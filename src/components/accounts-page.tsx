"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  KeyRound,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Activity,
  Wallet,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  Unplug,
  Pencil,
  Trash2,
  ExternalLink,
  Link2,
  Layers3,
  LockKeyhole,
  Clock3,
} from "lucide-react";
import type { Account, Provider, ProviderId } from "@/shared/types";
import { Badge, Button, Field, Modal, Money } from "./ui";
import type { PageProps } from "./studio";
type AccountForm = {
  id?: string;
  providerId: ProviderId;
  name: string;
  region: string;
  key: string;
  secret: string;
  budget: number;
  enabled: boolean;
};
export function AccountsPage({ state, api, refresh, notify }: PageProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<AccountForm | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState("");
  const [remove, setRemove] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const deepSeekAutoOpened = useRef(false);
  const selected = form
    ? state.providers.find((p) => p.id === form.providerId)
    : null;
  const connected = state.accounts.filter(
    (a) => a.status === "connected" && a.enabled,
  ).length;
  const spent = state.tasks.reduce((n, t) => n + (t.actualCost || 0), 0);
  const problems = state.accounts.filter((a) => a.status === "error").length;
  const open = (p: Provider, a?: Account) => {
    setError("");
    setReveal(false);
    setForm({
      id: a?.id,
      providerId: p.id,
      name: a?.name || `${p.name} · 我的账户`,
      region: a?.region || p.region,
      key: "",
      secret: "",
      budget: a?.budget || 2000,
      enabled: a?.enabled ?? true,
    });
  };
  useEffect(() => {
    if (deepSeekAutoOpened.current) return;
    if (
      new URLSearchParams(window.location.search).get("provider") ===
      "deepseek"
    ) {
      const provider = state.providers.find((p) => p.id === "deepseek");
      if (provider) {
        deepSeekAutoOpened.current = true;
        open(provider);
      }
    }
  }, [state.providers]);
  async function action(account: Account, type: "test" | "balance") {
    setBusy(`${account.id}-${type}`);
    try {
      await api(`accounts/${account.id}/${type}`, {});
      await refresh();
      notify(type === "test" ? "连接探测已完成" : "额度信息已更新");
    } catch (e) {
      await refresh();
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!form) return;
    setBusy("save");
    setError("");
    try {
      const payload = {
        ...form,
        key: form.key || undefined,
        secret: form.secret || undefined,
      };
      await api(
        form.id ? `accounts/${form.id}` : "accounts",
        payload,
        form.id ? "PATCH" : "POST",
      );
      await refresh();
      setForm(null);
      notify("账户已保存，凭据已加密");
      const returnRoute =
        form.providerId === "deepseek"
          ? sessionStorage.getItem("yingzao-optimizer-return-route")
          : null;
      if (returnRoute === "/video" || returnRoute === "/audio") {
        sessionStorage.removeItem("yingzao-optimizer-return-route");
        router.push(returnRoute);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const list = state.providers.filter(
    (p) =>
      (!query ||
        `${p.name} ${p.english}`.toLowerCase().includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "bound" &&
          state.accounts.some((a) => a.providerId === p.id)) ||
        (filter === "available" && p.supported)),
  );
  return (
    <div className="accounts-page">
      <div className="page-titlebar">
        <div>
          <div className="eyebrow">一个工作台，连接多种模型</div>
          <h1>
            模型与密钥 <Badge tone="green">安全连接</Badge>
          </h1>
          <p>连接你的模型账户，掌握每一份创作额度。</p>
        </div>
        <div className="title-actions">
          <Button
            busy={busy === "all"}
            disabled={!state.accounts.length}
            onClick={async () => {
              setBusy("all");
              let count = 0;
              for (const a of state.accounts.filter((a) => a.enabled)) {
                try {
                  await api(`accounts/${a.id}/test`, {});
                  count++;
                } catch {}
              }
              await refresh();
              setBusy("");
              notify(
                `已探测 ${state.accounts.filter((a) => a.enabled).length} 个账户，${count} 个返回成功`,
              );
            }}
          >
            <RefreshCw size={15} />
            探测已绑定账户
          </Button>
          <Button variant="primary" onClick={() => open(state.providers[0])}>
            <Plus size={17} />
            绑定新账户
          </Button>
        </div>
      </div>
      <div className="account-metrics">
        <Metric
          title="已绑定账户"
          value={String(state.accounts.length)}
          unit="个账户"
          icon={<Layers3 size={18} />}
          detail={`覆盖 ${new Set(state.accounts.map((a) => a.providerId)).size} 家服务商`}
        />
        <Metric
          title="已验证连接"
          value={String(connected)}
          unit="个账户"
          icon={<Activity size={18} />}
          detail="以最近一次官方接口探测为准"
          green
        />
        <Metric
          title="需要关注"
          value={String(problems)}
          unit="项异常"
          icon={<CircleAlert size={18} />}
          detail={problems ? "查看账户卡片中的错误说明" : "暂无已知连接异常"}
        />
        <Metric
          title="本站已知实际费用"
          value={`¥${spent.toFixed(2)}`}
          icon={<Wallet size={18} />}
          detail="未知扣费不计为已确认消费"
        />
      </div>
      <div className="accounts-filter">
        <div className="tab-group">
          {[
            { id: "all", label: "全部服务商" },
            { id: "bound", label: "已绑定" },
            { id: "available", label: "可接入" },
          ].map((t) => (
            <button
              className={filter === t.id ? "active" : ""}
              key={t.id}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="search-field">
          <KeyRound size={14} />
          <input
            placeholder="搜索厂商…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="provider-grid">
        {list.flatMap((provider) => {
          const accounts = state.accounts.filter(
            (a) => a.providerId === provider.id,
          );
          return (accounts.length ? accounts : [null]).map((a, i) => (
            <article
              className={`provider-card ${a?.status === "connected" ? "provider-connected" : ""}`}
              key={`${provider.id}-${a?.id || i}`}
            >
              <div className="provider-card-heading">
                <span
                  className="provider-logo"
                  style={{
                    color: provider.color,
                    background: `${provider.color}12`,
                  }}
                >
                  {provider.initials}
                </span>
                <div>
                  <h2>{provider.name}</h2>
                </div>
                <Badge
                  tone={
                    a?.status === "connected"
                      ? "green"
                      : a?.status === "error"
                        ? "red"
                        : "muted"
                  }
                >
                  {a
                    ? a.enabled
                      ? a.status === "connected"
                        ? "已连接"
                        : a.status === "error"
                          ? "连接异常"
                          : "待验证"
                      : "已停用"
                    : provider.supported
                      ? "未绑定"
                      : "待接入"}
                </Badge>
              </div>
              <div className="provider-models">
                {provider.id === "deepseek" ? (
                  <span>DeepSeek Flash · 提示词优化</span>
                ) : (
                  state.models
                    .filter((m) => m.providerId === provider.id)
                    .slice(0, 3)
                    .map((m) => <span key={m.id}>{m.name}</span>)
                )}
                {provider.id !== "deepseek" &&
                  !state.models.some((m) => m.providerId === provider.id) && (
                    <span>官方直连适配待扩展</span>
                  )}
              </div>
              <div className="account-id-row">
                <span>{a?.name || "尚未配置账户凭据"}</span>
                {a && <span className="mono">•••• {a.keyLast4}</span>}
              </div>
              <div className="balance-row">
                <div>
                  <span className="small muted">
                    {a?.balance.kind || provider.balanceKind}
                  </span>
                  <div className="balance-value">
                    {a?.balance.amount !== null &&
                    a?.balance.amount !== undefined ? (
                      <>
                        {a.balance.amount.toLocaleString("zh-CN")}
                        <small>{a.balance.unit}</small>
                      </>
                    ) : (
                      <>
                        <span className="balance-dash">—</span>
                        <small>{a ? "尚无可用数据" : "绑定后查看"}</small>
                      </>
                    )}
                  </div>
                </div>
                <Wallet size={25} />
              </div>
              <p className={`balance-note ${a?.lastError ? "error-text" : ""}`}>
                {a?.lastError ||
                  a?.balance.note ||
                  (!provider.supported
                    ? "目录已收录；生成适配尚未启用。"
                    : provider.balanceKind === "云账单只读授权"
                      ? "云余额需额外账单授权，推理密钥不含查账权限。"
                      : "使用你自己的账户，费用直接由厂商结算。")}
              </p>
              <div className="provider-card-meta">
                <span>
                  <Clock3 size={11} />
                  {a?.balance.updatedAt
                    ? new Date(a.balance.updatedAt).toLocaleString("zh-CN")
                    : "未同步"}
                </span>
                <span>{a?.region || provider.region}</span>
              </div>
              <div className="provider-card-actions">
                {a ? (
                  <>
                    <Button
                      busy={busy === `${a.id}-test`}
                      disabled={!a.enabled}
                      onClick={() => void action(a, "test")}
                    >
                      <Activity size={13} />
                      测试连接
                    </Button>
                    <Button
                      busy={busy === `${a.id}-balance`}
                      disabled={!a.enabled}
                      onClick={() => void action(a, "balance")}
                    >
                      <RefreshCw size={13} />
                      查询额度
                    </Button>
                    <button
                      className="icon-btn"
                      aria-label={`编辑${a.name}`}
                      onClick={() => open(provider, a)}
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                ) : (
                  <Button
                    className="bind-provider-button"
                    onClick={() => open(provider)}
                  >
                    <Plus size={14} />
                    绑定接口密钥
                  </Button>
                )}
                <a
                  className="icon-btn"
                  href={provider.billingUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`打开${provider.name}官方账单`}
                  title="官方账单与充值"
                >
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </article>
          ));
        })}
        <button
          className="provider-add-card"
          onClick={() => open(state.providers[0])}
        >
          <span>
            <Plus size={27} />
          </span>
          <strong>添加另一个账户</strong>
          <p>
            同一厂商支持多个账户
            <br />
            按项目管理你的创作预算
          </p>
        </button>
      </div>
      <div className="security-note">
        <ShieldCheck size={19} />
        <div>
          <strong>你的密钥，只属于你的工作台。</strong>
          <p>
            凭据在服务端加密存储，仅显示尾号。余额、积分与周期配额保留各自单位，不混合汇总。
          </p>
        </div>
        <a href="/settings">
          存储与安全设置 <ArrowUpRight size={14} />
        </a>
      </div>
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "编辑账户凭据" : "绑定新的模型账户"}
        description="凭据只用于你主动发起的连接和生成请求。"
        drawer
      >
        {form && selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="drawer-body">
              <Field label="服务商">
                <select
                  value={form.providerId}
                  disabled={!!form.id}
                  onChange={(e) => {
                    const p = state.providers.find(
                      (p) => p.id === e.target.value,
                    )!;
                    setForm({
                      ...form,
                      providerId: p.id,
                      name: `${p.name} · 我的账户`,
                      region: p.region,
                      secret: "",
                    });
                  }}
                >
                  {state.providers.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="credential-provider">
                <span
                  className="provider-logo"
                  style={{
                    color: selected.color,
                    background: `${selected.color}12`,
                  }}
                >
                  {selected.initials}
                </span>
                <div>
                  <strong>{selected.name}</strong>
                  <span>
                    {selected.id === "deepseek"
                      ? "用于提示词优化与官方余额查询"
                      : selected.supported
                        ? "官方接口适配已配置，绑定后验证账户权限"
                        : "厂商目录已收录，生成适配待接入"}
                  </span>
                </div>
                <a
                  href={selected.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="厂商官方文档"
                >
                  <ExternalLink size={17} />
                </a>
              </div>
              <Field label="账户别名">
                <input
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：我的视频创作账户"
                />
              </Field>
              <Field
                label="接口密钥"
                hint={form.id ? "留空保留当前凭据" : "仅服务端加密保存"}
              >
                <div className="secret-input">
                  <input
                    type={reveal ? "text" : "password"}
                    required={!form.id}
                    autoComplete="off"
                    spellCheck={false}
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder={
                      form.id
                        ? "输入新密钥以替换当前凭据"
                        : "粘贴服务商提供的密钥"
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={reveal ? "隐藏密钥" : "显示密钥"}
                    onClick={() => setReveal(!reveal)}
                  >
                    {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              {["aliyun", "kling"].includes(form.providerId) && (
                <Field
                  label={
                    form.providerId === "aliyun" ? "工作空间编号" : "签名密钥"
                  }
                  hint={
                    form.providerId === "aliyun"
                      ? "万相工作空间编号"
                      : "按厂商鉴权要求填写"
                  }
                >
                  <input
                    type={form.providerId === "aliyun" ? "text" : "password"}
                    autoComplete="off"
                    required={form.providerId === "aliyun" && !form.id}
                    value={form.secret}
                    onChange={(e) =>
                      setForm({ ...form, secret: e.target.value })
                    }
                    placeholder={form.id ? "留空保留原配置" : "填写对应凭据"}
                  />
                </Field>
              )}
              <div className="form-grid">
                <Field label="地区">
                  <input
                    required
                    value={form.region}
                    onChange={(e) =>
                      setForm({ ...form, region: e.target.value })
                    }
                  />
                </Field>
                <Field label="本站月预算（元）">
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    required
                    value={form.budget}
                    onChange={(e) =>
                      setForm({ ...form, budget: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <div className="capability-note">
                <ShieldCheck size={20} />
                <div>
                  <strong>额度查询支持说明</strong>
                  <p>
                    {form.providerId === "runway"
                      ? "可通过官方接口读取积分余额。"
                      : form.providerId === "deepseek"
                        ? "可查询 DeepSeek 余额；提示词优化会将当前文本发送至 DeepSeek 并按用量计费，本站费用中心暂不统计这类调用。"
                      : form.providerId === "elevenlabs"
                        ? "可读取当前周期的字符额度与已用量。"
                        : form.providerId === "vidu"
                          ? "余额查询以官方资源积分为单位，生成能力尚未开放。"
                          : form.providerId === "kling"
                            ? "官方资源包统计存在延迟，当前直连适配尚未开放。"
                            : form.providerId === "aliyun" ||
                                form.providerId === "volcengine"
                              ? "当前提供官方账单入口。云账户余额需要单独的账单只读身份，推理密钥不能替代。"
                              : "本版本提供官方账单入口；无公开接口时不显示模拟余额。"}
                  </p>
                </div>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
                启用此账户用于创作
              </label>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
              {form.id && (
                <div className="account-danger-actions">
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => {
                      setRemove(state.accounts.find((a) => a.id === form.id)!);
                    }}
                  >
                    <Trash2 size={14} />
                    删除账户绑定
                  </Button>
                </div>
              )}
            </div>
            <div className="drawer-footer">
              <Button type="button" onClick={() => setForm(null)}>
                取消
              </Button>
              <Button variant="primary" type="submit" busy={busy === "save"}>
                <LockKeyhole size={16} />
                安全保存账户
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="删除此账户绑定？"
        description="删除本站保存的凭据；不会注销厂商账户。历史任务将保留。"
      >
        <div className="modal-footer">
          <Button onClick={() => setRemove(null)}>取消</Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api(`accounts/${remove?.id}`, {}, "DELETE");
                await refresh();
                setRemove(null);
                setForm(null);
                notify("已删除账户绑定");
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            删除绑定
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function Metric({
  title,
  value,
  unit,
  icon,
  detail,
  green = false,
}: {
  title: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  detail: string;
  green?: boolean;
}) {
  return (
    <div className="metric">
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong className={green ? "green-text" : ""}>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </div>
  );
}
