import type { PromptContext, UserProfile } from "./context.js";

export type DjPlan = {
  episode: number;
  say: string;
  play: Array<{
    title: string;
    artist: string;
    intro?: string;
    audioUrl?: string;
    audioLabel?: string;
    source?: "local" | "netease" | "qq";
    matchedTitle?: string;
    matchedArtist?: string;
    externalUrl?: string;
    coverUrl?: string;
    playbackStatus?: "full" | "unverified" | "fallback" | "failed";
    isFallback?: boolean;
    failureReason?: string;
  }>;
  reason: string;
  segue: "fade" | "cut" | "silence";
};

export type AiTurn =
  | {
      mode: "chat";
      text: string;
    }
  | {
      mode: "recommend";
      plan: DjPlan;
    };

type BrainProvider = "mock" | "custom-http";

type GenerateDjPlanInput = {
  context: PromptContext;
  profile: UserProfile;
};

type ModelDjPlan = Omit<DjPlan, "episode">;
type TaggedRecommendation = {
  title: string;
  artist: string;
  dj: string;
};
type TaggedRecommendationSet = TaggedRecommendation[];

const mockSegments: Array<Omit<DjPlan, "episode">> = [
  {
    say: "欢迎回来。第一版本地电台已经接上你的个人资料，接下来会先用一段测试节目验证播放流程。",
    play: [
      {
        title: "Pilot Track",
        artist: "Local Library"
      }
    ],
    reason: "当前阶段使用 mock plan，先验证 API、状态流和前端对接。",
    segue: "fade"
  },
  {
    say: "现在换一个更轻的段落。这个版本还没有接真实歌库，但已经能像电台一样规划下一段内容。",
    play: [
      {
        title: "Morning Context",
        artist: "User Profile"
      }
    ],
    reason: "这次模拟读取作息资料，测试同一个按钮能连续生成不同节目。",
    segue: "silence"
  },
  {
    say: "这里留一点空间，像 DJ 在两首歌之间做一次短暂停顿。后面接入 TTS 后，这里会变成真实语音。",
    play: [
      {
        title: "TTS Preview",
        artist: "AI DJ"
      }
    ],
    reason: "这段用于验证未来 DJ 语音和歌曲播放之间的衔接。",
    segue: "cut"
  }
];

let mockEpisode = 0;

export async function generateAiTurn(input: GenerateDjPlanInput): Promise<AiTurn> {
  const provider = getBrainProvider();

  if (provider === "custom-http") {
    try {
      return await generateCustomHttpTurn(input.context);
    } catch (error) {
      console.error(
        "[brain] generation failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      return createRecoveryTurn();
    }
  }

  return createMockTurn(input.profile, input.context);
}

function getBrainProvider(): BrainProvider {
  const provider = process.env.AI_RADIO_BRAIN_PROVIDER;

  if (provider === "custom-http") {
    return provider;
  }

  return "mock";
}

function createMockTurn(profile: UserProfile, context: PromptContext): AiTurn {
  const requestText = readUserRequestFromPrompt(context.prompt);
  const shouldRecommend =
    !isExplicitNoMusicRequest(requestText) &&
    /推|推荐|听|歌|音乐|配乐|开车|睡前|运动|放松/.test(requestText);

  if (!shouldRecommend) {
    return {
      mode: "chat",
      text: "嗯，我在。你慢慢说，今天怎么了？"
    };
  }

  const playlistCount =
    typeof profile.playlists === "object" &&
    profile.playlists !== null &&
    "playlists" in profile.playlists &&
    Array.isArray(profile.playlists.playlists)
      ? profile.playlists.playlists.length
      : 0;
  const segment = mockSegments[mockEpisode % mockSegments.length];

  mockEpisode += 1;
  return {
    mode: "recommend",
    plan: {
      ...segment,
      episode: mockEpisode,
      play:
        playlistCount > 0
          ? [
              {
                title: "Playlist Seed",
                artist: "Your Library"
              }
            ]
          : segment.play
    }
  };
}

function createRecoveryTurn(): AiTurn {
  return {
    mode: "chat",
    text: "我这边刚刚有点卡住了，先缓一下。"
  };
}

async function generateCustomHttpTurn(context: PromptContext): Promise<AiTurn> {
  const baseUrl = process.env.AI_RADIO_MODEL_BASE_URL;
  const model = process.env.AI_RADIO_MODEL_NAME ?? "deepseek-v4-flash";
  const apiKey = process.env.AI_RADIO_MODEL_API_KEY;

  if (!baseUrl || !model) {
    throw new Error(
      "custom-http provider requires AI_RADIO_MODEL_BASE_URL and AI_RADIO_MODEL_NAME"
    );
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "你是私人电台 DJ「Redio」，也是用户的朋友。",
            "性格慵懒、有品味、自然，不端着。",
            "你必须判断用户意图：普通聊天就正常聊，不推歌，不输出 [RECOMMEND] 标签。",
            "用户明确说不要、暂时不想或先别播放/推荐音乐时，必须按普通聊天处理，即使句子里出现歌或音乐。",
            "否定词只有直接否定播放或推荐动作时才表示普通聊天；例如‘推荐一些不要太吵的歌’仍是推歌请求。",
            "只有用户明确想听歌、想要配乐、询问某个场景/心情适合的歌时，才进入推歌模式。",
            "推歌模式必须按上下文 requestedTrackCount 推荐歌曲。",
            "用户歌单是品味样本，不是封闭歌库；可以基于用户画像推荐歌单之外的歌曲。",
            "推荐时约 70% 贴合既有品味，约 30% 做有品味的新歌探索；避免反复推荐最近播过或被跳过的歌曲。",
            "每段 say 和 intro 必须为 60-100 个中文字符，输出前自检，不要返回少于 60 个字符的模型文案。",
            "推歌模式只输出 JSON，不要输出 Markdown，不要输出额外解释。",
            "普通聊天只输出自然中文回复。",
            "推歌 JSON 格式：",
            "{\"say\":\"DJ 文案\",\"play\":[{\"title\":\"歌曲名\",\"artist\":\"歌手\",\"intro\":\"单曲 DJ 衔接文案\"}],\"reason\":\"推荐原因\",\"segue\":\"fade\"}",
            "segue 只能是 fade、cut 或 silence。"
          ].join("\n")
        },
        {
          role: "user",
          content: context.prompt
        }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`custom-http provider failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  const content = readChatCompletionContent(data);
  const requestedMusic = isMusicRequest(context);
  const jsonPlan = tryParseDjPlan(content, context.requestedTrackCount);

  if (jsonPlan) {
    mockEpisode += 1;
    return {
      mode: "recommend",
      plan: {
        ...jsonPlan,
        episode: mockEpisode
      }
    };
  }

  if (requestedMusic && looksLikeJson(content)) {
    throw new Error("model returned invalid recommendation JSON");
  }

  const recommendations = parseTaggedRecommendations(content).slice(
    0,
    context.requestedTrackCount
  );

  if (requestedMusic && recommendations.length === 0) {
    throw new Error("model did not return a valid recommendation");
  }

  if (recommendations.length === 0) {
    return {
      mode: "chat",
      text: stripKnownTags(content).trim() || "嗯，我在。你慢慢说。"
    };
  }

  mockEpisode += 1;
  return {
    mode: "recommend",
    plan: {
      episode: mockEpisode,
      say: recommendations[0]?.dj ?? "这几首歌适合现在播放。",
      play: recommendations.map((recommendation) => ({
        title: recommendation.title,
        artist: recommendation.artist,
        intro: recommendation.dj
      })),
      reason: recommendations.map((recommendation) => recommendation.dj).join(" / "),
      segue: "fade"
    }
  };
}

export function parseTaggedRecommendation(content: string): TaggedRecommendation | null {
  return parseTaggedRecommendations(content)[0] ?? null;
}

export function parseTaggedRecommendations(content: string): TaggedRecommendationSet {
  const recommendMatch = content.match(/\[RECOMMEND\]([\s\S]*?)\[\/RECOMMEND\]/i);
  const djMatch = content.match(/\[DJ\]([\s\S]*?)\[\/DJ\]/i);

  if (!recommendMatch?.[1] || !djMatch?.[1]) {
    return [];
  }

  const pairs: TaggedRecommendation[] = [];
  const tagPattern =
    /\[RECOMMEND\]([\s\S]*?)\[\/RECOMMEND\]\s*\[DJ\]([\s\S]*?)\[\/DJ\]/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const title = readTaggedLine(match[1], "歌名");
    const artist = readTaggedLine(match[1], "歌手");
    const dj = match[2].trim();

    if (!title || !artist || !dj) {
      continue;
    }

    pairs.push({
      title,
      artist,
      dj: sanitizeDjIntro(dj).slice(0, 80)
    });
  }

  return pairs;
}

function readTaggedLine(block: string, label: string) {
  const match = block.match(new RegExp(`${label}\\s*[:：]\\s*(.+)`));
  return match?.[1]?.trim() ?? "";
}

function stripKnownTags(content: string) {
  return content
    .replace(/\[RECOMMEND\][\s\S]*?\[\/RECOMMEND\]/gi, "")
    .replace(/\[DJ\]([\s\S]*?)\[\/DJ\]/gi, "$1");
}

function readUserRequestFromPrompt(prompt: string) {
  const match = prompt.match(/## User Request\s+([\s\S]*?)(?:\n\n---\n\n|$)/);
  return match?.[1]?.trim() ?? prompt;
}

function normalizeDjPlan(plan: ModelDjPlan, requestedTrackCount: number): ModelDjPlan {
  const normalizedTracks = plan.play.slice(0, requestedTrackCount).map((track, index) => ({
    ...track,
    intro: sanitizeDjIntro(
      track.intro?.trim() ||
        (index === 0
          ? plan.say
          : `让氛围自然延展到${track.artist}的《${track.title}》。`)
    )
  }));

  if (normalizedTracks.length === 0) {
    throw new Error("model returned no playable recommendations");
  }

  return {
    ...plan,
    say: limitDjCopy(plan.say.trim() || normalizedTracks[0]?.intro || "这首歌适合现在播放。"),
    play: normalizedTracks
  };
}

function sanitizeDjIntro(intro: string) {
  return limitDjCopy(
    intro
      .trim()
      .replace(/^先来一首[，,、\s]*/, "")
      .replace(/^再来一首[，,、\s]*/, "")
      .replace(/^接着是[，,、\s]*/, "")
      .replace(/^然后是[，,、\s]*/, "")
      .replace(/^先来一首/, "")
      .replace(/^再来一首/, "")
      .replace(/^接着是/, "")
      .replace(/^然后是/, "")
      .replace(/^第[一二三四五六七八九十]+首[，,、\s]*/, "")
      .replace(/^最后一首[，,、\s]*/, "")
      .replace(/第[一二三四五六七八九十]+首/g, "这段")
      .replace(/下一首/g, "这段")
      .replace(/接下来/g, "这里")
      .replace(/最后一首/g, "这段")
  );
}

function limitDjCopy(text: string) {
  const maxCharacters = 100;

  if (text.length <= maxCharacters) {
    return text;
  }

  const slice = text.slice(0, maxCharacters);
  const punctuationIndex = Math.max(
    slice.lastIndexOf("，"),
    slice.lastIndexOf("。"),
    slice.lastIndexOf("、"),
    slice.lastIndexOf("；"),
    slice.lastIndexOf(","),
    slice.lastIndexOf(".")
  );

  if (punctuationIndex >= 36) {
    return slice.slice(0, punctuationIndex + 1);
  }

  return `${slice.replace(/[，。、；,.]+$/, "")}。`;
}

function readChatCompletionContent(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "choices" in data &&
    Array.isArray(data.choices)
  ) {
    const firstChoice = data.choices[0] as unknown;

    if (
      typeof firstChoice === "object" &&
      firstChoice !== null &&
      "message" in firstChoice &&
      typeof firstChoice.message === "object" &&
      firstChoice.message !== null &&
      "content" in firstChoice.message &&
      typeof firstChoice.message.content === "string"
    ) {
      return firstChoice.message.content;
    }
  }

  throw new Error("custom-http provider returned an unsupported response shape");
}

function parseDjPlan(content: string): ModelDjPlan {
  const parsed = JSON.parse(extractJson(content)) as unknown;

  if (!isModelDjPlan(parsed)) {
    throw new Error("model returned invalid DJ plan JSON");
  }

  return parsed;
}

function tryParseDjPlan(
  content: string,
  requestedTrackCount: number
): ModelDjPlan | null {
  try {
    return normalizeDjPlan(parseDjPlan(content), requestedTrackCount);
  } catch {
    return null;
  }
}

function looksLikeJson(content: string) {
  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("```json");
}

function isMusicRequest(context: PromptContext) {
  const request = readUserRequestFromPrompt(context.prompt);

  return (
    !isExplicitNoMusicRequest(request) &&
    (/(?:推|推荐|想听|要听|听点|放点|播点|来点|来些|给我(?:来|放|播|推|推荐)).{0,16}(?:歌|音乐|歌单|曲)/i.test(
      request
    ) ||
      /来(?:一|两|几|三|四|五|六|七|八|九|十)?首/i.test(request) ||
      /(?:适合|配).{0,16}(?:歌|音乐|歌单|曲)|配乐/i.test(request))
  );
}

function isExplicitNoMusicRequest(request: string) {
  return /(?:先|暂时|现在)?(?:不想|不要|不用|不需要|别)(?:听歌|听音乐|放歌|播放音乐|播歌|推歌|推荐歌曲|推荐音乐)|别(?:给我)?(?:放歌|播歌|推歌|推荐(?:歌|歌曲|音乐))/i.test(
    request
  );
}

function extractJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (fenced?.[1]) {
    return fenced[1];
  }

  return trimmed;
}

function isModelDjPlan(value: unknown): value is ModelDjPlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ModelDjPlan>;

  return (
    typeof candidate.say === "string" &&
    Array.isArray(candidate.play) &&
    candidate.play.length > 0 &&
    candidate.play.every(
      (track) =>
        typeof track === "object" &&
        track !== null &&
        "title" in track &&
        typeof track.title === "string" &&
        "artist" in track &&
        typeof track.artist === "string" &&
        (!("intro" in track) || typeof track.intro === "string")
    ) &&
    typeof candidate.reason === "string" &&
    (candidate.segue === "fade" ||
      candidate.segue === "cut" ||
      candidate.segue === "silence")
  );
}
