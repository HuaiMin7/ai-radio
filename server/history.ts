import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DjPlan } from "./brain.js";

export type PlaybackHistoryEntry = {
  id: string;
  createdAt: string;
  userMessage: string | null;
  say: string;
  play: DjPlan["play"];
  reason: string;
  segue: DjPlan["segue"];
  episode: number;
};

const maxHistoryEntries = 50;

export async function readPlaybackHistory(rootDir: string) {
  const path = getHistoryPath(rootDir);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isPlaybackHistoryEntry);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return [];
}

export async function appendPlaybackHistory(
  rootDir: string,
  entry: Omit<PlaybackHistoryEntry, "id" | "createdAt">
) {
  const path = getHistoryPath(rootDir);
  const history = await readPlaybackHistory(rootDir);
  const nextHistory = [
    {
      ...entry,
      play: entry.play.map(toPersistentTrack),
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    },
    ...history
  ].slice(0, maxHistoryEntries);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");

  return nextHistory;
}

function toPersistentTrack(track: DjPlan["play"][number]): DjPlan["play"][number] {
  return {
    title: track.title,
    artist: track.artist,
    intro: track.intro,
    audioLabel: track.audioLabel,
    source: track.source,
    matchedTitle: track.matchedTitle,
    matchedArtist: track.matchedArtist,
    externalUrl: track.externalUrl,
    coverUrl: track.coverUrl,
    playbackStatus: track.playbackStatus,
    isFallback: track.isFallback,
    failureReason: track.failureReason
  };
}

function getHistoryPath(rootDir: string) {
  return join(rootDir, "data", "history.json");
}

function isPlaybackHistoryEntry(value: unknown): value is PlaybackHistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PlaybackHistoryEntry>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    (typeof candidate.userMessage === "string" || candidate.userMessage === null) &&
    typeof candidate.say === "string" &&
    Array.isArray(candidate.play) &&
    candidate.play.every(isHistoryTrack) &&
    typeof candidate.reason === "string" &&
    typeof candidate.episode === "number" &&
    (candidate.segue === "fade" ||
      candidate.segue === "cut" ||
      candidate.segue === "silence")
  );
}

function isHistoryTrack(value: unknown): value is PlaybackHistoryEntry["play"][number] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PlaybackHistoryEntry["play"][number]>;

  return (
    typeof candidate.title === "string" &&
    typeof candidate.artist === "string" &&
    (candidate.intro === undefined || typeof candidate.intro === "string") &&
    (candidate.audioUrl === undefined || typeof candidate.audioUrl === "string") &&
    (candidate.audioLabel === undefined || typeof candidate.audioLabel === "string") &&
    (candidate.source === undefined ||
      candidate.source === "local" ||
      candidate.source === "netease" ||
      candidate.source === "qq") &&
    (candidate.matchedTitle === undefined || typeof candidate.matchedTitle === "string") &&
    (candidate.matchedArtist === undefined || typeof candidate.matchedArtist === "string") &&
    (candidate.externalUrl === undefined || typeof candidate.externalUrl === "string") &&
    (candidate.coverUrl === undefined || typeof candidate.coverUrl === "string") &&
    (candidate.playbackStatus === undefined ||
      candidate.playbackStatus === "full" ||
      candidate.playbackStatus === "unverified" ||
      candidate.playbackStatus === "fallback" ||
      candidate.playbackStatus === "failed") &&
    (candidate.isFallback === undefined || typeof candidate.isFallback === "boolean") &&
    (candidate.failureReason === undefined || typeof candidate.failureReason === "string")
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
