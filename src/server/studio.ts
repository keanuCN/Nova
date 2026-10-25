import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  providers,
  models,
  getModel as lookupModel,
  getProvider as lookupProvider,
} from "../shared/catalog";
import { validateProviderInput } from "./providers";
import {
  estimateCost,
  validateTaskInput,
  categoryDescendants,
  billingPeriod,
  isBudgetCommitted,
} from "../shared/domain";
import {
  initialPrompts,
  initialCategories,
  initialProjects,
  defaultSettings,
} from "../shared/seed";
import type {
  Account,
  Asset,
  Category,
  GenerationTask,
  Project,
  PromptTemplate,
  Settings,
  StudioState,
  TaskInput,
} from "../shared/types";

import { AppError } from "./errors";
export { AppError } from "./errors";
const now = () => new Date().toISOString();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const text = (v: unknown, max = 500) => {
  if (typeof v !== "string" || v.length > max)
    throw new AppError("文本格式或长度无效");
  return v;
};
const getModel = (id: string) => {
  try {
    return lookupModel(id);
  } catch {
    throw new AppError("未找到模型");
  }
};
const getProvider = (id: string) => {
  try {
    return lookupProvider(id);
  } catch {
    throw new AppError("未找到厂商");
  }
};
const name = (v: unknown) => {
  const s = text(v, 120).trim();
  if (!s) throw new AppError("名称不能为空");
  return s;
};
const numeric = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new AppError("金额或参数必须为非负有限数字");
  return v;
};
export interface Credentials {
  key: string;
  secret?: string;
}
export class Studio {
  readonly db: DatabaseSync;
  readonly dir: string;
  private master: Buffer;
  private closed = false;
  constructor(
    dir = process.env.STUDIO_DATA_DIR ||
      join(/* turbopackIgnore: true */ process.cwd(), "data"),
  ) {
    this.dir = resolve(/* turbopackIgnore: true */ dir);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    mkdirSync(join(this.dir, "assets"), { recursive: true, mode: 0o700 });
    const masterPath = join(this.dir, "master.key");
    const configured = process.env.STUDIO_MASTER_KEY;
    if (configured) {
      this.master = Buffer.from(
        configured,
        /^[a-f0-9]{64}$/i.test(configured) ? "hex" : "base64",
      );
      if (this.master.length !== 32)
        throw new Error("STUDIO_MASTER_KEY 必须为 32 字节的 hex 或 base64");
    } else {
      if (!existsSync(/* turbopackIgnore: true */ masterPath)) {
        if (
          existsSync(
            /* turbopackIgnore: true */ join(this.dir, "studio.sqlite"),
          )
        )
          throw new Error(
            "主密钥文件缺失，请从备份恢复 master.key 或配置原 STUDIO_MASTER_KEY",
          );
        try {
          const fd = openSync(masterPath, "wx", 0o600);
          try {
            writeFileSync(fd, randomBytes(32));
          } finally {
            closeSync(fd);
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        }
      }
      this.master = readFileSync(/* turbopackIgnore: true */ masterPath);
      if (this.master.length !== 32) throw new Error("主密钥文件无效");
      try {
        chmodSync(masterPath, 0o600);
      } catch {}
    }
    this.db = new DatabaseSync(join(this.dir, "studio.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY,nonce BLOB NOT NULL,tag BLOB NOT NULL,cipher BLOB NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS login_attempts(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);",
    );
    this.tx(() => {
      if (
        !this.db
          .prepare("SELECT value FROM meta WHERE key=?")
          .get("initialized")
      ) {
        for (const p of initialPrompts) this.put("prompts", p);
        for (const c of initialCategories) this.put("categories", c);
        for (const p of initialProjects) this.put("projects", p);
        this.put("settings", { id: "settings", ...defaultSettings });
        this.db
          .prepare("INSERT INTO meta VALUES (?,?)")
          .run("initialized", "1");
      }
    });
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }
  tx<T>(f: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = f();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid")
        .all(kind) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  get<T>(kind: string, id: string): T {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { data: string } | undefined;
    if (!row) throw new AppError("未找到记录", 404);
    return JSON.parse(row.data);
  }
  put<T extends { id: string }>(kind: string, item: T): T {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, item.id, JSON.stringify(item));
    return item;
  }
  remove(kind: string, id: string) {
    this.get(kind, id);
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  settings(): Settings {
    const { id, ...s } = this.get<Settings & { id: string }>(
      "settings",
      "settings",
    );
    void id;
    return s;
  }
  state(): StudioState {
    return {
      providers,
      models,
      prompts: this.list("prompts"),
      categories: this.list("categories"),
      projects: this.list("projects"),
      accounts: this.list("accounts"),
      tasks: this.list("tasks"),
      assets: this.list("assets"),
      settings: this.settings(),
    };
  }
  setupRequired() {
    return !this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("password");
  }
  setup(password: string) {
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 256
    )
      throw new AppError("密码需要 10–256 个字符");
    return this.tx(() => {
      if (!this.setupRequired()) throw new AppError("管理员已设置", 409);
      const salt = randomBytes(16).toString("hex");
      const digest = scryptSync(password, salt, 64).toString("hex");
      this.db
        .prepare("INSERT INTO meta VALUES (?,?)")
        .run("password", JSON.stringify({ salt, digest }));
      return this.newSession();
    });
  }
  private newSession() {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?)")
      .run(hash(token), Date.now() + 7 * 86400000);
    return token;
  }
  login(password: string, client = "local") {
    const clientId = hash(client);
    const attempt = this.db
      .prepare("SELECT count,expires FROM login_attempts WHERE id=?")
      .get(clientId) as { count: number; expires: number } | undefined;
    if (attempt && attempt.expires > Date.now() && attempt.count >= 8)
      throw new AppError("登录尝试过多，请 15 分钟后重试", 429);
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("password") as { value: string } | undefined;
    const stored = row
      ? JSON.parse(row.value)
      : { salt: "invalid", digest: "00".repeat(64) };
    const actual = scryptSync(
      typeof password === "string" ? password.slice(0, 256) : "",
      stored.salt,
      64,
    );
    if (!row || !timingSafeEqual(actual, Buffer.from(stored.digest, "hex"))) {
      this.db
        .prepare(
          "INSERT INTO login_attempts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,expires=excluded.expires",
        )
        .run(
          clientId,
          attempt && attempt.expires > Date.now() ? attempt.count + 1 : 1,
          Date.now() + 900000,
        );
      throw new AppError("密码错误", 401);
    }
    this.db.prepare("DELETE FROM login_attempts WHERE id=?").run(clientId);
    return this.newSession();
  }
  authenticate(token?: string) {
    if (!token || token.length > 200) return false;
    const r = this.db
      .prepare("SELECT expires FROM sessions WHERE token=?")
      .get(hash(token)) as { expires: number } | undefined;
    return !!r && r.expires > Date.now();
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  }
  savePrompt(input: Partial<PromptTemplate>, id?: string): PromptTemplate {
    return this.tx(() => {
      const old = id ? this.get<PromptTemplate>("prompts", id) : undefined;
      const categoryId = input.categoryId ?? old?.categoryId ?? "uncategorized";
      this.get<Category>("categories", categoryId);
      const content = text(input.content ?? old?.content ?? "", 30000);
      const title = name(input.name ?? old?.name ?? "未命名模板");
      const negativePrompt = text(
        input.negativePrompt ?? old?.negativePrompt ?? "",
        10000,
      );
      const modelId = input.modelId ?? old?.modelId ?? models[0].id;
      getModel(modelId);
      const changed =
        old &&
        (old.content !== content ||
          old.name !== title ||
          old.negativePrompt !== negativePrompt);
      const tags = input.tags ?? old?.tags ?? [];
      if (
        !Array.isArray(tags) ||
        tags.length > 30 ||
        tags.some((t) => typeof t !== "string" || t.length > 50)
      )
        throw new AppError("标签无效");
      const defaults = input.defaults ?? old?.defaults ?? {};
      if (
        !defaults ||
        Array.isArray(defaults) ||
        Object.keys(defaults).length > 50 ||
        Object.values(defaults).some(
          (v) => typeof v !== "string" || v.length > 2000,
        )
      )
        throw new AppError("变量默认值无效");
      const cover = text(input.cover ?? old?.cover ?? "", 1000);
      if (
        cover &&
        !cover.startsWith("/media/") &&
        !/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(cover)
      )
        throw new AppError("封面应使用本地素材");
      const p: PromptTemplate = {
        id: old?.id ?? randomUUID(),
        name: title,
        content,
        negativePrompt,
        modelId,
        description: text(input.description ?? old?.description ?? "", 2000),
        categoryId,
        tags,
        cover,
        defaults,
        favorite:
          input.favorite === undefined
            ? (old?.favorite ?? false)
            : input.favorite === true,
        usageCount: old?.usageCount ?? 0,
        version: old ? (changed ? old.version + 1 : old.version) : 1,
        versions: old
          ? [
              ...old.versions,
              ...(changed
                ? [
                    {
                      version: old.version,
                      content: old.content,
                      negativePrompt: old.negativePrompt,
                      name: old.name,
                      updatedAt: old.updatedAt,
                    },
                  ]
                : []),
            ]
          : [],
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
        deletedAt: old?.deletedAt ?? null,
      };
      return this.put("prompts", p);
    });
  }
  deletePrompt(id: string) {
    return this.tx(() => {
      const p = this.get<PromptTemplate>("prompts", id);
      p.deletedAt = now();
      p.updatedAt = now();
      return this.put("prompts", p);
    });
  }
  restorePrompt(id: string) {
    return this.tx(() => {
      const p = this.get<PromptTemplate>("prompts", id);
      p.deletedAt = null;
      p.updatedAt = now();
      return this.put("prompts", p);
    });
  }
  rollbackPrompt(id: string, version: number) {
    const p = this.get<PromptTemplate>("prompts", id);
    const old = p.versions.find((v) => v.version === version);
    if (!old) throw new AppError("未找到历史版本", 404);
    return this.savePrompt(
      {
        name: old.name ?? p.name,
        content: old.content,
        negativePrompt: old.negativePrompt,
      },
      id,
    );
  }
  saveCategory(input: Partial<Category>, id?: string) {
    return this.tx(() => {
      const cats = this.list<Category>("categories");
      const old = id ? this.get<Category>("categories", id) : undefined;
      if (id === "uncategorized") throw new AppError("未分类目录不可修改");
      const c: Category = {
        id: old?.id ?? randomUUID(),
        name: name(input.name ?? old?.name),
        parentId:
          input.parentId === undefined
            ? (old?.parentId ?? null)
            : input.parentId,
        sort: input.sort === undefined ? (old?.sort ?? 0) : numeric(input.sort),
      };
      const all = [...cats.filter((x) => x.id !== c.id), c];
      for (const item of all) {
        let cursor: Category | undefined = item;
        const visited = new Set<string>();
        let depth = 0;
        while (cursor) {
          if (visited.has(cursor.id)) throw new AppError("分类不能形成循环");
          visited.add(cursor.id);
          if (++depth > 3) throw new AppError("分类最多支持三级");
          if (cursor.parentId) {
            const parent = all.find((x) => x.id === cursor!.parentId);
            if (!parent) throw new AppError("父级分类不存在");
            cursor = parent;
          } else cursor = undefined;
        }
      }
      return this.put("categories", c);
    });
  }
  deleteCategory(id: string) {
    return this.tx(() => {
      if (id === "uncategorized") throw new AppError("未分类目录不可删除");
      this.get("categories", id);
      const ids = categoryDescendants(this.list("categories"), id);
      for (const p of this.list<PromptTemplate>("prompts"))
        if (ids.includes(p.categoryId))
          this.put("prompts", { ...p, categoryId: "uncategorized" });
      for (const cid of ids) this.remove("categories", cid);
    });
  }
  createProject(input: Partial<Project>) {
    return this.put("projects", {
      id: randomUUID(),
      name: name(input.name),
      description: text(input.description ?? "", 2000),
      createdAt: now(),
    });
  }
  private seal(id: string, c: Credentials) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.master, nonce);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(c), "utf8"),
      cipher.final(),
    ]);
    this.db
      .prepare(
        "INSERT INTO credentials VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,tag=excluded.tag,cipher=excluded.cipher",
      )
      .run(id, nonce, cipher.getAuthTag(), encrypted);
  }
  credentials(id: string): Credentials {
    const row = this.db
      .prepare("SELECT nonce,tag,cipher FROM credentials WHERE id=?")
      .get(id) as
      | { nonce: Uint8Array; tag: Uint8Array; cipher: Uint8Array }
      | undefined;
    if (!row) throw new AppError("账户凭据不存在");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.master, row.nonce);
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(row.tag);
      return JSON.parse(
        Buffer.concat([decipher.update(row.cipher), decipher.final()]).toString(
          "utf8",
        ),
      );
    } catch {
      throw new AppError("账户密钥无法解密，请检查主密钥", 500);
    }
  }
  saveAccount(
    input: Partial<Account> & { key?: string; secret?: string },
    id?: string,
  ): Account {
    return this.tx(() => {
      const old = id ? this.get<Account>("accounts", id) : undefined;
      const providerId = input.providerId ?? old?.providerId;
      if (!providerId) throw new AppError("请选择厂商");
      const provider = getProvider(providerId);
      if (old && old.providerId !== providerId)
        throw new AppError("已有账户不可更换厂商");
      const key =
        input.key === undefined
          ? old
            ? this.credentials(old.id).key
            : ""
          : text(input.key, 8192).trim();
      if (!key) throw new AppError("请输入 API Key");
      if (
        old &&
        ((input.region !== undefined && input.region !== old.region) ||
          (input.secret !== undefined &&
            input.secret !== this.credentials(old.id).secret)) &&
        this.list<GenerationTask>("tasks").some(
          (t) =>
            t.accountId === old.id &&
            ["queued", "submitting", "processing", "unknown"].includes(
              t.status,
            ),
        )
      )
        throw new AppError("账户仍有关联任务，暂不可修改地域或工作空间");
      const accountId = old?.id ?? randomUUID();
      const secret =
        input.secret === undefined
          ? old
            ? this.credentials(old.id).secret
            : undefined
          : text(input.secret, 8192);
      if (
        providerId === "aliyun" &&
        secret &&
        !/^[a-zA-Z0-9-]{1,100}$/.test(secret)
      )
        throw new AppError("Workspace ID 只能包含英文字母、数字与短横线");
      const a: Account = {
        id: accountId,
        providerId,
        name: name(input.name ?? old?.name ?? provider.name),
        region: text(input.region ?? old?.region ?? provider.region, 120),
        keyLast4: key.slice(-4),
        budget: numeric(input.budget ?? old?.budget ?? 0),
        enabled:
          input.enabled === undefined
            ? (old?.enabled ?? true)
            : input.enabled === true,
        status: "untested",
        balance: old?.balance ?? {
          amount: null,
          unit: "",
          kind: provider.balanceKind,
          updatedAt: null,
          note: "尚未查询，未推测账户余额",
        },
        createdAt: old?.createdAt ?? now(),
      };
      if (!a.enabled) a.status = "disabled";
      this.seal(accountId, { key, secret });
      return this.put("accounts", a);
    });
  }
  deleteAccount(id: string) {
    return this.tx(() => {
      if (
        this.list<GenerationTask>("tasks").some(
          (t) =>
            t.accountId === id &&
            ["queued", "submitting", "processing", "unknown"].includes(
              t.status,
            ),
        )
      )
        throw new AppError("账户仍有关联任务，请先处理任务");
      this.remove("accounts", id);
      this.db.prepare("DELETE FROM credentials WHERE id=?").run(id);
    });
  }
  updateAccount(
    id: string,
    patch: Pick<Partial<Account>, "status" | "lastError" | "balance">,
  ) {
    return this.tx(() =>
      this.put("accounts", { ...this.get<Account>("accounts", id), ...patch }),
    );
  }
  updateSettings(input: Partial<Settings>) {
    return this.tx(() => {
      const s = this.settings();
      for (const k of [
        "monthlyBudget",
        "dailyBudget",
        "perTaskLimit",
        "currencyRate",
        "concurrency",
      ] as const)
        if (input[k] !== undefined) s[k] = numeric(input[k]);
      if (
        s.currencyRate <= 0 ||
        !Number.isInteger(s.concurrency) ||
        s.concurrency < 1 ||
        s.concurrency > 8
      )
        throw new AppError("汇率必须为正数，并发数应为 1–8");
      this.put("settings", { id: "settings", ...s });
      return s;
    });
  }
  createTasks(raw: TaskInput): GenerationTask[] {
    return this.tx(() => {
      const model = getModel(raw.modelId);
      try {
        validateTaskInput(raw, model);
      } catch (e) {
        throw new AppError(e instanceof Error ? e.message : "任务参数无效");
      }
      if (
        typeof raw.audio !== "boolean" ||
        typeof raw.negativePrompt !== "string" ||
        !Array.isArray(raw.referenceAssetIds) ||
        raw.referenceAssetIds.some((x) => typeof x !== "string")
      )
        throw new AppError("任务参数格式无效");
      const account = this.get<Account>("accounts", raw.accountId);
      if (!account.enabled || account.providerId !== model.providerId)
        throw new AppError("请选择同一厂商的已启用账户");
      this.get("projects", raw.projectId);
      for (const aid of raw.referenceAssetIds) {
        const a = this.get<Asset>("assets", aid);
        if (a.kind !== "image")
          throw new AppError("当前创作模式仅支持图片参考");
      }
      if (raw.mode === "text" && raw.referenceAssetIds.length)
        throw new AppError("文生模式不能携带参考素材");
      if (raw.mode === "reference")
        throw new AppError("参考输入计费尚未接入，暂不支持提交");
      if (raw.mode === "image" && raw.referenceAssetIds.length !== 1)
        throw new AppError("首帧模式需要一张图片");
      if (model.providerId === "aliyun" && !this.credentials(account.id).secret)
        throw new AppError("Wan 3 需要在账户中配置 Workspace ID");
      const input: TaskInput = {
        modelId: raw.modelId,
        accountId: raw.accountId,
        projectId: raw.projectId,
        prompt: raw.prompt,
        negativePrompt: raw.negativePrompt,
        mode: raw.mode,
        duration: raw.duration,
        resolution: raw.resolution,
        aspectRatio: raw.aspectRatio,
        audio: raw.audio,
        count: 1,
        referenceAssetIds: [...raw.referenceAssetIds],
        ...(raw.voiceId ? { voiceId: text(raw.voiceId, 120) } : {}),
      };
      let template: PromptTemplate | undefined;
      if (raw.templateId) {
        template = this.get<PromptTemplate>("prompts", raw.templateId);
        if (template.deletedAt) throw new AppError("模板已删除");
        const version = raw.templateVersion ?? template.version;
        if (
          version !== template.version &&
          !template.versions.some((v) => v.version === version)
        )
          throw new AppError("模板版本不存在");
        input.templateId = template.id;
        input.templateVersion = version;
      }
      validateProviderInput(this, input, model);
      const settings = this.settings();
      const cost = estimateCost(model, input, settings.currencyRate);
      if (!Number.isFinite(cost) || cost <= 0)
        throw new AppError("无法可靠预估本次任务费用");
      const units = (value: number) => Math.round(value * 1_000_000);
      if (units(cost) > units(settings.perTaskLimit))
        throw new AppError("超出单任务预算限制");
      const all = this.list<GenerationTask>("tasks");
      const date = now();
      const billing = billingPeriod(date);
      const committed = all.filter(isBudgetCommitted);
      const amount = (tasks: GenerationTask[]) =>
        tasks.reduce((s, t) => s + units(t.actualCost ?? t.estimatedCost), 0);
      const reserve = units(cost) * raw.count;
      if (
        amount(
          committed.filter(
            (t) => billingPeriod(t.createdAt).month === billing.month,
          ),
        ) +
          reserve >
        units(settings.monthlyBudget)
      )
        throw new AppError("超出月度预算（包含待处理任务预留）");
      if (
        amount(
          committed.filter(
            (t) => billingPeriod(t.createdAt).day === billing.day,
          ),
        ) +
          reserve >
        units(settings.dailyBudget)
      )
        throw new AppError("超出每日预算（包含待处理任务预留）");
      if (
        amount(
          committed.filter(
            (t) =>
              t.accountId === account.id &&
              billingPeriod(t.createdAt).month === billing.month,
          ),
        ) +
          reserve >
        units(account.budget)
      )
        throw new AppError("超出账户预算（包含待处理任务预留）");
      const created: GenerationTask[] = [];
      for (let i = 0; i < raw.count; i++) {
        const t: GenerationTask = {
          id: randomUUID(),
          modelId: model.id,
          accountId: account.id,
          projectId: input.projectId,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          status: "queued",
          kind: model.kind,
          input: structuredClone(input),
          estimatedCost: cost,
          actualCost: null,
          costStatus: "estimated",
          remoteId: null,
          resultUrl: null,
          error: null,
          createdAt: date,
          updatedAt: date,
          priceSnapshot: {
            model: structuredClone(model),
            currencyRate: settings.currencyRate,
            estimatedCost: cost,
            template: template
              ? {
                  id: template.id,
                  version: input.templateVersion,
                  ...(template.version === input.templateVersion
                    ? {
                        name: template.name,
                        content: template.content,
                        negativePrompt: template.negativePrompt,
                      }
                    : template.versions.find(
                        (v) => v.version === input.templateVersion,
                      )),
                }
              : null,
          },
        };
        created.push(this.put("tasks", t));
      }
      if (template)
        this.put("prompts", {
          ...template,
          usageCount: template.usageCount + raw.count,
        });
      return created;
    });
  }
  updateTask(id: string, patch: Partial<GenerationTask>) {
    return this.tx(() =>
      this.put("tasks", {
        ...this.get<GenerationTask>("tasks", id),
        ...patch,
        id,
        updatedAt: now(),
      }),
    );
  }
  cancelQueued(id: string) {
    return this.tx(() => {
      const t = this.get<GenerationTask>("tasks", id);
      if (t.status !== "queued")
        throw new AppError(
          "只能在本地取消排队任务；已提交任务需厂商支持远程取消",
          409,
        );
      return this.put("tasks", {
        ...t,
        status: "cancelled" as const,
        updatedAt: now(),
      });
    });
  }
  expireSubmissions(at = Date.now()) {
    this.tx(() => {
      for (const t of this.list<GenerationTask>("tasks"))
        if (t.status === "submitting" && Date.parse(t.updatedAt) + 180000 < at)
          this.put("tasks", {
            ...t,
            status: "unknown",
            costStatus: "pending",
            error:
              "提交进程中断或超时，厂商可能已接收任务。为避免重复扣费不会自动重试，请到厂商控制台核对。",
            updatedAt: now(),
          });
      this.db.prepare("DELETE FROM leases WHERE expires<?").run(at);
    });
  }
  claimTask(): GenerationTask | undefined {
    return this.tx(() => {
      const all = this.list<GenerationTask>("tasks");
      const active = all.filter((t) =>
        ["submitting", "processing"].includes(t.status),
      );
      if (active.length >= this.settings().concurrency) return;
      const t = all.find(
        (t) =>
          t.status === "queued" &&
          this.get<Account>("accounts", t.accountId).enabled &&
          !active.some((a) => a.accountId === t.accountId),
      );
      if (!t) return;
      const a = this.get<Account>("accounts", t.accountId);
      if (!a.enabled) return;
      return this.put("tasks", {
        ...t,
        status: "submitting" as const,
        updatedAt: now(),
      });
    });
  }
  acquirePoll(id: string) {
    return this.tx(() => {
      const l = this.db
        .prepare("SELECT expires FROM leases WHERE id=?")
        .get(id) as { expires: number } | undefined;
      if (l && l.expires > Date.now()) return false;
      this.db
        .prepare(
          "INSERT INTO leases VALUES (?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires",
        )
        .run(id, Date.now() + 300000);
      return true;
    });
  }
  releasePoll(id: string) {
    this.db.prepare("DELETE FROM leases WHERE id=?").run(id);
  }
  saveAsset(
    buffer: Buffer,
    mime: string,
    filename: string,
    projectId: string,
    taskId?: string,
  ): Asset {
    this.get("projects", projectId);
    if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024)
      throw new AppError("素材大小应为 1 字节至 50MB");
    const kind = detectMedia(buffer, mime);
    const id = randomUUID();
    const a: Asset = {
      id,
      name: name(filename),
      kind,
      mime,
      size: buffer.length,
      url: `/api/assets/${id}`,
      projectId,
      createdAt: now(),
      ...(taskId ? { taskId } : {}),
    };
    writeFileSync(join(this.dir, "assets", id), buffer, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      return this.put("assets", a);
    } catch (e) {
      unlinkSync(join(this.dir, "assets", id));
      throw e;
    }
  }
  assetData(id: string) {
    const asset = this.get<Asset>("assets", id);
    return {
      asset,
      buffer: readFileSync(
        /* turbopackIgnore: true */ join(this.dir, "assets", asset.id),
      ),
    };
  }
  deleteAsset(id: string) {
    return this.tx(() => {
      const a = this.get<Asset>("assets", id);
      const tasks = this.list<GenerationTask>("tasks");
      if (
        tasks.some(
          (t) =>
            ["queued", "submitting", "processing", "unknown"].includes(
              t.status,
            ) &&
            (t.input.referenceAssetIds.includes(id) ||
              t.assetId === id ||
              t.resultUrl === a.url ||
              a.taskId === t.id),
        )
      )
        throw new AppError("素材仍被待处理任务引用");
      this.remove("assets", id);
      const deletedAt = now();
      for (const t of tasks) {
        if (t.assetId === id || t.resultUrl === a.url) {
          this.put("tasks", {
            ...t,
            assetId: undefined,
            resultUrl: null,
            resultDeletedAt: deletedAt,
            updatedAt: deletedAt,
          });
        }
      }
      try {
        unlinkSync(join(this.dir, "assets", a.id));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    });
  }
}
export function detectMedia(
  b: Buffer,
  mime: string,
): "image" | "audio" | "video" {
  const ok =
    mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : mime === "image/webp"
          ? b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP"
          : mime === "audio/mpeg"
            ? b.toString("ascii", 0, 3) === "ID3" ||
              (b[0] === 255 && (b[1] & 224) === 224)
            : mime === "audio/wav"
              ? b.toString("ascii", 0, 4) === "RIFF" &&
                b.toString("ascii", 8, 12) === "WAVE"
              : mime === "video/mp4" || mime === "video/quicktime"
                ? b.toString("ascii", 4, 8) === "ftyp"
                : mime === "video/webm" || mime === "audio/webm"
                  ? b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
                  : false;
  if (!ok)
    throw new AppError(
      "仅支持有效的 PNG/JPEG/WebP 图片、MP3/WAV 音频与 MP4/WebM/MOV 视频",
    );
  return mime.startsWith("image/")
    ? "image"
    : mime.startsWith("audio/")
      ? "audio"
      : "video";
}
let instance: Studio | undefined;
export function getStudio() {
  return (instance ??= new Studio());
}
