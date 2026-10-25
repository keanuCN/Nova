import type { Category, GenerationTask, Model, TaskInput } from "./types";
export function billingPeriod(value: string | Date): {
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const read = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  const month = `${read("year")}-${read("month")}`;
  return { month, day: `${month}-${read("day")}` };
}
export function isBudgetCommitted(
  task: Pick<GenerationTask, "status" | "costStatus">,
): boolean {
  return !(
    (task.status === "cancelled" || task.status === "failed") &&
    task.costStatus !== "pending"
  );
}
export function orderTasks(tasks: GenerationTask[]): GenerationTask[] {
  const active = (t: GenerationTask) =>
    ["queued", "submitting", "processing", "unknown"].includes(t.status)
      ? 0
      : 1;
  return [...tasks].sort(
    (a, b) =>
      active(a) - active(b) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
export function extractVariables(content: string): string[] {
  return [
    ...new Set(
      [...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim()),
    ),
  ];
}
export function renderTemplate(
  content: string,
  values: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, key: string) => {
    const value = values[key.trim()];
    if (!value?.trim()) throw new Error(`请填写${key.trim()}`);
    return value;
  });
}
export function estimateCost(
  model: Model,
  input: Pick<TaskInput, "resolution" | "duration" | "prompt" | "count">,
  rate = 7.2,
): number {
  const price = model.rates[input.resolution];
  if (price === undefined) throw new Error("不支持的分辨率");
  const units =
    model.rateUnit === "character"
      ? [...input.prompt].reduce(
          (sum, c) =>
            sum +
            (model.providerId === "minimax" && /\p{Script=Han}/u.test(c)
              ? 2
              : 1),
          0,
        )
      : model.rateUnit === "song"
        ? 1
        : input.duration;
  return (
    Math.round(
      units * price * input.count * (model.currency === "USD" ? rate : 1) * 1e6,
    ) / 1e6
  );
}
export function categoryDescendants(
  categories: Category[],
  id: string,
): string[] {
  const result: string[] = [];
  const visit = (key: string) => {
    if (result.includes(key)) return;
    result.push(key);
    categories.filter((c) => c.parentId === key).forEach((c) => visit(c.id));
  };
  visit(id);
  return result;
}
export function validateTaskInput(input: TaskInput, model: Model): void {
  if (!model.enabled) throw new Error("该模型尚未开放接入");
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 10000
  )
    throw new Error("提示词应为 1–10000 个字符");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 4)
    throw new Error("生成数量应为 1–4");
  if (!model.modes.includes(input.mode))
    throw new Error("模型不支持该生成模式");
  if (!model.resolutions.includes(input.resolution))
    throw new Error("模型不支持该分辨率");
  if (!model.durations.includes(input.duration))
    throw new Error("模型不支持该时长");
  if (model.kind === "video" && !model.aspects.includes(input.aspectRatio))
    throw new Error("模型不支持该画幅");
  if (
    input.mode !== "text" &&
    (!Array.isArray(input.referenceAssetIds) ||
      input.referenceAssetIds.length === 0)
  )
    throw new Error("请上传参考素材");
  if (input.negativePrompt?.trim() && !model.negativePrompt)
    throw new Error("模型不支持负向提示词");
  if (input.audio && !model.audio) throw new Error("模型不支持生成音轨");
}
