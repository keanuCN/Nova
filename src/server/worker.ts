import { getStudio, Studio, AppError } from "./studio";
import {
  submitTask,
  pollTask,
  downloadResult,
  ProviderError,
  type Fetcher,
  type ProviderResult,
} from "./providers";
import type { GenerationTask } from "../shared/types";

async function finishResult(
  s: Studio,
  t: GenerationTask,
  r: ProviderResult,
  fetcher: Fetcher,
) {
  if (r.status === "succeeded") {
    const downloaded = r.bytes
      ? { bytes: r.bytes, mime: r.mime || "audio/mpeg" }
      : r.url
        ? await downloadResult(r.url, fetcher)
        : undefined;
    if (!downloaded) throw new AppError("厂商未返回可用生成素材");
    const mime =
      downloaded.mime === "application/octet-stream" || !downloaded.mime
        ? t.kind === "audio"
          ? "audio/mpeg"
          : "video/mp4"
        : downloaded.mime;
    const asset = s.saveAsset(
      downloaded.bytes,
      mime,
      `${t.kind === "audio" ? "配音" : "视频"}-${t.id.slice(0, 8)}.${t.kind === "audio" ? "mp3" : mime === "video/quicktime" ? "mov" : "mp4"}`,
      t.projectId,
      t.id,
    );
    return s.updateTask(t.id, {
      status: "succeeded",
      remoteId: r.remoteId ?? t.remoteId,
      resultUrl: asset.url,
      assetId: asset.id,
      error: null,
      costStatus: "estimated",
    });
  }
  if (r.status === "failed" || r.status === "cancelled")
    return s.updateTask(t.id, {
      status: r.status,
      error: r.error ?? "厂商任务已结束，实际扣费待核对。",
      costStatus: "pending",
    });
  return s.updateTask(t.id, {
    status: "processing",
    remoteId: r.remoteId ?? t.remoteId,
    error: null,
  });
}
export async function refreshTask(
  s: Studio,
  id: string,
  fetcher: Fetcher = fetch,
) {
  const t = s.get<GenerationTask>("tasks", id);
  if (t.status !== "processing" && !(t.status === "unknown" && t.remoteId))
    throw new AppError("只有已提交并取得厂商 ID 的任务可以刷新", 409);
  if (!s.acquirePoll(id)) throw new AppError("任务正在刷新，请稍后再试", 409);
  try {
    const result = await pollTask(s, t, fetcher);
    return await finishResult(s, t, result, fetcher);
  } catch (e) {
    const message =
      e instanceof AppError ? e.message : "厂商查询失败，请稍后刷新。";
    s.updateTask(id, { error: message });
    throw e;
  } finally {
    s.releasePoll(id);
  }
}
export async function runWorkerTick(
  s: Studio = getStudio(),
  fetcher: Fetcher = fetch,
) {
  s.expireSubmissions();
  const polling = s
    .list<GenerationTask>("tasks")
    .filter(
      (t) =>
        t.status === "processing" &&
        Date.now() - Date.parse(t.updatedAt) > 15000,
    );
  await Promise.allSettled(polling.map((t) => refreshTask(s, t.id, fetcher)));
  const claims: GenerationTask[] = [];
  for (let slot = 0; slot < s.settings().concurrency; slot++) {
    const t = s.claimTask();
    if (!t) break;
    claims.push(t);
  }
  await Promise.all(
    claims.map(async (t) => {
      let received = false;
      try {
        const result = await submitTask(s, t, fetcher);
        received = true;
        if (result.remoteId)
          s.updateTask(t.id, {
            status: "processing",
            remoteId: result.remoteId,
          });
        await finishResult(
          s,
          { ...t, remoteId: result.remoteId ?? t.remoteId },
          result,
          fetcher,
        );
      } catch (e) {
        // Once a paid response arrived, a local storage failure must never release its reservation or retry submission.
        const current = s.get<GenerationTask>("tasks", t.id);
        const uncertain =
          received ||
          (e instanceof ProviderError ? e.uncertain : !(e instanceof AppError));
        s.updateTask(t.id, {
          status:
            received && current.remoteId
              ? "processing"
              : uncertain
                ? "unknown"
                : "failed",
          costStatus: uncertain ? "pending" : "estimated",
          error:
            e instanceof AppError
              ? e.message
              : "提交结果无法确认，请到厂商控制台核对，系统不会自动重试。",
        });
      }
    }),
  );
}
