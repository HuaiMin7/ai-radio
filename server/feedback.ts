import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type FeedbackAction = "like" | "skip" | "replay";

export type TrackFeedbackEntry = {
  id: string;
  createdAt: string;
  action: FeedbackAction;
  title: string;
  artist: string;
  source?: "local" | "netease" | "qq";
  audioLabel?: string;
};

export type FeedbackSummary = {
  recent: TrackFeedbackEntry[];
  likedTracks: Array<{ title: string; artist: string; count: number }>;
  skippedTracks: Array<{ title: string; artist: string; count: number }>;
  replayedTracks: Array<{ title: string; artist: string; count: number }>;
  guidance: string[];
};

const maxFeedbackEntries = 200;

export async function readTrackFeedback(rootDir: string) {
  const path = getFeedbackPath(rootDir);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isTrackFeedbackEntry);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return [];
}

export async function appendTrackFeedback(
  rootDir: string,
  entry: Omit<TrackFeedbackEntry, "id" | "createdAt">
) {
  const path = getFeedbackPath(rootDir);
  const feedback = await readTrackFeedback(rootDir);
  const nextFeedback = [
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    },
    ...feedback
  ].slice(0, maxFeedbackEntries);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(nextFeedback, null, 2)}\n`, "utf8");

  return nextFeedback;
}

export function summarizeTrackFeedback(feedback: TrackFeedbackEntry[]): FeedbackSummary {
  const likedTracks = countTracks(feedback.filter((entry) => entry.action === "like"));
  const skippedTracks = countTracks(feedback.filter((entry) => entry.action === "skip"));
  const replayedTracks = countTracks(feedback.filter((entry) => entry.action === "replay"));

  return {
    recent: feedback.slice(0, 12),
    likedTracks,
    skippedTracks,
    replayedTracks,
    guidance: [
      "Treat likes as positive taste signals, especially when repeated.",
      "Treat skips as soft negative signals; avoid repeating skipped tracks soon.",
      "Treat replays as strong positive signals for mood, texture, and energy.",
      "Use feedback to adjust recommendation direction, not to create a closed playlist."
    ]
  };
}

function countTracks(entries: TrackFeedbackEntry[]) {
  const counts = new Map<string, { title: string; artist: string; count: number }>();

  for (const entry of entries) {
    const key = `${entry.title.trim().toLowerCase()}::${entry.artist.trim().toLowerCase()}`;
    const current = counts.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    counts.set(key, {
      title: entry.title,
      artist: entry.artist,
      count: 1
    });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 16);
}

function getFeedbackPath(rootDir: string) {
  return join(rootDir, "data", "feedback.json");
}

function isTrackFeedbackEntry(value: unknown): value is TrackFeedbackEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TrackFeedbackEntry>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.action === "like" ||
      candidate.action === "skip" ||
      candidate.action === "replay") &&
    typeof candidate.title === "string" &&
    typeof candidate.artist === "string" &&
    (candidate.source === undefined ||
      candidate.source === "local" ||
      candidate.source === "netease" ||
      candidate.source === "qq") &&
    (candidate.audioLabel === undefined || typeof candidate.audioLabel === "string")
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
