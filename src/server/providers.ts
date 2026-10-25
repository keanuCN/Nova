import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getModel } from "../shared/catalog";
import type {
  Account,
  GenerationTask,
  Model,
  TaskInput,
} from "../shared/types";
import type { Studio } from "./studio";
import { AppError } from "./errors";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class ProviderError extends AppError {
  constructor(
    message: string,
    public uncertain = false,
    status = 502,
  ) {
    super(message, status);
  }
}
export interface ProviderResult {
  status: "processing" | "succeeded" | "failed" | "cancelled";
  remoteId?: string;
  url?: string;
  bytes?: Buffer;
  mime?: string;
  error?: string;
}
// Official API references, verified 2026-10-24. Payloads are deliberately provider-specific.
export const providerSources = {
  deepseek: "https://api-docs.deepseek.com/api/get-user-balance/",
  deepseekChat: "https://api-docs.deepseek.com/api/create-chat-completion/",
  volcengine:
    "https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh",
  aliyun:
    "https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference",
  minimax:
    "https://platform.minimax.cn/docs/api-reference/video-generation-v2-create",
  speech: "https://platform.minimax.cn/docs/api-reference/speech-t2a-http",
  runway: "https://docs.dev.runwayml.com/api/",
  kling: "https://dev.runwayml.com/learn/kling-3-0-api",
  elevenlabs: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
  vidu: "https://platform.vidu.cn/docs/api-reference/task-management/account-balance",
};
const supported = new Set([
  "doubao-seedance-2-5-260628",
  "doubao-seedance-2-0-mini-260615",
  "wan3.0-video",
  "wan3.0-video-prime",
  "MiniMax-H3",
  "MiniMax-H3-Lite",
  "gen4.5",
  "kling3.0_pro",
  "speech-2.8-turbo",
  "speech-2.8-hd",
  "eleven_v4",
]);
export function validateProviderInput(
  s: Studio,
  input: TaskInput,
  model: Model,
) {
  if (!supported.has(model.remoteId))
    throw new AppError("该模型的官方协议尚未核验，暂不可提交");
  if (input.mode === "reference") throw new AppError("暂未接入参考输入计费");
  if (
    model.providerId === "runway" &&
    input.prompt.length > (model.remoteId === "gen4.5" ? 1000 : 2500)
  )
    throw new AppError("Runway 提示词超过该模型长度限制");
  if (
    model.providerId === "minimax" &&
    model.kind === "audio" &&
    input.prompt.length >= 10000
  )
    throw new AppError("MiniMax 配音文本须少于 10000 字符");
  if (
    model.remoteId === "gen4.5" &&
    input.mode === "text" &&
    !["16:9", "9:16"].includes(input.aspectRatio)
  )
    throw new AppError("Gen-4.5 文生视频仅支持 16:9 或 9:16");
  if (
    model.providerId === "aliyun" &&
    !["中国 · 北京", "中国大陆 · 北京", "北京", "cn-beijing"].includes(
      s.get<Account>("accounts", input.accountId).region,
    )
  )
    throw new AppError("当前万相价格快照仅支持北京地域账户");
  if (
    model.providerId === "minimax" &&
    !["中国大陆", "国际"].includes(
      s.get<Account>("accounts", input.accountId).region,
    )
  )
    throw new AppError("MiniMax 地域请选择中国大陆或国际");
  if (
    model.providerId === "minimax" &&
    s.get<Account>("accounts", input.accountId).region !== "中国大陆"
  )
    throw new AppError("当前 MiniMax 生成仅支持中国大陆价格快照");
  if (model.providerId === "minimax" && model.kind === "video" && !input.audio)
    throw new AppError("H3 原生输出音轨，当前不支持关闭音轨");
  if (input.mode === "image") {
    if (!["volcengine", "runway", "aliyun"].includes(model.providerId))
      throw new AppError(
        "当前厂商需要公网素材地址；私有本地图片不会发送为不可访问的 localhost 地址。请选择火山、万相或 Runway 首帧模式。",
      );
    const a = s.get<{ size: number; mime: string }>(
      "assets",
      input.referenceAssetIds[0],
    );
    if (a.size > 4 * 1024 * 1024)
      throw new AppError("当前首帧传输上限为 4MB，请压缩图片后上传");
    if (
      model.providerId === "runway" &&
      Math.ceil(a.size / 3) * 4 + a.mime.length + 13 > 5 * 1024 * 1024
    )
      throw new AppError(
        "Runway 首帧编码后上限为 5MB，请将原图压缩到 3.7MB 以下",
      );
    if (!["image/png", "image/jpeg", "image/webp"].includes(a.mime))
      throw new AppError("首帧仅支持 PNG/JPEG/WebP");
  }
}
function context(s: Studio, t: GenerationTask) {
  const snapshot = t.priceSnapshot as { model?: Model } | null;
  const model =
    snapshot?.model?.id === t.modelId ? snapshot.model : getModel(t.modelId);
  const account = s.get<Account>("accounts", t.accountId);
  const credentials = s.credentials(account.id);
  let origin = "";
  if (model.providerId === "volcengine")
    origin = "https://ark.cn-beijing.volces.com";
  if (model.providerId === "minimax") {
    if (account.region === "中国大陆") origin = "https://api.minimax.cn";
    else if (account.region === "国际") origin = "https://api.minimax.io";
    else throw new AppError("MiniMax 地域请选择中国大陆或国际");
  }
  if (model.providerId === "runway") origin = "https://api.dev.runwayml.com";
  if (model.providerId === "elevenlabs") origin = "https://api.elevenlabs.io";
  if (model.providerId === "aliyun") {
    if (
      !credentials.secret ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(credentials.secret)
    )
      throw new AppError("请配置有效的阿里云 Workspace ID");
    origin = `https://${credentials.secret}.cn-beijing.maas.aliyuncs.com`;
  }
  if (!origin) throw new AppError("厂商暂未接入");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (model.providerId === "elevenlabs")
    headers["xi-api-key"] = credentials.key;
  else headers.Authorization = `Bearer ${credentials.key}`;
  if (model.providerId === "runway") headers["X-Runway-Version"] = "2024-11-06";
  return { model, origin, headers };
}
async function request(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  method = "GET",
  body?: unknown,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError(
      method === "POST"
        ? "提交未收到确定响应；厂商可能已受理，请核对控制台，系统不会自动重试。"
        : "厂商查询连接失败，请稍后刷新。",
      method === "POST",
    );
  }
  if (!response.ok)
    throw new ProviderError(
      `厂商返回 HTTP ${response.status}，请检查密钥权限、地域或额度。`,
      method === "POST" && response.status >= 500,
      response.status === 401 || response.status === 403 ? 400 : 502,
    );
  return response;
}
async function json(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const response = await request(fetcher, url, headers, method, body);
  try {
    const data = await response.json();
    if (data?.base_resp?.status_code && data.base_resp.status_code !== 0)
      throw new ProviderError(
        `厂商业务错误 ${Number(data.base_resp.status_code) || "未知"}，请在控制台查看详情。`,
        method === "POST" &&
          ![1002, 1004, 1008, 2013].includes(
            Number(data.base_resp.status_code),
          ),
      );
    if (data?.error || data?.code)
      throw new ProviderError(
        "厂商返回业务错误，请在控制台查看请求详情。",
        method === "POST",
      );
    return data;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(
      "厂商响应无法解析；请在控制台核对请求。",
      method === "POST",
    );
  }
}
function remoteId(data: any, key: string) {
  if (typeof data?.[key] !== "string" && typeof data?.[key] !== "number")
    throw new ProviderError("厂商未返回任务标识，请在控制台核对请求。", true);
  return String(data[key]);
}
function deepseekBalanceRows(data: any) {
  if (
    typeof data?.is_available !== "boolean" ||
    !Array.isArray(data.balance_infos)
  )
    throw new ProviderError("DeepSeek 未返回有效的账户余额信息");
  const rows: { currency: "CNY" | "USD"; amount: number }[] =
    data.balance_infos.flatMap((row: any) => {
      const amount =
        typeof row?.total_balance === "string"
          ? Number(row.total_balance)
          : NaN;
      if (
        !["CNY", "USD"].includes(row?.currency) ||
        !Number.isFinite(amount) ||
        amount < 0
      )
        return [];
      return [{ currency: row.currency as "CNY" | "USD", amount }];
    });
  if (!rows.length)
    throw new ProviderError("DeepSeek 未返回有效的 CNY 或 USD 可用余额");
  return rows;
}
function imageData(s: Studio, t: GenerationTask) {
  const { asset, buffer } = s.assetData(t.input.referenceAssetIds[0]);
  return `data:${asset.mime};base64,${buffer.toString("base64")}`;
}
export async function submitTask(
  s: Studio,
  t: GenerationTask,
  fetcher: Fetcher = fetch,
): Promise<ProviderResult> {
  const { model, origin, headers } = context(s, t);
  validateProviderInput(s, t.input, model);
  const i = t.input;
  const image = i.mode === "image" ? imageData(s, t) : undefined;
  if (model.providerId === "volcengine") {
    const content: unknown[] = [{ type: "text", text: i.prompt }];
    if (image)
      content.push({
        type: "image_url",
        image_url: { url: image },
        role: "first_frame",
      });
    const data = await json(
      fetcher,
      `${origin}/api/v3/contents/generations/tasks`,
      headers,
      "POST",
      {
        model: model.remoteId,
        content,
        resolution: i.resolution,
        ratio: i.aspectRatio,
        duration: i.duration,
        generate_audio: i.audio,
      },
    );
    return { status: "processing", remoteId: remoteId(data, "id") };
  }
  if (model.providerId === "aliyun") {
    const data = await json(
      fetcher,
      `${origin}/api/v1/services/aigc/video-generation/video-synthesis`,
      { ...headers, "X-DashScope-Async": "enable" },
      "POST",
      {
        model: model.remoteId,
        input: {
          prompt: i.prompt,
          ...(image ? { media: [{ type: "first_frame", url: image }] } : {}),
        },
        parameters: {
          resolution: i.resolution.toUpperCase(),
          ratio: i.aspectRatio,
          duration: i.duration,
          audio: i.audio,
        },
      },
    );
    return { status: "processing", remoteId: remoteId(data.output, "task_id") };
  }
  if (model.providerId === "minimax" && model.kind === "video") {
    const data = await json(
      fetcher,
      `${origin}/v2/video_generation`,
      headers,
      "POST",
      {
        model: model.remoteId,
        content: [{ type: "text", text: i.prompt }],
        resolution: i.resolution,
        duration: i.duration,
        ratio: i.aspectRatio,
      },
    );
    return { status: "processing", remoteId: remoteId(data, "task_id") };
  }
  if (model.providerId === "minimax" && model.kind === "audio") {
    const data = await json(fetcher, `${origin}/v1/t2a_v2`, headers, "POST", {
      model: model.remoteId,
      text: i.prompt,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: i.voiceId || model.voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    });
    const audio = data.data?.audio;
    if (
      typeof audio !== "string" ||
      !/^(?:[0-9a-fA-F]{2})+$/.test(audio) ||
      audio.length > 100 * 1024 * 1024
    )
      throw new ProviderError("配音响应中没有有效音频，请核对厂商记录。", true);
    return {
      status: "succeeded",
      bytes: Buffer.from(audio, "hex"),
      mime: "audio/mpeg",
    };
  }
  if (model.providerId === "runway") {
    const ratios =
      model.remoteId === "gen4.5"
        ? { "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960" }
        : { "16:9": "1920:1080", "9:16": "1080:1920", "1:1": "1440:1440" };
    const data = await json(
      fetcher,
      `${origin}/v1/${image ? "image_to_video" : "text_to_video"}`,
      headers,
      "POST",
      {
        model: model.remoteId,
        promptText: i.prompt,
        ratio: ratios[i.aspectRatio as keyof typeof ratios],
        duration: i.duration,
        ...(image ? { promptImage: image } : {}),
        ...(model.remoteId === "kling3.0_pro" ? { audio: i.audio } : {}),
      },
    );
    return { status: "processing", remoteId: remoteId(data, "id") };
  }
  if (model.providerId === "elevenlabs") {
    const voice = i.voiceId || model.voiceId;
    if (!voice || !/^[a-zA-Z0-9_-]{1,120}$/.test(voice))
      throw new AppError("无效的音色 ID");
    const response = await request(
      fetcher,
      `${origin}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      headers,
      "POST",
      { text: i.prompt, model_id: model.remoteId },
    );
    try {
      const bytes = await limitedBody(response);
      if (bytes.length === 0) throw new Error("empty audio");
      return { status: "succeeded", bytes, mime: "audio/mpeg" };
    } catch {
      // A successful POST may already be billed even when its response cannot be read or stored.
      await response.body?.cancel().catch(() => {});
      throw new ProviderError(
        "厂商已接受配音请求，但音频响应读取失败。请核对官方记录，系统不会自动重试。",
        true,
      );
    }
  }
  throw new AppError("该模型暂未接入");
}
export async function pollTask(
  s: Studio,
  t: GenerationTask,
  fetcher: Fetcher = fetch,
): Promise<ProviderResult> {
  if (!t.remoteId) throw new AppError("此任务缺少厂商任务 ID，无法查询", 409);
  const { model, origin, headers } = context(s, t);
  const id = encodeURIComponent(t.remoteId);
  let status: string, url: string | undefined;
  if (model.providerId === "volcengine") {
    const data = await json(
      fetcher,
      `${origin}/api/v3/contents/generations/tasks/${id}`,
      headers,
    );
    status = String(data.status).toLowerCase();
    url = data.content?.video_url;
  } else if (model.providerId === "aliyun") {
    const data = await json(fetcher, `${origin}/api/v1/tasks/${id}`, headers);
    status = String(data.output?.task_status).toLowerCase();
    url = data.output?.video_url;
  } else if (model.providerId === "minimax" && model.kind === "video") {
    const data = await json(
      fetcher,
      `${origin}/v2/query/video_generation/${id}`,
      headers,
    );
    status = String(data.task?.status).toLowerCase();
    url = data.task?.content?.url;
  } else if (model.providerId === "runway") {
    const data = await json(fetcher, `${origin}/v1/tasks/${id}`, headers);
    status = String(data.status).toLowerCase();
    url = data.output?.[0];
  } else throw new AppError("此厂商不支持任务查询");
  if (["succeeded", "success"].includes(status)) {
    if (typeof url !== "string")
      throw new ProviderError(
        "厂商已完成，但未返回可下载地址；请稍后刷新或核对控制台。",
      );
    return { status: "succeeded", url };
  }
  if (["failed", "fail", "expired"].includes(status))
    return {
      status: "failed",
      error: "厂商任务失败，请到厂商控制台查看详情。实际扣费待账单确认。",
    };
  if (["cancelled", "canceled"].includes(status))
    return {
      status: "cancelled",
      error: "厂商已取消任务。实际扣费待账单确认。",
    };
  if (
    ![
      "queued",
      "pending",
      "running",
      "processing",
      "submitted",
      "preparing",
      "queueing",
      "throttled",
    ].includes(status)
  )
    throw new ProviderError("厂商任务状态未知，请核对控制台。");
  return { status: "processing" };
}
export async function testAccount(
  s: Studio,
  id: string,
  fetcher: Fetcher = fetch,
) {
  const account = s.get<Account>("accounts", id);
  const credentials = s.credentials(id);
  let url = "",
    headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.key}`,
    };
  if (account.providerId === "runway") {
    url = "https://api.dev.runwayml.com/v1/organization";
    headers["X-Runway-Version"] = "2024-11-06";
  } else if (account.providerId === "elevenlabs") {
    url = "https://api.elevenlabs.io/v1/user/subscription";
    headers = { "xi-api-key": credentials.key };
  } else if (account.providerId === "vidu") {
    url = viduOrigin(account.region) + "/ent/v2/credits";
    headers = { Authorization: `Token ${credentials.key}` };
  } else if (account.providerId === "deepseek") {
    url = "https://api.deepseek.com/user/balance";
  } else if (account.providerId === "volcengine")
    url = "https://ark.cn-beijing.volces.com/api/v3/models";
  else
    throw new AppError(
      "该厂商没有已核验的免费凭据检测接口，请在官方控制台验证；系统不会发起收费测试。",
      422,
    );
  try {
    const data = await json(fetcher, url, headers);
    if (account.providerId === "deepseek") deepseekBalanceRows(data);
    return s.updateAccount(id, {
      status: account.enabled ? "connected" : "disabled",
      lastError: undefined,
    });
  } catch (e) {
    s.updateAccount(id, {
      status: "error",
      lastError: e instanceof AppError ? e.message : "凭据检测失败",
    });
    throw e;
  }
}
export async function cancelRemoteTask(
  s: Studio,
  t: GenerationTask,
  fetcher: Fetcher = fetch,
) {
  if (t.status !== "processing" || !t.remoteId)
    throw new AppError("当前任务无法安全取消，请在厂商控制台核对", 409);
  const { model, origin, headers } = context(s, t);
  if (model.providerId !== "runway")
    throw new AppError("当前厂商远程取消尚未接入，请在厂商控制台操作", 422);
  if (!s.acquirePoll(t.id)) throw new AppError("任务正在更新，请稍后重试", 409);
  try {
    await request(
      fetcher,
      `${origin}/v1/tasks/${encodeURIComponent(t.remoteId)}`,
      headers,
      "DELETE",
    );
    return s.updateTask(t.id, {
      status: "cancelled",
      costStatus: "pending",
      error: "已发送厂商取消请求，实际扣费待官方账单确认。",
    });
  } finally {
    s.releasePoll(t.id);
  }
}
export async function refreshBalance(
  s: Studio,
  id: string,
  fetcher: Fetcher = fetch,
) {
  const a = s.get<Account>("accounts", id);
  const c = s.credentials(id);
  let balance: Account["balance"];
  if (a.providerId === "deepseek") {
    const data = await json(
      fetcher,
      "https://api.deepseek.com/user/balance",
      { Authorization: `Bearer ${c.key}` },
    );
    const rows = deepseekBalanceRows(data);
    const primary = rows.find((r) => r.currency === "CNY") || rows[0];
    balance = {
      amount: primary.amount,
      unit: primary.currency,
      kind: "DeepSeek API 可用余额",
      updatedAt: new Date().toISOString(),
      note: `${rows.map((r) => `${r.currency} ${r.amount.toFixed(2)}`).join(" · ")}；提示词优化费用由 DeepSeek 直接扣除。`,
    };
  } else if (a.providerId === "runway") {
    const data = await json(
      fetcher,
      "https://api.dev.runwayml.com/v1/organization",
      { Authorization: `Bearer ${c.key}`, "X-Runway-Version": "2024-11-06" },
    );
    if (
      typeof data.creditBalance !== "number" ||
      !Number.isFinite(data.creditBalance)
    )
      throw new ProviderError("厂商未返回有效积分余额");
    balance = {
      amount: data.creditBalance,
      unit: "credits",
      kind: "API 积分",
      updatedAt: new Date().toISOString(),
      note: "来自 Runway 组织接口，积分不等同于现金余额。",
    };
  } else if (a.providerId === "elevenlabs") {
    const data = await json(
      fetcher,
      "https://api.elevenlabs.io/v1/user/subscription",
      { "xi-api-key": c.key },
    );
    if (
      typeof data.character_limit !== "number" ||
      typeof data.character_count !== "number"
    )
      throw new ProviderError("厂商未返回有效字符额度");
    balance = {
      amount: Math.max(0, data.character_limit - data.character_count),
      unit: "字符",
      kind: "周期剩余字符额度",
      updatedAt: new Date().toISOString(),
      note: `已使用 ${data.character_count} / ${data.character_limit} 字符；非现金余额。`,
    };
  } else if (a.providerId === "vidu") {
    const data = await json(fetcher, viduOrigin(a.region) + "/ent/v2/credits", {
      Authorization: `Token ${c.key}`,
    });
    // The official example calls this `remains`; the field table calls it `remaining_credits`.
    const remains: unknown = data.remains ?? data.remaining_credits;
    if (
      !Array.isArray(remains) ||
      remains.some(
        (r) =>
          !r ||
          !["test", "metered", "concurrent"].includes(r.type) ||
          !Number.isSafeInteger(r.credit_remain) ||
          r.credit_remain < 0,
      )
    ) {
      throw new ProviderError("厂商未返回有效的分类积分余额");
    }
    const amount = (type: string): number | null =>
      remains.find((r) => r.type === type)?.credit_remain ?? null;
    balance = {
      amount: amount("metered"),
      unit: "积分",
      kind: "计量资源包积分",
      updatedAt: new Date().toISOString(),
      note: `测试积分 ${amount("test") ?? "未返回"}；并发包积分 ${amount("concurrent") ?? "未返回"}。各资源包保留分类，不等同于现金余额。`,
    };
  } else {
    balance = {
      amount: null,
      unit: "",
      kind: a.balance.kind,
      updatedAt: null,
      note: ["volcengine", "aliyun", "google"].includes(a.providerId)
        ? "云账户余额需要单独的只读云账单凭据，模型 API Key 无法查询；请通过官方账单入口查看。"
        : "此厂商余额接口尚未核验，请通过官方账单入口查看。",
    };
  }
  return s.updateAccount(id, { balance });
}
function viduOrigin(region: string) {
  if (region === "中国大陆") return "https://api.vidu.cn";
  if (region === "国际") return "https://api.vidu.com";
  throw new AppError("Vidu 地域请选择中国大陆或国际");
}
async function limitedBody(response: Response) {
  if (Number(response.headers.get("content-length")) > 50 * 1024 * 1024)
    throw new AppError("生成素材超过 50MB，请从厂商控制台下载");
  if (!response.body) throw new AppError("生成素材响应为空");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 50 * 1024 * 1024)
        throw new AppError("生成素材超过 50MB，请从厂商控制台下载");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
const safeSuffixes = [
  ".volces.com",
  ".byteimg.com",
  ".ibytedtos.com",
  ".aliyuncs.com",
  ".minimax.io",
  ".minimax.cn",
  ".minimaxi.com",
  ".minimax.chat",
  ".hailuoai.com",
  ".amazonaws.com",
  ".cloudfront.net",
  ".runwayml.com",
  ".runway.com",
  ".elevenlabs.io",
];
export async function downloadResult(url: string, fetcher: Fetcher = fetch) {
  let target = url;
  for (let redirects = 0; redirects < 4; redirects++) {
    const u = new URL(target);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443") ||
      isIP(u.hostname) ||
      !safeSuffixes.some((suffix) => u.hostname.endsWith(suffix))
    )
      throw new AppError(
        "厂商返回的素材域名不在可信下载范围，请从官方控制台下载",
      );
    const addresses = await lookup(u.hostname, { all: true });
    if (
      addresses.length === 0 ||
      addresses.some((a) => !publicAddress(a.address))
    )
      throw new AppError("素材地址解析到非公网地址，下载已阻止");
    const response = await fetcher(u.href, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(90000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new AppError("素材下载重定向无效");
      target = new URL(location, u).href;
      continue;
    }
    if (!response.ok) throw new AppError("厂商素材下载失败，请稍后刷新");
    return {
      bytes: await limitedBody(response),
      mime: (response.headers.get("content-type") ?? "").split(";")[0],
    };
  }
  throw new AppError("素材下载重定向次数过多");
}
function publicAddress(ip: string) {
  if (ip.includes(":"))
    return (
      !/^(::|fc|fd|fe8|fe9|fea|feb|ff)/i.test(ip) &&
      !ip.toLowerCase().startsWith("2001:db8")
    );
  const n = ip.split(".").map(Number);
  return (
    n.length === 4 &&
    n[0] !== 0 &&
    n[0] !== 10 &&
    n[0] !== 127 &&
    n[0] < 224 &&
    !(n[0] === 169 && n[1] === 254) &&
    !(n[0] === 172 && n[1] >= 16 && n[1] <= 31) &&
    !(n[0] === 192 && n[1] === 168) &&
    !(n[0] === 100 && n[1] >= 64 && n[1] <= 127)
  );
}
