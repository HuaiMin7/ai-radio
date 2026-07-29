import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthenticatedUser } from "./auth.js";
import { readChatHistory } from "./chat.js";
import { readTrackFeedback, summarizeTrackFeedback } from "./feedback.js";
import { readPlaybackHistory } from "./history.js";
import type { NowPlayingState } from "./state.js";
import { buildTasteProfile } from "./taste-profile.js";
import { getLocalTimeSnapshot, getWeatherSnapshot } from "./weather.js";

export type UserProfile = {
  taste: string;
  routines: string;
  moodRules: string;
  playlists: unknown;
};

export type PromptContext = {
  prompt: string;
  requestedTrackCount: number;
  characterCount: number;
  generatedAt: string;
  sources: Array<{
    label: string;
    path: string;
    characterCount: number;
  }>;
};

async function readText(path: string) {
  return readFile(path, "utf8");
}

async function readJson(path: string) {
  const raw = await readText(path);
  return JSON.parse(raw) as unknown;
}

export async function loadUserProfile(rootDir: string): Promise<UserProfile> {
  const userDir = join(rootDir, "user");

  const [taste, routines, moodRules, playlists] = await Promise.all([
    readText(join(userDir, "taste.md")),
    readText(join(userDir, "routines.md")),
    readText(join(userDir, "mood-rules.md")),
    readJson(join(userDir, "playlists.json"))
  ]);

  return {
    taste,
    routines,
    moodRules,
    playlists
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function buildSection(title: string, content: string) {
  return `## ${title}\n\n${content.trim() || "(empty)"}`;
}

function inferRequestedTrackCount(userMessage?: string) {
  const message = userMessage?.trim() ?? "";

  if (!message) {
    return 1;
  }

  const arabicMatch = message.match(/(\d+)\s*首/);

  if (arabicMatch?.[1]) {
    return Math.min(10, Math.max(1, Number(arabicMatch[1])));
  }

  const chineseNumbers: Record<string, number> = {
    一: 1,
    两: 2,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  const chineseMatch = message.match(/([一两二三四五六七八九十])\s*首/);

  if (chineseMatch?.[1]) {
    return chineseNumbers[chineseMatch[1]] ?? 1;
  }

  if (/一首|1首/.test(message)) {
    return 1;
  }

  if (/几首|多首|一些|一批|歌单|列表|推荐歌曲|来点歌/.test(message)) {
    return 8;
  }

  return 1;
}

function summarizePlan(plan: NowPlayingState["currentPlan"]) {
  if (!plan) {
    return null;
  }

  return {
    say: plan.say,
    play: plan.play.map((track) => ({
      title: track.title,
      artist: track.artist,
      intro: track.intro,
      source: track.source,
      matchedTitle: track.matchedTitle,
      matchedArtist: track.matchedArtist
    })),
    reason: plan.reason,
    segue: plan.segue,
    episode: plan.episode
  };
}

function summarizeHistory(
  history: Awaited<ReturnType<typeof readPlaybackHistory>>
) {
  return history.slice(0, 5).map((entry) => ({
    userMessage: entry.userMessage,
    say: entry.say,
    play: entry.play.map((track) => ({
      title: track.title,
      artist: track.artist,
      intro: track.intro,
      source: track.source,
      matchedTitle: track.matchedTitle,
      matchedArtist: track.matchedArtist
    })),
    reason: entry.reason,
    segue: entry.segue,
    episode: entry.episode,
    createdAt: entry.createdAt
  }));
}

function summarizeRecentTracks(history: Awaited<ReturnType<typeof readPlaybackHistory>>) {
  const tracks = history.flatMap((entry) =>
    entry.play.map((track) => ({
      title: track.title,
      artist: track.artist,
      source: track.source,
      createdAt: entry.createdAt
    }))
  );

  return tracks.slice(0, 24);
}

export async function buildPromptContext(
  rootDir: string,
  nowPlaying: NowPlayingState,
  userMessage: string | undefined,
  user: AuthenticatedUser
): Promise<PromptContext> {
  const personaPath = join(rootDir, "prompts", "dj-persona.md");
  const userDir = join(rootDir, "user");

  const [persona, profile, history, feedback, chatHistory, weather] = await Promise.all([
    readText(personaPath),
    loadUserProfile(rootDir),
    readPlaybackHistory(rootDir, user),
    readTrackFeedback(rootDir, user),
    readChatHistory(rootDir, user),
    getWeatherSnapshot().catch((error) => ({
      status: "not-configured" as const,
      provider: "qweather" as const,
      message: error instanceof Error ? error.message : "天气读取失败"
    }))
  ]);

  const localTime = getLocalTimeSnapshot();
  const requestedTrackCount = inferRequestedTrackCount(userMessage);
  const runtimeContext = {
    now: localTime.iso,
    localDate: localTime.localDate,
    localTime: localTime.localTime,
    timezone: localTime.timeZone,
    radioStatus: nowPlaying.status,
    currentPlan: summarizePlan(nowPlaying.currentPlan),
    userMessage: userMessage?.trim() || null,
    stateUpdatedAt: nowPlaying.updatedAt,
    weather
  };

  const tasteProfile = buildTasteProfile(profile.playlists);
  const tasteProfileText = formatJson(tasteProfile);
  const historyText = formatJson(summarizeHistory(history));
  const feedbackText = formatJson(summarizeTrackFeedback(feedback));
  const recentTrackText = formatJson(summarizeRecentTracks(history));
  const recentConversationText = formatJson(
    chatHistory.slice(-20).map((message) => ({
      role: message.role,
      text: message.text,
      createdAt: message.createdAt
    }))
  );
  const runtimeText = formatJson({
    ...runtimeContext,
    requestedTrackCount
  });

  const sources = [
    {
      label: "系统人格",
      path: "prompts/dj-persona.md",
      characterCount: persona.length
    },
    {
      label: "音乐口味",
      path: "user/taste.md",
      characterCount: profile.taste.length
    },
    {
      label: "日常作息",
      path: "user/routines.md",
      characterCount: profile.routines.length
    },
    {
      label: "情绪规则",
      path: "user/mood-rules.md",
      characterCount: profile.moodRules.length
    },
    {
      label: "品味画像",
      path: "user/playlists.json",
      characterCount: tasteProfileText.length
    },
    {
      label: "播放记忆",
      path: "data/history.json",
      characterCount: historyText.length
    },
    {
      label: "个性化反馈",
      path: "data/feedback.json",
      characterCount: feedbackText.length
    },
    {
      label: "最近对话",
      path: "data/chat.json",
      characterCount: recentConversationText.length
    },
    {
      label: "运行状态",
      path: "memory:now-playing",
      characterCount: runtimeText.length
    },
    {
      label: "实时天气",
      path: "api:qweather-now",
      characterCount: formatJson(weather).length
    }
  ];

  const prompt = [
    buildSection("System Persona", persona),
    buildSection("Taste", profile.taste),
    buildSection("Routines", profile.routines),
    buildSection("Mood Rules", profile.moodRules),
    buildSection("Taste Profile From Seed Playlist", tasteProfileText),
    buildSection("Recent Playback Memory", historyText),
    buildSection("Recent Track Repetition Guard", recentTrackText),
    buildSection("Personal Feedback Memory", feedbackText),
    buildSection("Recent Conversation", recentConversationText),
    buildSection("Runtime State", runtimeText),
    buildSection("User Request", userMessage?.trim() || "Generate the next radio segment."),
    buildSection(
      "Required Response Format",
      `Intent rules:
- If the user wants normal conversation, reply naturally as Redio. Do not recommend music. Do not output [RECOMMEND] or [DJ].
- If the user explicitly says not to play or recommend music, treat it as normal conversation even when the message contains words such as song or music.
- A negative adjective does not cancel a recommendation request. For example, "推荐一些不要太吵的歌" is still a music request.
- If the user clearly wants to hear music, asks for a song, asks for music for a mood/scene, or implies they want a soundtrack, recommend exactly ${requestedTrackCount} song(s) based on the taste profile, runtime context, and your broader music knowledge.
- The seed playlist is not a closed library. You may recommend songs outside the seed playlist.
- Balance familiarity and discovery: around 70% aligned with known taste, around 30% tasteful new exploration, unless the user asks for familiar songs.
- Avoid repeating tracks from Recent Track Repetition Guard unless the user explicitly asks to replay or discuss them.
- Respect Personal Feedback Memory: lean toward liked/replayed textures and avoid recently skipped tracks.
- If requestedTrackCount is 1, output one item in play.
- If requestedTrackCount is greater than 1, output exactly ${requestedTrackCount} items in play, one intro per song.

DJ copy rule:
- Each generated DJ copy must contain 60-100 Chinese characters. Check the length before responding and do not return model-written copy shorter than 60 characters.
- It should sound like a natural spoken radio segue.
- Keep it natural, atmospheric, and specific to the song and user context.

Recommend mode JSON format only:
{
  "say": "Natural spoken Chinese DJ copy for the first song, 60-100 Chinese characters.",
  "play": [
    {
      "title": "clean song title",
      "artist": "clean artist name",
      "intro": "Natural spoken Chinese DJ copy for this song, 60-100 Chinese characters."
    }
  ],
  "reason": "why these songs fit the request",
  "segue": "fade"
}

segue must be one of: fade, cut, silence.`
    )
  ].join("\n\n---\n\n");

  return {
    prompt,
    requestedTrackCount,
    characterCount: prompt.length,
    generatedAt: new Date().toISOString(),
    sources
  };
}
