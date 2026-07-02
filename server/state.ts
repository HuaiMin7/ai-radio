import type { DjPlan } from "./brain.js";
import type { PromptContext } from "./context.js";
import { appendPlaybackHistory } from "./history.js";
import { resolvePlayableTrack } from "./music.js";
import { appendPlaybackQueue } from "./queue.js";

export type NowPlayingState = {
  status: "idle" | "planned";
  currentPlan: DjPlan | null;
  currentContext: PromptContext | null;
  updatedAt: string;
};

export type PublicNowPlayingState = Omit<NowPlayingState, "currentContext">;

let nowPlaying: NowPlayingState = {
  status: "idle",
  currentPlan: null,
  currentContext: null,
  updatedAt: new Date().toISOString()
};

export function getNowPlaying() {
  return nowPlaying;
}

export function getPublicNowPlaying(): PublicNowPlayingState {
  return {
    status: nowPlaying.status,
    currentPlan: nowPlaying.currentPlan,
    updatedAt: nowPlaying.updatedAt
  };
}

export async function setCurrentPlan(
  rootDir: string,
  plan: DjPlan,
  context: PromptContext,
  userMessage?: string
) {
  const playablePlan = {
    ...plan,
    play: await Promise.all(
      plan.play.map(async (track, index) => ({
        ...track,
        ...(await resolvePlayableTrack(track, index, rootDir))
      }))
    )
  };

  const nextNowPlaying: NowPlayingState = {
    status: "planned",
    currentPlan: playablePlan,
    currentContext: context,
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
