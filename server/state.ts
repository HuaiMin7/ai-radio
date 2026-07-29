import type { DjPlan } from "./brain.js";
import type { PromptContext } from "./context.js";
import { appendPlaybackHistory } from "./history.js";
import { resolvePlayableTrack } from "./music.js";
import { appendPlaybackQueue } from "./queue.js";
import { readPlayableSeedTracks } from "./seed-tracks.js";

export type NowPlayingState = {
  status: "idle" | "planned";
  currentPlan: DjPlan | null;
  currentContext: PromptContext | null;
  playbackSummary: PlaybackSummary;
  updatedAt: string;
};

export type PublicNowPlayingState = Omit<NowPlayingState, "currentContext">;

export type PlaybackSummary = {
  status: "full" | "attemptable" | "failed" | "idle";
  hasFullPlayableTrack: boolean;
  hasAttemptableTrack: boolean;
};

let nowPlaying: NowPlayingState = {
  status: "idle",
  currentPlan: null,
  currentContext: null,
  playbackSummary: {
    status: "idle",
    hasFullPlayableTrack: false,
    hasAttemptableTrack: false
  },
  updatedAt: new Date().toISOString()
};

export function getNowPlaying() {
  return nowPlaying;
}

export function getPublicNowPlaying(): PublicNowPlayingState {
  return {
    status: nowPlaying.status,
    currentPlan: nowPlaying.currentPlan,
    playbackSummary: nowPlaying.playbackSummary,
    updatedAt: nowPlaying.updatedAt
  };
}

export async function setCurrentPlan(
  rootDir: string,
  plan: DjPlan,
  context: PromptContext,
  userMessage?: string
) {
  const playablePlan = await buildPlayablePlan(rootDir, plan, context, userMessage);

  const nextNowPlaying: NowPlayingState = {
    status: "planned",
    currentPlan: playablePlan,
    currentContext: context,
    playbackSummary: summarizePlayback(playablePlan),
    updatedAt: new Date().toISOString()
  };

  await appendPlaybackHistory(rootDir, {
    userMessage: userMessage?.trim() || null,
    say: playablePlan.say,
    play: playablePlan.play,
    reason: playablePlan.reason,
    segue: playablePlan.segue,
    episode: playablePlan.episode
  });
  await appendPlaybackQueue(rootDir, playablePlan);

  nowPlaying = nextNowPlaying;

  return nowPlaying;
}

async function buildPlayablePlan(
  rootDir: string,
  plan: DjPlan,
  context: PromptContext,
  userMessage?: string
) {
  const targetCount = Math.max(1, Math.min(10, context.requestedTrackCount));
  const resolvedTracks = await Promise.all(
    plan.play.map(async (track, index) => ({
      ...track,
      ...(await resolvePlayableTrack(track, index, rootDir))
    }))
  );
  const selectedTracks = resolvedTracks.filter(isFullPlayableTrack);
  const selectedKeys = new Set(selectedTracks.map(getTrackIdentity));

  if (selectedTracks.length < targetCount) {
    const seedTracks = await readPlayableSeedTracks(rootDir, userMessage);

    for (const seedTrack of seedTracks) {
      if (selectedTracks.length >= targetCount) {
        break;
      }

      const key = getTrackIdentity(seedTrack);

      if (selectedKeys.has(key)) {
        continue;
      }

      const resolvedSeedTrack = {
        ...seedTrack,
        ...(await resolvePlayableTrack(seedTrack, selectedTracks.length, rootDir))
      };

      if (!isFullPlayableTrack(resolvedSeedTrack)) {
        continue;
      }

      selectedKeys.add(key);
      selectedTracks.push({
        ...resolvedSeedTrack,
        intro:
          seedTrack.intro ??
          `这首 ${seedTrack.title} 更稳，也贴近你的歌单口味，先把氛围接住。`
      });
    }
  }

  const finalTracks = selectedTracks.length > 0 ? selectedTracks : resolvedTracks;
  const limitedTracks = finalTracks.slice(0, targetCount);
  const recommendationChanged = limitedTracks.some(
    (track, index) =>
      !plan.play[index] ||
      getTrackIdentity(track) !== getTrackIdentity(plan.play[index])
  );
  const firstTrackChanged =
    limitedTracks[0] &&
    plan.play[0] &&
    getTrackIdentity(limitedTracks[0]) !== getTrackIdentity(plan.play[0]);

  return {
    ...plan,
    say:
      firstTrackChanged && limitedTracks[0]?.intro
        ? limitedTracks[0].intro
        : plan.say,
    play: limitedTracks,
    reason:
      recommendationChanged
        ? "根据当前时间、天气、对话和个人听歌偏好推荐；原推荐中有歌曲暂时没有 QQ 可播地址，已替换为可验证的 QQ 音源。"
        : selectedTracks.length >= targetCount
        ? plan.reason
        : `${plan.reason}；部分歌曲暂时没有 QQ 可播地址，已保留可验证结果。`
  };
}

function summarizePlayback(plan: DjPlan): PlaybackSummary {
  const hasFullPlayableTrack = plan.play.some(
    (track) => track.playbackStatus === "full" && !track.isFallback && !!track.audioUrl
  );
  const hasAttemptableTrack = plan.play.some(
    (track) => track.playbackStatus !== "failed" && !!track.audioUrl
  );

  return {
    status: hasFullPlayableTrack ? "full" : hasAttemptableTrack ? "attemptable" : "failed",
    hasFullPlayableTrack,
    hasAttemptableTrack
  };
}

function isFullPlayableTrack(track: DjPlan["play"][number]) {
  return track.playbackStatus === "full" && !track.isFallback && !!track.audioUrl;
}

function getTrackIdentity(track: { title: string; artist: string }) {
  return `${normalizeIdentity(track.title)}::${normalizeIdentity(track.artist)}`;
}

function normalizeIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
