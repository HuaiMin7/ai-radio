import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  clearAuthenticatedUser,
  readAuthenticatedUser,
  revokeUserSessions,
  setAuthenticatedUser,
  type AuthenticatedUser
} from "./auth.js";
import { generateAiTurn } from "./brain.js";
import { appendChatTurn, readChatHistory } from "./chat.js";
import { buildPromptContext, loadUserProfile } from "./context.js";
import {
  appendTrackFeedback,
  readTrackFeedback,
  type FeedbackAction
} from "./feedback.js";
import { readPlaybackHistory } from "./history.js";
import { resolvePlayableTrack } from "./music.js";
import { readPlaybackQueue } from "./queue.js";
import {
  authenticateAndSaveQqCookie,
  clearQqCookie,
  getQqLoginStatus,
  resolveQqLyrics,
  searchQqSongs
} from "./qq-music.js";
import { createQqQrLogin, pollQqQrLogin } from "./qq-login.js";
import { getNowPlaying, getPublicNowPlaying, setCurrentPlan } from "./state.js";
import {
  getSpeechAudioContentType,
  readSpeechAudio,
  synthesizeSpeech
} from "./tts.js";
import { getWeatherSnapshot } from "./weather.js";

type Handler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>;

const defaultAllowedCorsOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
];
const publicRateLimitPaths = new Set([
  "/api/plan",
  "/api/tts",
  "/api/qq/login/cookie",
  "/api/qq/login/qr"
]);
const rateLimitBuckets = new Map<
  string,
  {
    count: number;
    windowStartedAt: number;
  }
>();
const maxJsonBodyBytes = 32 * 1024;

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendJsonWithCors(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  origin: string | undefined
) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    ...(isAllowedCorsOrigin(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true"
        }
      : {}),
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendAudio(
  response: ServerResponse,
  body: Buffer,
  contentType: string,
  origin: string | undefined
) {
  response.writeHead(200, {
    ...(isAllowedCorsOrigin(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true"
        }
      : {}),
    "Vary": "Origin",
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  response.end(body);
}

function sendAudioProxyError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  origin: string | undefined
) {
  response.writeHead(statusCode, {
    ...(isAllowedCorsOrigin(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true"
        }
      : {}),
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify({ error: message }, null, 2));
}

async function proxyAudioUrl(
  request: IncomingMessage,
  response: ServerResponse,
  targetUrl: string,
  origin: string | undefined
) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    sendAudioProxyError(response, 400, "Invalid audio URL", origin);
    return;
  }

  if (!isAllowedAudioProxyUrl(parsedUrl)) {
    sendAudioProxyError(response, 403, "Audio proxy host is not allowed", origin);
    return;
  }

  const upstreamResponse = await fetch(parsedUrl, {
    headers: {
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: "https://y.qq.com/",
      Origin: "https://y.qq.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      ...(request.headers.range ? { Range: request.headers.range } : {})
    }
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    sendAudioProxyError(
      response,
      upstreamResponse.status,
      `Audio upstream failed: ${upstreamResponse.status}`,
      origin
    );
    return;
  }

  const headers: Record<string, string> = {
    ...(isAllowedCorsOrigin(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true"
        }
      : {}),
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };

  for (const headerName of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type"
  ]) {
    const headerValue = upstreamResponse.headers.get(headerName);

    if (headerValue) {
      headers[headerName] = headerValue;
    }
  }

  response.writeHead(upstreamResponse.status, headers);

  if (!upstreamResponse.body) {
    response.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(response);
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, {
    error: "Not found"
  });
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maxJsonBodyBytes) {
      throw new RequestError(413, "Request body is too large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError(400, "Invalid JSON body");
  }
}

function readUserMessage(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return undefined;
}

class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function isAllowedCorsOrigin(origin: string | undefined): origin is string {
  if (typeof origin !== "string") {
    return false;
  }

  const configuredOrigins = (process.env.AI_RADIO_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([...defaultAllowedCorsOrigins, ...configuredOrigins]).has(origin);
}

function isCorsRejected(origin: string | undefined) {
  return typeof origin === "string" && !isAllowedCorsOrigin(origin);
}

function isAllowedAudioProxyUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (hostname === "qq.com" || hostname.endsWith(".qq.com"))
  );
}

function isPublicDemo() {
  return process.env.AI_RADIO_PUBLIC_DEMO === "1";
}

function isPublicAdminRoute(method: string | undefined, pathname: string) {
  return (
    method === "GET" &&
    ["/api/profile", "/api/context"].includes(pathname)
  );
}

function getClientAddress(request: IncomingMessage) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

  return forwardedAddress?.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
}

function isPublicRateLimited(request: IncomingMessage, pathname: string) {
  if (
    !isPublicDemo() ||
    request.method !== "POST" ||
    !publicRateLimitPaths.has(pathname)
  ) {
    return false;
  }

  const configuredLimit = Number(process.env.AI_RADIO_PUBLIC_RATE_LIMIT_PER_MINUTE ?? "12");
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit)
    : 12;
  const now = Date.now();
  const key = `${getClientAddress(request)}:${pathname}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.windowStartedAt >= 60_000) {
    rateLimitBuckets.set(key, {
      count: 1,
      windowStartedAt: now
    });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

function readTtsText(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof body.text === "string"
  ) {
    return body.text;
  }

  return undefined;
}

function readTrackRequest(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "title" in body &&
    "artist" in body &&
    typeof body.title === "string" &&
    typeof body.artist === "string"
  ) {
    return {
      title: body.title,
      artist: body.artist
    };
  }

  return undefined;
}

function isFeedbackAction(value: unknown): value is FeedbackAction {
  return value === "like" || value === "skip" || value === "replay";
}

function isTrackSource(value: unknown): value is "local" | "netease" | "qq" {
  return value === "local" || value === "netease" || value === "qq";
}

function shouldTrustStoredPlayableTrack(track: {
  audioUrl?: string;
  artist: string;
  matchedArtist?: string;
  playbackStatus?: string;
  source?: string;
}) {
  if (track.playbackStatus !== "full" || !track.audioUrl) {
    return false;
  }

  if (track.source !== "qq") {
    return true;
  }

  return isStoredQqArtistMatch(track.artist, track.matchedArtist ?? "");
}

function isStoredQqArtistMatch(requestedArtist: string, matchedArtist: string) {
  const requested = normalizeMatchValue(requestedArtist);
  const matched = normalizeMatchValue(matchedArtist);

  if (!requested || !matched) {
    return false;
  }

  return matched.includes(requested) || requested.includes(matched);
}

function normalizeMatchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function readFeedbackRequest(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    isFeedbackAction(body.action) &&
    "title" in body &&
    "artist" in body &&
    typeof body.title === "string" &&
    typeof body.artist === "string"
  ) {
    const source = "source" in body && isTrackSource(body.source) ? body.source : undefined;
    const audioLabel =
      "audioLabel" in body && typeof body.audioLabel === "string"
        ? body.audioLabel
        : undefined;

    return {
      action: body.action,
      title: body.title,
      artist: body.artist,
      source,
      audioLabel
    };
  }

  return undefined;
}

function readCookieRequest(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "cookie" in body &&
    typeof body.cookie === "string"
  ) {
    return body.cookie;
  }

  return undefined;
}

export function createRouter(rootDir: string): Handler {
  return async (request, response) => {
    const origin = request.headers.origin;

    if (isCorsRejected(origin)) {
      sendJson(response, 403, {
        error: "Origin is not allowed"
      });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJsonWithCors(response, 204, null, origin);
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    try {
      const authenticatedUser = await readAuthenticatedUser(rootDir, request);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJsonWithCors(response, 200, { ok: true }, origin);
        return;
      }

      if (isPublicRateLimited(request, url.pathname)) {
        response.setHeader("Retry-After", "60");
        sendJsonWithCors(response, 429, {
          error: "请求过于频繁，请稍后再试"
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/qq/login/status") {
        sendJsonWithCors(
          response,
          200,
          await getQqLoginStatus(rootDir, authenticatedUser),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/qq/login/qr") {
        sendJsonWithCors(response, 200, await createQqQrLogin(), origin);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/qq/login/qr/")
      ) {
        const sessionId = decodeURIComponent(
          url.pathname.replace("/api/qq/login/qr/", "")
        );
        const result = await pollQqQrLogin(rootDir, sessionId);

        if (result.state === "complete") {
          setAuthenticatedUser(request, response, result.user);
          sendJsonWithCors(
            response,
            200,
            {
              state: result.state,
              message: result.message,
              status: result.status
            },
            origin
          );
          return;
        }

        sendJsonWithCors(response, 200, result, origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/qq/login/cookie") {
        const body = await readJsonBody(request);
        const cookie = readCookieRequest(body);

        if (!cookie?.trim()) {
          sendJsonWithCors(response, 400, {
            error: "QQ Cookie is required"
          }, origin);
          return;
        }

        const authentication = await authenticateAndSaveQqCookie(rootDir, cookie);

        if (!authentication.user) {
          sendJsonWithCors(
            response,
            401,
            {
              error:
                authentication.status.message ??
                "QQ 音乐账号验证失败"
            },
            origin
          );
          return;
        }

        if (
          authenticatedUser &&
          authentication.user.storageKey !== authenticatedUser.storageKey
        ) {
          sendJsonWithCors(
            response,
            403,
            {
              error: "只能更新当前已登录音乐账号的播放凭据"
            },
            origin
          );
          return;
        }

        setAuthenticatedUser(request, response, authentication.user);
        sendJsonWithCors(response, 200, authentication.status, origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/qq/logout") {
        if (authenticatedUser) {
          await revokeUserSessions(rootDir, authenticatedUser);
          await clearQqCookie(rootDir, authenticatedUser);
        }

        clearAuthenticatedUser(request, response);
        sendJsonWithCors(
          response,
          200,
          await getQqLoginStatus(rootDir),
          origin
        );
        return;
      }

      if (isPublicDemo() && isPublicAdminRoute(request.method, url.pathname)) {
        sendJsonWithCors(response, 403, {
          error: "This management endpoint is disabled in the public demo"
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/profile") {
        requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(response, 200, await loadUserProfile(rootDir), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/now") {
        const user = requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(response, 200, getPublicNowPlaying(user), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/history") {
        const user = requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(
          response,
          200,
          await readPlaybackHistory(rootDir, user),
          origin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/chat") {
        const user = requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(
          response,
          200,
          await readChatHistory(rootDir, user),
          origin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/queue") {
        const user = requireAuthenticatedUser(authenticatedUser);
        const queue = await readPlaybackQueue(rootDir, user);
        const orderedQueue = queue
          .map((track, index) => ({ track, index }))
          .sort((left, right) => {
            const queuedAtDiff =
              Date.parse(left.track.queuedAt) - Date.parse(right.track.queuedAt);

            return queuedAtDiff || left.index - right.index;
          })
          .map(({ track }) => track);
        const playableQueue = await Promise.all(
          orderedQueue.map(async (track, index) => {
            const playableTrack =
              shouldTrustStoredPlayableTrack(track)
                ? track
                : await resolvePlayableTrack(track, index, rootDir, user);

            return {
              id: track.id,
              queuedAt: track.queuedAt,
              episode: track.episode,
              intro: track.intro,
              ...playableTrack
            };
          })
        );

        sendJsonWithCors(response, 200, playableQueue, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/feedback") {
        const user = requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(
          response,
          200,
          await readTrackFeedback(rootDir, user),
          origin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/weather") {
        sendJsonWithCors(response, 200, await getWeatherSnapshot(), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/audio/proxy") {
        requireAuthenticatedUser(authenticatedUser);
        await proxyAudioUrl(request, response, url.searchParams.get("url") ?? "", origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/qq/search") {
        requireAuthenticatedUser(authenticatedUser);
        const keywords = url.searchParams.get("keywords") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? "6");

        sendJsonWithCors(response, 200, {
          provider: "qq",
          songs: await searchQqSongs(keywords, Number.isFinite(limit) ? limit : 6)
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/lyrics") {
        requireAuthenticatedUser(authenticatedUser);
        const title = url.searchParams.get("title")?.trim() ?? "";
        const artist = url.searchParams.get("artist")?.trim() ?? "";
        const songMid = url.searchParams.get("songMid")?.trim() ?? "";
        const duration = Number(url.searchParams.get("duration") ?? "0");

        if (!songMid && (!title || !artist)) {
          sendJsonWithCors(response, 400, {
            error: "Track title and artist are required when songMid is missing"
          }, origin);
          return;
        }

        sendJsonWithCors(
          response,
          200,
          await resolveQqLyrics(
            title,
            artist,
            songMid,
            Number.isFinite(duration) && duration > 0 ? duration : 0
          ),
          origin
        );
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/tts/")) {
        requireAuthenticatedUser(authenticatedUser);
        const fileName = decodeURIComponent(url.pathname.replace("/api/tts/", ""));
        sendAudio(
          response,
          await readSpeechAudio(rootDir, fileName),
          getSpeechAudioContentType(fileName),
          origin
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/context") {
        const user = requireAuthenticatedUser(authenticatedUser);
        sendJsonWithCors(
          response,
          200,
          await buildPromptContext(
            rootDir,
            getNowPlaying(user),
            undefined,
            user
          ),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/tts") {
        requireAuthenticatedUser(authenticatedUser);
        const body = await readJsonBody(request);
        const text = readTtsText(body);

        if (!text) {
          sendJsonWithCors(response, 400, {
            error: "TTS text is required"
          }, origin);
          return;
        }

        sendJsonWithCors(response, 200, await synthesizeSpeech(rootDir, text), origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/resolve-track") {
        const user = requireAuthenticatedUser(authenticatedUser);
        const body = await readJsonBody(request);
        const track = readTrackRequest(body);

        if (!track) {
          sendJsonWithCors(response, 400, {
            error: "Track title and artist are required"
          }, origin);
          return;
        }

        sendJsonWithCors(
          response,
          200,
          await resolvePlayableTrack(track, 0, rootDir, user),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/feedback") {
        const user = requireAuthenticatedUser(authenticatedUser);
        const body = await readJsonBody(request);
        const feedback = readFeedbackRequest(body);

        if (!feedback) {
          sendJsonWithCors(response, 400, {
            error: "Feedback action, title, and artist are required"
          }, origin);
          return;
        }

        sendJsonWithCors(
          response,
          200,
          await appendTrackFeedback(rootDir, user, feedback),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/plan") {
        const user = requireAuthenticatedUser(authenticatedUser);
        const body = await readJsonBody(request);
        const userMessage = readUserMessage(body);

        if (!userMessage?.trim()) {
          sendJsonWithCors(response, 400, {
            error: "Plan message is required"
          }, origin);
          return;
        }

        const profile = await loadUserProfile(rootDir);
        const context = await buildPromptContext(
          rootDir,
          getNowPlaying(user),
          userMessage,
          user
        );
        const turn = await generateAiTurn({ context, profile });

        if (turn.mode === "chat") {
          await appendChatTurn(
            rootDir,
            user,
            userMessage,
            turn.text
          );
          sendJsonWithCors(response, 200, {
            mode: "chat",
            message: turn.text
          }, origin);
          return;
        }

        const state = await setCurrentPlan(
          rootDir,
          user,
          turn.plan,
          context,
          userMessage
        );

        await appendChatTurn(
          rootDir,
          user,
          userMessage,
          state.currentPlan?.say ?? turn.plan.say,
          state.currentPlan ?? turn.plan
        );
        sendJsonWithCors(
          response,
          200,
          {
            mode: "recommend",
            state
          },
          origin
        );
        return;
      }

      notFound(response);
    } catch (error) {
      if (error instanceof RequestError) {
        sendJsonWithCors(response, error.statusCode, {
          error: error.message
        }, origin);
        return;
      }

      sendJsonWithCors(response, 500, {
        error: error instanceof Error ? error.message : "Unknown server error"
      }, origin);
    }
  };
}

function requireAuthenticatedUser(
  user: AuthenticatedUser | null
): AuthenticatedUser {
  if (!user) {
    throw new RequestError(401, "请先登录音乐账号");
  }

  return user;
}
