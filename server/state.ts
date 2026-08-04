import type { AuthenticatedUser } from "./auth.js";
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

const nowPlayingByUser = new Map<string, NowPlayingState>();
// 防止长期运行后无限增长：超过上限时淘汰最久未更新的用户。
// 淘汰只丢失内存态（下次访问重建为 idle），历史/队列已落盘，不丢数据。
const maxNowPlayingEntries = 5_000;

function evictStaleNowPlaying() {
  if (nowPlayingByUser.size <= maxNowPlayingEntries) {
    return;
  }

  const entries = [...nowPlayingByUser.entries()].sort(
    (a, b) =>
      new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime()
  );

  const removeCount = nowPlayingByUser.size - maxNowPlayingEntries;

  for (let index = 0; index < removeCount; index += 1) {
    nowPlayingByUser.delete(entries[index][0]);
  }
}

export function getNowPlaying(user: AuthenticatedUser) {
  const current = nowPlayingByUser.get(user.storageKey);

  if (current) {
    return current;
  }

  const initial = createIdleState();
  nowPlayingByUser.set(user.storageKey, initial);
  evictStaleNowPlaying();
  return initial;
}

export function getPublicNowPlaying(user: AuthenticatedUser): PublicNowPlayingState {
  const nowPlaying = getNowPlaying(user);

  return {
    status: nowPlaying.status,
    currentPlan: nowPlaying.currentPlan,
    playbackSummary: nowPlaying.playbackSummary,
    updatedAt: nowPlaying.updatedAt
  };
}

export async function setCurrentPlan(
  rootDir: string,
  user: AuthenticatedUser,
  plan: DjPlan,
  context: PromptContext,
  userMessage?: string
) {
  const playablePlan = await buildPlayablePlan(
    rootDir,
    user,
    plan,
    context,
    userMessage
  );

  const nextNowPlaying: NowPlayingState = {
    status: "planned",
    currentPlan: playablePlan,
    currentContext: context,
    playbackSummary: summarizePlayback(playablePlan),
    updatedAt: new Date().toISOString()
  };

  await appendPlaybackHistory(rootDir, user, {
    userMessage: userMessage?.trim() || null,
    say: playablePlan.say,
    play: playablePlan.play,
    reason: playablePlan.reason,
    segue: playablePlan.segue,
    episode: playablePlan.episode
  });
  await appendPlaybackQueue(rootDir, user, playablePlan);

  nowPlayingByUser.set(user.storageKey, nextNowPlaying);
  evictStaleNowPlaying();

  return nextNowPlaying;
}

async function buildPlayablePlan(
  rootDir: string,
  user: AuthenticatedUser,
  plan: DjPlan,
  context: PromptContext,
  userMessage?: string
) {
  const targetCount = Math.max(1, Math.min(10, context.requestedTrackCount));
  const resolvedTracks = await Promise.all(
    plan.play.map(async (track, index) => ({
      ...track,
      ...(await resolvePlayableTrack(track, index, rootDir, user))
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
        ...(await resolvePlayableTrack(
          seedTrack,
          selectedTracks.length,
          rootDir,
          user
        ))
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

function createIdleState(): NowPlayingState {
  return {
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
