import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertAuthConfiguration } from "./auth.js";
import { createRouter } from "./router.js";
import { registerCpuProfiler } from "./profiler.js";

loadEnvFile(process.cwd());
assertAuthConfiguration();

// SIGUSR2 → 有界 CPU 采样。必须在这里注册：
// Node 对 SIGUSR2 无内置处理器，未注册时收到该信号会直接终止进程。
registerCpuProfiler();

const host = process.env.AI_RADIO_API_HOST ?? "127.0.0.1";
const configuredPort = Number(process.env.AI_RADIO_API_PORT ?? "8788");
const port = Number.isInteger(configuredPort) && configuredPort > 0
  ? configuredPort
  : 8788;

const router = createRouter(process.cwd());

const server = createServer((request, response) => {
  void router(request, response);
});

// 记录活跃连接，优雅关闭时才能真正等它们收尾
const activeSockets = new Set<import("node:net").Socket>();

server.on("connection", (socket) => {
  activeSockets.add(socket);
  socket.on("close", () => {
    activeSockets.delete(socket);
  });
});

server.listen(port, host, () => {
  console.log(`AI Radio API listening at http://${host}:${port}`);
});

/**
 * 优雅关闭。
 *
 * 背景：状态文件（聊天/历史/队列）虽已改为原子写入，但仍应给
 * 进行中的写操作留出收尾时间。直接强杀会中断正在处理的请求。
 *
 * 流程：停止接收新连接 → 等待在途请求完成（最多 15s）→ 退出。
 * 超时后强制销毁剩余连接，避免卡住 systemd 的 TimeoutStopSec=20s。
 */
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[shutdown] 收到 ${signal}，开始优雅关闭…`);

  const forceExitTimer = setTimeout(() => {
    console.warn("[shutdown] 等待超时，强制关闭剩余连接");
    for (const socket of activeSockets) {
      socket.destroy();
    }
    process.exit(0);
  }, 15_000);

  forceExitTimer.unref();

  server.close((error) => {
    if (error) {
      console.error("[shutdown] 关闭出错:", error);
      process.exit(1);
    }

    console.log("[shutdown] 所有连接已收尾，正常退出");
    clearTimeout(forceExitTimer);
    process.exit(0);
  });

  // 空闲 keep-alive 连接不会自己断开，主动关掉
  for (const socket of activeSockets) {
    if ((socket as unknown as { _httpMessage?: unknown })._httpMessage == null) {
      socket.end();
    }
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

function loadEnvFile(rootDir: string) {
  try {
    const env = readFileSync(join(rootDir, ".env"), "utf8");

    for (const line of env.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional. Defaults keep the local mock provider working.
  }
}
