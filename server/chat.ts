import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthenticatedUser } from "./auth.js";
import { getUserDataDir } from "./auth.js";
import type { DjPlan } from "./brain.js";

export type ChatHistoryMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt: string;
  plan?: DjPlan;
};

const maxChatMessages = 200;

export async function readChatHistory(
  rootDir: string,
  user: AuthenticatedUser
) {
  const path = getChatPath(rootDir, user);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isChatHistoryMessage);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return [];
}

export async function appendChatTurn(
  rootDir: string,
  user: AuthenticatedUser,
  userMessage: string,
  assistantMessage: string,
  plan?: DjPlan
) {
  const path = getChatPath(rootDir, user);
  const history = await readChatHistory(rootDir, user);
  const createdAt = new Date().toISOString();
  const turnId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nextHistory: ChatHistoryMessage[] = [
    ...history,
    {
      id: `${turnId}-user`,
      role: "user" as const,
      text: userMessage,
      createdAt
    },
    {
      id: `${turnId}-assistant`,
      role: "assistant" as const,
      text: assistantMessage,
      createdAt,
      ...(plan ? { plan } : {})
    }
  ].slice(-maxChatMessages);

  await mkdir(getUserDataDir(rootDir, user), {
    recursive: true,
    mode: 0o700
  });
  await writeFile(path, `${JSON.stringify(nextHistory, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });

  return nextHistory;
}

function getChatPath(rootDir: string, user: AuthenticatedUser) {
  return join(getUserDataDir(rootDir, user), "chat.json");
}

function isChatHistoryMessage(value: unknown): value is ChatHistoryMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ChatHistoryMessage>;

  return (
    typeof candidate.id === "string" &&
    (candidate.role === "assistant" || candidate.role === "user") &&
    typeof candidate.text === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.plan === undefined || isDjPlan(candidate.plan))
  );
}

function isDjPlan(value: unknown): value is DjPlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DjPlan>;

  return (
    typeof candidate.episode === "number" &&
    typeof candidate.say === "string" &&
    Array.isArray(candidate.play) &&
    typeof candidate.reason === "string" &&
    (candidate.segue === "fade" ||
      candidate.segue === "cut" ||
      candidate.segue === "silence")
  );
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
