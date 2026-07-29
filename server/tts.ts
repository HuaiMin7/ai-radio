import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const maxSpeechCharacters = 700;

export type TtsResult = {
  audioUrl: string;
  provider: "aliyun-qwen-tts" | "macos-say";
  fallback?: boolean;
};

export async function synthesizeSpeech(
  rootDir: string,
  text: string
): Promise<TtsResult> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("TTS text is required");
  }

  if (normalizedText.length > maxSpeechCharacters) {
    throw new Error(`TTS text must be ${maxSpeechCharacters} characters or less`);
  }

  if (getTtsProvider() === "aliyun-qwen-tts") {
    try {
      return await synthesizeAliyunQwenSpeech(rootDir, normalizedText);
    } catch (error) {
      if (process.platform !== "darwin") {
        throw new Error(`Aliyun Qwen-TTS failed: ${readErrorMessage(error)}`);
      }

      try {
        return {
          ...(await synthesizeMacosSpeech(rootDir, normalizedText)),
          fallback: true
        };
      } catch (fallbackError) {
        throw new Error(
          [
            `Aliyun Qwen-TTS failed: ${readErrorMessage(error)}`,
            `macOS say fallback failed: ${readErrorMessage(fallbackError)}`
          ].join("; ")
        );
      }
    }
  }

  return synthesizeMacosSpeech(rootDir, normalizedText);
}

async function synthesizeAliyunQwenSpeech(
  rootDir: string,
  normalizedText: string
): Promise<TtsResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.AI_RADIO_MODEL_API_KEY;

  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is required for Aliyun Qwen-TTS");
  }

  const model = process.env.AI_RADIO_TTS_MODEL ?? "qwen3-tts-instruct-flash-realtime";
  const voice = process.env.AI_RADIO_TTS_VOICE ?? "Cherry";
  const instructions =
    process.env.AI_RADIO_TTS_INSTRUCTIONS ??
    "语速自然偏慢，声音温暖，有夜间电台 DJ 的陪伴感。";
  const websocketUrl =
    process.env.AI_RADIO_TTS_WEBSOCKET_URL ??
    "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
  const id = createTtsId(["aliyun-qwen-tts", model, voice, instructions, normalizedText]);
  const fileName = `${id}.wav`;
  const filePath = getTtsFilePath(rootDir, fileName);

  try {
    await access(filePath);
  } catch {
    const requestFilePath = getTtsFilePath(rootDir, `${id}.json`);
    const scriptPath = join(rootDir, "server", "qwen-tts-realtime.py");

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(
      requestFilePath,
      JSON.stringify({
        apiKey,
        model,
        voice,
        instructions,
        websocketUrl,
        text: normalizedText,
        outputPath: filePath
      }),
      "utf8"
    );

    try {
      await execFileAsync(await getPythonExecutable(rootDir), [scriptPath, requestFilePath], {
        timeout: 45000
      });
    } finally {
      await unlink(requestFilePath).catch(() => undefined);
    }
  }

  return {
    audioUrl: `/api/tts/${fileName}`,
    provider: "aliyun-qwen-tts"
  };
}

async function synthesizeMacosSpeech(
  rootDir: string,
  normalizedText: string
): Promise<TtsResult> {
  if (process.platform !== "darwin") {
    throw new Error(
      "macOS say fallback is unavailable on this server; configure Aliyun Qwen-TTS"
    );
  }

  const voice = process.env.AI_RADIO_TTS_MACOS_VOICE;
  const rate = process.env.AI_RADIO_TTS_MACOS_RATE;
  const id = createTtsId(["macos-say", voice ?? "", rate ?? "", normalizedText]);
  const fileName = `${id}.m4a`;
  const filePath = getTtsFilePath(rootDir, fileName);

  try {
    await access(filePath);
  } catch {
    const tempFilePath = getTtsFilePath(rootDir, `${id}.aiff`);

    await mkdir(dirname(filePath), { recursive: true });
    await execFileAsync("/usr/bin/say", [
      ...(voice ? ["-v", voice] : []),
      ...(rate ? ["-r", rate] : []),
      "-o",
      tempFilePath,
      normalizedText
    ]);
    await execFileAsync("/usr/bin/afconvert", [
      "-f",
      "m4af",
      "-d",
      "aac",
      tempFilePath,
      filePath
    ]);
    await unlink(tempFilePath).catch(() => undefined);
  }

  return {
    audioUrl: `/api/tts/${fileName}`,
    provider: "macos-say"
  };
}

export async function readSpeechAudio(rootDir: string, fileName: string) {
  if (!/^[a-f0-9]{24}\.(m4a|wav)$/.test(fileName)) {
    throw new Error("Invalid TTS file name");
  }

  return readFile(getTtsFilePath(rootDir, fileName));
}

export function getSpeechAudioContentType(fileName: string) {
  return fileName.endsWith(".wav") ? "audio/wav" : "audio/mp4";
}

function getTtsFilePath(rootDir: string, fileName: string) {
  return join(rootDir, "cache", "tts", fileName);
}

function getTtsProvider() {
  if (process.env.AI_RADIO_TTS_PROVIDER === "macos-say") {
    return "macos-say";
  }

  if (
    process.env.AI_RADIO_TTS_PROVIDER === "aliyun-qwen-tts" ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.AI_RADIO_MODEL_API_KEY
  ) {
    return "aliyun-qwen-tts";
  }

  return process.platform === "darwin" ? "macos-say" : "aliyun-qwen-tts";
}

function createTtsId(parts: string[]) {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

async function getPythonExecutable(rootDir: string) {
  if (process.env.AI_RADIO_TTS_PYTHON) {
    return process.env.AI_RADIO_TTS_PYTHON;
  }

  const localPython = join(rootDir, ".venv", "bin", "python");

  try {
    await access(localPython);
    return localPython;
  } catch {
    return "python3";
  }
}
