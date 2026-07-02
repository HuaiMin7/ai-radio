import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";

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
  playbackKeyReady: boolean;
  message?: string;
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

type AppView = "radio" | "settings";

type PlayableTrack = Track & {
  audioLabel: string;
  audioUrl: string;
  source: "local" | "netease" | "qq";
  djIntro?: string;
  matchedTitle?: string;
  matchedArtist?: string;
  externalUrl?: string;
  playbackStatus?: "full" | "unverified" | "fallback" | "failed";
  isFallback?: boolean;
  failureReason?: string;
};

const djDuckingRatio = 0.5;
const musicIntentPattern =
  /(推|推荐|听|放|播|来|歌|音乐|歌单|曲|适合|心情|开车|通勤|睡|阅读|工作|学习|下雨|夜晚|早上|午后|轻松|安静|兴奋|emo|治愈)/i;

const fallbackTracks: PlayableTrack[] = [
  {
    title: "Local Focus Loop",
    artist: "Redio Lab",
    audioLabel: "本地测试音频 A",
    audioUrl: "/audio/local-focus.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Local Night Loop",
    artist: "Redio Lab",
    audioLabel: "本地测试音频 B",
    audioUrl: "/audio/local-night.wav",
    source: "local",
    playbackStatus: "fallback",
    isFallback: true,
    failureReason: "本地测试音频，不代表真实推荐歌曲已解析成功"
  },
  {
    title: "Warm Static",
    artist: "Redio Lab",
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

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

function shouldRefreshProviderTrack(track: PlayableTrack) {
  if (track.playbackStatus === "full" && !track.isFallback) {
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

function isTrackPlayable(track: PlayableTrack) {
  return Boolean(track.audioUrl && track.playbackStatus !== "failed");
}

function findNextPlayableTrackIndex(tracks: PlayableTrack[], startIndex: number) {
  for (let index = startIndex + 1; index < tracks.length; index += 1) {
    if (isTrackPlayable(tracks[index])) {
      return index;
    }
  }

  return -1;
}

function findPreviousPlayableTrackIndex(tracks: PlayableTrack[], startIndex: number) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (isTrackPlayable(tracks[index])) {
      return index;
    }
  }

  return -1;
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

function VolumeIcon({ color = "white" }: { color?: string }) {
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
      <path
        d="M9.97456 5.60423C10.2005 5.36181 10.5801 5.34843 10.8226 5.57436C11.4229 6.13387 11.9904 6.92913 11.9904 8.01331C11.9904 9.07394 11.4434 9.85032 10.8726 10.4047C10.6349 10.6356 10.255 10.63 10.0241 10.3923C9.79326 10.1546 9.79881 9.77472 10.0365 9.54386C10.4886 9.10483 10.7904 8.61931 10.7904 8.01331C10.7904 7.39079 10.4749 6.89068 10.0044 6.45223C9.76202 6.22631 9.74864 5.84664 9.97456 5.60423Z"
        fill={color}
      />
      <path
        d="M12.8587 4.07678C12.6287 3.83825 12.2489 3.83135 12.0103 4.06137C11.7718 4.29139 11.7649 4.67122 11.9949 4.90976C12.844 5.79026 13.4646 6.63312 13.4646 8.05612C13.4646 9.42443 12.8818 10.2296 12.0872 11.1039C11.8644 11.3491 11.8825 11.7286 12.1277 11.9515C12.373 12.1743 12.7524 12.1562 12.9753 11.9109C13.8376 10.9621 14.6646 9.87443 14.6646 8.05612C14.6646 6.1724 13.7901 5.04264 12.8587 4.07678Z"
        fill={color}
      />
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

function ChatStatusBars() {
  return (
    <span aria-hidden="true" className="chatStatusBars">
      <i />
      <i />
      <i />
      <i />
    </span>
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
  const selectedTrackKeyRef = useRef("");
  const songVolumeAnimationRef = useRef<number | null>(null);
  const browserAudioUnlockedRef = useRef(false);
  const audioUnlockElementRef = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleHistoryEntryCount, setVisibleHistoryEntryCount] = useState(5);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [playbackRequestId, setPlaybackRequestId] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
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
  const [queueTracks, setQueueTracks] = useState<QueueTrack[]>([]);
  const [historyEntries, setHistoryEntries] = useState<PlaybackHistoryEntry[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<TrackFeedbackEntry[]>([]);
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
    setQueueTracks(entries);
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
      setError("歌曲播放器还没有准备好。");
      return false;
    }

    if (!isTrackPlayable(selectedTrack)) {
      const errorMessage =
        selectedTrack.failureReason ?? "这首歌暂时没有可播放 QQ 音源。";

      setError(errorMessage);
      appendLog(
        "error",
        "歌曲无法播放",
        `${selectedTrack.title} / ${selectedTrack.artist} · ${errorMessage}`
      );
      return false;
    }

    try {
      await audio.play();
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
    setSongDucking(false);
  }

  function toPlayableTrack(track: DjPlan["play"][number]): PlayableTrack | null {
    if (!track.title || !track.artist) {
      return null;
    }

    return {
      title: track.title,
      artist: track.artist,
      audioLabel: track.audioLabel ?? "本地测试音频",
      audioUrl: track.audioUrl ?? "",
      source: track.source ?? "local",
      djIntro: track.intro,
      matchedTitle: track.matchedTitle,
      matchedArtist: track.matchedArtist,
      externalUrl: track.externalUrl,
      playbackStatus: track.playbackStatus,
      isFallback: track.isFallback,
      failureReason: track.failureReason
    };
  }

  function readRecommendedTracks() {
    const recommendedTracks: PlayableTrack[] = [];
    const seenTrackKeys = new Set<string>();

    function addTrack(track: PlayableTrack | null) {
      if (!track) {
        return;
      }

      const key = getPlayableTrackKey(track);

      if (seenTrackKeys.has(key)) {
        return;
      }

      seenTrackKeys.add(key);
      const resolvedTrack = resolvedTrackOverrides[key];

      recommendedTracks.push(
        resolvedTrack
          ? {
              ...resolvedTrack,
              djIntro: track.djIntro
            }
          : track
      );
    }

    if (queueTracks.length > 0) {
      for (const track of queueTracks) {
        addTrack(toPlayableTrack(track));
      }

      return recommendedTracks;
    }

    if (plan?.play.length) {
      for (const track of plan.play) {
        addTrack(toPlayableTrack(track));
      }
    }

    return recommendedTracks;
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
      await audio.play();
      setError(null);
      appendLog("success", "DJ 文案开始播报", tts.provider);
      return true;
    } catch (requestError) {
      setIsSpeaking(false);
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
      void loadQueue();
      const firstTrack = state.currentPlan?.play[0];
      const firstPlayableTrackIndex = state.currentPlan?.play.findIndex(
        (track) => track.audioUrl && track.playbackStatus !== "failed"
      ) ?? -1;
      const firstPlayableTrack =
        firstPlayableTrackIndex >= 0
          ? state.currentPlan?.play[firstPlayableTrackIndex]
          : undefined;
      const hasPlayableTrack = Boolean(firstPlayableTrack);
      const firstDjIntro = firstPlayableTrack?.intro ?? state.currentPlan?.say;
      const hasDjCopy = Boolean(firstDjIntro?.trim());

      if (hasPlayableTrack) {
        setSelectedTrackIndex(firstPlayableTrackIndex);
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
  const tracks = readRecommendedTracks();
  const selectedTrack = tracks[selectedTrackIndex] ?? fallbackTracks[0];
  const selectedTrackKey = getPlayableTrackKey(selectedTrack);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    selectedTrackKeyRef.current = selectedTrackKey;
  }, [selectedTrackKey]);

  useEffect(() => {
    const nextTracks = readRecommendedTracks();
    const firstPlayableTrackIndex = nextTracks.findIndex(isTrackPlayable);

    setSelectedTrackIndex(firstPlayableTrackIndex >= 0 ? firstPlayableTrackIndex : 0);
  }, [plan, queueTracks]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);

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
          ? new URL(resolvedTrack.audioUrl, window.location.href).href
          : "";
        const wasPlaying = !!audio && !audio.paused;

        setError(playbackWarning);

        if (audio && resolvedTrack.playbackStatus === "full" && audio.src !== resolvedAudioUrl) {
          audio.src = resolvedTrack.audioUrl;
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

  function selectTrack(index: number) {
    const track = tracks[index];

    if (track && !isTrackPlayable(track)) {
      setError(track.failureReason ?? "这首歌暂时没有可播放 QQ 音源。");
    }

    setSelectedTrackIndex(index);
  }

  function playTrackAt(index: number, shouldStartPlayback = true) {
    const track = tracks[index];

    if (!track) {
      return;
    }

    if (!isTrackPlayable(track)) {
      setError(track.failureReason ?? "这首歌暂时没有可播放 QQ 音源。");
      return;
    }

    setSelectedTrackIndex(index);

    if (shouldStartPlayback) {
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
    const previousTrackIndex = findPreviousPlayableTrackIndex(tracks, selectedTrackIndex);

    if (previousTrackIndex !== -1) {
      playTrackAt(previousTrackIndex);
    }
  }

  function playNextTrack() {
    const nextTrackIndex = findNextPlayableTrackIndex(tracks, selectedTrackIndex);

    if (nextTrackIndex !== -1) {
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
    const nextTrackIndex = findNextPlayableTrackIndex(tracks, selectedTrackIndex);

    if (nextTrackIndex === -1) {
      setIsPlaying(false);
      return;
    }

    const nextTrack = tracks[nextTrackIndex];

    setSelectedTrackIndex(nextTrackIndex);
    requestTrackPlayback(nextTrack?.djIntro);
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

    setError(errorMessage);
    setIsPlaying(false);
    appendLog(
      "error",
      "歌曲播放失败",
      `${selectedTrack.title} / ${selectedTrack.artist} · ${errorMessage}`
    );

    const nextTrackIndex = findNextPlayableTrackIndex(tracks, selectedTrackIndex);

    if (nextTrackIndex !== -1) {
      const nextTrack = tracks[nextTrackIndex];

      setSelectedTrackIndex(nextTrackIndex);
      requestTrackPlayback(nextTrack?.djIntro);
    }
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
        setError("当前歌曲无法播放，请换一首或重新解析 QQ 音源。");
      }
    } catch {
      setError("当前歌曲无法播放，请换一首或重新解析 QQ 音源。");
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

  return (
    <main className="pageShell">
      <section className="radioFrame">
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
          src={selectedTrack.audioUrl}
        />
        <audio
          onEnded={handleDjPlaybackEnded}
          onPause={handleDjPlaybackStopped}
          onPlay={handleDjPlaybackStarted}
          preload="auto"
          ref={djAudioRef}
        />

        <header className="radioTop">
          <h1>Redio</h1>
          <button
            className="settingsTopButton"
            onClick={() => setAppView((view) => (view === "settings" ? "radio" : "settings"))}
            type="button"
          >
            {appView === "settings" ? "BACK" : "SETTING"}
          </button>
          <span>{formatClock()}</span>
        </header>

        {appView === "settings" ? (
          <section className="settingsPage" aria-label="设置">
            <div className="settingsIntro">
              <p>SETTING</p>
              <span>播放记录、QQ 授权和运行状态都放在这里。</span>
            </div>

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
                          onChange={(event) => setVolume(Number(event.target.value))}
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

            {isChatOpen ? (
              <ChatWindow
                error={error}
                historyEntries={historyEntries}
                isLoading={isLoading}
                isPlanning={isPlanning}
                message={draftMessage}
                messages={messages}
                onLoadMoreHistory={loadMoreChatHistory}
                onClose={() => setIsChatOpen(false)}
                onMessageChange={setDraftMessage}
                onSend={generateSegment}
                plan={plan}
                planningInputText={planningCopy.input}
                planningText={planningCopy.bubble}
                visibleHistoryEntryCount={visibleHistoryEntryCount}
              />
            ) : null}
          </>
        )}
      </section>
    </main>
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
  isPlanning,
  message,
  messages,
  onClose,
  onLoadMoreHistory,
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
  isPlanning: boolean;
  message: string;
  messages: ChatMessage[];
  onClose: () => void;
  onLoadMoreHistory: () => void;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  plan: DjPlan | null | undefined;
  planningInputText: string;
  planningText: string;
  visibleHistoryEntryCount: number;
}) {
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const previousVisibleHistoryCountRef = useRef(visibleHistoryEntryCount);
  const liveUserMessages = new Set(
    messages
      .filter((chatMessage) => chatMessage.role === "user")
      .map((chatMessage) => chatMessage.text)
  );
  const historyMessages = historyEntries
    .filter((entry) => !entry.userMessage || !liveUserMessages.has(entry.userMessage))
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
    <section className="chatWindow">
      <header className="chatHeader">
        <div>
          <RedioMarkIcon />
          <h2>Redio</h2>
        </div>
        <button aria-label="关闭对话" onClick={onClose} type="button">
          <ChatStatusBars />
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
            {chatMessage.role === "assistant" ? <div className="avatar" /> : null}
            <div>
              <small>{chatMessage.role === "user" ? "Me" : "Redio"}</small>
              <p>{chatMessage.text}</p>
              {chatMessage.plan?.play.length ? (
                <div className="trackCardList">
                  {chatMessage.plan.play.map((track, index) => (
                    <div className="trackCard" key={`${track.title}-${index}`}>
                      <span>推荐歌曲 {chatMessage.plan?.play.length === 1 ? "" : index + 1}</span>
                      <strong>{track.title}</strong>
                      <em>
                        {track.artist}
                        {track.audioLabel ? ` · ${track.audioLabel}` : ""}
                        {` · ${getPlaybackStatusLabel(track)}`}
                      </em>
                      {track.matchedTitle && track.matchedTitle !== track.title ? (
                        <em>
                          命中：{track.matchedTitle}
                          {track.matchedArtist ? ` / ${track.matchedArtist}` : ""}
                        </em>
                      ) : null}
                      {track.failureReason ? <em>{track.failureReason}</em> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {chatMessage.role === "user" ? <div className="avatar" /> : null}
          </div>
        ))}

        {isPlanning ? (
          <div className="message inbound">
            <div className="avatar" />
            <div>
              <small>Redio</small>
              <p>{planningText}</p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="chatReason">{error}</p> : null}

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
    </section>
  );
}
