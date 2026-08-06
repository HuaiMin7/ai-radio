import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import { StarfieldCanvas } from "./StarfieldCanvas";

declare global {
  interface Window {
    redioDesktop?: {
      isDesktop: boolean;
      openQQMusicLogin: () => Promise<DesktopQqLoginResult>;
      clearQQMusicLogin: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

type DesktopQqLoginResult =
  | {
      ok: true;
      cookie: string;
      reused?: boolean;
      partial?: boolean;
    }
  | {
      ok: false;
      cancelled?: boolean;
      message?: string;
      error?: string;
    };

type RedioBridgeStatus = {
  connected: boolean;
  version?: string;
  checking: boolean;
  message?: string;
};

type RedioBridgeResponse = {
  ok?: boolean;
  cookie?: string;
  status?: QqLoginStatus;
  message?: string;
  error?: string;
  partial?: boolean;
  reused?: boolean;
  opened?: boolean;
  diagnostics?: {
    cookieCount: number;
    cookieNames: string[];
    pageCookieCount: number;
  };
};

type DjPlan = {
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

type NowPlayingState = {
  status: "idle" | "planned";
  currentPlan: DjPlan | null;
  currentContext?: PromptContext | null;
  playbackSummary?: {
    status: "full" | "attemptable" | "failed" | "idle";
    hasFullPlayableTrack: boolean;
    hasAttemptableTrack: boolean;
  };
  updatedAt: string;
};

type PlanResponse =
  | {
      mode: "chat";
      message: string;
    }
  | {
      mode: "recommend";
      state: NowPlayingState;
    };

type PromptContext = {
  prompt: string;
  characterCount: number;
  generatedAt: string;
  sources: Array<{
    label: string;
    path: string;
    characterCount: number;
  }>;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt: string;
  plan?: DjPlan;
  shouldAnimate?: boolean;
};

type RecommendedTrack = DjPlan["play"][number];

type PlaybackHistoryEntry = {
  id: string;
  createdAt: string;
  userMessage: string | null;
  say: string;
  play: DjPlan["play"];
  reason: string;
  segue: DjPlan["segue"];
  episode: number;
};

type QueueTrack = DjPlan["play"][number] & {
  id: string;
  queuedAt: string;
  episode: number;
};

type TrackFeedbackAction = "like" | "skip" | "replay";

type TrackFeedbackEntry = {
  id: string;
  createdAt: string;
  action: TrackFeedbackAction;
  title: string;
  artist: string;
  source?: "local" | "netease" | "qq";
  audioLabel?: string;
};

type TtsResponse = {
  audioUrl: string;
  provider: "aliyun-qwen-tts" | "macos-say";
  fallback?: boolean;
};

type ResolveTrackResponse = PlayableTrack;

type QqLoginStatus = {
  provider: "qq";
  loggedIn: boolean;
  hasCookie: boolean;
  userId?: string;
  nickname?: string;
  avatarUrl?: string;
  playbackKeyReady: boolean;
  message?: string;
};

type LyricLine = {
  time: number;
  text: string;
};

type LyricsResponse = {
  provider: "qq" | "lrclib";
  songMid?: string;
  matchedTitle: string;
  matchedArtist: string;
  lines: LyricLine[];
};

type AppLogEntry = {
  id: string;
  createdAt: string;
  level: "info" | "success" | "error";
  message: string;
  detail?: string;
};

type WeatherSnapshot =
  | {
      status: "configured";
      provider: "qweather";
      location: string;
      observedAt: string;
      text: string;
      temperature: string;
      feelsLike: string;
      humidity: string;
      windDirection: string;
      windScale: string;
    }
  | {
      status: "not-configured";
      provider: "qweather";
      message: string;
    };

type Track = {
  title: string;
  artist: string;
};

type AppView = "radio" | "settings" | "agent";

type PlayableTrack = Track & {
  audioLabel: string;
  audioUrl: string;
  source: "local" | "netease" | "qq";
  queueId?: string;
  queuedAt?: string;
  episode?: number;
  djIntro?: string;
  matchedTitle?: string;
  matchedArtist?: string;
  externalUrl?: string;
  coverUrl?: string;
  playbackStatus?: "full" | "unverified" | "fallback" | "failed";
  isFallback?: boolean;
  failureReason?: string;
};

type CircularQueuePlayerProps = {
  currentCaption: string;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  isPlaying: boolean;
  onLike: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
  onSelectTrack: (index: number) => void;
  onToggleMute: () => void;
  onTogglePlayback: () => void;
  onVolumeChange: (value: number) => void;
  selectedTrack: PlayableTrack;
  selectedTrackIndex: number;
  tracks: PlayableTrack[];
  volume: number;
};

const djDuckingRatio = 0.5;
const musicIntentPattern =
  /(?:推|推荐|想听|要听|听点|放点|播点|来点|来些|给我(?:来|放|播|推|推荐)).{0,16}(?:歌|音乐|歌单|曲)|来(?:一|两|几|三|四|五|六|七|八|九|十)?首|(?:适合|配).{0,16}(?:歌|音乐|歌单|曲)|配乐/i;
const noMusicIntentPattern =
  /(?:先|暂时|现在)?(?:不想|不要|不用|不需要|别)(?:听歌|听音乐|放歌|播放音乐|播歌|推歌|推荐歌曲|推荐音乐)|别(?:给我)?(?:放歌|播歌|推歌|推荐(?:歌|歌曲|音乐))/i;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const appBaseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

function getPublicAssetUrl(url: string) {
  return `${appBaseUrl}${url}`;
}

const fallbackTracks: PlayableTrack[] = [
  {
    title: "GOOD FOR ME.",
    artist: "SEVENTEEN",
    audioLabel: "本地测试音频 A",
    audioUrl: "/audio/local-focus.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "OuterWilds",
    artist: "Andrew Prahlow",
    audioLabel: "本地测试音频 B",
    audioUrl: "/audio/local-night.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "电台情歌",
    artist: "莫文蔚",
    audioLabel: "本地测试音频 A",
    audioUrl: "/audio/local-focus.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Soft Pulse",
    artist: "Redio Lab",
    audioLabel: "本地测试音频 B",
    audioUrl: "/audio/local-night.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Midnight Cue",
    artist: "Redio Lab",
    audioLabel: "本地测试音频 A",
    audioUrl: "/audio/local-focus.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  }
];

const queueFallbackCovers = [
  getPublicAssetUrl("/images/redio-queue-cover-0.png"),
  getPublicAssetUrl("/images/redio-queue-cover-1.png"),
  getPublicAssetUrl("/images/redio-queue-cover-2.jpg"),
  getPublicAssetUrl("/images/redio-queue-cover-3.jpg"),
  getPublicAssetUrl("/images/redio-queue-cover-4.jpg"),
  getPublicAssetUrl("/images/redio-queue-cover-5.png"),
  getPublicAssetUrl("/images/redio-queue-cover-6.png")
];

const redioBridgeRequestTimeoutMs = 4500;
const redioBridgeMinimumVersion = [0, 1, 5];

function isRedioBridgeOutdated(version?: string) {
  if (!version) return false;

  const currentVersion = version.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < redioBridgeMinimumVersion.length; index += 1) {
    const currentPart = currentVersion[index] ?? 0;
    const minimumPart = redioBridgeMinimumVersion[index];
    if (currentPart !== minimumPart) return currentPart < minimumPart;
  }

  return false;
}

function getApiUrl(url: string) {
  return url.startsWith("/api/") ? `${apiBaseUrl}${url}` : url;
}

function getPlaybackAudioUrl(track: PlayableTrack) {
  if (!track.audioUrl) {
    return "";
  }

  if (track.source === "qq" && /^https?:\/\//i.test(track.audioUrl)) {
    return getApiUrl(`/api/audio/proxy?url=${encodeURIComponent(track.audioUrl)}`);
  }

  return track.audioUrl.startsWith("/")
    ? getPublicAssetUrl(track.audioUrl)
    : track.audioUrl;
}

function requestRedioBridge(
  type:
    | "REDIO_BRIDGE_PING"
    | "REDIO_BRIDGE_GET_STATUS"
    | "REDIO_BRIDGE_OPEN_QQ_LOGIN"
    | "REDIO_BRIDGE_WARMUP_QQ_PLAYBACK"
    | "REDIO_BRIDGE_SYNC_QQ_COOKIE",
  timeoutMs = redioBridgeRequestTimeoutMs
): Promise<RedioBridgeResponse & { version?: string }> {
  return new Promise((resolve, reject) => {
    const id = createMessageId();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Redio Bridge 未连接"));
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || data.source !== "redio-bridge-extension" || data.id !== id) return;

      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      resolve(data.response ?? { ok: true, version: data.version });
    }

    window.addEventListener("message", handleMessage);
    window.postMessage({
      source: "redio-web",
      type,
      id
    }, window.location.origin);
  });
}

function waitForBridgePoll(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(url), {
    ...init,
    credentials: init?.credentials ?? "include"
  });

  if (!response.ok) {
    let errorMessage = `请求失败：${response.status}`;

    try {
      const body = (await response.json()) as unknown;

      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        errorMessage = body.error;
      }
    } catch {
      // Keep the status-based message when the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatClock() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function formatToday() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
}

function formatWeatherLabel(weather: WeatherSnapshot) {
  if (weather.status === "not-configured") {
    return "天气未配置";
  }

  return `${weather.text} ${weather.temperature}°C`;
}

function formatHistoryTime(createdAt: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(createdAt));
}

function getMessageTimestamp(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "--/--",
      time: "--:--"
    };
  }

  return {
    date: `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  };
}

function formatLogTime(createdAt: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(createdAt));
}

function getPlayableTrackKey(track: Track) {
  return `${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`;
}

function getQqSongMid(externalUrl: string | undefined) {
  return externalUrl?.match(/songDetail\/([^/?#]+)/)?.[1] ?? "";
}

function getCurrentLyricText(lines: LyricLine[], currentTime: number) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].time <= currentTime + 0.05) {
      return lines[index].text;
    }
  }

  return undefined;
}

function getPlayableTrackIdentity(track: PlayableTrack, index: number) {
  return track.queueId ?? `${getPlayableTrackKey(track)}::${index}`;
}

function shouldRefreshProviderTrack(track: PlayableTrack) {
  if (track.audioUrl && track.playbackStatus !== "failed" && !track.isFallback) {
    return false;
  }

  return (
    track.source === "netease" ||
    track.source === "qq" ||
    ((track.isFallback || track.playbackStatus === "fallback") &&
      [track.audioLabel, track.failureReason].some(
        (value) => value?.includes("网易云") || value?.includes("QQ 音乐")
      ))
  );
}

function getDuckedSongVolume(volume: number) {
  return volume * djDuckingRatio;
}

function clampVolume(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function getPlaybackStatusLabel(track: Pick<PlayableTrack, "playbackStatus" | "isFallback">) {
  if (track.playbackStatus === "full") {
    return "完整歌源";
  }

  if (track.playbackStatus === "unverified") {
    return "音源待验证";
  }

  if (track.playbackStatus === "failed") {
    return "音源失败";
  }

  if (track.isFallback || track.playbackStatus === "fallback") {
    return "测试音频";
  }

  return "音源未知";
}

function getTrackPlaybackWarning(track: PlayableTrack) {
  if (track.playbackStatus === "full") {
    return null;
  }

  if (track.playbackStatus === "unverified") {
    return track.failureReason ?? "当前音源尚未确认是否为完整歌曲。";
  }

  if (track.isFallback || track.playbackStatus === "fallback") {
    return track.failureReason ?? "当前播放的是本地测试音频，不代表真实推荐歌曲已解析成功。";
  }

  if (track.playbackStatus === "failed") {
    return track.failureReason ?? "这首歌暂时没有可播放音源。";
  }

  return null;
}

function hasAttemptableAudio(track: PlayableTrack) {
  return Boolean(track.audioUrl && track.playbackStatus !== "failed");
}

function isVerifiedFullTrack(track: PlayableTrack) {
  return track.playbackStatus === "full" && !track.isFallback;
}

function isTrackPlayable(track: PlayableTrack) {
  return hasAttemptableAudio(track);
}

function findNextVerifiedTrackIndex(tracks: PlayableTrack[], startIndex: number) {
  for (let index = startIndex + 1; index < tracks.length; index += 1) {
    if (isVerifiedFullTrack(tracks[index])) {
      return index;
    }
  }

  return -1;
}

function findFirstAttemptableTrackIndex(tracks: PlayableTrack[]) {
  return tracks.findIndex(hasAttemptableAudio);
}

function getPlaybackErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  ) {
    return "浏览器安全策略阻止了自动播放，请手动点击一次播放。";
  }

  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return "当前音频格式或地址无法播放，请换一首歌重试。";
  }

  return "当前推荐音源播放失败，请手动点击播放重试。";
}

function getPlanningCopy(message: string) {
  if (!message.trim()) {
    return {
      input: "正在生成...",
      bubble: "正在准备下一段电台节目",
      mode: "program" as const
    };
  }

  if (!noMusicIntentPattern.test(message) && musicIntentPattern.test(message)) {
    return {
      input: "正在理解...",
      bubble: "正在理解你的意思",
      mode: "music" as const
    };
  }

  return {
    input: "正在思考...",
    bubble: "让我想想怎么回你",
    mode: "chat" as const
  };
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="backIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.5 4.75L8.25 12L15.5 19.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function VolumeIcon({
  color = "currentColor",
  muted = false
}: {
  color?: string;
  muted?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className="volumeIcon"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.44196 4.81854L6.74091 1.94527C6.95236 1.76546 7.22167 1.66663 7.50016 1.66663C8.1445 1.66663 8.66683 2.18483 8.66683 2.82406V13.1758C8.66683 13.4521 8.56721 13.7193 8.38596 13.9291C7.96664 14.4144 7.23012 14.4706 6.74091 14.0546L3.44196 11.1814C3.41175 11.1557 3.37328 11.1416 3.3335 11.1416H2.50016C1.85583 11.1416 1.3335 10.6234 1.3335 9.98412V6.01578C1.3335 5.37655 1.85583 4.85835 2.50016 4.85835H3.3335C3.37328 4.85835 3.41175 4.84423 3.44196 4.81854ZM3.3335 9.94155C3.64661 9.94155 3.95104 10.049 4.19512 10.2471L7.46683 13.0988V2.90109L4.1951 5.75283C3.95103 5.95088 3.64662 6.05835 3.3335 6.05835H2.5335V9.94155H3.3335Z"
        fill={color}
      />
      {muted ? (
        <path
          d="M2.25 2.25L13.75 13.75"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      ) : (
        <>
          <path
            d="M9.97456 5.60423C10.2005 5.36181 10.5801 5.34843 10.8226 5.57436C11.4229 6.13387 11.9904 6.92913 11.9904 8.01331C11.9904 9.07394 11.4434 9.85032 10.8726 10.4047C10.6349 10.6356 10.255 10.63 10.0241 10.3923C9.79326 10.1546 9.79881 9.77472 10.0365 9.54386C10.4886 9.10483 10.7904 8.61931 10.7904 8.01331C10.7904 7.39079 10.4749 6.89068 10.0044 6.45223C9.76202 6.22631 9.74864 5.84664 9.97456 5.60423Z"
            fill={color}
          />
          <path
            d="M12.8587 4.07678C12.6287 3.83825 12.2489 3.83135 12.0103 4.06137C11.7718 4.29139 11.7649 4.67122 11.9949 4.90976C12.844 5.79026 13.4646 6.63312 13.4646 8.05612C13.4646 9.42443 12.8818 10.2296 12.0872 11.1039C11.8644 11.3491 11.8825 11.7286 12.1277 11.9515C12.373 12.1743 12.7524 12.1562 12.9753 11.9109C13.8376 10.9621 14.6646 9.87443 14.6646 8.05612C14.6646 6.1724 13.7901 5.04264 12.8587 4.07678Z"
            fill={color}
          />
        </>
      )}
    </svg>
  );
}

function MessageSendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="messageSendIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.9232 5.8598C20.297 4.75537 19.2421 3.70181 18.1386 4.07756L2.95308 9.24851C1.83235 9.63014 1.65618 11.1418 2.65909 11.7711L8.58385 15.4886L12.2621 21.3419C12.8924 22.3449 14.4042 22.1665 14.7839 21.0444L19.9232 5.8598ZM4.3346 10.6881L17.9499 6.05177L13.3428 19.6641L10.3596 14.9169L13.9424 11.333C14.2953 10.98 14.2953 10.4076 13.9424 10.0545C13.5894 9.70146 13.0172 9.70146 12.6643 10.0545L9.06426 13.6557L4.3346 10.6881Z"
        fill="url(#message-send-gradient)"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="message-send-gradient"
          x1="-10"
          x2="21.4283"
          y1="4"
          y2="8.73878"
        >
          <stop stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      className="micIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2C9.65279 2 7.75 3.90279 7.75 6.25V11.25C7.75 13.5972 9.65279 15.5 12 15.5C14.3472 15.5 16.25 13.5972 16.25 11.25V6.25C16.25 3.90279 14.3472 2 12 2ZM9.25 6.25C9.25 4.73122 10.4812 3.5 12 3.5C13.5188 3.5 14.75 4.73122 14.75 6.25V11.25C14.75 12.7688 13.5188 14 12 14C10.4812 14 9.25 12.7688 9.25 11.25V6.25Z"
        fill="url(#mic-gradient-primary)"
      />
      <path
        d="M11.25 18.9642V21.25C11.25 21.6642 11.5858 22 12 22C12.4142 22 12.75 21.6642 12.75 21.25V18.9642C16.6783 18.5869 19.75 15.2772 19.75 11.25V10.75C19.75 10.3358 19.4142 10 19 10C18.5858 10 18.25 10.3358 18.25 10.75V11.25C18.25 14.7018 15.4518 17.5 12 17.5C8.54822 17.5 5.75 14.7018 5.75 11.25V10.75C5.75 10.3358 5.41421 10 5 10C4.58579 10 4.25 10.3358 4.25 10.75V11.25C4.25 15.2772 7.3217 18.5869 11.25 18.9642Z"
        fill="url(#mic-gradient-secondary)"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="mic-gradient-primary"
          x1="-6.08333"
          x2="21.2224"
          y1="2"
          y2="5.19081"
        >
          <stop stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="mic-gradient-secondary"
          x1="-6.08333"
          x2="21.2224"
          y1="2"
          y2="5.19081"
        >
          <stop stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatisticsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="statisticsIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g filter="url(#statistics-shadow)">
        <path
          d="M14.3658 3C14.8628 3 15.2658 3.40294 15.2658 3.9V20.1C15.2658 20.5971 14.8628 21 14.3658 21C13.8687 21 13.4658 20.5971 13.4658 20.1V3.9C13.4658 3.40294 13.8687 3 14.3658 3Z"
          fill="#00AB47"
        />
        <path
          d="M5.8 8.9C5.8 8.40294 5.39706 8 4.9 8C4.40294 8 4 8.40294 4 8.9V20.1C4 20.5971 4.40294 21 4.9 21C5.39706 21 5.8 20.5971 5.8 20.1V8.9Z"
          fill="#00AB47"
        />
        <path
          d="M10.5329 12.9C10.5329 12.4029 10.1299 12 9.63288 12C9.13582 12 8.73288 12.4029 8.73288 12.9V20.1C8.73288 20.5971 9.13582 21 9.63288 21C10.1299 21 10.5329 20.5971 10.5329 20.1V12.9Z"
          fill="#00AB47"
        />
        <path
          d="M19.9986 9.9C19.9986 9.40294 19.5957 9 19.0986 9C18.6016 9 18.1986 9.40294 18.1986 9.9V20.1C18.1986 20.5971 18.6016 21 19.0986 21C19.5957 21 19.9986 20.5971 19.9986 20.1V9.9Z"
          fill="#00AB47"
        />
      </g>
      <defs>
        <filter
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
          height="28"
          id="statistics-shadow"
          width="28"
          x="-2"
          y="-2"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            result="hardAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0"
          />
          <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow" />
          <feBlend in="SourceGraphic" in2="effect1_dropShadow" mode="normal" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg
      aria-hidden="true"
      className="transportIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.0976 5.41789L5.28602 10.6191C4.52721 11.067 4.27397 12.0473 4.72039 12.8086C4.85782 13.043 5.05256 13.2383 5.28618 13.3762L14.0978 18.576C14.8566 19.0238 15.8336 18.7696 16.28 18.0082C16.424 17.7625 16.5 17.4825 16.5 17.1974V6.7964C16.5 5.91309 15.7863 5.19702 14.9059 5.19702C14.6217 5.19702 14.3426 5.27328 14.0976 5.41789Z"
        fill="white"
      />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg
      aria-hidden="true"
      className="transportIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.90239 5.41789L18.714 10.6191C19.4728 11.067 19.726 12.0473 19.2796 12.8086C19.1422 13.043 18.9474 13.2383 18.7138 13.3762L9.90223 18.576C9.14337 19.0238 8.16637 18.7696 7.72004 18.0082C7.57597 17.7625 7.5 17.4825 7.5 17.1974V6.7964C7.5 5.91309 8.21369 5.19702 9.09408 5.19702C9.37832 5.19702 9.6574 5.27328 9.90239 5.41789Z"
        fill="white"
      />
    </svg>
  );
}

function PauseTransportIcon() {
  return (
    <svg
      aria-hidden="true"
      className="transportIcon"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.75 5C6.7835 5 6 5.7835 6 6.75V17.25C6 18.2165 6.7835 19 7.75 19C8.7165 19 9.5 18.2165 9.5 17.25V6.75C9.5 5.7835 8.7165 5 7.75 5Z"
        fill="white"
      />
      <path
        d="M16.25 5C15.2835 5 14.5 5.7835 14.5 6.75V17.25C14.5 18.2165 15.2835 19 16.25 19C17.2165 19 18 18.2165 18 17.25V6.75C18 5.7835 17.2165 5 16.25 5Z"
        fill="white"
      />
    </svg>
  );
}

function PlayTransportIcon() {
  return <NextIcon />;
}

export function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const djAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingDjIntroRef = useRef<string | null>(null);
  const pendingQueueAutoplayRef = useRef(false);
  const planningRequestInFlightRef = useRef(false);
  const djSpeechRequestIdRef = useRef(0);
  const resolvingTrackKeysRef = useRef(new Set<string>());
  const playbackErrorRetryKeysRef = useRef(new Set<string>());
  const selectedTrackKeyRef = useRef("");
  const songVolumeAnimationRef = useRef<number | null>(null);
  const browserAudioUnlockedRef = useRef(false);
  const audioUnlockElementRef = useRef<HTMLAudioElement | null>(null);
  const playbackToastTimerRef = useRef<number | null>(null);
  const lyricsCacheRef = useRef(new Map<string, LyricLine[]>());
  const bridgeAutoRefreshInFlightRef = useRef(false);
  const lastSyncedBridgeCookieRef = useRef("");
  const lastAudibleVolumeRef = useRef(0.5);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [playbackRequestId, setPlaybackRequestId] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLyrics, setActiveLyrics] = useState<{
    trackKey: string;
    lines: LyricLine[];
  } | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningCopy, setPlanningCopy] = useState(getPlanningCopy(""));
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isQqSourceOpen, setIsQqSourceOpen] = useState(false);
  const [isQqSaving, setIsQqSaving] = useState(false);
  const [isQqWebLoginBusy, setIsQqWebLoginBusy] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isManualCookieOpen, setIsManualCookieOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeDjText, setActiveDjText] = useState<string | null>(null);
  const [queueTracks, setQueueTracks] = useState<QueueTrack[]>([]);
  const [historyEntries, setHistoryEntries] = useState<PlaybackHistoryEntry[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<TrackFeedbackEntry[]>([]);
  const [hasEnteredRadio, setHasEnteredRadio] = useState(false);
  const [appView, setAppView] = useState<AppView>("radio");
  const [resolvedTrackOverrides, setResolvedTrackOverrides] = useState<
    Record<string, PlayableTrack>
  >({});
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [qqLoginStatus, setQqLoginStatus] = useState<QqLoginStatus | null>(null);
  const [qqCookieDraft, setQqCookieDraft] = useState("");
  const [redioBridgeStatus, setRedioBridgeStatus] = useState<RedioBridgeStatus>({
    connected: false,
    checking: true,
    message: "正在检测 Redio Bridge"
  });
  const [logs, setLogs] = useState<AppLogEntry[]>([
    {
      id: "boot",
      createdAt: new Date().toISOString(),
      level: "info",
      message: "页面已启动",
      detail: "等待读取电台状态"
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [playbackToast, setPlaybackToast] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (playbackToastTimerRef.current !== null) {
        window.clearTimeout(playbackToastTimerRef.current);
      }
    };
  }, []);

  function appendLog(
    level: AppLogEntry["level"],
    message: string,
    detail?: string
  ) {
    setLogs((currentLogs) =>
      [
        {
          id: createMessageId(),
          createdAt: new Date().toISOString(),
          level,
          message,
          detail
        },
        ...currentLogs
      ].slice(0, 30)
    );
  }

  function clearPlaybackToast() {
    if (playbackToastTimerRef.current !== null) {
      window.clearTimeout(playbackToastTimerRef.current);
      playbackToastTimerRef.current = null;
    }

    setPlaybackToast(null);
  }

  function showPlaybackToast(message: string) {
    clearPlaybackToast();
    setPlaybackToast(message);
    playbackToastTimerRef.current = window.setTimeout(() => {
      setPlaybackToast(null);
      playbackToastTimerRef.current = null;
    }, 4200);
  }

  function showTrackPlaybackFailure(track: PlayableTrack, fallbackReason: string) {
    const reason = track.failureReason?.trim() || fallbackReason;

    setError(reason);
    showPlaybackToast(`《${track.title}》播放失败：${reason}`);
    return reason;
  }

  async function loadNowPlaying() {
    setError(null);
    const state = await fetchJson<NowPlayingState>("/api/now");

    setNowPlaying(state);
    const firstTrack = state.currentPlan?.play[0];
    const playableTrack = firstTrack ? toPlayableTrack(firstTrack) : null;

    setError(playableTrack ? getTrackPlaybackWarning(playableTrack) : null);
  }

  async function loadHistory() {
    const entries = await fetchJson<PlaybackHistoryEntry[]>("/api/history");
    setHistoryEntries(entries);
  }

  async function loadChatHistory() {
    const entries = await fetchJson<ChatMessage[]>("/api/chat");
    setMessages(entries);
    return entries;
  }

  async function loadQueue() {
    const entries = await fetchJson<QueueTrack[]>("/api/queue");
    setQueueTracks((currentTracks) => {
      const currentTracksById = new Map(
        currentTracks.map((track) => [track.id, track] as const)
      );

      return entries.map((track) => {
        const currentTrack = currentTracksById.get(track.id);

        return currentTrack?.coverUrl
          ? {
              ...track,
              coverUrl: currentTrack.coverUrl
            }
          : track;
      });
    });
    return entries;
  }

  async function loadFeedback() {
    const entries = await fetchJson<TrackFeedbackEntry[]>("/api/feedback");
    setFeedbackEntries(entries);
  }

  async function loadWeather() {
    const snapshot = await fetchJson<WeatherSnapshot>("/api/weather");
    setWeather(snapshot);
  }

  async function loadQqLoginStatus() {
    const status = await fetchJson<QqLoginStatus>("/api/qq/login/status");
    setQqLoginStatus(status);
    return status;
  }

  async function loadAuthenticatedData() {
    await Promise.all([
      loadNowPlaying(),
      loadHistory(),
      loadQueue(),
      loadChatHistory()
    ]);
    await Promise.allSettled([
      loadFeedback().catch((requestError) => {
        const errorMessage =
          requestError instanceof Error ? requestError.message : "偏好记录读取失败。";

        appendLog("error", "偏好记录读取失败", errorMessage);
      }),
      loadWeather().catch((requestError) => {
        const errorMessage =
          requestError instanceof Error ? requestError.message : "天气读取失败。";

        appendLog("error", "天气读取失败", errorMessage);
      })
    ]);
  }

  function resetAuthenticatedData() {
    setNowPlaying(null);
    setHistoryEntries([]);
    setQueueTracks([]);
    setFeedbackEntries([]);
    setMessages([]);
    setSelectedTrackId(null);
    setIsPlaying(false);
    audioRef.current?.pause();
  }

  function openLoginModal() {
    setError(null);
    setIsManualCookieOpen(false);
    setIsLoginModalOpen(true);
    void detectRedioBridge();
  }

  function closeLoginModal() {
    setIsLoginModalOpen(false);
    setIsManualCookieOpen(false);
    setIsQqWebLoginBusy(false);
  }

  async function detectRedioBridge() {
    setRedioBridgeStatus((currentStatus) => ({
      ...currentStatus,
      checking: true,
      message: "正在检测 Redio Bridge"
    }));

    try {
      const response = await requestRedioBridge("REDIO_BRIDGE_PING", 1800);
      setRedioBridgeStatus({
        connected: true,
        checking: false,
        version: response.version,
        message: response.version ? `Bridge 已连接 · v${response.version}` : "Bridge 已连接"
      });
    } catch {
      setRedioBridgeStatus({
        connected: false,
        checking: false,
        message: "未检测到 Redio Bridge"
      });
    }
  }

  async function refreshRedioBridgeQqStatus() {
    try {
      const response = await requestRedioBridge("REDIO_BRIDGE_GET_STATUS");
      setRedioBridgeStatus((currentStatus) => ({
        ...currentStatus,
        connected: true,
        checking: false,
        message: response.message ?? currentStatus.message ?? "Bridge 已连接"
      }));

      if (response.status?.loggedIn) {
        await loadQqLoginStatus();
      }
    } catch (requestError) {
      setRedioBridgeStatus({
        connected: false,
        checking: false,
        message:
          requestError instanceof Error ? requestError.message : "Redio Bridge 检测失败"
      });
    }
  }

  async function persistQqCookie(cookie: string, source: "manual" | "desktop" | "bridge") {
    if (!cookie.trim()) {
      setError("请先粘贴 QQ 音乐 Cookie。");
      return;
    }

    setIsQqSaving(true);

    try {
      const status = await fetchJson<QqLoginStatus>("/api/qq/login/cookie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cookie
        })
      });

      setQqLoginStatus(status);
      if (status.loggedIn) {
        await loadAuthenticatedData();
        closeLoginModal();
      }
      resolvingTrackKeysRef.current.clear();
      setResolvedTrackOverrides({});
      if (source === "manual") {
        setQqCookieDraft("");
      }
      appendLog(
        status.playbackKeyReady ? "success" : "info",
        status.playbackKeyReady ? "QQ 音乐播放授权已保存" : "QQ 音乐账号态已保存",
        status.playbackKeyReady
          ? source === "bridge"
            ? "Redio Bridge 已同步播放票据"
            : "已检测到播放票据"
          : "缺少播放票据，部分歌曲仍可能不可播"
      );
      setError(status.playbackKeyReady ? null : status.message ?? "QQ 音乐播放授权不完整。");
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "QQ Cookie 保存失败。";

      setError(errorMessage);
      appendLog("error", "QQ Cookie 保存失败", errorMessage);
    } finally {
      setIsQqSaving(false);
    }
  }

  async function saveQqCookie() {
    await persistQqCookie(qqCookieDraft, "manual");
  }

  async function openQqBridgeLogin() {
    setIsQqWebLoginBusy(true);
    setError(null);

    try {
      appendLog("info", "打开 QQ 音乐官方登录页", "Redio Bridge 正在等待扫码授权");
      const response = await requestRedioBridge("REDIO_BRIDGE_OPEN_QQ_LOGIN", 8000);

      if (response.status?.playbackKeyReady && response.cookie?.trim()) {
        await persistQqCookie(response.cookie, "bridge");
        await refreshRedioBridgeQqStatus();
        return;
      }

      let accountSynced = false;
      let playbackWarmupStarted = false;
      let lastSyncedCookie = "";
      const deadline = Date.now() + 120000;

      while (Date.now() < deadline) {
        await waitForBridgePoll(1500);
        const current = await requestRedioBridge("REDIO_BRIDGE_GET_STATUS", 6000);

        setRedioBridgeStatus((currentStatus) => ({
          ...currentStatus,
          connected: true,
          checking: false,
          message: current.message ?? "正在等待 QQ 音乐登录"
        }));

        if (!current.status?.loggedIn || !current.cookie?.trim()) {
          continue;
        }

        if (
          !accountSynced ||
          (current.status.playbackKeyReady && current.cookie !== lastSyncedCookie)
        ) {
          await persistQqCookie(current.cookie, "bridge");
          accountSynced = true;
          lastSyncedCookie = current.cookie;
          lastSyncedBridgeCookieRef.current = current.cookie;
        }

        if (current.status.playbackKeyReady) {
          setError(null);
          setRedioBridgeStatus((currentStatus) => ({
            ...currentStatus,
            message: "QQ 音乐播放授权已同步"
          }));
          appendLog("success", "QQ 音乐网页登录完成", "账号和播放票据已自动同步");
          return;
        }

        if (!playbackWarmupStarted) {
          playbackWarmupStarted = true;
          setRedioBridgeStatus((currentStatus) => ({
            ...currentStatus,
            message: "账号已登录，正在获取播放票据"
          }));
          await requestRedioBridge("REDIO_BRIDGE_WARMUP_QQ_PLAYBACK", 8000);
        }
      }

      if (accountSynced) {
        setError("QQ 账号已同步，但尚未生成播放票据。请在 QQ 音乐网页播放任意一首歌，再点“刷新登录状态”。");
        appendLog("info", "QQ 账号登录已同步", "播放票据尚未生成，可在 QQ 音乐网页播放一次后刷新状态");
        return;
      }

      throw new Error(response.error ?? "两分钟内没有检测到 QQ 音乐登录态，请返回 Redio 后刷新登录状态");
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "Redio Bridge 登录失败。";

      setError(errorMessage);
      appendLog("error", "Redio Bridge 登录失败", errorMessage);
    } finally {
      setIsQqWebLoginBusy(false);
    }
  }

  async function openQqLoginFromModal() {
    if (
      !redioBridgeStatus.connected ||
      isRedioBridgeOutdated(redioBridgeStatus.version)
    ) {
      window.open("https://y.qq.com/", "_blank", "noopener,noreferrer");
      setError("请先安装并启用 Redio Bridge，登录后再刷新登录状态。");
      return;
    }

    await openQqBridgeLogin();
  }

  async function syncQqCookieFromBridge(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsQqSaving(true);
      setError(null);
    }

    try {
      const response = await requestRedioBridge("REDIO_BRIDGE_SYNC_QQ_COOKIE");

      setRedioBridgeStatus((currentStatus) => ({
        ...currentStatus,
        connected: true,
        checking: false,
        message: response.message ?? currentStatus.message
      }));

      if (!response.status?.loggedIn || !response.cookie?.trim()) {
        if (!options.silent) {
          const message = response.message ?? response.error ?? "未检测到 QQ 音乐登录状态";
          const diagnostics = response.diagnostics;
          const diagnosticDetail = diagnostics
            ? `读取到 ${diagnostics.cookieCount} 个 QQ Cookie 字段（页面 ${diagnostics.pageCookieCount} 个）：${diagnostics.cookieNames.join(", ") || "无"}`
            : message;
          setError(message);
          appendLog("info", "QQ 音乐登录状态未更新", diagnosticDetail);
        }
        return;
      }

      if (options.silent && response.cookie === lastSyncedBridgeCookieRef.current) {
        await loadQqLoginStatus();
        return;
      }

      await persistQqCookie(response.cookie, "bridge");
      lastSyncedBridgeCookieRef.current = response.cookie;

      if (!options.silent) {
        appendLog(
          response.status.playbackKeyReady ? "success" : "info",
          "QQ 音乐登录状态已刷新",
          response.status.playbackKeyReady ? "播放票据已同步" : "账号已登录，播放票据尚未生成"
        );
      }
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "Redio Bridge 同步失败。";

      if (!options.silent) {
        setError(errorMessage);
        appendLog("error", "Redio Bridge 同步失败", errorMessage);
      }
    } finally {
      if (!options.silent) {
        setIsQqSaving(false);
      }
    }
  }

  async function openQqDesktopLogin() {
    if (!window.redioDesktop?.openQQMusicLogin) {
      setError("当前不是桌面客户端，暂时只能手动粘贴 QQ Cookie。");
      return;
    }

    setIsQqWebLoginBusy(true);
    setError(null);

    try {
      appendLog("info", "打开 QQ 音乐官方登录窗口", "请在弹窗中扫码登录");
      const result = await window.redioDesktop.openQQMusicLogin();

      if (!result.ok) {
        throw new Error(result.message ?? result.error ?? "QQ 音乐登录未完成");
      }

      await persistQqCookie(result.cookie, "desktop");

      if (result.partial) {
        setError("QQ 账号已同步，但播放授权不完整，部分歌曲仍可能不可播。");
      }
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "QQ 音乐网页登录失败。";

      setError(errorMessage);
      appendLog("error", "QQ 音乐网页登录失败", errorMessage);
    } finally {
      setIsQqWebLoginBusy(false);
    }
  }

  async function clearQqCookie() {
    setIsQqSaving(true);

    try {
      if (window.redioDesktop?.clearQQMusicLogin) {
        await window.redioDesktop.clearQQMusicLogin();
      }

      const status = await fetchJson<QqLoginStatus>("/api/qq/logout", {
        method: "POST"
      });

      setQqLoginStatus(status);
      resetAuthenticatedData();
      setHasEnteredRadio(false);
      setAppView("radio");
      setIsChatOpen(false);
      lastSyncedBridgeCookieRef.current = "";
      resolvingTrackKeysRef.current.clear();
      setResolvedTrackOverrides({});
      appendLog("info", "QQ 音乐已退出登录");
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "QQ 音乐退出登录失败。";

      setError(errorMessage);
      appendLog("error", "QQ 音乐退出登录失败", errorMessage);
    } finally {
      setIsQqSaving(false);
    }
  }

  async function startSongPlayback() {
    const audio = audioRef.current;

    if (!audio) {
      const errorMessage = "歌曲播放器还没有准备好。";

      setError(errorMessage);
      showPlaybackToast(`播放失败：${errorMessage}`);
      return false;
    }

    if (!isTrackPlayable(selectedTrack)) {
      stopPlaybackForUnavailableTrack();
      const errorMessage = showTrackPlaybackFailure(
        selectedTrack,
        "这首歌暂时没有可播放 QQ 音源。"
      );

      appendLog(
        "error",
        "歌曲无法播放",
        `${selectedTrack.title} / ${selectedTrack.artist} · ${errorMessage}`
      );
      return false;
    }

    try {
      await audio.play();
      clearPlaybackToast();
      const playbackWarning = getTrackPlaybackWarning(selectedTrack);

      setError(playbackWarning);
      appendLog(
        playbackWarning ? "info" : "success",
        playbackWarning ? "歌曲开始播放，歌源待验证" : "歌曲开始播放",
        `${selectedTrack.title} / ${selectedTrack.artist} · ${getPlaybackStatusLabel(selectedTrack)}`
      );
      return true;
    } catch (playbackError) {
      const errorMessage = getPlaybackErrorMessage(playbackError);

      setError(errorMessage);
      showPlaybackToast(`《${selectedTrack.title}》播放失败：${errorMessage}`);
      appendLog("error", "歌曲自动播放失败", errorMessage);
      return false;
    }
  }

  function unlockBrowserAudioPlayback() {
    if (browserAudioUnlockedRef.current) {
      return;
    }

    const unlockAudio =
      audioUnlockElementRef.current ?? new Audio(getPublicAssetUrl("/audio/local-focus.wav"));

    audioUnlockElementRef.current = unlockAudio;
    unlockAudio.muted = true;
    unlockAudio.volume = 0;
    unlockAudio.preload = "auto";

    void unlockAudio
      .play()
      .then(() => {
        unlockAudio.pause();
        unlockAudio.currentTime = 0;
        browserAudioUnlockedRef.current = true;
        appendLog("success", "浏览器音频已解锁", "后续电台节目可以自动续播");
      })
      .catch(() => {
        appendLog("info", "浏览器音频等待解锁", "首次播放可能仍需手动点击播放");
      });
  }

  function handleDjPlaybackEnded() {
    handleDjPlaybackStopped();
  }

  function requestTrackPlayback(djIntro?: string) {
    pendingQueueAutoplayRef.current = true;
    pendingDjIntroRef.current = djIntro?.trim() || null;
    setPlaybackRequestId((requestId) => requestId + 1);
  }

  function stopPlaybackForUnavailableTrack() {
    pendingQueueAutoplayRef.current = false;
    pendingDjIntroRef.current = null;

    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    djSpeechRequestIdRef.current += 1;

    const djAudio = djAudioRef.current;

    if (djAudio) {
      djAudio.pause();
      djAudio.currentTime = 0;
    }

    setIsPlaying(false);
    setIsSpeaking(false);
    setActiveDjText(null);
    setCurrentTime(0);
    setDuration(0);
    setSongDucking(false);
  }

  function rampSongVolume(targetVolume: number, durationMs = 450) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const songAudio = audio;

    if (songVolumeAnimationRef.current !== null) {
      window.cancelAnimationFrame(songVolumeAnimationRef.current);
    }

    const startVolume = songAudio.volume;
    const startTime = window.performance.now();

    function animateVolume(now: number) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      songAudio.volume = clampVolume(
        startVolume + (targetVolume - startVolume) * easedProgress
      );

      if (progress < 1) {
        songVolumeAnimationRef.current = window.requestAnimationFrame(animateVolume);
      } else {
        songVolumeAnimationRef.current = null;
      }
    }

    songVolumeAnimationRef.current = window.requestAnimationFrame(animateVolume);
  }

  function setSongDucking(isDucked: boolean) {
    rampSongVolume(isDucked ? getDuckedSongVolume(volume) : volume);
  }

  function handleDjPlaybackStarted() {
    setIsSpeaking(true);
    setSongDucking(true);
  }

  function handleDjPlaybackStopped() {
    setIsSpeaking(false);
    setActiveDjText(null);
    setSongDucking(false);
  }

  function toPlayableTrack(
    track: DjPlan["play"][number] | QueueTrack
  ): PlayableTrack | null {
    if (!track.title || !track.artist) {
      return null;
    }

    const queueTrack = "id" in track ? track : null;

    return {
      title: track.title,
      artist: track.artist,
      audioLabel: track.audioLabel ?? "本地测试音频",
      audioUrl: track.audioUrl ?? "",
      source: track.source ?? "local",
      queueId: queueTrack?.id,
      queuedAt: queueTrack?.queuedAt,
      episode: queueTrack?.episode,
      djIntro: track.intro,
      matchedTitle: track.matchedTitle,
      matchedArtist: track.matchedArtist,
      externalUrl: track.externalUrl,
      coverUrl: track.coverUrl,
      playbackStatus: track.playbackStatus,
      isFallback: track.isFallback,
      failureReason: track.failureReason
    };
  }

  function readRecommendedTracks() {
    const sourceTracks = queueTracks.length > 0 ? queueTracks : plan?.play ?? [];

    return sourceTracks.flatMap((sourceTrack) => {
      const track = toPlayableTrack(sourceTrack);

      if (!track) {
        return [];
      }

      const resolvedTrack = resolvedTrackOverrides[getPlayableTrackKey(track)];

      return [
        resolvedTrack
          ? {
              ...track,
              ...resolvedTrack,
              djIntro: track.djIntro
            }
          : track
      ];
    });
  }

  async function playDjCopy(text: string | undefined) {
    if (!text?.trim()) {
      setError("当前还没有可播报的 DJ 文案。");
      return false;
    }

    const audio = djAudioRef.current;
    const requestId = djSpeechRequestIdRef.current + 1;

    djSpeechRequestIdRef.current = requestId;

    if (!audio) {
      setError("DJ 播报播放器还没有准备好。");
      return false;
    }

    try {
      appendLog("info", "请求 TTS 播报", text.slice(0, 80));
      const tts = await fetchJson<TtsResponse>("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text
        })
      });

      if (requestId !== djSpeechRequestIdRef.current) {
        return false;
      }

      audio.pause();
      audio.src = tts.audioUrl;
      audio.currentTime = 0;
      audio.volume = volume;
      setActiveDjText(text.trim());
      await audio.play();
      setError(null);
      appendLog("success", "DJ 文案开始播报", tts.provider);
      return true;
    } catch (requestError) {
      setIsSpeaking(false);
      setActiveDjText(null);
      const errorMessage =
        requestError instanceof Error ? requestError.message : "DJ 文案播报失败。";

      setError(errorMessage);
      appendLog("error", "DJ 文案播报失败", errorMessage);
      return false;
    }
  }

  function toggleDjSpeech() {
    const audio = djAudioRef.current;

    if (isSpeaking && audio) {
      djSpeechRequestIdRef.current += 1;
      audio.pause();
      audio.currentTime = 0;
      setIsSpeaking(false);
      return;
    }

    void playDjCopy(selectedTrack.djIntro ?? plan?.say);
  }

  async function generateSegment(message = draftMessage) {
    if (planningRequestInFlightRef.current) {
      return;
    }

    const trimmedMessage = message.trim();
    const userMessage = trimmedMessage || "生成下一段节目";
    const initialPlanningCopy = getPlanningCopy(userMessage);
    const planningStageTimers: number[] = [];

    unlockBrowserAudioPlayback();
    planningRequestInFlightRef.current = true;
    setPlanningCopy(initialPlanningCopy);

    if (initialPlanningCopy.mode === "music") {
      planningStageTimers.push(
        window.setTimeout(() => {
          setPlanningCopy({
            input: "正在挑歌...",
            bubble: "正在挑选适合你的歌",
            mode: "music"
          });
        }, 900),
        window.setTimeout(() => {
          setPlanningCopy({
            input: "正在确认音源...",
            bubble: "正在确认可播放音源",
            mode: "music"
          });
        }, 3200)
      );
    }

    setIsPlanning(true);
    setIsChatOpen(true);
    setError(null);
    setDraftMessage("");
    appendLog("info", "提交节目生成请求", userMessage);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: createMessageId(),
        role: "user",
        text: userMessage,
        createdAt: new Date().toISOString()
      }
    ]);

    try {
      const response = await fetchJson<PlanResponse>("/api/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userMessage
        })
      });

      if (response.mode === "chat") {
        appendLog("success", "Redio 已回复", "普通聊天，不触发播放");
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createMessageId(),
            role: "assistant",
            text: response.message,
            createdAt: new Date().toISOString(),
            shouldAnimate: true
          }
        ]);
        return;
      }

      const state = response.state;

      setNowPlaying(state);
      void loadHistory();
      const refreshedQueue = await loadQueue();
      const firstTrack = state.currentPlan?.play[0];
      const firstVerifiedPlanIndex = state.currentPlan?.play.findIndex(
        (track) => track.playbackStatus === "full" && !track.isFallback
      ) ?? -1;
      const firstVerifiedTrack =
        firstVerifiedPlanIndex >= 0
          ? state.currentPlan?.play[firstVerifiedPlanIndex]
          : undefined;
      const firstDjIntro = firstVerifiedTrack?.intro ?? state.currentPlan?.say;
      const hasDjCopy = Boolean(firstDjIntro?.trim());

      if (firstVerifiedTrack) {
        let matchingQueueIndex = -1;

        for (let index = refreshedQueue.length - 1; index >= 0; index -= 1) {
          const queueTrack = refreshedQueue[index];

          if (
            queueTrack.episode === state.currentPlan?.episode &&
            getPlayableTrackKey(queueTrack) === getPlayableTrackKey(firstVerifiedTrack)
          ) {
            matchingQueueIndex = index;
            break;
          }
        }

        const matchingQueueTrack =
          matchingQueueIndex >= 0
            ? toPlayableTrack(refreshedQueue[matchingQueueIndex])
            : null;

        if (matchingQueueTrack) {
          setSelectedTrackId(
            getPlayableTrackIdentity(matchingQueueTrack, matchingQueueIndex)
          );
        }

        requestTrackPlayback(hasDjCopy ? firstDjIntro : undefined);
      }

      if (firstTrack) {
        const firstPlayableTrack = toPlayableTrack(firstTrack);
        const playbackWarning = firstPlayableTrack
          ? getTrackPlaybackWarning(firstPlayableTrack)
          : "这首歌暂时没有可播放音源。";

        if (playbackWarning) {
          setError(playbackWarning);
          appendLog("error", "歌源未确认完整", playbackWarning);
        }
      }

      appendLog(
        firstTrack?.playbackStatus === "full" ? "success" : "info",
        firstTrack?.playbackStatus === "full" ? "推荐生成成功" : "推荐已生成，歌源待验证",
        firstTrack
          ? `${firstTrack.title} / ${firstTrack.artist} · ${getPlaybackStatusLabel(firstTrack)}`
          : "未返回歌曲"
      );
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: "assistant",
          text: state.currentPlan?.say ?? "已生成新的电台段落。",
          createdAt: new Date().toISOString(),
          plan: state.currentPlan ?? undefined,
          shouldAnimate: true
        }
      ]);
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error
          ? requestError.message
          : "无法生成节目段落。";

      setError(errorMessage);
      appendLog("error", "节目生成失败", errorMessage);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId(),
          role: "assistant",
          text: errorMessage,
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      planningStageTimers.forEach((timer) => window.clearTimeout(timer));
      planningRequestInFlightRef.current = false;
      setIsPlanning(false);
    }
  }

  useEffect(() => {
    const shouldRefreshBridgeLogin =
      isLoginModalOpen || (appView === "settings" && isQqSourceOpen);

    if (
      !shouldRefreshBridgeLogin ||
      !redioBridgeStatus.connected ||
      isRedioBridgeOutdated(redioBridgeStatus.version)
    ) {
      return;
    }

    let disposed = false;

    const refreshLoginStatus = () => {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        bridgeAutoRefreshInFlightRef.current
      ) {
        return;
      }

      bridgeAutoRefreshInFlightRef.current = true;
      void syncQqCookieFromBridge({ silent: true }).finally(() => {
        bridgeAutoRefreshInFlightRef.current = false;
      });
    };

    window.addEventListener("focus", refreshLoginStatus);
    document.addEventListener("visibilitychange", refreshLoginStatus);
    refreshLoginStatus();

    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshLoginStatus);
      document.removeEventListener("visibilitychange", refreshLoginStatus);
    };
  }, [
    appView,
    isLoginModalOpen,
    isQqSourceOpen,
    redioBridgeStatus.connected,
    redioBridgeStatus.version
  ]);

  useEffect(() => {
    Promise.all([
      loadQqLoginStatus(),
      loadWeather().catch((requestError) => {
        const errorMessage =
          requestError instanceof Error ? requestError.message : "天气读取失败。";

        appendLog("error", "天气读取失败", errorMessage);
        return null;
      })
    ])
      .then(async ([status]) => {
        if (!status.loggedIn) {
          resetAuthenticatedData();
          return;
        }

        await loadAuthenticatedData();
        appendLog(
          "success",
          "账号数据读取完成",
          "/api/now + /api/history + /api/queue + /api/chat"
        );
      })
      .catch((requestError) => {
        const errorMessage =
          requestError instanceof Error
            ? requestError.message
            : "无法读取当前电台状态。";

        setError(errorMessage);
        appendLog("error", "基础数据读取失败", errorMessage);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      djAudioRef.current?.pause();
      if (songVolumeAnimationRef.current !== null) {
        window.cancelAnimationFrame(songVolumeAnimationRef.current);
      }
    };
  }, []);

  const plan = nowPlaying?.currentPlan;
  const recommendedTracks = readRecommendedTracks();
  const tracks = recommendedTracks.length > 0 ? recommendedTracks : fallbackTracks;
  const selectedTrackIndexById = selectedTrackId
    ? tracks.findIndex(
        (track, index) => getPlayableTrackIdentity(track, index) === selectedTrackId
      )
    : -1;
  const firstVerifiedTrackIndex = tracks.findIndex(isVerifiedFullTrack);
  const firstAttemptableTrackIndex = findFirstAttemptableTrackIndex(tracks);
  const selectedTrackIndex =
    selectedTrackIndexById >= 0
      ? selectedTrackIndexById
      : firstVerifiedTrackIndex >= 0
        ? firstVerifiedTrackIndex
        : firstAttemptableTrackIndex >= 0
          ? firstAttemptableTrackIndex
        : 0;
  const selectedTrack = tracks[selectedTrackIndex] ?? fallbackTracks[0];
  const selectedTrackKey = getPlayableTrackKey(selectedTrack);
  const currentCaption =
    activeLyrics?.trackKey === selectedTrackKey
      ? getCurrentLyricText(activeLyrics.lines, currentTime) ?? selectedTrack.artist
      : selectedTrack.artist;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const listenerName = qqLoginStatus?.nickname ?? qqLoginStatus?.userId ?? "你";
  const listenerCount = qqLoginStatus?.loggedIn ? 1 : 0;
  const agentGenreTags = [
    "JAZZ-HIPHOP",
    "NEO-CLASSICAL",
    "90S华语",
    "HIP-HOP",
    "柴可夫斯基&EMINEM",
    "J-ROCK",
    "下雨白噪音",
    "POST-PUNK",
    "SHIBUYA-KEI"
  ];

  useEffect(() => {
    selectedTrackKeyRef.current = selectedTrackKey;
  }, [selectedTrackKey]);

  useEffect(() => {
    let isCancelled = false;

    if (selectedTrack.source !== "qq" || duration <= 0) {
      setActiveLyrics(null);
      return;
    }

    const cachedLines = lyricsCacheRef.current.get(selectedTrackKey);

    if (cachedLines) {
      setActiveLyrics({ trackKey: selectedTrackKey, lines: cachedLines });
      return;
    }

    setActiveLyrics(null);

    const params = new URLSearchParams({
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      duration: String(duration)
    });
    const songMid = getQqSongMid(selectedTrack.externalUrl);

    if (songMid) {
      params.set("songMid", songMid);
    }

    void fetchJson<LyricsResponse>(`/api/lyrics?${params.toString()}`)
      .then((response) => {
        if (isCancelled) {
          return;
        }

        lyricsCacheRef.current.set(selectedTrackKey, response.lines);
        setActiveLyrics({ trackKey: selectedTrackKey, lines: response.lines });
      })
      .catch((requestError) => {
        if (!isCancelled) {
          appendLog(
            "info",
            "歌词加载失败",
            requestError instanceof Error ? requestError.message : "未取得歌词"
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    duration,
    selectedTrack.artist,
    selectedTrack.externalUrl,
    selectedTrack.source,
    selectedTrack.title,
    selectedTrackKey
  ]);

  useEffect(() => {
    if (isTrackPlayable(selectedTrack)) {
      return;
    }

    stopPlaybackForUnavailableTrack();
    showTrackPlaybackFailure(selectedTrack, "这首歌暂时没有可播放音源。");
  }, [
    selectedTrack.audioUrl,
    selectedTrack.failureReason,
    selectedTrack.playbackStatus,
    selectedTrackKey
  ]);

  useEffect(() => {
    const selectedTrackStillExists = tracks.some(
      (track, index) => getPlayableTrackIdentity(track, index) === selectedTrackId
    );

    if (selectedTrackStillExists) {
      return;
    }

    const currentEpisode = plan?.episode;
    let nextSelectedIndex = queueTracks.findIndex((track) => {
      const playableTrack = toPlayableTrack(track);

      return (
        track.episode === currentEpisode &&
        playableTrack !== null &&
        isTrackPlayable(playableTrack)
      );
    });

    if (nextSelectedIndex < 0) {
      nextSelectedIndex = queueTracks.findIndex((track) => {
        const playableTrack = toPlayableTrack(track);

        return playableTrack !== null && isTrackPlayable(playableTrack);
      });
    }

    const nextSelectedTrack =
      nextSelectedIndex >= 0 ? toPlayableTrack(queueTracks[nextSelectedIndex]) : null;

    if (nextSelectedTrack) {
      setSelectedTrackId(getPlayableTrackIdentity(nextSelectedTrack, nextSelectedIndex));
    }
  }, [plan, queueTracks, selectedTrackId]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);

    if (pendingQueueAutoplayRef.current && !isVerifiedFullTrack(selectedTrack)) {
      pendingQueueAutoplayRef.current = false;
      pendingDjIntroRef.current = null;
      return;
    }

    if (isPlaying || pendingQueueAutoplayRef.current) {
      const pendingDjIntro = pendingDjIntroRef.current;

      pendingQueueAutoplayRef.current = false;
      pendingDjIntroRef.current = null;
      void startSongPlayback().then((didStartPlayback) => {
        if (!didStartPlayback) {
          setIsPlaying(false);
        }

        if (pendingDjIntro) {
          void playDjCopy(pendingDjIntro);
        }
      });
    }
  }, [selectedTrack.audioUrl, playbackRequestId]);

  useEffect(() => {
    if (!shouldRefreshProviderTrack(selectedTrack)) {
      return;
    }

    const trackKey = selectedTrackKey;

    if (resolvingTrackKeysRef.current.has(trackKey)) {
      return;
    }

    resolvingTrackKeysRef.current.add(trackKey);

    void fetchJson<ResolveTrackResponse>("/api/resolve-track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: selectedTrack.title,
        artist: selectedTrack.artist
      })
    })
      .then((resolvedTrack) => {
        setResolvedTrackOverrides((currentOverrides) => ({
          ...currentOverrides,
          [trackKey]: resolvedTrack
        }));

        if (selectedTrackKeyRef.current !== trackKey) {
          return;
        }

        const playbackWarning = getTrackPlaybackWarning(resolvedTrack);
        const audio = audioRef.current;
        const resolvedAudioUrl = resolvedTrack.audioUrl
          ? new URL(getPlaybackAudioUrl(resolvedTrack), window.location.href).href
          : "";
        const wasPlaying = !!audio && !audio.paused;

        setError(playbackWarning);

        if (audio && resolvedTrack.playbackStatus === "full" && audio.src !== resolvedAudioUrl) {
          audio.src = getPlaybackAudioUrl(resolvedTrack);
          audio.load();
          appendLog(
            "success",
            "QQ 音源已刷新",
            `${resolvedTrack.title} / ${resolvedTrack.artist} · ${getPlaybackStatusLabel(resolvedTrack)}`
          );

          if (wasPlaying || pendingQueueAutoplayRef.current) {
            void audio.play().catch(() => {
              setError("QQ 音源已刷新，请手动点击播放。");
            });
          }
        }
      })
      .catch((requestError) => {
        const errorMessage =
          requestError instanceof Error ? requestError.message : "音源刷新失败。";

        appendLog("error", "音源刷新失败", errorMessage);
      })
      .finally(() => {
        resolvingTrackKeysRef.current.delete(trackKey);
      });
  }, [
    qqLoginStatus?.playbackKeyReady,
    selectedTrack.artist,
    selectedTrack.failureReason,
    selectedTrack.isFallback,
    selectedTrack.playbackStatus,
    selectedTrack.source,
    selectedTrack.title,
    selectedTrackKey
  ]);

  useEffect(() => {
    rampSongVolume(isSpeaking ? getDuckedSongVolume(volume) : volume);

    if (djAudioRef.current) {
      djAudioRef.current.volume = volume;
    }
  }, [volume, isSpeaking]);

  function changeVolume(value: number) {
    const nextVolume = clampVolume(value);

    if (nextVolume > 0) {
      lastAudibleVolumeRef.current = nextVolume;
    }

    setVolume(nextVolume);
  }

  function toggleMute() {
    setVolume((currentVolume) => {
      if (currentVolume > 0) {
        lastAudibleVolumeRef.current = currentVolume;
        return 0;
      }

      return lastAudibleVolumeRef.current || 0.5;
    });
  }

  function selectTrack(index: number) {
    const track = tracks[index];

    if (!track) {
      return;
    }

    if (!isTrackPlayable(track)) {
      stopPlaybackForUnavailableTrack();
      showTrackPlaybackFailure(track, "这首歌暂时没有可播放 QQ 音源。");
    } else {
      clearPlaybackToast();
    }

    setSelectedTrackId(getPlayableTrackIdentity(track, index));
  }

  function playTrackAt(index: number, shouldStartPlayback = true) {
    const track = tracks[index];

    if (!track) {
      return;
    }

    setSelectedTrackId(getPlayableTrackIdentity(track, index));

    if (!isTrackPlayable(track)) {
      stopPlaybackForUnavailableTrack();
      showTrackPlaybackFailure(track, "正在重新解析这首歌的 QQ 音源。");
      return;
    }

    const playbackWarning = getTrackPlaybackWarning(track);

    if (playbackWarning) {
      setError(playbackWarning);
      showPlaybackToast(playbackWarning);
    } else {
      clearPlaybackToast();
    }

    if (shouldStartPlayback && isVerifiedFullTrack(track)) {
      unlockBrowserAudioPlayback();
      requestTrackPlayback(track.djIntro);
    }
  }

  async function recordTrackFeedback(action: TrackFeedbackAction, track = selectedTrack) {
    try {
      const entries = await fetchJson<TrackFeedbackEntry[]>("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          title: track.title,
          artist: track.artist,
          source: track.source,
          audioLabel: track.audioLabel
        })
      });

      setFeedbackEntries(entries);
      appendLog("success", "偏好已记录", `${action}: ${track.title} / ${track.artist}`);
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "偏好记录失败。";

      setError(errorMessage);
      appendLog("error", "偏好记录失败", errorMessage);
    }
  }

  function isTrackFeedbackActive(action: TrackFeedbackAction, track = selectedTrack) {
    const trackKey = getPlayableTrackKey(track);

    return feedbackEntries.some(
      (entry) => entry.action === action && getPlayableTrackKey(entry) === trackKey
    );
  }

  function playPreviousTrack() {
    const previousTrackIndex = selectedTrackIndex - 1;

    if (previousTrackIndex >= 0) {
      playTrackAt(previousTrackIndex);
    }
  }

  function playNextTrack() {
    const nextTrackIndex = selectedTrackIndex + 1;

    if (nextTrackIndex < tracks.length) {
      playTrackAt(nextTrackIndex);
    }
  }

  function skipCurrentTrack() {
    void recordTrackFeedback("skip");

    if (tracks.length > 1) {
      pendingQueueAutoplayRef.current = isPlaying;
      playNextTrack();
      return;
    }

    audioRef.current?.pause();
  }

  function replayCurrentTrack() {
    void recordTrackFeedback("replay");

    const audio = audioRef.current;

    if (audio) {
      audio.currentTime = 0;
    }

    void startSongPlayback();
  }

  function handleSongEnded() {
    const nextTrackIndex = findNextVerifiedTrackIndex(tracks, selectedTrackIndex);

    if (nextTrackIndex === -1) {
      setIsPlaying(false);
      return;
    }

    const nextTrack = tracks[nextTrackIndex];

    setSelectedTrackId(getPlayableTrackIdentity(nextTrack, nextTrackIndex));
    requestTrackPlayback(nextTrack?.djIntro);
  }

  async function retrySelectedTrackAfterPlaybackError(errorMessage: string) {
    const trackKey = selectedTrackKey;

    if (
      playbackErrorRetryKeysRef.current.has(trackKey) ||
      resolvingTrackKeysRef.current.has(trackKey) ||
      selectedTrack.source !== "qq"
    ) {
      return false;
    }

    playbackErrorRetryKeysRef.current.add(trackKey);
    resolvingTrackKeysRef.current.add(trackKey);
    appendLog(
      "info",
      "歌曲播放失败，重新解析音源",
      `${selectedTrack.title} / ${selectedTrack.artist} · ${errorMessage}`
    );

    try {
      const resolvedTrack = await fetchJson<ResolveTrackResponse>("/api/resolve-track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: selectedTrack.title,
          artist: selectedTrack.artist
        })
      });

      setResolvedTrackOverrides((currentOverrides) => ({
        ...currentOverrides,
        [trackKey]: resolvedTrack
      }));

      if (
        selectedTrackKeyRef.current !== trackKey ||
        resolvedTrack.playbackStatus !== "full" ||
        !resolvedTrack.audioUrl
      ) {
        return false;
      }

      const audio = audioRef.current;

      if (!audio) {
        return false;
      }

      audio.src = getPlaybackAudioUrl(resolvedTrack);
      audio.load();
      appendLog(
        "success",
        "QQ 音源已重新解析",
        `${resolvedTrack.title} / ${resolvedTrack.artist} · ${getPlaybackStatusLabel(resolvedTrack)}`
      );
      requestTrackPlayback();
      return true;
    } catch (requestError) {
      const retryError =
        requestError instanceof Error ? requestError.message : "音源重新解析失败。";

      appendLog("error", "音源重新解析失败", retryError);
      return false;
    } finally {
      resolvingTrackKeysRef.current.delete(trackKey);
    }
  }

  function handleSongError(event: SyntheticEvent<HTMLAudioElement>) {
    const mediaErrorCode = event.currentTarget.error?.code ?? null;

    if (
      mediaErrorCode === null &&
      selectedTrack.playbackStatus === "full" &&
      !selectedTrack.isFallback
    ) {
      setError(null);
      return;
    }

    const errorMessage =
      selectedTrack.isFallback || selectedTrack.playbackStatus === "fallback"
        ? "本地测试音频也无法播放，请检查音频文件或刷新页面。"
        : "当前推荐音源加载失败，请手动点击播放重试。";

    showTrackPlaybackFailure(selectedTrack, errorMessage);
    setIsPlaying(false);
    appendLog(
      "error",
      "歌曲播放失败",
      `${selectedTrack.title} / ${selectedTrack.artist} · ${errorMessage}`
    );

    void retrySelectedTrackAfterPlaybackError(errorMessage).then((didRetry) => {
      if (didRetry) {
        return;
      }

      const nextTrackIndex = findNextVerifiedTrackIndex(tracks, selectedTrackIndex);

      if (nextTrackIndex !== -1) {
        const nextTrack = tracks[nextTrackIndex];

        setSelectedTrackId(getPlayableTrackIdentity(nextTrack, nextTrackIndex));
        requestTrackPlayback(nextTrack?.djIntro);
      }
    });
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    unlockBrowserAudioPlayback();

    try {
      const didStartPlayback = await startSongPlayback();

      if (!didStartPlayback) {
        setIsPlaying(false);
      }
    } catch {
      const errorMessage = "当前歌曲无法播放，请换一首或重新解析 QQ 音源。";

      setError(errorMessage);
      showPlaybackToast(`《${selectedTrack.title}》播放失败：${errorMessage}`);
    }
  }

  function seekPlayback(value: number) {
    if (!audioRef.current || duration <= 0) {
      return;
    }

    const nextTime = Math.min(Math.max(value, 0), duration);

    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const sharedAudioPlayers = (
    <>
      <audio
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={handleSongEnded}
        onError={handleSongError}
        onCanPlay={() => {
          if (selectedTrack.playbackStatus === "full" && !selectedTrack.isFallback) {
            setError(null);
          }
        }}
        onLoadStart={() => {
          if (selectedTrack.playbackStatus === "full" && !selectedTrack.isFallback) {
            setError(null);
          }
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        preload="metadata"
        ref={audioRef}
        src={getPlaybackAudioUrl(selectedTrack)}
      />
      <audio
        onEnded={handleDjPlaybackEnded}
        onPause={handleDjPlaybackStopped}
        onPlay={handleDjPlaybackStarted}
        preload="auto"
        ref={djAudioRef}
      />
    </>
  );

  const chatWindow = isChatOpen ? (
    <ChatWindow
      error={error}
      isLoading={isLoading}
      isLandingChat={!hasEnteredRadio}
      isPlanning={isPlanning}
      message={draftMessage}
      messages={messages}
      onClose={() => setIsChatOpen(false)}
      onOpenAgentProfile={() => {
        setHasEnteredRadio(true);
        setIsChatOpen(false);
        setAppView("agent");
      }}
      onMessageChange={setDraftMessage}
      onMessageAnimationComplete={(messageId) => {
        setMessages((currentMessages) =>
          currentMessages.map((chatMessage) =>
            chatMessage.id === messageId
              ? {
                  ...chatMessage,
                  shouldAnimate: false
                }
              : chatMessage
          )
        );
      }}
      onSend={generateSegment}
      plan={plan}
      planningInputText={planningCopy.input}
      planningText={planningCopy.bubble}
    />
  ) : null;
  const loginModal = isLoginModalOpen ? (
    <LoginModal
      bridgeStatus={redioBridgeStatus}
      cookieDraft={qqCookieDraft}
      error={error}
      isLoginBusy={isQqWebLoginBusy}
      isManualCookieOpen={isManualCookieOpen}
      isSaving={isQqSaving}
      onClose={closeLoginModal}
      onCookieChange={setQqCookieDraft}
      onDetectBridge={() => void detectRedioBridge()}
      onOpenQqLogin={() => void openQqLoginFromModal()}
      onRefresh={() => void syncQqCookieFromBridge()}
      onSaveCookie={() => void saveQqCookie()}
      onToggleManualCookie={() => setIsManualCookieOpen((isOpen) => !isOpen)}
    />
  ) : null;
  const settingsSections = (
    <>
      <HistorySection
        entries={historyEntries}
        isOpen={isHistoryOpen}
        onToggle={() => setIsHistoryOpen((isOpen) => !isOpen)}
      />

      <QqSourceSection
        bridgeStatus={redioBridgeStatus}
        cookieDraft={qqCookieDraft}
        isOpen={isQqSourceOpen}
        isSaving={isQqSaving}
        onClear={() => void clearQqCookie()}
        onCookieChange={setQqCookieDraft}
        onDetectBridge={() => void detectRedioBridge()}
        onDesktopLogin={() => void openQqDesktopLogin()}
        onBridgeLogin={() => void openQqBridgeLogin()}
        onSave={() => void saveQqCookie()}
        onSyncBridge={() => void syncQqCookieFromBridge()}
        onToggle={() => setIsQqSourceOpen((isOpen) => !isOpen)}
        isDesktop={Boolean(window.redioDesktop?.isDesktop)}
        isWebLoginBusy={isQqWebLoginBusy}
        status={qqLoginStatus}
      />

      <LogSection
        entries={logs}
        isOpen={isLogOpen}
        onToggle={() => setIsLogOpen((isOpen) => !isOpen)}
      />
    </>
  );
  const enterRadioView = (view: AppView) => {
    setAppView(view);
    setHasEnteredRadio(true);
    setIsChatOpen(false);
  };

  if (!hasEnteredRadio) {
    return (
      <>
        {qqLoginStatus?.loggedIn ? sharedAudioPlayers : null}
        {playbackToast ? (
          <p aria-live="assertive" className="playbackToast" role="alert">
            {playbackToast}
          </p>
        ) : null}
        {isSpeaking && activeDjText ? <DjSpeechBubble text={activeDjText} /> : null}
        <LandingPage
          chatWindow={chatWindow}
          error={playbackToast ? null : error}
          hasPlaybackToast={Boolean(playbackToast)}
          isLoginBusy={isQqWebLoginBusy}
          onEnter={enterRadioView}
          onLogin={openLoginModal}
          onLogout={() => void clearQqCookie()}
          onOpenChat={() => setIsChatOpen(true)}
          player={{
            currentCaption,
            currentTime,
            duration,
            isLiked: isTrackFeedbackActive("like"),
            isPlaying,
            onLike: () => void recordTrackFeedback("like"),
            onNext: playNextTrack,
            onPrevious: playPreviousTrack,
            onSeek: seekPlayback,
            onSelectTrack: (index) => playTrackAt(index),
            onToggleMute: toggleMute,
            onTogglePlayback: () => void togglePlayback(),
            onVolumeChange: changeVolume,
            selectedTrack,
            selectedTrackIndex,
            tracks,
            volume
          }}
          settingsContent={settingsSections}
          status={qqLoginStatus}
        />
        {loginModal}
      </>
    );
  }

  return (
    <>
      <main className="pageShell">
        <section className="radioFrame">
        {qqLoginStatus?.loggedIn ? sharedAudioPlayers : null}

        <header className={`radioTop ${appView === "agent" ? "agentTop" : ""}`}>
          {appView === "agent" ? (
            <button
              aria-label="返回电台"
              className="agentBackButton"
              onClick={() => setAppView("radio")}
              type="button"
            >
              <BackIcon />
            </button>
          ) : (
            <>
              <h1>Redio</h1>
              <button
                className="settingsTopButton"
                onClick={() => setAppView((view) => (view === "settings" ? "radio" : "settings"))}
                type="button"
              >
                {appView === "settings" ? "BACK" : "SETTING"}
              </button>
            </>
          )}
          <span>{formatClock()}</span>
        </header>

        {appView === "agent" ? (
          <AgentProfilePage
            genreTags={agentGenreTags}
            isLoginBusy={isQqWebLoginBusy}
            listenerCount={listenerCount}
            listenerName={listenerName}
            onLogin={openLoginModal}
            status={qqLoginStatus}
          />
        ) : appView === "settings" ? (
          <section className="settingsPage" aria-label="设置">
            <div className="settingsIntro">
              <p>SETTING</p>
              <span>播放记录、QQ 授权和运行状态都放在这里。</span>
            </div>

            <div className="settingsScrollArea">
              {settingsSections}
            </div>
          </section>
        ) : (
          <>
            <section className="environmentStrip" aria-label="环境信息">
              <span>{formatToday()}</span>
              <span>{weather ? formatWeatherLabel(weather) : "天气读取中"}</span>
            </section>

            {error ? <p className="statusNotice">{error}</p> : null}

            <section className="playerBlock" aria-label="当前播放">
              <section className="playerCard">
                <div className="timePanel">
                  <p className="bigTime">{formatClock()}</p>
                </div>
                <div className="songNow">
                  <StatisticsIcon />
                  <div className="songInfo">
                    <strong title={selectedTrack.title}>{selectedTrack.title}</strong>
                    <small title={selectedTrack.artist}>{selectedTrack.artist}</small>
                  </div>
                </div>
              </section>

              <section className="mediaControls" aria-label="播放控制">
                <div className="controlButtons">
                  <button aria-label="上一首" onClick={playPreviousTrack} type="button">
                    <PreviousIcon />
                  </button>
                  <button
                    aria-label={isPlaying ? "暂停" : "播放"}
                    onClick={togglePlayback}
                    type="button"
                  >
                    {isPlaying ? <PauseTransportIcon /> : <PlayTransportIcon />}
                  </button>
                  <button aria-label="下一首" onClick={playNextTrack} type="button">
                    <NextIcon />
                  </button>
                </div>
                <div className="progressRow">
                  <span>{formatPlaybackTime(currentTime)}</span>
                  <input
                    aria-label="播放进度"
                    className="progressTrack"
                    disabled={duration <= 0}
                    max={duration || 0}
                    min="0"
                    onInput={(event) => seekPlayback(Number(event.currentTarget.value))}
                    step="0.1"
                    style={
                      {
                        "--progress-percent": `${progressPercent}%`
                      } as CSSProperties
                    }
                    type="range"
                    value={duration > 0 ? currentTime : 0}
                  />
                  <span>{formatPlaybackTime(duration)}</span>
                  <div className="volumeControl">
                    <button
                      aria-expanded={isVolumeOpen}
                      aria-label="调整音量"
                      className="volumeButton"
                      onClick={() => setIsVolumeOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      <VolumeIcon />
                    </button>
                    {isVolumeOpen ? (
                      <div className="volumePopover">
                        <input
                          aria-label="音量"
                          max="1"
                          min="0"
                          onChange={(event) => changeVolume(Number(event.target.value))}
                          step="0.01"
                          type="range"
                          value={volume}
                        />
                        <strong>{Math.round(volume * 100)}%</strong>
                        <span className="volumePopoverIcon">
                          <VolumeIcon color="#555" />
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </section>

            <section className="queueSection">
              <div className="queueTitle">
                <span>QUEUE</span>
                <span>{tracks.length} TRACKS</span>
              </div>
              <div className="queueList">
                {tracks.map((track, index) => (
                  <button
                    className={`queueItem ${index === selectedTrackIndex ? "isSelected" : ""} ${
                      !isTrackPlayable(track) ? "isUnavailable" : ""
                    }`}
                    key={`${track.title}-${index}`}
                    onClick={() => selectTrack(index)}
                    type="button"
                  >
                    <span className="queueIndex">{index === selectedTrackIndex ? "" : index + 1}</span>
                    <strong>{track.title}</strong>
                    <em title={getPlaybackStatusLabel(track)}>{track.artist}</em>
                  </button>
                ))}
              </div>
            </section>

            {!isChatOpen ? (
              <AskDock
                disabled={isPlanning}
                isPlanning={isPlanning}
                message={draftMessage}
                planningInputText={planningCopy.input}
                onFocus={() => setIsChatOpen(true)}
                onMessageChange={setDraftMessage}
                onSend={generateSegment}
              />
            ) : null}

            {chatWindow}
          </>
        )}
        </section>
      </main>
      {loginModal}
    </>
  );
}

function LoginModal({
  bridgeStatus,
  cookieDraft,
  error,
  isLoginBusy,
  isManualCookieOpen,
  isSaving,
  onClose,
  onCookieChange,
  onDetectBridge,
  onOpenQqLogin,
  onRefresh,
  onSaveCookie,
  onToggleManualCookie
}: {
  bridgeStatus: RedioBridgeStatus;
  cookieDraft: string;
  error: string | null;
  isLoginBusy: boolean;
  isManualCookieOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onCookieChange: (value: string) => void;
  onDetectBridge: () => void;
  onOpenQqLogin: () => void;
  onRefresh: () => void;
  onSaveCookie: () => void;
  onToggleManualCookie: () => void;
}) {
  const bridgeReady =
    bridgeStatus.connected && !isRedioBridgeOutdated(bridgeStatus.version);

  return (
    <section
      aria-labelledby="login-modal-title"
      aria-modal="true"
      className="loginModalOverlay"
      data-node-id="164:2573"
      role="dialog"
    >
      <div className="loginModal" data-node-id="233:760">
        <button
          aria-label="关闭登录弹窗"
          className="loginModalClose"
          data-node-id="233:781"
          onClick={onClose}
          type="button"
        >
          <img alt="" aria-hidden="true" src={getPublicAssetUrl("/images/login-close.svg")} />
        </button>

        <div className="loginModalPrimary" data-node-id="233:761">
          <h2 data-node-id="233:762" id="login-modal-title">
            欢迎登录
          </h2>

          <div
            aria-label="登录平台"
            className="loginPlatformTabs"
            data-node-id="234:788"
            role="tablist"
          >
            <span aria-hidden="true" className="loginPlatformIndicator" />
            <button aria-selected="true" role="tab" type="button">
              QQ音乐
            </button>
            <button aria-selected="false" disabled role="tab" type="button">
              网易云
            </button>
            <button aria-selected="false" disabled role="tab" type="button">
              酷狗
            </button>
          </div>

          <div className="loginQqBlock" data-node-id="233:763">
            <button
              aria-busy={isLoginBusy}
              aria-label="打开 QQ 音乐登录页"
              className="loginQrPlaceholder"
              data-node-id="233:764"
              disabled={isLoginBusy}
              onClick={onOpenQqLogin}
              type="button"
            />
            <p className="loginQrCaption" data-node-id="233:773">
              <span>点击</span>
              <strong>
                <img alt="" aria-hidden="true" src={getPublicAssetUrl("/images/qq-music-icon.png")} />
                QQ音乐
              </strong>
              <span>{isLoginBusy ? "等待登录" : "扫码登录"}</span>
            </p>
          </div>
        </div>

        <div aria-hidden="true" className="loginModalDivider" data-node-id="239:822" />

        <div className="loginModalActions" data-node-id="239:798">
          <button
            className="loginBridgeCheck"
            disabled={bridgeStatus.checking}
            onClick={onDetectBridge}
            type="button"
          >
            <i className={bridgeReady ? "isReady" : ""} />
            <span>{bridgeStatus.checking ? "检测中" : "Bridge检测"}</span>
          </button>
          <button disabled={isSaving || !bridgeReady} onClick={onRefresh} type="button">
            {isSaving ? "刷新中" : "刷新登录状态"}
          </button>
          <button
            aria-expanded={isManualCookieOpen}
            onClick={onToggleManualCookie}
            type="button"
          >
            手动导入Cookie
          </button>
        </div>

        {isManualCookieOpen ? (
          <div className="loginManualCookiePanel">
            <label htmlFor="login-cookie-input">QQ 音乐 Cookie</label>
            <textarea
              id="login-cookie-input"
              onChange={(event) => onCookieChange(event.target.value)}
              placeholder="uin=...; qm_keyst=...; qqmusic_key=..."
              spellCheck={false}
              value={cookieDraft}
            />
            <div>
              <button disabled={isSaving || !cookieDraft.trim()} onClick={onSaveCookie} type="button">
                {isSaving ? "导入中" : "确认导入"}
              </button>
              <button onClick={onToggleManualCookie} type="button">
                取消
              </button>
            </div>
            {error ? (
              <p aria-live="polite" className="loginManualCookieError">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="loginBridgeNotice" data-node-id="239:813">
          网页版通过 Redio Bridge 打开 QQ 音乐官方页面并同步登录态。
          验证成功后，聊天、推荐、播放记录和反馈只归属于当前音乐账号。
          <a download href={getPublicAssetUrl("/downloads/redio-bridge.zip")}>
            点击安装
          </a>
        </p>
      </div>
    </section>
  );
}

const DJ_WAVE_EASE = [0.4, 0, 0.6, 1] as [number, number, number, number];
const DJ_WAVE_BARS = [
  {
    nodeId: "325:415",
    initialHeight: 8,
    heights: [8, 18, 6, 16, 4, 14, 8],
    times: [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]
  },
  {
    nodeId: "325:416",
    initialHeight: 14,
    heights: [14, 6, 20, 8, 18, 5, 16, 14],
    times: [0, 0.125, 0.275, 0.425, 0.6, 0.775, 0.9, 1]
  },
  {
    nodeId: "325:417",
    initialHeight: 10,
    heights: [10, 20, 4, 18, 6, 16, 10],
    times: [0, 0.175, 0.325, 0.475, 0.65, 0.8, 1]
  },
  {
    nodeId: "325:418",
    initialHeight: 6,
    heights: [6, 16, 4, 20, 6, 14, 4, 18, 6],
    times: [0, 0.1, 0.225, 0.35, 0.5, 0.65, 0.8, 0.925, 1]
  }
] satisfies Array<{
  nodeId: string;
  initialHeight: number;
  heights: number[];
  times: number[];
}>;

function DjSpeechBubble({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <aside
      aria-live="polite"
      className="djSpeechBubble"
      data-node-id="320:422"
      role="status"
    >
      <img
        alt="Redio DJ"
        className="djSpeechBubbleAvatar"
        data-node-id="320:406"
        src={getPublicAssetUrl("/images/agent-dj.png")}
      />
      <p data-node-id="320:408">{text}</p>
      <div
        aria-hidden="true"
        className="djSpeechBubbleWaveform"
        data-node-id="325:414"
      >
        {DJ_WAVE_BARS.map((bar) => (
          <motion.span
            animate={
              shouldReduceMotion
                ? { height: bar.initialHeight }
                : { height: bar.heights }
            }
            data-node-id={bar.nodeId}
            initial={{ height: bar.initialHeight }}
            key={bar.nodeId}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    height: {
                      duration: 2,
                      times: bar.times,
                      ease: DJ_WAVE_EASE,
                      repeat: Infinity
                    }
                  }
            }
          />
        ))}
      </div>
    </aside>
  );
}

export function LandingPage({
  chatWindow,
  error,
  hasPlaybackToast,
  isLoginBusy,
  onEnter,
  onLogin,
  onLogout,
  onOpenChat,
  player,
  settingsContent,
  status
}: {
  chatWindow: ReactNode;
  error: string | null;
  hasPlaybackToast: boolean;
  isLoginBusy: boolean;
  onEnter: (view: AppView) => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenChat: () => void;
  player: CircularQueuePlayerProps;
  settingsContent: ReactNode;
  status: QqLoginStatus | null;
}) {
  const accountLabel = status?.nickname ?? status?.userId ?? "账号昵称";
  const isLoggedIn = status?.loggedIn === true;
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"home" | "settings">("home");

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsAccountMenuOpen(false);
    }
  }, [isLoggedIn]);

  return (
    <main
      className={`landingPage ${isLoggedIn ? "isLoggedIn" : ""}${hasPlaybackToast ? " hasPlaybackToast" : ""}`}
      data-node-id="164:1145"
    >
      <header className="landingNav" data-node-id={isLoggedIn ? "239:867" : "232:744"}>
        <div className="landingNavLeft" data-node-id={isLoggedIn ? "239:868" : "232:735"}>
          <a
            aria-label="返回 halou.net.cn 首页"
            className="landingBrand"
            data-node-id="239:869"
            href="https://www.halou.net.cn/"
          >
            <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
              <path
                d="M14.9998 19.9201L8.47984 13.4001C7.70984 12.6301 7.70984 11.3701 8.47984 10.6001L14.9998 4.08008"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit="10"
                strokeWidth="1.5"
              />
            </svg>
          </a>
        </div>

        <nav
          aria-label="主要导航"
          className="landingLinks"
          data-node-id={isLoggedIn ? "239:870" : "232:737"}
        >
          <button
            aria-current={activeSection === "home" ? "page" : undefined}
            data-node-id={isLoggedIn ? "239:871" : "232:738"}
            onClick={() => setActiveSection("home")}
            type="button"
          >
            Home
          </button>
          <button
            data-node-id={isLoggedIn ? "239:872" : "232:739"}
            onClick={isLoggedIn ? onOpenChat : onLogin}
            type="button"
          >
            Chat
          </button>
          <button
            aria-current={activeSection === "settings" ? "page" : undefined}
            data-node-id={isLoggedIn ? "239:873" : "232:740"}
            onClick={() => {
              if (isLoggedIn) {
                setActiveSection("settings");
              } else {
                onLogin();
              }
            }}
            type="button"
          >
            Setting
          </button>
          <button
            data-node-id={isLoggedIn ? "239:874" : "232:741"}
            onClick={() => onEnter("agent")}
            type="button"
          >
            About
          </button>
        </nav>

        <div className="landingNavRight" data-node-id={isLoggedIn ? "239:875" : "232:742"}>
          {isLoggedIn ? (
            <>
              <div className="landingChatAnchor">
                <AskAnythingButton onClick={onOpenChat} />
                {chatWindow}
              </div>
              <div className="landingAccountMenuAnchor" ref={accountMenuRef}>
                <button
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`当前登录账号：${accountLabel}`}
                  className="landingAccount"
                  data-node-id="262:698"
                  onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
                  title={accountLabel}
                  type="button"
                >
                  <img
                    alt=""
                    onError={(event) => {
                      event.currentTarget.src = getPublicAssetUrl("/images/redio-account-placeholder.png");
                    }}
                    referrerPolicy="no-referrer"
                    src={status?.avatarUrl ?? getPublicAssetUrl("/images/redio-account-placeholder.png")}
                  />
                </button>

                {isAccountMenuOpen ? (
                  <div
                    aria-label="账号菜单"
                    className="landingAccountMenu"
                    data-node-id="262:700"
                    role="menu"
                  >
                    <div className="landingAccountPlatform" data-node-id="262:753">
                      <img
                        alt="QQ Music"
                        className="landingAccountPlatformIcon"
                        data-node-id="262:767"
                        src={getPublicAssetUrl("/images/account-menu-qq-music.png")}
                      />
                      <span data-node-id="262:759" title={accountLabel}>
                        {accountLabel}
                      </span>
                    </div>

                    <div className="landingAccountMenuDivider" data-node-id="262:763" />
                    <div className="landingAccountMenuDividerGap" data-node-id="262:764" />

                    <button
                      className="landingAccountMenuItem"
                      data-node-id="262:729"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setActiveSection("settings");
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <img alt="" data-node-id="262:731" src={getPublicAssetUrl("/images/account-menu-settings.svg")} />
                      <span data-node-id="262:734">Settings</span>
                    </button>

                    <button
                      className="landingAccountMenuItem"
                      data-node-id="262:747"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        onLogout();
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <img alt="" data-node-id="262:749" src={getPublicAssetUrl("/images/account-menu-logout.svg")} />
                      <span data-node-id="262:752">Logout</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <button
              className="landingJoin"
              data-node-id="239:840"
              disabled={isLoginBusy}
              onClick={onLogin}
              type="button"
            >
              {isLoginBusy ? "Signing in…" : "sign in"}
            </button>
          )}
        </div>
      </header>

      {error ? (
        <p aria-live="polite" className="landingStatusNotice">
          {error}
        </p>
      ) : null}

      {activeSection === "settings" ? (
        <section className="landingSettingsPage" aria-label="设置">
          <div className="landingSettingsScroll">{settingsContent}</div>
        </section>
      ) : (
        <section
          className="landingHero"
          data-node-id={isLoggedIn ? "271:1283" : "164:1156"}
        >
          {isLoggedIn ? (
            <CircularQueuePlayer {...player} />
          ) : (
            <div className="landingHeroCopy" data-node-id="164:1638">
              <h1 data-node-id="164:1639">Music&apos;s</h1>
              <p data-node-id="164:1640">你的心情，自有频率</p>
            </div>
          )}
        </section>
      )}

      <img
        alt=""
        aria-hidden="true"
        className="landingGlow"
        data-node-id="164:1648"
        src={getPublicAssetUrl("/images/redio-landing-ellipse.svg")}
      />
      <StarfieldCanvas />
    </main>
  );
}

function useFlowingGradientMotion(autoStart = true) {
  const gradientRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);

  const stopAnimation = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startAnimation = () => {
    if (!gradientRef.current) {
      return;
    }

    stopAnimation();
    const colors = gradientRef.current.querySelectorAll<HTMLElement>(".color");
    const moveColors = () => {
      colors.forEach((color) => {
        color.style.transform = `translate(${Math.floor(Math.random() * 200 - 100)}%, ${Math.floor(Math.random() * 200 - 100)}%)`;
      });
    };

    window.setTimeout(moveColors, 100);
    intervalRef.current = window.setInterval(moveColors, 1500);
  };

  useEffect(() => {
    if (autoStart) {
      startAnimation();
    }
    return stopAnimation;
  }, []);

  return { gradientRef, startAnimation };
}

function AskAnythingButton({ onClick }: { onClick: () => void }) {
  const { gradientRef, startAnimation } = useFlowingGradientMotion();

  return (
    <div className="landingAskAnythingSlot">
      <button
        aria-label="Ask Anything"
        className="button-gradient visible"
        onClick={onClick}
        onMouseEnter={startAnimation}
        type="button"
      >
        <div className="btn-content">
          <span className="gen-btn__icon">
            <svg
              aria-hidden="true"
              fill="#ffffff"
              height="24"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clipPath="url(#clip0_3261_12990)">
                <path
                  d="M9.90999 6.62001C9.90999 6.62001 9.90999 6.59001 9.91999 6.57001C10.13 5.26001 11.04 4.12001 12.31 3.62001L15.91 2.23001C16.93 1.83001 18.09 1.97001 18.99 2.59001C19.9 3.20001 20.44 4.24001 20.44 5.33001C20.44 6.61001 19.5 7.97001 18.31 8.43001L11.63 11.02C11.46 11.09 11.32 11.29 11.32 11.47V17.56C11.32 20.31 8.78999 22.49 5.92999 21.89C4.25999 21.54 2.89999 20.19 2.54999 18.51C1.94999 15.65 4.12999 13.12 6.87999 13.12C8.02999 13.12 9.06999 13.55 9.85999 14.27V7.20001L9.90999 6.62001Z"
                  fill="white"
                />
                <path
                  d="M21.17 16.98C21.17 17.05 21.13 17.21 20.94 17.27L19.96 17.54C19.11 17.77 18.47 18.41 18.24 19.26L17.98 20.22C17.92 20.44 17.75 20.46 17.67 20.46C17.59 20.46 17.42 20.44 17.36 20.22L17.1 19.25C16.87 18.41 16.22 17.77 15.38 17.54L14.41 17.28C14.2 17.22 14.18 17.04 14.18 16.97C14.18 16.89 14.2 16.71 14.41 16.65L15.39 16.39C16.23 16.15 16.87 15.51 17.1 14.67L17.36 13.72L17.38 13.65C17.45 13.48 17.61 13.45 17.67 13.45C17.73 13.45 17.9 13.47 17.96 13.63L18.24 14.66C18.47 15.5 19.12 16.14 19.96 16.38L20.93 16.64L20.96 16.66C21.16 16.74 21.17 16.92 21.17 16.98Z"
                  fill="white"
                />
              </g>
              <defs>
                <clipPath id="clip0_3261_12990">
                  <rect fill="white" height="24" width="24" />
                </clipPath>
              </defs>
            </svg>
          </span>
          <span>Ask Anything</span>
        </div>
        <div className="border" />
        <div className="gradient-0" />
        <div className="gradient-1" />
        <div className="glass" />
        <div className="gradient-2" ref={gradientRef}>
          <div className="color-1 color" />
          <div className="color-2 color" />
          <div className="color-3 color" />
          <div className="color-4 color" />
          <div className="color-5 color" />
          <div className="color-6 color" />
        </div>
      </button>
    </div>
  );
}

// —— 环形画廊参数（算法参考 reactbits.dev CircularGallery，bend≈6 的观感）——
// 卡片沿圆弧分布：R = (H² + B²) / (2B)，下沉量 arc = R - √(R² - x²)，倾角 = asin(x / R)
const QUEUE_BEND_RATIO = 0.46; // B / H，越大弧越弯
const QUEUE_CENTER_SCALE = 1.65; // 中心卡相对两侧卡的放大倍数
const QUEUE_SCROLL_EASE = 0.09; // lerp 缓动系数，与 reactbits scrollEase 同义
const QUEUE_CARD_SPACING_RATIO = 0.216; // 相邻卡片的水平间距（占容器宽度）

function lerpValue(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function CircularQueuePlayer({
  currentCaption,
  currentTime,
  duration,
  isLiked,
  isPlaying,
  onLike,
  onNext,
  onPrevious,
  onSeek,
  onSelectTrack,
  onToggleMute,
  onTogglePlayback,
  onVolumeChange,
  selectedTrack,
  selectedTrackIndex,
  tracks,
  volume
}: CircularQueuePlayerProps) {
  const dragStateRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const suppressClickUntilRef = useRef(0);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const scrollRef = useRef({ current: selectedTrackIndex, target: selectedTrackIndex });
  const orbitSizeRef = useRef({ height: 600, width: 1200 });
  const wheelLockUntilRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolumePopoverOpen, setIsVolumePopoverOpen] = useState(false);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = Math.round(volume * 100);
  const isMuted = volume <= 0;
  const visibleTracks = tracks
    .map((track, index) => ({ index, offset: index - selectedTrackIndex, track }))
    .filter(({ offset }) => Math.abs(offset) <= 5);

  useEffect(() => {
    const orbit = orbitRef.current;
    if (!orbit) {
      return;
    }

    const updateOrbitSize = () => {
      const { height, width } = orbit.getBoundingClientRect();
      orbitSizeRef.current = { height, width };
    };

    updateOrbitSize();
    const observer = new ResizeObserver(updateOrbitSize);
    observer.observe(orbit);

    return () => observer.disconnect();
  }, []);

  // 选中曲目变化时，把滚动目标对齐到该卡片（吸附）
  useEffect(() => {
    scrollRef.current.target = selectedTrackIndex;
  }, [selectedTrackIndex]);

  // —— 弧线布局渲染循环 ——
  // 每帧将 scroll.current 向 target lerp（与 reactbits 的 update() 相同），
  // 再按圆弧公式计算每张卡片的 x/y/rotation/scale，直接写 transform，不经过 React 渲染。
  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const scroll = scrollRef.current;
      scroll.current = lerpValue(scroll.current, scroll.target, QUEUE_SCROLL_EASE);

      const { width: orbitWidth } = orbitSizeRef.current;
      const spacing = orbitWidth * QUEUE_CARD_SPACING_RATIO;
      const H = orbitWidth / 2;
      const B = H * QUEUE_BEND_RATIO;
      const R = (H * H + B * B) / (2 * B);

      cardRefs.current.forEach((card, index) => {
        const x = (index - scroll.current) * spacing;
        const effectiveX = Math.min(Math.abs(x), H);
        const arc = R - Math.sqrt(Math.max(R * R - effectiveX * effectiveX, 0));
        const rotation = Math.sign(x) * Math.asin(effectiveX / R);

        // 与中心的距离决定卡片大小：中心 1 → 两侧渐小
        const proximity = Math.max(0, 1 - Math.abs(index - scroll.current));
        const scale = 1 + (QUEUE_CENTER_SCALE - 1) * proximity;

        card.style.transform =
          `translate(calc(-50% + ${x}px), ${arc}px) ` +
          `rotate(${rotation}rad) scale(${scale})`;
        card.style.zIndex = String(100 - Math.round(Math.abs(x)));
      });

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!isVolumePopoverOpen) {
      return;
    }

    function closeVolumePopoverOnOutsidePointer(event: PointerEvent) {
      if (volumeControlRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsVolumePopoverOpen(false);
    }

    document.addEventListener("pointerdown", closeVolumePopoverOnOutsidePointer);

    return () => {
      document.removeEventListener("pointerdown", closeVolumePopoverOnOutsidePointer);
    };
  }, [isVolumePopoverOpen]);

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>, shouldNavigate: boolean) {
    const dragState = dragStateRef.current;

    if (!dragState) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);

    if (dragState.moved) {
      suppressClickUntilRef.current = Date.now() + 250;
    }

    if (!shouldNavigate || !dragState.moved) {
      scrollRef.current.target = selectedTrackIndex;
      return;
    }

    // 松手时吸附到最近的卡片（等价 reactbits 的 onCheck），并同步业务选中态
    const snapped = Math.max(
      0,
      Math.min(tracks.length - 1, Math.round(scrollRef.current.target))
    );

    if (snapped !== selectedTrackIndex) {
      onSelectTrack(snapped);
    } else {
      scrollRef.current.target = selectedTrackIndex;
    }
  }

  return (
    <section
      aria-label={`当前播放：${selectedTrack.title}，${selectedTrack.artist}`}
      className="circularQueuePlayer"
      data-node-id="165:4787"
    >
      <div
        aria-label="即将播放队列，可左右滑动切歌"
        className={`queueOrbit ${isDragging ? "isDragging" : ""}`}
        ref={orbitRef}
        onPointerCancel={(event) => finishDrag(event, false)}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          dragStateRef.current = {
            startX: event.clientX,
            startScroll: scrollRef.current.target,
            moved: false
          };
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current;

          if (!dragState) {
            return;
          }

          const deltaX = event.clientX - dragState.startX;

          if (Math.abs(deltaX) > 6) {
            dragState.moved = true;
          }

          // 拖动位移直接映射为滚动量（负相关：向左拖 → 队列前进）
          const spacing = orbitSizeRef.current.width * QUEUE_CARD_SPACING_RATIO || 1;
          const nextTarget = dragState.startScroll - deltaX / spacing;
          scrollRef.current.target = Math.max(
            -0.35,
            Math.min(tracks.length - 1 + 0.35, nextTarget)
          );
        }}
        onPointerUp={(event) => finishDrag(event, true)}
        onWheel={(event) => {
          const now = Date.now();

          if (now < wheelLockUntilRef.current) {
            return;
          }

          const delta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

          if (Math.abs(delta) < 12) {
            return;
          }

          wheelLockUntilRef.current = now + 320;

          if (delta > 0) {
            onNext();
          } else {
            onPrevious();
          }
        }}
        role="group"
      >
        <div className="queueOrbitTrack">
          {visibleTracks.map(({ index, offset, track }) => {
            const absoluteOffset = Math.abs(offset);
            const coverUrl =
              track.coverUrl ?? queueFallbackCovers[index % queueFallbackCovers.length];

            return (
              <button
                aria-current={offset === 0 ? "true" : undefined}
                aria-label={
                  offset === 0
                    ? `正在播放：${track.title}，${track.artist}`
                    : `播放 ${track.title}，${track.artist}`
                }
                className={`queueOrbitItem ${offset === 0 ? "isCurrent" : ""} ${
                  absoluteOffset === 5 ? "isBuffer" : ""
                } ${!isTrackPlayable(track) ? "isUnavailable" : ""}`}
                key={getPlayableTrackIdentity(track, index)}
                ref={(node) => {
                  if (node) {
                    cardRefs.current.set(index, node);
                  } else {
                    cardRefs.current.delete(index);
                  }
                }}
                onClick={() => {
                  if (Date.now() < suppressClickUntilRef.current || offset === 0) {
                    return;
                  }

                  onSelectTrack(index);
                }}
                type="button"
              >
                <img
                  alt=""
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.src =
                      queueFallbackCovers[index % queueFallbackCovers.length];
                  }}
                  src={coverUrl}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="queuePlayerContent">
        <div className="queuePlayerHeading" data-node-id="165:4957">
          <h1 data-node-id="165:4958" title={selectedTrack.title}>
            {selectedTrack.title}
          </h1>
          <p aria-live="polite" data-node-id="165:4959">
            {currentCaption}
          </p>
        </div>

        <section
          className="queueMediaControls"
          aria-label="播放控制"
          data-node-id="165:4960"
        >
          <div className="queueControlButtons" data-node-id="165:4961">
            <button
              aria-label={isLiked ? "已喜欢" : "喜欢当前歌曲"}
              aria-pressed={isLiked}
              className={`queueLikeButton ${isLiked ? "isActive" : ""}`}
              onClick={onLike}
              type="button"
            >
              <img alt="" aria-hidden="true" src={getPublicAssetUrl("/images/redio-player-like.svg")} />
            </button>
            <div className="queueTransportButtons" data-node-id="165:4963">
              <button aria-label="上一首" onClick={onPrevious} type="button">
                <PreviousIcon />
              </button>
              <button
                aria-label={isPlaying ? "暂停" : "播放"}
                onClick={onTogglePlayback}
                type="button"
              >
                {isPlaying ? <PauseTransportIcon /> : <PlayTransportIcon />}
              </button>
              <button aria-label="下一首" onClick={onNext} type="button">
                <NextIcon />
              </button>
            </div>
            <div
              className={`queueVolumeControl ${isMuted ? "isMuted" : ""}`}
              data-node-id={isMuted ? "198:710" : "198:696"}
              ref={volumeControlRef}
            >
              <button
                aria-controls="queue-volume-popover"
                aria-expanded={isVolumePopoverOpen}
                aria-label={isVolumePopoverOpen ? "收起音量控制" : "展开音量控制"}
                className="queueVolumeToolbarButton"
                onClick={() => setIsVolumePopoverOpen((isOpen) => !isOpen)}
                title={isVolumePopoverOpen ? "收起音量" : "调节音量"}
                type="button"
              >
                <VolumeIcon muted={isMuted} />
              </button>
              {isVolumePopoverOpen ? (
                <div className="queueVolumePopover" id="queue-volume-popover">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="queueVolumePopoverBackground"
                    src={getPublicAssetUrl("/images/redio-volume-control-bg.svg")}
                  />
                  <div className="queueVolumePopoverContent">
                    <div className="queueVolumeSliderSlot">
                      <input
                        aria-label="音量"
                        className="queueVolumeSlider"
                        disabled={isMuted}
                        max="1"
                        min="0"
                        onInput={(event) =>
                          onVolumeChange(Number(event.currentTarget.value))
                        }
                        step="0.01"
                        style={
                          {
                            "--volume-percent": `${volumePercent}%`
                          } as CSSProperties
                        }
                        type="range"
                        value={volume}
                      />
                    </div>
                    <output aria-live="polite" className="queueVolumePercent">
                      {volumePercent}%
                    </output>
                    <button
                      aria-label={isMuted ? "取消静音" : "静音"}
                      aria-pressed={isMuted}
                      className="queueVolumePopoverButton"
                      onClick={onToggleMute}
                      type="button"
                    >
                      <img
                        alt=""
                        aria-hidden="true"
                        src={
                          isMuted
                            ? getPublicAssetUrl("/images/redio-volume-muted.svg")
                            : getPublicAssetUrl("/images/redio-volume-sound.svg")
                        }
                      />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="queueProgressRow" data-node-id="165:4970">
            <span>{formatPlaybackTime(currentTime)}</span>
            <input
              aria-label="播放进度"
              className="progressTrack"
              disabled={duration <= 0}
              max={duration || 0}
              min="0"
              onInput={(event) => onSeek(Number(event.currentTarget.value))}
              step="0.1"
              style={
                {
                  "--progress-percent": `${progressPercent}%`
                } as CSSProperties
              }
              type="range"
              value={duration > 0 ? currentTime : 0}
            />
            <span>{formatPlaybackTime(duration)}</span>
          </div>
        </section>
      </div>
    </section>
  );
}

function AgentProfilePage({
  genreTags,
  isLoginBusy,
  listenerCount,
  listenerName,
  onLogin,
  status
}: {
  genreTags: string[];
  isLoginBusy: boolean;
  listenerCount: number;
  listenerName: string;
  onLogin: () => void;
  status: QqLoginStatus | null;
}) {
  const accountLabel = status?.loggedIn
    ? status.nickname ?? status.userId ?? "账号昵称"
    : "登录";

  return (
    <section className="agentProfilePage" aria-label="DJ Agent 资料页">
      <section className="agentIdentity">
        <div className="agentPortrait" aria-hidden="true" />
        <div className="agentNameBlock">
          <h2>Redio</h2>
          <p>
            <i />
            <span>一开机我就打碟</span>
          </p>
        </div>
      </section>

      <section className="agentBio" aria-label="DJ 简介">
        <p>{listenerName}的私人DJ，会打碟的taste.md 🎧</p>
        <span>Your mood is my prompt.</span>
        <span>I hate algorithm. I have taste.</span>
      </section>

      <section className="agentStats" aria-label="DJ 数据">
        <div>
          <span>ON AIR</span>
          <strong>24/7</strong>
        </div>
        <div>
          <span>GENRES</span>
          <strong>∞</strong>
        </div>
        <div>
          <span>LISTENER</span>
          <strong>{listenerCount}</strong>
        </div>
      </section>

      <section className="agentGenreTags" aria-label="擅长风格">
        {genreTags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </section>

      <section className="agentLogin" aria-label="登录">
        <h3>登录</h3>
        <button
          className={status?.loggedIn ? "isLoggedIn" : ""}
          disabled={isLoginBusy}
          onClick={status?.loggedIn ? undefined : onLogin}
          type="button"
        >
          <i />
          <span>{isLoginBusy ? "等待扫码" : accountLabel}</span>
        </button>
      </section>
    </section>
  );
}

function HistorySection({
  entries,
  isOpen,
  onToggle
}: {
  entries: PlaybackHistoryEntry[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const visibleEntries = entries.slice(0, 4);

  return (
    <section className="memorySection" aria-label="播放记忆">
      <button className="memoryHeader" onClick={onToggle} type="button">
        <span>播放记忆</span>
        <strong>{entries.length} 条记录</strong>
      </button>
      {isOpen ? (
        <div className="memoryList">
          {visibleEntries.length > 0 ? (
            visibleEntries.map((entry) => {
              const track = entry.play[0];
              const sourceLabel =
                track?.playbackStatus === "fallback" || track?.isFallback
                  ? "测试音频"
                  : track?.playbackStatus === "unverified"
                    ? "音源待验证"
                    : track?.source === "qq"
                      ? "QQ 音乐"
                      : track?.source === "netease"
                      ? "网易云"
                      : track?.source === "local"
                        ? "本地音源"
                        : "待解析";

              return (
                <article className="memoryItem" key={entry.id}>
                  <div className="memoryMeta">
                    <span>{formatHistoryTime(entry.createdAt)}</span>
                    <em>第 {entry.episode} 段</em>
                  </div>
                  <strong>{entry.userMessage ?? "自动生成节目"}</strong>
                  <p>{entry.say}</p>
                  <small>
                    {track
                      ? `${track.title} / ${track.artist} · ${sourceLabel}`
                      : "暂无推荐歌曲"}
                  </small>
                  <small>{entry.reason}</small>
                </article>
              );
            })
          ) : (
            <p className="memoryEmpty">生成第一段节目后，这里会出现播放记录。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function QqSourceSection({
  bridgeStatus,
  cookieDraft,
  isDesktop,
  isOpen,
  isSaving,
  isWebLoginBusy,
  onBridgeLogin,
  onClear,
  onCookieChange,
  onDetectBridge,
  onDesktopLogin,
  onSave,
  onSyncBridge,
  onToggle,
  status
}: {
  bridgeStatus: RedioBridgeStatus;
  cookieDraft: string;
  isDesktop: boolean;
  isOpen: boolean;
  isSaving: boolean;
  isWebLoginBusy: boolean;
  onBridgeLogin: () => void;
  onClear: () => void;
  onCookieChange: (value: string) => void;
  onDetectBridge: () => void;
  onDesktopLogin: () => void;
  onSave: () => void;
  onSyncBridge: () => void;
  onToggle: () => void;
  status: QqLoginStatus | null;
}) {
  const statusText = status?.playbackKeyReady
    ? "播放授权已就绪"
    : status?.loggedIn
      ? "账号态已保存，播放授权不完整"
      : status?.hasCookie
        ? "Cookie 不完整"
        : "未连接";
  const hasSavedLogin = Boolean(status?.loggedIn || status?.hasCookie);
  const clearButtonLabel = status?.loggedIn ? "退出登录" : "清除 Cookie";
  const bridgeNeedsReload =
    bridgeStatus.connected && isRedioBridgeOutdated(bridgeStatus.version);
  const primaryLoginLabel = isWebLoginBusy
    ? "等待扫码"
    : bridgeNeedsReload
      ? "请重新加载 Bridge"
    : bridgeStatus.connected
      ? "扫码登录 QQ 音乐"
      : isDesktop
        ? "桌面端扫码登录"
        : "安装 Bridge 后登录";

  return (
    <section className="sourceSection" aria-label="QQ 音源">
      <button className="sourceHeader" onClick={onToggle} type="button">
        <span>QQ 音源</span>
        <strong>{statusText}</strong>
      </button>
      {isOpen ? (
        <div className="sourcePanel">
          <p>
            Redio Bridge 可以读取你在 QQ 音乐官方网页的登录态，并只把必要 Cookie
            按音乐账号加密保存。未安装 Bridge 时仍可使用桌面端登录或手动导入。
          </p>
          <div className="bridgeStatusCard">
            <span>Redio Bridge</span>
            <strong className={bridgeStatus.connected && !bridgeNeedsReload ? "isReady" : ""}>
              {bridgeStatus.checking
                ? "检测中"
                : bridgeNeedsReload
                  ? `需重新加载 · v${bridgeStatus.version}`
                : bridgeStatus.connected
                  ? bridgeStatus.version
                    ? `已连接 · v${bridgeStatus.version}`
                    : "已连接"
                  : "未安装"}
            </strong>
            <small>{bridgeStatus.message}</small>
          </div>
          <div className="sourceStatusGrid">
            <span>账号</span>
            <strong>{status?.nickname ?? status?.userId ?? "未登录"}</strong>
            <span>播放票据</span>
            <strong>{status?.playbackKeyReady ? "已检测到" : "未检测到"}</strong>
          </div>
          <div className="sourceLoginBlock">
            <button
              className="sourceLoginButton"
              disabled={
                isSaving ||
                isWebLoginBusy ||
                bridgeNeedsReload ||
                (!bridgeStatus.connected && !isDesktop)
              }
              onClick={bridgeStatus.connected ? onBridgeLogin : onDesktopLogin}
              type="button"
            >
              {primaryLoginLabel}
            </button>
            <small>
              {bridgeStatus.connected
                ? bridgeNeedsReload
                  ? "请在 Chrome 扩展管理页重新加载 Redio Bridge，然后刷新当前页面。"
                  : "点击后会打开 QQ 音乐官方网页，扫码完成后自动同步播放票据。"
                : isDesktop
                  ? "未检测到 Bridge，当前会使用桌面客户端登录窗口。"
                  : "浏览器版需要先加载 bridge-extension 目录，或继续手动粘贴 Cookie。"}
            </small>
          </div>
          <textarea
            aria-label="QQ 音乐 Cookie"
            onChange={(event) => onCookieChange(event.target.value)}
            placeholder="uin=...; qm_keyst=...; qqmusic_key=...; music_key=..."
            spellCheck={false}
            value={cookieDraft}
          />
          <div className="sourceActions">
            <button disabled={bridgeStatus.checking} onClick={onDetectBridge} type="button">
              {bridgeStatus.checking ? "检测中" : "重新检测"}
            </button>
            <button
              disabled={isSaving || !bridgeStatus.connected || bridgeNeedsReload}
              onClick={onSyncBridge}
              type="button"
            >
              刷新登录状态
            </button>
            <button disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? "保存中" : "保存 Cookie"}
            </button>
            <button disabled={isSaving || !hasSavedLogin} onClick={onClear} type="button">
              {isSaving && hasSavedLogin ? "处理中" : clearButtonLabel}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LogSection({
  entries,
  isOpen,
  onToggle
}: {
  entries: AppLogEntry[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const visibleEntries = entries.slice(0, 8);

  return (
    <section className="logSection" aria-label="运行日志">
      <button className="logHeader" onClick={onToggle} type="button">
        <span>运行日志</span>
        <strong>{entries.length} 条</strong>
      </button>
      {isOpen ? (
        <div className="logList">
          {visibleEntries.map((entry) => {
            const levelLabel =
              entry.level === "success" ? "成功" : entry.level === "error" ? "异常" : "信息";

            return (
              <article className={`logItem is-${entry.level}`} key={entry.id}>
                <div className="logMeta">
                  <span>{formatLogTime(entry.createdAt)}</span>
                  <em>{levelLabel}</em>
                </div>
                <strong>{entry.message}</strong>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function AskDock({
  disabled,
  isLandingChat = false,
  isPlanning,
  message,
  onFocus,
  onMessageChange,
  onSend,
  planningInputText,
  showMicButton = false
}: {
  disabled: boolean;
  isLandingChat?: boolean;
  isPlanning: boolean;
  message: string;
  onFocus: () => void;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  planningInputText: string;
  showMicButton?: boolean;
}) {
  const inputValue = isPlanning ? planningInputText : message;
  const isLandingInputActive = isLandingChat && inputValue.trim().length > 0;
  const isSendDisabled = disabled || (isLandingChat && inputValue.trim().length === 0);
  const { gradientRef: sendGradientRef, startAnimation: startSendGradientAnimation } =
    useFlowingGradientMotion(false);

  function handleSubmit() {
    if (!isSendDisabled) {
      onSend();
    }
  }

  return (
    <div
      className={`askDock${isLandingChat ? " landingChatDefaultInput" : ""}${isLandingInputActive ? " isTyping" : ""}`}
      data-node-id={isLandingChat ? (isLandingInputActive ? "277:1700" : "277:1661") : undefined}
    >
      <input
        data-node-id={isLandingChat ? (isLandingInputActive ? "277:1701" : "277:1662") : undefined}
        disabled={isPlanning}
        onChange={(event) => onMessageChange(event.target.value)}
        onClick={onFocus}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={isLandingChat ? "Tell me your mood" : "Ask Anything"}
        value={inputValue}
      />
      {showMicButton ? (
        <button
          aria-label="语音输入暂未启用"
          className="micButton"
          disabled
          title="语音输入暂未启用"
          type="button"
        >
          <MicIcon />
        </button>
      ) : null}
      <button
        aria-label="发送"
        className={`sendButton${isLandingChat ? " sendGradientButton" : ""}`}
        data-node-id={isLandingChat ? (isSendDisabled ? "281:419" : "281:426") : undefined}
        disabled={isSendDisabled}
        onClick={handleSubmit}
        onMouseEnter={isLandingChat && !isSendDisabled ? startSendGradientAnimation : undefined}
        type="button"
      >
        {isLandingChat ? (
          <>
            <img
              alt=""
              aria-hidden="true"
              className="messageSendIcon"
              data-node-id={isSendDisabled ? "281:420" : "281:427"}
              src={getPublicAssetUrl("/images/figma-chat-send.svg")}
            />
            <div aria-hidden="true" className="button-gradient visible sendGradientEffect">
              <div className="border" />
              <div className="gradient-0" />
              <div className="gradient-1" />
              <div className="glass" />
              <div className="gradient-2" ref={sendGradientRef}>
                <div className="color-1 color" />
                <div className="color-2 color" />
                <div className="color-3 color" />
                <div className="color-4 color" />
                <div className="color-5 color" />
                <div className="color-6 color" />
              </div>
            </div>
          </>
        ) : (
          <MessageSendIcon />
        )}
      </button>
    </div>
  );
}

function MessageTimestamp({ createdAt }: { createdAt: string }) {
  const timestamp = getMessageTimestamp(createdAt);

  return (
    <time className="messageMeta" dateTime={createdAt}>
      <span>{timestamp.date}</span>
      <span>{timestamp.time}</span>
    </time>
  );
}

export function ChatWindow({
  error,
  isLoading,
  isLandingChat,
  isPlanning,
  message,
  messages,
  onClose,
  onOpenAgentProfile,
  onMessageAnimationComplete,
  onMessageChange,
  onSend,
  plan,
  planningInputText,
  planningText
}: {
  error: string | null;
  isLoading: boolean;
  isLandingChat: boolean;
  isPlanning: boolean;
  message: string;
  messages: ChatMessage[];
  onClose: () => void;
  onOpenAgentProfile: () => void;
  onMessageAnimationComplete: (messageId: string) => void;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  plan: DjPlan | null | undefined;
  planningInputText: string;
  planningText: string;
}) {
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const introCreatedAtRef = useRef(new Date().toISOString());
  const [expandedTrackMessageIds, setExpandedTrackMessageIds] = useState<Set<string>>(
    () => new Set()
  );
  const visibleMessages =
    messages.length > 0
      ? messages
      : [
          {
            id: "intro",
            role: "assistant" as const,
            text: isLoading
              ? "正在读取本地电台状态..."
              : plan?.say ?? "我已经准备好根据你的资料生成下一段节目。",
            createdAt: introCreatedAtRef.current,
            plan: plan ?? undefined
          }
      ];
  const latestMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? "";
  const planningCreatedAt =
    messages[messages.length - 1]?.createdAt ?? introCreatedAtRef.current;

  function keepLatestMessageVisible() {
    const chatMessages = chatMessagesRef.current;

    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function toggleAllTracks(messageId: string) {
    setExpandedTrackMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(messageId)) {
        nextIds.delete(messageId);
      } else {
        nextIds.add(messageId);
      }

      return nextIds;
    });
  }

  useEffect(() => {
    const chatMessages = chatMessagesRef.current;

    if (!chatMessages) {
      return;
    }

    const scrollToBottom = () => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    const animationFrame = requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 80);

    scrollToBottom();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [latestMessageId, isPlanning]);

  return (
    <section
      className={`chatWindow ${isLandingChat ? "isLandingChat" : ""}`}
      data-node-id={isLandingChat ? "276:884" : undefined}
    >
      <header className="chatHeader" data-node-id={isLandingChat ? "276:885" : undefined}>
        <div data-node-id={isLandingChat ? "276:886" : undefined}>
          <img
            alt=""
            aria-hidden="true"
            className="redioMarkIcon"
            data-node-id={isLandingChat ? "276:887" : undefined}
            src={getPublicAssetUrl("/images/figma-chat-redio-mark.svg")}
          />
          <h2 data-node-id={isLandingChat ? "276:888" : undefined}>Redio</h2>
        </div>
        <button
          aria-label="关闭对话"
          data-node-id={isLandingChat ? "276:889" : undefined}
          onClick={onClose}
          type="button"
        >
          <img
            alt=""
            aria-hidden="true"
            className="chatCloseIcon"
            src={getPublicAssetUrl("/images/figma-chat-close.svg")}
          />
        </button>
      </header>

      <div
        className="chatMessages"
        data-node-id={isLandingChat ? "276:891" : undefined}
        ref={chatMessagesRef}
      >
        {visibleMessages.map((chatMessage) => (
          <div
            className={`message ${chatMessage.role === "user" ? "outbound" : "inbound"}`}
            key={chatMessage.id}
          >
            {chatMessage.role === "assistant" ? (
              <button
                aria-label="打开 DJ Agent 资料页"
                className="avatar agentAvatarButton"
                onClick={onOpenAgentProfile}
                type="button"
              />
            ) : null}
            <div className="messageContent">
              <MessageTimestamp createdAt={chatMessage.createdAt} />
              <p>
                {chatMessage.role === "assistant" ? (
                  <TypewriterText
                    animate={Boolean(chatMessage.shouldAnimate)}
                    onComplete={() => onMessageAnimationComplete(chatMessage.id)}
                    onProgress={keepLatestMessageVisible}
                    text={getAssistantBubbleText(chatMessage)}
                  />
                ) : (
                  chatMessage.text
                )}
              </p>
              {chatMessage.plan?.play.length ? (
                <RecommendedTrackCards
                  isExpanded={expandedTrackMessageIds.has(chatMessage.id)}
                  onToggleExpanded={() => toggleAllTracks(chatMessage.id)}
                  tracks={chatMessage.plan.play}
                />
              ) : null}
            </div>
            {chatMessage.role === "user" ? <div className="avatar userAvatar" /> : null}
          </div>
        ))}

        {isPlanning ? (
          <div className="message inbound">
            <button
              aria-label="打开 DJ Agent 资料页"
              className="avatar agentAvatarButton"
              onClick={onOpenAgentProfile}
              type="button"
            />
            <div className="messageContent">
              <MessageTimestamp createdAt={planningCreatedAt} />
              <p className="planningBubble">
                <ThinkingOrb
                  aria-hidden="true"
                  className="planningBubbleOrb"
                  size={64}
                  state="working"
                  theme="dark"
                />
                <span className="thinkingShimmer" data-text={planningText}>
                  {planningText}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="chatReason">{error}</p> : null}

      <AskDock
        disabled={isPlanning}
        isLandingChat={isLandingChat}
        isPlanning={isPlanning}
        message={message}
        onFocus={() => undefined}
        onMessageChange={onMessageChange}
        onSend={onSend}
        planningInputText={planningInputText}
        showMicButton={!isLandingChat}
      />
    </section>
  );
}

function getAssistantBubbleText(message: ChatMessage) {
  const reason = message.plan?.reason?.trim();

  if (reason) {
    return reason;
  }

  return message.text;
}

function getTypewriterDelay(character: string) {
  if (/[。！？!?]/.test(character)) {
    return 120;
  }

  if (/[，、；：,.]/.test(character)) {
    return 72;
  }

  return 30;
}

function TypewriterText({
  animate,
  onComplete,
  onProgress,
  text
}: {
  animate: boolean;
  onComplete: () => void;
  onProgress: () => void;
  text: string;
}) {
  const [visibleLength, setVisibleLength] = useState(() => (animate ? 0 : text.length));
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onProgressRef.current = onProgress;
  }, [onComplete, onProgress]);

  useEffect(() => {
    if (!animate) {
      setVisibleLength(text.length);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleLength(text.length);
      onCompleteRef.current();
      return;
    }

    setVisibleLength(0);

    if (!text) {
      onCompleteRef.current();
      return;
    }

    let nextLength = 0;
    let timeout = 0;

    const typeNextCharacter = () => {
      nextLength += 1;
      setVisibleLength(nextLength);

      if (nextLength >= text.length) {
        onCompleteRef.current();
        return;
      }

      timeout = window.setTimeout(
        typeNextCharacter,
        getTypewriterDelay(text[nextLength - 1] ?? "")
      );
    };

    timeout = window.setTimeout(typeNextCharacter, 80);

    return () => window.clearTimeout(timeout);
  }, [animate, text]);

  const isTyping = visibleLength < text.length;

  useEffect(() => {
    onProgressRef.current();
  }, [visibleLength]);

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, visibleLength)}</span>
      {isTyping ? <span aria-hidden="true" className="typewriterCursor" /> : null}
    </span>
  );
}

function RecommendedTrackCards({
  isExpanded,
  onToggleExpanded,
  tracks
}: {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  tracks: RecommendedTrack[];
}) {
  const visibleTracks = isExpanded ? tracks : tracks.slice(0, 3);
  const hasMoreTracks = tracks.length > 3;

  return (
    <div className="trackCardList">
      {visibleTracks.map((track, index) => (
        <RecommendedTrackCard
          key={`${track.title}-${track.artist}-${index}`}
          track={track}
        />
      ))}

      {hasMoreTracks ? (
        <button className="showAllTracks" onClick={onToggleExpanded} type="button">
          {isExpanded ? "收起歌曲" : "全部歌曲"}
          <span aria-hidden="true">{isExpanded ? "⌃" : "⌄"}</span>
        </button>
      ) : null}
    </div>
  );
}

function RecommendedTrackCard({ track }: { track: RecommendedTrack }) {
  const [hasCoverError, setHasCoverError] = useState(false);
  const shouldShowCover = Boolean(track.coverUrl && !hasCoverError);

  return (
    <div className="trackCard">
      {shouldShowCover ? (
        <img
          alt=""
          className="trackCover"
          onError={() => setHasCoverError(true)}
          referrerPolicy="no-referrer"
          src={track.coverUrl}
        />
      ) : (
        <div aria-hidden="true" className="trackCover trackCoverFallback" />
      )}
      <div>
        <strong title={track.title}>{track.title}</strong>
        <em title={track.artist}>{track.artist}</em>
      </div>
    </div>
  );
}
