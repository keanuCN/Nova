import { runWorkerTick } from "../src/server/worker";
import { getStudio } from "../src/server/studio";
const studio = getStudio();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.info(
  "Nova 后台任务服务已启动：持久化队列，每 3 秒检查；无任务时不会调用生成接口。",
);
while (!stopping) {
  try {
    await runWorkerTick(studio);
  } catch {
    console.error("Worker 本轮处理失败，请检查数据库或网络配置。");
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000));
}
studio.close();
