import { resolveQqPlayableUrl } from "./qq-music.js";

export type TrackRequest = {
  title: string;
  artist: string;
};

export type PlayableTrack = TrackRequest & {
  audioUrl: string;
  audioLabel: string;
  source: "local" | "netease" | "qq";
  matchedTitle: string;
  matchedArtist: string;
  externalUrl?: string;
  coverUrl?: string;
  playbackStatus: "full" | "unverified" | "fallback" | "failed";
  isFallback?: boolean;
  failureReason?: string;
};

type MusicProvider = "local" | "netease" | "qq";

type NeteaseSearchSong = {
  id: number;
  name: string;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
};

type NeteaseSearchResponse = {
  result?: {
    songs?: NeteaseSearchSong[];
  };
};

type NeteaseSongUrlResponse = {
  data?: Array<{
    id?: number;
    url?: string | null;
  }>;
};

const localLibrary: PlayableTrack[] = [
  {
    title: "Local Focus Loop",
    artist: "Redio Lab",
    audioUrl: "/audio/local-focus.wav",
    audioLabel: "本地测试音频 A",
    source: "local",
    matchedTitle: "Local Focus Loop",
    matchedArtist: "Redio Lab",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Local Night Loop",
    artist: "Redio Lab",
    audioUrl: "/audio/local-night.wav",
    audioLabel: "本地测试音频 B",
    source: "local",
    matchedTitle: "Local Night Loop",
    matchedArtist: "Redio Lab",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Warm Static",
    artist: "Redio Lab",
    audioUrl: "/audio/local-focus.wav",
    audioLabel: "本地测试音频 A",
    source: "local",
    matchedTitle: "Warm Static",
    matchedArtist: "Redio Lab",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Soft Pulse",
    artist: "Redio Lab",
    audioUrl: "/audio/local-night.wav",
    audioLabel: "本地测试音频 B",
    source: "local",
    matchedTitle: "Soft Pulse",
    matchedArtist: "Redio Lab",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Midnight Cue",
    artist: "Redio Lab",
    audioUrl: "/audio/local-focus.wav",
    audioLabel: "本地测试音频 A",
    source: "local",
    matchedTitle: "Midnight Cue",
    matchedArtist: "Redio Lab",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  }
];

export function listLocalTracks() {
  return localLibrary;
}

export async function resolvePlayableTrack(
  track: TrackRequest,
  fallbackIndex = 0,
  rootDir = process.cwd()
): Promise<PlayableTrack> {
  const provider = getMusicProvider();

  if (provider === "qq") {
    return resolveQqTrack(track, fallbackIndex, rootDir);
  }

  if (provider === "netease") {
    return resolveNeteaseTrack(track, fallbackIndex);
  }

  return resolveLocalTrack(track, fallbackIndex);
}

function getMusicProvider(): MusicProvider {
  const provider = process.env.AI_RADIO_MUSIC_PROVIDER;

  if (provider === "local") {
    return "local";
  }

  if (
    provider === "netease" &&
    process.env.AI_RADIO_ENABLE_NETEASE_PROVIDER === "1"
  ) {
    return "netease";
  }

  return "qq";
}

function resolveLocalTrack(track: TrackRequest, fallbackIndex = 0): PlayableTrack {
  const requestedTitle = normalize(track.title);
  const requestedArtist = normalize(track.artist);
  const matchedTrack = localLibrary.find((candidate) => {
    const candidateTitle = normalize(candidate.title);
    const candidateArtist = normalize(candidate.artist);

    return (
      candidateTitle === requestedTitle ||
      (candidateTitle.includes(requestedTitle) && requestedTitle.length > 0) ||
      (requestedTitle.includes(candidateTitle) && candidateTitle.length > 0) ||
      candidateArtist === requestedArtist
    );
  });
  const fallbackTrack =
    matchedTrack ?? localLibrary[fallbackIndex % localLibrary.length] ?? localLibrary[0];

  return {
    title: track.title,
    artist: track.artist,
    audioUrl: fallbackTrack.audioUrl,
    audioLabel: fallbackTrack.audioLabel,
    source: "local",
    matchedTitle: fallbackTrack.matchedTitle,
    matchedArtist: fallbackTrack.matchedArtist,
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: matchedTrack
      ? "当前使用本地测试音频，不代表真实推荐歌曲已解析成功"
      : "未匹配到真实推荐歌曲，使用本地测试音频"
  };
}

async function resolveNeteaseTrack(
  track: TrackRequest,
  fallbackIndex: number
): Promise<PlayableTrack> {
  const fallbackTrack = resolveLocalTrack(track, fallbackIndex);
  const baseUrl = process.env.AI_RADIO_NETEASE_API_BASE_URL ?? "http://127.0.0.1:3000";
  const searchUrl = new URL("/search", baseUrl);

  searchUrl.searchParams.set("keywords", `${track.title} ${track.artist}`.trim());
  searchUrl.searchParams.set("limit", "1");

  try {
    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
      return toNeteaseUnavailableFallback(track, fallbackTrack, "网易云搜索失败");
    }

    const searchData = (await searchResponse.json()) as NeteaseSearchResponse;
    const song = searchData.result?.songs?.[0];

    if (!song) {
      return toNeteaseUnavailableFallback(track, fallbackTrack, "网易云未找到歌曲");
    }

    const songUrl = new URL("/song/url", baseUrl);
    songUrl.searchParams.set("id", String(song.id));

    const urlResponse = await fetch(songUrl);

    if (!urlResponse.ok) {
      return toNeteaseFallback(track, song, fallbackTrack);
    }

    const urlData = (await urlResponse.json()) as NeteaseSongUrlResponse;
    const playableUrl = urlData.data?.[0]?.url;

    if (!playableUrl) {
      return toNeteaseFallback(track, song, fallbackTrack);
    }

    return {
      title: track.title,
      artist: track.artist,
      audioUrl: playableUrl,
      audioLabel: "网易云音乐",
      source: "netease",
      matchedTitle: song.name,
      matchedArtist: readNeteaseArtists(song),
      externalUrl: `https://music.163.com/#/song?id=${song.id}`,
      playbackStatus: "unverified",
      failureReason: "网易云返回了播放地址，但尚未确认是否为完整歌曲"
    };
  } catch {
    return toNeteaseUnavailableFallback(track, fallbackTrack, "网易云 API 未连接");
  }
}

async function resolveQqTrack(
  track: TrackRequest,
  _fallbackIndex: number,
  rootDir: string
): Promise<PlayableTrack> {
  try {
    const result = await resolveQqPlayableUrl(rootDir, track.title, track.artist);

    if (!result.playable) {
      return {
        title: track.title,
        artist: track.artist,
        audioUrl: "",
        audioLabel: "QQ 音乐不可播",
        source: "qq",
        matchedTitle: result.matchedTitle ?? track.title,
        matchedArtist: result.matchedArtist ?? track.artist,
        externalUrl: result.externalUrl,
        coverUrl: result.coverUrl,
        playbackStatus: "failed",
        failureReason: result.message
      };
    }

    return {
      title: track.title,
      artist: track.artist,
      audioUrl: result.url,
      audioLabel: `QQ 音乐 · ${result.quality}`,
      source: "qq",
      matchedTitle: result.matchedTitle,
      matchedArtist: result.matchedArtist,
      externalUrl: result.externalUrl,
      coverUrl: result.coverUrl,
      playbackStatus: "full"
    };
  } catch (error) {
    return {
      title: track.title,
      artist: track.artist,
      audioUrl: "",
      audioLabel: "QQ 音乐解析失败",
      source: "qq",
      matchedTitle: track.title,
      matchedArtist: track.artist,
      playbackStatus: "failed",
      failureReason:
        error instanceof Error ? error.message : "QQ 音乐解析失败"
    };
  }
}

function toNeteaseUnavailableFallback(
  track: TrackRequest,
  fallbackTrack: PlayableTrack,
  reason: string
): PlayableTrack {
  return {
    ...fallbackTrack,
    title: track.title,
    artist: track.artist,
    audioLabel: `${fallbackTrack.audioLabel} · ${reason}`,
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: reason
  };
}

function toNeteaseFallback(
  track: TrackRequest,
  song: NeteaseSearchSong,
  fallbackTrack: PlayableTrack
): PlayableTrack {
  return {
    ...fallbackTrack,
    title: track.title,
    artist: track.artist,
    audioLabel: `${fallbackTrack.audioLabel} · 网易云无可播放地址`,
    matchedTitle: song.name,
    matchedArtist: readNeteaseArtists(song),
    externalUrl: `https://music.163.com/#/song?id=${song.id}`,
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "网易云无可播放地址，当前使用本地测试音频"
  };
}

function readNeteaseArtists(song: NeteaseSearchSong) {
  const artists = song.ar ?? song.artists ?? [];
  return artists.map((artist) => artist.name).filter(Boolean).join(", ");
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
