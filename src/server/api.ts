import { AppError, getStudio, type Studio } from "./studio";
import { refreshBalance, testAccount, cancelRemoteTask } from "./providers";
import { refreshTask } from "./worker";
import { optimizePrompt } from "./prompt-optimizer";
import type { GenerationTask } from "../shared/types";
const cookieName = "studio_session";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
function token(req: Request) {
  const raw = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return raw;
}
function sessionCookie(req: Request, value: string, maxAge = 604800) {
  const secure =
    new URL(process.env.STUDIO_PUBLIC_ORIGIN || req.url).protocol === "https:";
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
async function readBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit)
    throw new AppError("请求内容过大", 413);
  if (!req.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new AppError("请求内容过大", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
async function body(req: Request) {
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError("请使用 JSON 请求", 415);
  try {
    const data = JSON.parse(
      Buffer.from(await readBody(req, 128 * 1024)).toString(),
    );
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new AppError("请求必须为 JSON 对象");
    return data;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("JSON 请求格式错误");
  }
}
function checkOrigin(req: Request) {
  const url = new URL(req.url);
  const configured = process.env.STUDIO_PUBLIC_ORIGIN;
  // Next may normalize Request.url to localhost even when the browser addresses 127.0.0.1.
  // Host is accepted only for an explicit public origin or the fixed loopback allowlist.
  const host = req.headers.get("host") || url.host;
  if (!/^[A-Za-z0-9.\-:\[\]]+$/.test(host))
    throw new AppError("访问地址格式无效", 403);
  const canonical = new URL(
    `${configured ? new URL(configured).protocol : url.protocol}//${host}`,
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    canonical.hostname,
  );
  if (configured ? canonical.origin !== new URL(configured).origin : !local)
    throw new AppError(
      "当前访问地址未被允许，请设置 STUDIO_PUBLIC_ORIGIN",
      403,
    );
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (!origin || origin !== canonical.origin)
      throw new AppError("请求来源校验失败", 403);
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
      throw new AppError("请求来源校验失败", 403);
  }
}
export async function handleApi(
  req: Request,
  studio?: Studio,
): Promise<Response> {
  try {
    checkOrigin(req);
    const s = studio ?? getStudio();
    const parts = new URL(req.url).pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean)
      .map((x) => decodeURIComponent(x));
    const [resource, id, action] = parts;
    const method = req.method;
    const session = token(req);
    if (resource === "auth") {
      if (method === "GET" && !id)
        return json({
          setupRequired: s.setupRequired(),
          authenticated: s.authenticate(session),
        });
      if (method === "POST" && id === "setup") {
        const input = await body(req);
        const session = s.setup(input.password);
        const response = json(
          { authenticated: true, setupRequired: false },
          201,
        );
        response.headers.set("Set-Cookie", sessionCookie(req, session));
        return response;
      }
      if (method === "POST" && id === "login") {
        const input = await body(req);
        const session = s.login(input.password, new URL(req.url).hostname);
        const response = json({ authenticated: true, setupRequired: false });
        response.headers.set("Set-Cookie", sessionCookie(req, session));
        return response;
      }
      if (method === "POST" && id === "logout") {
        if (session) s.logout(session);
        const response = json({ ok: true });
        response.headers.set("Set-Cookie", sessionCookie(req, "", 0));
        return response;
      }
      throw new AppError("接口不存在", 404);
    }
    if (!s.authenticate(session)) throw new AppError("请先登录", 401);
    if (resource === "state" && method === "GET" && !id) return json(s.state());
    if (resource === "prompts") {
      if (id === "optimize" && method === "POST")
        return json(await optimizePrompt(s, await body(req)));
      if (method === "POST" && !id)
        return json(s.savePrompt(await body(req)), 201);
      if (id && method === "PATCH" && !action)
        return json(s.savePrompt(await body(req), id));
      if (id && method === "DELETE" && !action) return json(s.deletePrompt(id));
      if (id && method === "POST" && action === "restore")
        return json(s.restorePrompt(id));
      if (id && method === "POST" && action === "rollback")
        return json(s.rollbackPrompt(id, (await body(req)).version));
    }
    if (resource === "categories") {
      if (method === "POST" && !id)
        return json(s.saveCategory(await body(req)), 201);
      if (id && method === "PATCH" && !action)
        return json(s.saveCategory(await body(req), id));
      if (id && method === "DELETE" && !action) {
        s.deleteCategory(id);
        return json({ ok: true });
      }
    }
    if (resource === "projects" && method === "POST" && !id)
      return json(s.createProject(await body(req)), 201);
    if (resource === "accounts") {
      if (method === "POST" && !id)
        return json(s.saveAccount(await body(req)), 201);
      if (id && method === "PATCH" && !action)
        return json(s.saveAccount(await body(req), id));
      if (id && method === "DELETE" && !action) {
        s.deleteAccount(id);
        return json({ ok: true });
      }
      if (id && method === "POST" && action === "test")
        return json(await testAccount(s, id));
      if (id && method === "POST" && action === "balance")
        return json(await refreshBalance(s, id));
    }
    if (resource === "tasks") {
      if (method === "POST" && !id)
        return json(s.createTasks(await body(req)), 201);
      if (id && method === "POST" && action === "cancel") {
        const t = s.get<GenerationTask>("tasks", id);
        return json(
          t.status === "queued"
            ? s.cancelQueued(id)
            : await cancelRemoteTask(s, t),
        );
      }
      if (id && method === "POST" && action === "refresh")
        return json(await refreshTask(s, id));
    }
    if (resource === "settings" && method === "PATCH" && !id)
      return json(s.updateSettings(await body(req)));
    if (resource === "assets") {
      if (method === "POST" && !id) {
        const bytes = await readBody(req, 51 * 1024 * 1024);
        const form = await new Request(req.url, {
          method: "POST",
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
          body: bytes,
        }).formData();
        const file = form.get("file");
        const projectId = form.get("projectId");
        if (!(file instanceof File) || typeof projectId !== "string")
          throw new AppError("请上传文件并选择项目");
        return json(
          s.saveAsset(
            Buffer.from(await file.arrayBuffer()),
            file.type,
            file.name,
            projectId,
          ),
          201,
        );
      }
      if (id && method === "GET" && !action) {
        const { asset, buffer } = s.assetData(id);
        const response = new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": asset.mime,
            "Content-Length": String(buffer.length),
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cross-Origin-Resource-Policy": "same-origin",
            "Accept-Ranges": "none",
          },
        });
        return response;
      }
      if (id && method === "DELETE" && !action) {
        s.deleteAsset(id);
        return json({ ok: true });
      }
    }
    throw new AppError("接口不存在", 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (
      e instanceof SyntaxError ||
      e instanceof URIError ||
      e instanceof TypeError
    )
      return json({ error: "请求参数或格式无效" }, 400);
    return json(
      { error: "服务器无法完成请求，请检查本地服务日志和配置。" },
      500,
    );
  }
}
