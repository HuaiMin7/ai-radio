import type { IncomingMessage, ServerResponse } from "node:http";
import { generateAiTurn } from "./brain.js";
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
  clearQqCookie,
  getQqLoginStatus,
  saveQqCookie,
  searchQqSongs
} from "./qq-music.js";
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
    "Access-Control-Allow-Headers": "Content-Type",
    ...(isAllowedCorsOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
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
    ...(isAllowedCorsOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  response.end(body);
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, {
    error: "Not found"
  });
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

const allowedCorsOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

function isAllowedCorsOrigin(origin: string | undefined): origin is string {
  return typeof origin === "string" && allowedCorsOrigins.has(origin);
}

function isCorsRejected(origin: string | undefined) {
  return typeof origin === "string" && !isAllowedCorsOrigin(origin);
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
      if (request.method === "GET" && url.pathname === "/api/profile") {
        sendJsonWithCors(response, 200, await loadUserProfile(rootDir), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/now") {
        sendJsonWithCors(response, 200, getPublicNowPlaying(), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/history") {
        sendJsonWithCors(response, 200, await readPlaybackHistory(rootDir), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/queue") {
        const queue = await readPlaybackQueue(rootDir);
        const orderedQueue = queue
          .map((track, index) => ({ track, index }))
          .sort((left, right) => {
            const queuedAtDiff =
              Date.parse(right.track.queuedAt) - Date.parse(left.track.queuedAt);

            return queuedAtDiff || left.index - right.index;
          })
          .map(({ track }) => track);
        const playableQueue = await Promise.all(
          orderedQueue.map(async (track, index) => {
            const playableTrack = await resolvePlayableTrack(track, index, rootDir);

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
        sendJsonWithCors(response, 200, await readTrackFeedback(rootDir), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/weather") {
        sendJsonWithCors(response, 200, await getWeatherSnapshot(), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/qq/login/status") {
        sendJsonWithCors(response, 200, await getQqLoginStatus(rootDir), origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/qq/search") {
        const keywords = url.searchParams.get("keywords") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? "6");

        sendJsonWithCors(response, 200, {
          provider: "qq",
          songs: await searchQqSongs(keywords, Number.isFinite(limit) ? limit : 6)
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/tts/")) {
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
        if (process.env.AI_RADIO_DEBUG_CONTEXT !== "1") {
          notFound(response);
          return;
        }

        sendJsonWithCors(
          response,
          200,
          await buildPromptContext(rootDir, getNowPlaying()),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/tts") {
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
        const body = await readJsonBody(request);
        const track = readTrackRequest(body);

        if (!track) {
          sendJsonWithCors(response, 400, {
            error: "Track title and artist are required"
          }, origin);
          return;
        }

        sendJsonWithCors(response, 200, await resolvePlayableTrack(track, 0, rootDir), origin);
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

        sendJsonWithCors(response, 200, await saveQqCookie(rootDir, cookie), origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/qq/logout") {
        sendJsonWithCors(response, 200, await clearQqCookie(rootDir), origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/feedback") {
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
          await appendTrackFeedback(rootDir, feedback),
          origin
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/plan") {
        const body = await readJsonBody(request);
        const userMessage = readUserMessage(body);

        if (!userMessage?.trim()) {
          sendJsonWithCors(response, 400, {
            error: "Plan message is required"
          }, origin);
          return;
        }

        const profile = await loadUserProfile(rootDir);
        const context = await buildPromptContext(rootDir, getNowPlaying(), userMessage);
        const turn = await generateAiTurn({ context, profile });

        if (turn.mode === "chat") {
          sendJsonWithCors(response, 200, {
            mode: "chat",
            message: turn.text
          }, origin);
          return;
        }

        sendJsonWithCors(response, 200, {
          mode: "recommend",
          state: await setCurrentPlan(rootDir, turn.plan, context, userMessage)
        }, origin);
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
