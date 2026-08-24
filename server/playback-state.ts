import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "./atomic-write.js";
import type { AuthenticatedUser } from "./auth.js";
import { getUserDataDir } from "./auth.js";

export type PlaybackResumeStateInput = {
  version: 1;
  queueId: string;
  positionSeconds: number;
  wasPlaying: boolean;
  introPlayed: boolean;
};

export type PlaybackResumeState = PlaybackResumeStateInput & {
  updatedAt: string;
};

export async function readPlaybackResumeState(
  rootDir: string,
  user: AuthenticatedUser
) {
  try {
    const raw = await readFile(getPlaybackStatePath(rootDir, user), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return isPlaybackResumeState(parsed) ? parsed : null;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writePlaybackResumeState(
  rootDir: string,
  user: AuthenticatedUser,
  input: PlaybackResumeStateInput
) {
  const state: PlaybackResumeState = {
    ...input,
    updatedAt: new Date().toISOString()
  };

  await writeJsonAtomic(getPlaybackStatePath(rootDir, user), state, {
    mode: 0o600
  });

  return state;
}

function getPlaybackStatePath(rootDir: string, user: AuthenticatedUser) {
  return join(getUserDataDir(rootDir, user), "playback-state.json");
}

function isPlaybackResumeState(value: unknown): value is PlaybackResumeState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PlaybackResumeState>;

  return (
    candidate.version === 1 &&
    typeof candidate.queueId === "string" &&
    Boolean(candidate.queueId.trim()) &&
    typeof candidate.positionSeconds === "number" &&
    Number.isFinite(candidate.positionSeconds) &&
    candidate.positionSeconds >= 0 &&
    typeof candidate.wasPlaying === "boolean" &&
    typeof candidate.introPlayed === "boolean" &&
    typeof candidate.updatedAt === "string" &&
    Number.isFinite(Date.parse(candidate.updatedAt))
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
