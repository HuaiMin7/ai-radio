import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent
} from "react";
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
  plan?: DjPlan;
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
  /(推|推荐|听|放|播|来|歌|音乐|歌单|曲|适合|心情|开车|通勤|睡|阅读|工作|学习|下雨|夜晚|早上|午后|轻松|安静|兴奋|emo|治愈)/i;

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
  "/images/redio-queue-cover-0.png",
  "/images/redio-queue-cover-1.png",
  "/images/redio-queue-cover-2.jpg",
  "/images/redio-queue-cover-3.jpg",
  "/images/redio-queue-cover-4.jpg",
  "/images/redio-queue-cover-5.png",
  "/images/redio-queue-cover-6.png"
];

const apiBaseUrl = "http://127.0.0.1:8788";

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

  return track.audioUrl;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(url), init);

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
      bubble: "正在准备下一段电台节目..."
    };
  }

  if (musicIntentPattern.test(message)) {
    return {
      input: "正在挑歌...",
      bubble: "正在挑一首适合你的歌..."
    };
  }

  return {
    input: "正在思考...",
    bubble: "让我想想怎么回你..."
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

function RedioMarkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="redioMarkIcon"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 0C12.4183 0 16 3.58172 16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0ZM8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1Z"
        fill="#FB3367"
      />
      <path
        clipRule="evenodd"
        d="M8 12C10.2091 12 12 10.2091 12 8C12 5.79086 10.2091 4 8 4C5.79086 4 4 5.79086 4 8C4 10.2091 5.79086 12 8 12Z"
        fill="#FB3367"
        fillRule="evenodd"
      />
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
  const lastAudibleVolumeRef = useRef(0.5);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleHistoryEntryCount, setVisibleHistoryEntryCount] = useState(5);
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

  function loadMoreChatHistory() {
    setVisibleHistoryEntryCount((count) =>
      Math.min(count + 5, historyEntries.length)
    );
  }

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
  }

  async function persistQqCookie(cookie: string, source: "manual" | "desktop") {
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
      resolvingTrackKeysRef.current.clear();
      setResolvedTrackOverrides({});
      if (source === "manual") {
        setQqCookieDraft("");
      }
      appendLog(
        status.playbackKeyReady ? "success" : "info",
        status.playbackKeyReady ? "QQ 音乐播放授权已保存" : "QQ 音乐账号态已保存",
        status.playbackKeyReady
          ? "已检测到播放票据"
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
      resolvingTrackKeysRef.current.clear();
      setResolvedTrackOverrides({});
      appendLog("info", "QQ 音乐 Cookie 已清除");
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : "QQ Cookie 清除失败。";

      setError(errorMessage);
      appendLog("error", "QQ Cookie 清除失败", errorMessage);
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
      audioUnlockElementRef.current ?? new Audio("/audio/local-focus.wav");

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

    unlockBrowserAudioPlayback();
    planningRequestInFlightRef.current = true;
    setPlanningCopy(getPlanningCopy(userMessage));
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
        text: userMessage
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
        appendLog("success", "Z 已回复", "普通聊天，不触发播放");
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createMessageId(),
            role: "assistant",
            text: response.message
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
          plan: state.currentPlan ?? undefined
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
          text: errorMessage
        }
      ]);
    } finally {
      planningRequestInFlightRef.current = false;
      setIsPlanning(false);
    }
  }

  useEffect(() => {
    Promise.all([loadNowPlaying(), loadHistory(), loadQueue()])
      .then(async () => {
        appendLog("success", "核心数据读取完成", "/api/now + /api/history + /api/queue");

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
          }),
          loadQqLoginStatus().catch((requestError) => {
            const errorMessage =
              requestError instanceof Error ? requestError.message : "QQ 音源状态读取失败。";

            appendLog("error", "QQ 音源状态读取失败", errorMessage);
          })
        ]);
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
      historyEntries={historyEntries}
      isLoading={isLoading}
      isLandingChat={!hasEnteredRadio}
      isPlanning={isPlanning}
      message={draftMessage}
      messages={messages}
      onClose={() => setIsChatOpen(false)}
      onLoadMoreHistory={loadMoreChatHistory}
      onOpenAgentProfile={() => {
        if (!hasEnteredRadio) {
          return;
        }

        setIsChatOpen(false);
        setAppView("agent");
      }}
      onMessageChange={setDraftMessage}
      onSend={generateSegment}
      plan={plan}
      planningInputText={planningCopy.input}
      planningText={planningCopy.bubble}
      visibleHistoryEntryCount={visibleHistoryEntryCount}
    />
  ) : null;
  const enterRadioView = (view: AppView) => {
    setAppView(view);
    setHasEnteredRadio(true);
    setIsChatOpen(false);
  };

  if (!hasEnteredRadio) {
    return (
      <>
        {sharedAudioPlayers}
        {playbackToast ? (
          <p aria-live="assertive" className="playbackToast" role="alert">
            {playbackToast}
          </p>
        ) : null}
        {isSpeaking && activeDjText ? <DjSpeechBubble text={activeDjText} /> : null}
        <LandingPage
          draftMessage={draftMessage}
          error={error}
          isLoginBusy={isQqWebLoginBusy}
          isPlanning={isPlanning}
          onDraftMessageChange={setDraftMessage}
          onEnter={enterRadioView}
          onLogin={() => void openQqDesktopLogin()}
          onBuyTokens={() => setError("Token 购买功能尚未接入。")}
          onOpenChat={() => setIsChatOpen(true)}
          onSend={() => {
            if (!draftMessage.trim() || isPlanning) {
              return;
            }

            void generateSegment();
          }}
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
          status={qqLoginStatus}
        />
        {chatWindow}
      </>
    );
  }

  return (
    <main className="pageShell">
      <section className="radioFrame">
        {sharedAudioPlayers}

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
            onLogin={() => void openQqDesktopLogin()}
            status={qqLoginStatus}
          />
        ) : appView === "settings" ? (
          <section className="settingsPage" aria-label="设置">
            <div className="settingsIntro">
              <p>SETTING</p>
              <span>播放记录、QQ 授权和运行状态都放在这里。</span>
            </div>

            <div className="settingsScrollArea">
              <HistorySection
                entries={historyEntries}
                isOpen={isHistoryOpen}
                onToggle={() => setIsHistoryOpen((isOpen) => !isOpen)}
              />

              <QqSourceSection
                cookieDraft={qqCookieDraft}
                isOpen={isQqSourceOpen}
                isSaving={isQqSaving}
                onClear={() => void clearQqCookie()}
                onCookieChange={setQqCookieDraft}
                onDesktopLogin={() => void openQqDesktopLogin()}
                onSave={() => void saveQqCookie()}
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
                    onChange={(event) => seekPlayback(Number(event.target.value))}
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
  );
}

function DjSpeechBubble({ text }: { text: string }) {
  /* Figma node 204:1755 精准还原
     Frame: 400×72 | radius:54 | bg:#303034 | padding:12 20 12 12 | gap:12
     Avatar: 48×48 圆形 | Text: PingFang SC 400 14px #ffffff */
  return (
    <aside
      aria-live="polite"
      className="djSpeechBubble"
      data-node-id="204:1755"
      role="status"
    >
      {/* Avatar 头像 — Figma node 204:1756, 48×48, 圆形 */}
      <img
        alt="Redio DJ"
        className="djSpeechBubbleAvatar"
        data-node-id="204:1756"
        src="/images/agent-dj.png"
      />
      {/* 播报文案 — Figma node Text, PingFang SC 400 14px #fff */}
      <p data-node-id="204:1757">{text}</p>
      {/* Waveform 已移除：Figma 204:1755 无此元素 */}
    </aside>
  );
}

function LandingPage({
  draftMessage,
  error,
  isLoginBusy,
  isPlanning,
  onBuyTokens,
  onDraftMessageChange,
  onEnter,
  onLogin,
  onOpenChat,
  onSend,
  player,
  status
}: {
  draftMessage: string;
  error: string | null;
  isLoginBusy: boolean;
  isPlanning: boolean;
  onBuyTokens: () => void;
  onDraftMessageChange: (message: string) => void;
  onEnter: (view: AppView) => void;
  onLogin: () => void;
  onOpenChat: () => void;
  onSend: () => void;
  player: CircularQueuePlayerProps;
  status: QqLoginStatus | null;
}) {
  const accountLabel = status?.nickname ?? status?.userId ?? "账号昵称";
  const isLoggedIn = status?.loggedIn === true;

  return (
    <main className={`landingPage ${isLoggedIn ? "isLoggedIn" : ""}`} data-node-id="164:1145">
      <header className="landingNav" data-node-id="164:1146">
        <button
          aria-label="Redio 首页"
          className="landingBrand"
          onClick={onOpenChat}
          type="button"
        >
          Redio
        </button>

        <nav aria-label="主要导航" className="landingLinks" data-node-id="164:1629">
          <button aria-current="page" onClick={() => onEnter("radio")} type="button">
            Home
          </button>
          <button onClick={() => onEnter("radio")} type="button">
            Playlist
          </button>
          <button onClick={() => onEnter("settings")} type="button">
            Setting
          </button>
          <button onClick={() => onEnter("agent")} type="button">
            About
          </button>
        </nav>

        {isLoggedIn ? (
          <button
            aria-label={`当前登录账号：${accountLabel}`}
            className="landingAccount"
            data-node-id="164:2604"
            onClick={() => onEnter("agent")}
            type="button"
          >
            <img
              alt=""
              onError={(event) => {
                event.currentTarget.src = "/images/redio-account-placeholder.png";
              }}
              referrerPolicy="no-referrer"
              src={status.avatarUrl ?? "/images/redio-account-placeholder.png"}
            />
            <span>{accountLabel}</span>
          </button>
        ) : (
          <button
            className="landingJoin"
            data-node-id="164:1634"
            disabled={isLoginBusy}
            onClick={onLogin}
            type="button"
          >
            {isLoginBusy ? "Waiting for Login" : "Join the Radio"}
          </button>
        )}
      </header>

      {error ? (
        <p aria-live="polite" className="landingStatusNotice">
          {error}
        </p>
      ) : null}

      <section className="landingHero" data-node-id="164:1156">
        {isLoggedIn ? <BuyTokensButton onClick={onBuyTokens} /> : null}

        {isLoggedIn ? (
          <CircularQueuePlayer {...player} />
        ) : (
          <div className="landingHeroCopy" data-node-id="164:1638">
            <h1 data-node-id="164:1639">Music&apos;s</h1>
            <p data-node-id="164:1640">你的心情，自有频率</p>
          </div>
        )}

        {isLoggedIn ? (
          <form
            className="landingAsk"
            data-node-id="164:1161"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <input
              aria-label="对 Redio 说点什么"
              disabled={isPlanning}
              onChange={(event) => onDraftMessageChange(event.target.value)}
              placeholder="Ask Anything"
              value={draftMessage}
            />
            <button
              aria-label="发送"
              disabled={isPlanning}
              type="submit"
            >
              <img alt="" aria-hidden="true" src="/images/redio-landing-send.svg" />
            </button>
          </form>
        ) : null}
      </section>

      <img
        alt=""
        aria-hidden="true"
        className="landingGlow"
        data-node-id="164:1648"
        src="/images/redio-landing-ellipse.svg"
      />
      <img
        alt=""
        aria-hidden="true"
        className="landingStars"
        data-node-id="164:1649"
        src="/images/redio-landing-starfield.svg"
      />
      <StarfieldCanvas />
    </main>
  );
}

function BuyTokensButton({ onClick }: { onClick: () => void }) {
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
    startAnimation();
    return stopAnimation;
  }, []);

  return (
    <div className="landingBuyTokensSlot">
      <button
        aria-label="Buy tokens"
        className="button-gradient visible"
        onClick={onClick}
        onMouseEnter={startAnimation}
        type="button"
      >
        <div className="btn-content">
          <span className="gen-btn__icon">
            <svg
              aria-hidden="true"
              fill="none"
              height="22"
              viewBox="0 0 21 21"
              width="22"
              xmlns="http://www.w3.org/2000/svg"
            >
              <mask
                height="21"
                id="mask0_buy_tokens"
                maskUnits="userSpaceOnUse"
                width="21"
                x="0"
                y="0"
              >
                <path d="M21 0H0V21H21V0Z" fill="white" />
              </mask>
              <g mask="url(#mask0_buy_tokens)">
                <path
                  d="M14.2191 12.4788L12.6428 12.8979C11.2852 13.2714 10.2283 14.3284 9.84564 15.6951L9.42652 17.2713C9.28074 17.7907 8.55182 17.7907 8.42426 17.2713L8.00514 15.6951C7.63157 14.3375 6.57466 13.2805 5.20796 12.8979L3.6317 12.4788C3.11235 12.333 3.11235 11.6041 3.6317 11.4765L5.20796 11.0574C6.56555 10.6838 7.62246 9.6269 8.00514 8.2602L8.42426 6.68394C8.57004 6.1646 9.29896 6.1646 9.42652 6.68394L9.84564 8.2602C10.2192 9.61779 11.2761 10.6747 12.6428 11.0574L14.2191 11.4765C14.7384 11.6223 14.7384 12.3512 14.2191 12.4788Z"
                  fill="white"
                />
                <path
                  d="M17.9621 5.55421L17.2697 5.73643C16.6775 5.90044 16.2128 6.36512 16.0397 6.96646L15.8574 7.65893C15.7937 7.88671 15.4748 7.88671 15.4201 7.65893L15.2379 6.96646C15.0739 6.37423 14.6092 5.90955 14.0078 5.73643L13.3154 5.55421C13.0876 5.49043 13.0876 5.17153 13.3154 5.11686L14.0078 4.93464C14.6001 4.77063 15.0647 4.30596 15.2379 3.70461L15.4201 3.01215C15.4839 2.78436 15.8028 2.78436 15.8574 3.01215L16.0397 3.70461C16.2037 4.29684 16.6683 4.76152 17.2697 4.93464L17.9621 5.11686C18.1899 5.18064 18.1899 5.49954 17.9621 5.55421Z"
                  fill="white"
                />
              </g>
            </svg>
          </span>
          <span>Buy tokens</span>
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
  const dragStartXRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(0);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolumePopoverOpen, setIsVolumePopoverOpen] = useState(false);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = Math.round(volume * 100);
  const isMuted = volume <= 0;
  const visibleTracks = tracks
    .map((track, index) => ({ index, offset: index - selectedTrackIndex, track }))
    .filter(({ offset }) => Math.abs(offset) <= 4);

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
    const dragStartX = dragStartXRef.current;

    if (dragStartX === null) {
      return;
    }

    const deltaX = event.clientX - dragStartX;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStartXRef.current = null;
    setDragOffset(0);
    setIsDragging(false);

    if (!shouldNavigate || Math.abs(deltaX) < 48) {
      return;
    }

    suppressClickUntilRef.current = Date.now() + 250;

    if (deltaX > 0) {
      onPrevious();
    } else {
      onNext();
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
        onPointerCancel={(event) => finishDrag(event, false)}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          dragStartXRef.current = event.clientX;
          setDragOffset(0);
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragStartXRef.current === null) {
            return;
          }

          const nextOffset = event.clientX - dragStartXRef.current;

          setDragOffset(Math.max(-140, Math.min(140, nextOffset)));
        }}
        onPointerUp={(event) => finishDrag(event, true)}
        role="group"
        style={{ "--queue-drag-x": `${dragOffset}px` } as CSSProperties}
      >
        <div className="queueOrbitTrack">
          {visibleTracks.map(({ index, offset, track }) => {
            const absoluteOffset = Math.abs(offset);
            const xOffsets = [0, 330, 585, 755, 900];
            const yOffsets = [0, 100, 250, 470, 690];
            const direction = offset < 0 ? -1 : 1;
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
                  absoluteOffset === 4 ? "isBuffer" : ""
                } ${!isTrackPlayable(track) ? "isUnavailable" : ""}`}
                key={getPlayableTrackIdentity(track, index)}
                onClick={() => {
                  if (Date.now() < suppressClickUntilRef.current || offset === 0) {
                    return;
                  }

                  onSelectTrack(index);
                }}
                style={
                  {
                    "--queue-cover-rotation": `${offset * 20}deg`,
                    "--queue-cover-x": `${direction * xOffsets[absoluteOffset]}px`,
                    "--queue-cover-y": `${yOffsets[absoluteOffset]}px`,
                    zIndex: 10 - absoluteOffset
                  } as CSSProperties
                }
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
              <img alt="" aria-hidden="true" src="/images/redio-player-like.svg" />
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
                    src="/images/redio-volume-control-bg.svg"
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
                            ? "/images/redio-volume-muted.svg"
                            : "/images/redio-volume-sound.svg"
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
              onChange={(event) => onSeek(Number(event.target.value))}
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
  cookieDraft,
  isDesktop,
  isOpen,
  isSaving,
  isWebLoginBusy,
  onClear,
  onCookieChange,
  onDesktopLogin,
  onSave,
  onToggle,
  status
}: {
  cookieDraft: string;
  isDesktop: boolean;
  isOpen: boolean;
  isSaving: boolean;
  isWebLoginBusy: boolean;
  onClear: () => void;
  onCookieChange: (value: string) => void;
  onDesktopLogin: () => void;
  onSave: () => void;
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

  return (
    <section className="sourceSection" aria-label="QQ 音源">
      <button className="sourceHeader" onClick={onToggle} type="button">
        <span>QQ 音源</span>
        <strong>{statusText}</strong>
      </button>
      {isOpen ? (
        <div className="sourcePanel">
          <p>
            {isDesktop
              ? "桌面客户端可以打开 QQ 音乐官方窗口扫码登录。Cookie 只保存在本机 data 目录，不会展示回页面。"
              : "当前浏览器版需要手动导入 QQ 音乐 Cookie。Cookie 只保存在本机 data 目录，不会展示回页面。"}
          </p>
          <div className="sourceStatusGrid">
            <span>账号</span>
            <strong>{status?.nickname ?? status?.userId ?? "未登录"}</strong>
            <span>播放票据</span>
            <strong>{status?.playbackKeyReady ? "已检测到" : "未检测到"}</strong>
          </div>
          <div className="sourceLoginBlock">
            <button
              className="sourceLoginButton"
              disabled={isSaving || isWebLoginBusy}
              onClick={onDesktopLogin}
              type="button"
            >
              {isWebLoginBusy
                ? "等待扫码"
                : isDesktop
                  ? "扫码登录 QQ 音乐"
                  : "桌面端扫码登录"}
            </button>
            <small>
              {isDesktop
                ? "退出账号后可以从这里重新打开 QQ 音乐登录窗口。"
                : "当前是浏览器预览，扫码登录需要在桌面客户端中使用；也可以继续手动粘贴 Cookie。"}
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
            <button disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? "保存中" : "保存 Cookie"}
            </button>
            <button disabled={isSaving || !status?.hasCookie} onClick={onClear} type="button">
              清除
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
          {visibleEntries.map((entry) => (
            <article className={`logItem is-${entry.level}`} key={entry.id}>
              <div>
                <span>{formatLogTime(entry.createdAt)}</span>
                <strong>{entry.message}</strong>
              </div>
              {entry.detail ? <p>{entry.detail}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AskDock({
  disabled,
  isPlanning,
  message,
  onFocus,
  onMessageChange,
  onSend,
  planningInputText,
  showMicButton = false
}: {
  disabled: boolean;
  isPlanning: boolean;
  message: string;
  onFocus: () => void;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  planningInputText: string;
  showMicButton?: boolean;
}) {
  function handleSubmit() {
    if (!disabled) {
      onSend();
    }
  }

  return (
    <div className="askDock">
      <input
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
        placeholder="Ask Anything"
        value={isPlanning ? planningInputText : message}
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
        className="sendButton"
        disabled={disabled}
        onClick={handleSubmit}
        type="button"
      >
        <MessageSendIcon />
      </button>
    </div>
  );
}

function ChatWindow({
  error,
  historyEntries,
  isLoading,
  isLandingChat,
  isPlanning,
  message,
  messages,
  onClose,
  onLoadMoreHistory,
  onOpenAgentProfile,
  onMessageChange,
  onSend,
  plan,
  planningInputText,
  planningText,
  visibleHistoryEntryCount
}: {
  error: string | null;
  historyEntries: PlaybackHistoryEntry[];
  isLoading: boolean;
  isLandingChat: boolean;
  isPlanning: boolean;
  message: string;
  messages: ChatMessage[];
  onClose: () => void;
  onLoadMoreHistory: () => void;
  onOpenAgentProfile: () => void;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  plan: DjPlan | null | undefined;
  planningInputText: string;
  planningText: string;
  visibleHistoryEntryCount: number;
}) {
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const previousVisibleHistoryCountRef = useRef(visibleHistoryEntryCount);
  const [expandedTrackMessageIds, setExpandedTrackMessageIds] = useState<Set<string>>(
    () => new Set()
  );
  const liveUserMessageCounts = messages
    .filter((chatMessage) => chatMessage.role === "user")
    .reduce((counts, chatMessage) => {
      counts.set(chatMessage.text, (counts.get(chatMessage.text) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  const historyMessages = historyEntries
    .filter((entry) => {
      if (!entry.userMessage) {
        return true;
      }

      const remainingLiveCount = liveUserMessageCounts.get(entry.userMessage) ?? 0;

      if (remainingLiveCount <= 0) {
        return true;
      }

      liveUserMessageCounts.set(entry.userMessage, remainingLiveCount - 1);
      return false;
    })
    .slice(0, visibleHistoryEntryCount)
    .reverse()
    .flatMap((entry) => {
      const entryPlan: DjPlan = {
        episode: entry.episode,
        say: entry.say,
        play: entry.play,
        reason: entry.reason,
        segue: entry.segue
      };
      const restoredMessages: ChatMessage[] = [];

      if (entry.userMessage) {
        restoredMessages.push({
          id: `${entry.id}-user`,
          role: "user",
          text: entry.userMessage
        });
      }

      restoredMessages.push({
        id: `${entry.id}-assistant`,
        role: "assistant",
        text: entry.say,
        plan: entryPlan
      });

      return restoredMessages;
    });
  const visibleMessages =
    historyMessages.length > 0 || messages.length > 0
      ? [...historyMessages, ...messages]
      : [
          {
            id: "intro",
            role: "assistant" as const,
            text: isLoading
              ? "正在读取本地电台状态..."
              : plan?.say ?? "我已经准备好根据你的资料生成下一段节目。",
            plan: plan ?? undefined
          }
      ];
  const hasMoreHistory = visibleHistoryEntryCount < historyEntries.length;
  const latestMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? "";

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

    const isLoadingMoreHistory =
      visibleHistoryEntryCount > previousVisibleHistoryCountRef.current;

    previousVisibleHistoryCountRef.current = visibleHistoryEntryCount;

    if (isLoadingMoreHistory) {
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
  }, [latestMessageId, isPlanning, visibleHistoryEntryCount]);

  return (
    <section className={`chatWindow ${isLandingChat ? "isLandingChat" : ""}`}>
      <header className="chatHeader">
        <div>
          <RedioMarkIcon />
          <h2>Redio</h2>
        </div>
        <button
          aria-label="关闭对话"
          onClick={onClose}
          type="button"
        >
          <img
            alt=""
            aria-hidden="true"
            className="chatCollapseIcon"
            src="/images/redio-chat-collapse.svg"
          />
        </button>
      </header>

      <div
        className="chatMessages"
        ref={chatMessagesRef}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop <= 12 && hasMoreHistory) {
            onLoadMoreHistory();
          }
        }}
      >
        {hasMoreHistory ? (
          <button className="loadMoreHistory" onClick={onLoadMoreHistory} type="button">
            上滑加载更早会话
          </button>
        ) : null}
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
            <div>
              <small>{chatMessage.role === "user" ? "Me" : "Redio"}</small>
              <p>
                {chatMessage.role === "assistant" ? (
                  <TypewriterText text={getAssistantBubbleText(chatMessage)} />
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
            <div>
              <small>Redio</small>
              <p>{planningText}</p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="chatReason">{error}</p> : null}

      {!isLandingChat ? (
        <AskDock
          disabled={isPlanning}
          isPlanning={isPlanning}
          message={message}
          onFocus={() => undefined}
          onMessageChange={onMessageChange}
          onSend={onSend}
          planningInputText={planningInputText}
          showMicButton
        />
      ) : null}
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

function TypewriterText({ text }: { text: string }) {
  const [visibleLength, setVisibleLength] = useState(text.length);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (hasMountedRef.current) {
      setVisibleLength(text.length);
      return;
    }

    hasMountedRef.current = true;
    setVisibleLength(0);

    if (!text) {
      return;
    }

    let nextLength = 0;
    const interval = window.setInterval(() => {
      nextLength += 1;
      setVisibleLength(nextLength);

      if (nextLength >= text.length) {
        window.clearInterval(interval);
      }
    }, 18);

    return () => window.clearInterval(interval);
  }, [text]);

  const isTyping = visibleLength < text.length;

  return (
    <>
      <span>{text.slice(0, visibleLength)}</span>
      {isTyping ? <span aria-hidden="true" className="typewriterCursor" /> : null}
    </>
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
