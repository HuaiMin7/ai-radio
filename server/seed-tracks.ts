import { readFile } from "node:fs/promises";
import { join } from "node:path";

type SeedPlaylist = {
  tracks?: SeedTrack[];
};

type SeedTrack = {
  title?: string;
  artist?: string;
  moods?: string[];
  scenes?: string[];
  energy?: number;
  djAngle?: string;
};

export async function readPlayableSeedTracks(rootDir: string, userMessage = "") {
  const playlists = JSON.parse(
    await readFile(join(rootDir, "user", "playlists.json"), "utf8")
  ) as { playlists?: SeedPlaylist[] } | SeedTrack[];
  const tracks = readSeedTracks(playlists)
    .filter((track): track is Required<Pick<SeedTrack, "title" | "artist">> & SeedTrack =>
      Boolean(track.title?.trim() && track.artist?.trim())
    )
    .map((track, index) => ({
      title: track.title.trim(),
      artist: track.artist.trim(),
      intro: track.djAngle,
      score: scoreSeedTrack(track, userMessage),
      index
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return tracks.map(({ title, artist, intro }) => ({ title, artist, intro }));
}

function readSeedTracks(playlists: { playlists?: SeedPlaylist[] } | SeedTrack[]) {
  if (Array.isArray(playlists)) {
    return playlists;
  }

  return playlists.playlists?.flatMap((playlist) => playlist.tracks ?? []) ?? [];
}

function scoreSeedTrack(track: SeedTrack, userMessage: string) {
  const message = userMessage.trim();
  const searchableTags = [...(track.moods ?? []), ...(track.scenes ?? [])];
  let score = 0;

  for (const tag of searchableTags) {
    if (tag && message.includes(tag)) {
      score += 10;
    }
  }

  if (/困|累|疲惫|下班|通勤/.test(message)) {
    score += scoreByTags(track, ["通勤路上", "放松", "愉悦", "释然"]);
  }

  if (/雨|下雨|阴天/.test(message)) {
    score += scoreByTags(track, ["雨天", "温柔", "平静"]);
  }

  if (/睡|夜|深夜/.test(message)) {
    score += scoreByTags(track, ["深夜独处", "睡前", "平静"]);
  }

  if (/开车|路上/.test(message)) {
    score += scoreByTags(track, ["开车", "通勤路上"]);
  }

  if (/工作|专注|学习/.test(message)) {
    score += scoreByTags(track, ["工作", "学习", "平静"]);
  }

  if (typeof track.energy === "number") {
    score += Math.max(0, 5 - Math.abs(track.energy - 3));
  }

  return score;
}

function scoreByTags(track: SeedTrack, expectedTags: string[]) {
  const tags = new Set([...(track.moods ?? []), ...(track.scenes ?? [])]);

  return expectedTags.reduce((score, tag) => score + (tags.has(tag) ? 5 : 0), 0);
}
