import type { PromptTemplate } from "./types";
import { models } from "./catalog";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface TemplateDraft {
  text: string;
  template: PromptTemplate;
}
const key = "yingzao-template-draft";
const promptResumeKey = "yingzao-prompt-resume";
export function saveDraft(storage: StoragePort, draft: TemplateDraft) {
  storage.setItem(key, JSON.stringify(draft));
}
export interface PromptResumeDraft {
  text: string;
  kind: "audio" | "video";
  template?: PromptTemplate;
}
export function savePromptResume(
  storage: StoragePort,
  draft: PromptResumeDraft,
) {
  storage.setItem(promptResumeKey, JSON.stringify(draft));
}
export function takePromptResume(
  storage: StoragePort,
  kind: "audio" | "video",
): PromptResumeDraft | null {
  const raw = storage.getItem(promptResumeKey);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PromptResumeDraft;
    if (
      typeof data.text !== "string" ||
      !["audio", "video"].includes(data.kind) ||
      data.text.length > 10_000
    )
      throw new Error("invalid prompt resume draft");
    if (data.kind !== kind) return null;
    storage.removeItem(promptResumeKey);
    if (data.template && typeof data.template.id !== "string")
      data.template = undefined;
    return data;
  } catch {
    storage.removeItem(promptResumeKey);
    return null;
  }
}
export function takeDraft(
  storage: StoragePort,
  kind: "audio" | "video",
): TemplateDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as TemplateDraft;
    if (typeof data.text !== "string" || typeof data.template?.id !== "string")
      throw new Error("invalid draft");
    const model = models.find((m) => m.id === data.template.modelId);
    if (!model) throw new Error("invalid model");
    if (model.kind !== kind) return null;
    storage.removeItem(key);
    return data;
  } catch {
    storage.removeItem(key);
    return null;
  }
}
