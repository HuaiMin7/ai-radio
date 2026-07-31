import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Session } from "node:inspector";

/**
 * 按需 CPU Profiler。
 *
 * 收到 SIGUSR2 时启动一次**有界**（默认 45 秒）的 CPU 采样，写入
 * `/var/lib/redio/profiles/`，用于定位「零流量下持续满载」这类死循环。
 *
 * 设计约束（来自 Codex review）：
 * - 不使用 `node --cpu-prof`：那是从启动就采样、退出才落盘，长跑开销大且文件巨大。
 * - Inspector 用 in-process `node:inspector` Session，**不监听任何端口**，
 *   不存在公网 Inspector 导致 RCE 的风险。
 * - 防重入 + 冷却，避免探针连续触发把自己压垮。
 * - 只抓 CPU profile，**不抓 Heap Snapshot**——堆里含百炼 Key、QQ Cookie
 *   和用户聊天内容，落盘属于数据泄露。
 * - 注册 SIGUSR2 处理器本身也是必需的：Node 对 SIGUSR2 无内置处理，
 *   未注册时 POSIX 默认动作是**终止进程**。
 */

const PROFILE_DIR = process.env.REDIO_PROFILE_DIR ?? "/var/lib/redio/profiles";
const DURATION_MS = Number(process.env.REDIO_PROFILE_MS ?? "45000");
const COOLDOWN_MS = 10 * 60 * 1000;
const KEEP_FILES = 10;

let running = false;
let lastRunAt = 0;

async function captureCpuProfile() {
  if (running) {
    console.warn("[profiler] 上一次采样仍在进行，忽略本次请求");
    return;
  }

  const now = Date.now();

  if (now - lastRunAt < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - lastRunAt)) / 1000);
    console.warn(`[profiler] 冷却中，${waitSec}s 后才可再次采样`);
    return;
  }

  running = true;
  lastRunAt = now;

  const session = new Session();

  try {
    session.connect();

    await post(session, "Profiler.enable");
    await post(session, "Profiler.start");
    console.warn(`[profiler] CPU 采样开始，持续 ${DURATION_MS / 1000}s`);

    await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

    const result = (await post(session, "Profiler.stop")) as {
      profile: unknown;
    };

    await mkdir(PROFILE_DIR, { recursive: true });

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const filePath = join(PROFILE_DIR, `cpu-${stamp}.cpuprofile`);

    await writeFile(filePath, JSON.stringify(result.profile), {
      encoding: "utf8",
      mode: 0o600
    });

    console.warn(`[profiler] CPU profile 已写入 ${filePath}`);

    await rotate();
  } catch (error) {
    console.error("[profiler] 采样失败:", error);
  } finally {
    try {
      session.disconnect();
    } catch {
      // ignore
    }
    running = false;
  }
}

function post(session: Session, method: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

async function rotate() {
  try {
    const { readdir, stat, unlink } = await import("node:fs/promises");
    const names = (await readdir(PROFILE_DIR)).filter((n) =>
      n.endsWith(".cpuprofile")
    );

    if (names.length <= KEEP_FILES) {
      return;
    }

    const withTime = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(PROFILE_DIR, name));
        return { name, mtime: info.mtimeMs };
      })
    );

    withTime.sort((a, b) => b.mtime - a.mtime);

    for (const item of withTime.slice(KEEP_FILES)) {
      await unlink(join(PROFILE_DIR, item.name)).catch(() => {});
    }
  } catch {
    // 轮换失败不影响主流程
  }
}

/**
 * 注册 SIGUSR2 处理器，并写下就绪标记文件，
 * 供外部取证探针判断「现在发 SIGUSR2 是安全的」。
 */
export function registerCpuProfiler() {
  process.on("SIGUSR2", () => {
    void captureCpuProfile();
  });

  void (async () => {
    try {
      await mkdir(PROFILE_DIR, { recursive: true });
      await writeFile(join(PROFILE_DIR, ".sigusr2-enabled"), `${process.pid}\n`, {
        encoding: "utf8"
      });
    } catch {
      // 标记文件写不了不影响功能，只是探针会保守跳过信号
    }
  })();

  console.log("[profiler] SIGUSR2 按需 CPU 采样已就绪");
}
