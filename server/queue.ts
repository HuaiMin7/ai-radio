import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DjPlan } from "./brain.js";

export type QueueTrack = DjPlan["play"][number] & {
  id: string;
  queuedAt: string;
  episode: number;
};

const maxQueueTracks = 200;

export async function readPlaybackQueue(rootDir: string) {
  const path = getQueuePath(rootDir);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isQueueTrack);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return [];
}

export async function appendPlaybackQueue(rootDir: string, plan: DjPlan) {
  const path = getQueuePath(rootDir);
  const queue = await readPlaybackQueue(rootDir);
  const queuedAt = new Date().toISOString();
  const newTracks = plan.play.map((track, index) => ({
    ...toPersistentTrack(track),
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    queuedAt,
    episode: plan.episode
  }));
  const nextQueue = [...queue, ...newTracks].slice(-maxQueueTracks);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(nextQueue, null, 2)}\n`, "utf8");

  return nextQueue;
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

function getQueuePath(rootDir: string) {
  return join(rootDir, "data", "queue.json");
}

function isQueueTrack(value: unknown): value is QueueTrack {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<QueueTrack>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.queuedAt === "string" &&
    typeof candidate.episode === "number" &&
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
