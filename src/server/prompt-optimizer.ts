import type { Account } from "../shared/types";
import type { Studio } from "./studio";
import { AppError } from "./errors";

type OptimizeInput = {
  accountId?: unknown;
  prompt?: unknown;
  kind?: unknown;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

function apiError(status: number) {
  if (status === 401 || status === 403)
    return new AppError("DeepSeek API Key 无效或无权访问，请检查账户绑定。", 400);
  if (status === 402)
    return new AppError("DeepSeek API 余额不足，请查询额度并充值后重试。", 402);
  if (status === 429)
    return new AppError("DeepSeek API 暂时限流，请稍后重试。", 429);
  if (status >= 500)
    return new AppError("DeepSeek 服务暂时不可用，请稍后重试。", 502);
  return new AppError(`DeepSeek 请求未通过（HTTP ${status}），请检查输入。`, 400);
}

export async function optimizePrompt(
  studio: Studio,
  input: OptimizeInput,
  fetcher: Fetcher = fetch,
) {
  if (typeof input.accountId !== "string" || !input.accountId)
    throw new AppError("请选择已绑定的 DeepSeek 账户");
  if (typeof input.prompt !== "string" || !input.prompt.trim())
    throw new AppError("请先填写提示词");
  if (input.prompt.length > 10_000)
    throw new AppError("提示词不能超过 10000 个字符");
  if (input.kind !== "video" && input.kind !== "audio")
    throw new AppError("暂不支持该创作类型");

  const account = studio.get<Account>("accounts", input.accountId);
  if (account.providerId !== "deepseek")
    throw new AppError("提示词优化需要 DeepSeek 账户");
  if (!account.enabled) throw new AppError("该 DeepSeek 账户已停用");
  const { key } = studio.credentials(account.id);
  const task =
    input.kind === "video"
      ? "视频生成提示词"
      : "音频配音文案";
  const system =
    input.kind === "video"
      ? "你是专业的视频生成提示词编辑。基于用户原意优化为清晰、具体、可执行的生成提示词，可梳理主体与动作、场景、构图、镜头运动、光线色彩和氛围。不得擅自改变主题、事实或创意，不要引入矛盾要求；保留所有 {{变量名}} 占位符原样不动。沿用原文语言，只输出优化后的提示词正文，不要标题、解释或引号。"
      : "你是专业的配音文案编辑。保留原意、事实、专有名词与数字，优化口语自然度、节奏、断句和标点，不要添加原文没有的信息；保留所有 {{变量名}} 占位符原样不动。沿用原文语言，只输出优化后的配音文案正文，不要标题、解释或引号。";

  let response: Response;
  try {
    response = await fetcher("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `请优化以下${task}：\n\n${input.prompt.trim()}`,
          },
        ],
        temperature: 0.45,
        max_tokens: 1500,
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
    });
  } catch {
    throw new AppError(
      "未收到 DeepSeek 响应，可能已提交并产生费用；请先查询额度，再决定是否重试。",
      502,
    );
  }
  if (!response.ok) throw apiError(response.status);

  let data: any;
  try {
    const raw = await response.text();
    if (raw.length > 512 * 1024) throw new Error("response too large");
    data = JSON.parse(raw);
  } catch {
    throw new AppError("DeepSeek 返回内容无法读取，请稍后重试。", 502);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new AppError("DeepSeek 没有返回可用的优化结果。", 502);
  const prompt = text
    .trim()
    .replace(/^```(?:\w+)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!prompt || prompt.length > 20_000)
    throw new AppError("DeepSeek 返回的提示词长度无效。", 502);
  return {
    prompt,
    model: typeof data.model === "string" ? data.model : "deepseek-flash",
    usage: {
      inputTokens: Number.isSafeInteger(data?.usage?.prompt_tokens)
        ? data.usage.prompt_tokens
        : null,
      outputTokens: Number.isSafeInteger(data?.usage?.completion_tokens)
        ? data.usage.completion_tokens
        : null,
    },
  };
}
