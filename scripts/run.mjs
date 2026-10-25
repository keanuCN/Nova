import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
export function launch(mode) {
  const isDev = mode === "dev";
  // Load env files once in the supervisor. Passing Node's env-file flags to
  // child processes makes Node propagate them through NODE_OPTIONS, where
  // those flags are rejected by Next's own workers on Windows.
  for (const file of [".env", ".env.local"]) {
    if (existsSync(resolve(file))) process.loadEnvFile(resolve(file));
  }
  const children = [
    spawn(
      process.execPath,
      [
        resolve("node_modules/next/dist/bin/next"),
        isDev ? "dev" : "start",
        "--hostname",
        isDev ? "127.0.0.1" : "0.0.0.0",
        ...process.argv.slice(2),
      ],
      { stdio: "inherit", windowsHide: true },
    ),
    spawn(
      process.execPath,
      ["--import", "tsx", resolve("scripts/worker.ts")],
      { stdio: "inherit", windowsHide: true },
    ),
  ];
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (!child.killed) child.kill("SIGTERM");
    setTimeout(() => process.exit(code), 1500).unref();
  }
  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
  for (const child of children) {
    child.on("error", (e) => {
      console.error("启动失败：", e.message);
      stop(1);
    });
    child.on("exit", (code, signal) => {
      if (!stopping) {
        console.error(`子进程退出 (${code ?? signal})，正在关闭工作台。`);
        stop(code ?? 1);
      }
    });
  }
}
