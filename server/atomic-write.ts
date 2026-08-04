import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 原子写入 JSON 文件。
 *
 * 背景：原先各处直接 `writeFile(path, json)`。若进程在写入过程中被强杀
 * （OOM kill / systemd 超时 / 自动重启），会留下被截断的半个 JSON，
 * 下次读取直接解析失败，等于丢失该用户的聊天、历史或队列数据。
 *
 * 做法：先写同目录下的临时文件，再 `rename` 到目标路径。
 * 同一文件系统内的 rename 是原子操作，读取方要么看到完整旧内容，
 * 要么看到完整新内容，不存在中间态。
 */
export async function writeJsonAtomic(
  path: string,
  value: unknown,
  options: { mode?: number } = {}
) {
  const mode = options.mode ?? 0o600;
  const dir = dirname(path);
  const tempPath = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  await mkdir(dir, { recursive: true, mode: 0o700 });

  try {
    await writeFile(tempPath, payload, { encoding: "utf8", mode });
    await rename(tempPath, path);
  } catch (error) {
    // 清理残留临时文件，避免目录里堆积 .tmp
    await import("node:fs/promises")
      .then((fs) => fs.unlink(tempPath))
      .catch(() => {});
    throw error;
  }
}

/**
 * 原子写入纯文本文件（用于 session-revoked-before 这类小文件）。
 */
export async function writeTextAtomic(
  path: string,
  text: string,
  options: { mode?: number } = {}
) {
  const mode = options.mode ?? 0o600;
  const dir = dirname(path);
  const tempPath = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);

  await mkdir(dir, { recursive: true, mode: 0o700 });

  try {
    await writeFile(tempPath, text, { encoding: "utf8", mode });
    await rename(tempPath, path);
  } catch (error) {
    await import("node:fs/promises")
      .then((fs) => fs.unlink(tempPath))
      .catch(() => {});
    throw error;
  }
}
