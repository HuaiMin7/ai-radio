// QQ QR authorization flow adapted from sansenjian/qq-music-api (MIT).
// See THIRD_PARTY_NOTICES.md.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthenticatedUser } from "./auth.js";
import {
  authenticateAndSaveQqCookie,
  probeAndSaveQqPlayback,
  type QqLoginStatus
} from "./qq-music.js";

export type QqQrLoginState =
  | "pending"
  | "scanned"
  | "authorizing"
  | "verifying_account"
  | "verifying_playback"
  | "ready"
  | "expired"
  | "error";

type QqQrSession = {
  qrsig: string;
  ptqrtoken: number;
  createdAt: number;
  expiresAt: number;
  ownerNonceHash: string;
  state: QqQrLoginState;
  message: string;
  lastPolledAt: number;
  processing: boolean;
  status?: QqLoginStatus;
  user?: AuthenticatedUser;
};

export type QqQrLoginPollResult = {
  state: QqQrLoginState;
  message: string;
  pollAfterMs: number;
  status?: QqLoginStatus;
  user?: AuthenticatedUser;
};

const qrSessions = new Map<string, QqQrSession>();
const qrSessionLifetimeMs = 3 * 60 * 1000;
const qrSessionRetentionMs = 60 * 1000;
const upstreamPollIntervalMs = 1500;
const backgroundPollIntervalMs = 800;
const requestTimeoutMs = 10_000;

export async function createQqQrLogin(ownerNonce: string) {
  removeExpiredSessions();

  if (!ownerNonce) {
    throw new Error("登录会话初始化失败，请刷新页面后重试");
  }

  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrshow");
  url.searchParams.set("appid", "716027609");
  url.searchParams.set("e", "2");
  url.searchParams.set("l", "M");
  url.searchParams.set("s", "3");
  url.searchParams.set("d", "72");
  url.searchParams.set("v", "4");
  url.searchParams.set("t", String(Math.random()));
  url.searchParams.set("daid", "383");
  url.searchParams.set("pt_3rd_aid", "100497308");
  url.searchParams.set("u1", "https://graph.qq.com/oauth2.0/login_jump");

  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error("QQ 音乐登录二维码获取失败");

  const qrsig = readSetCookiePairs(response.headers)
    .map(parseCookiePair)
    .find(([name]) => name === "qrsig")?.[1];
  if (!qrsig) throw new Error("QQ 音乐没有返回二维码登录凭据");

  const loginId = randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + qrSessionLifetimeMs;

  qrSessions.set(loginId, {
    qrsig,
    ptqrtoken: hash33(qrsig),
    createdAt,
    expiresAt,
    ownerNonceHash: hashOwnerNonce(ownerNonce),
    state: "pending",
    message: "请使用 QQ 音乐或 QQ 扫码",
    lastPolledAt: 0,
    processing: false
  });

  return {
    loginId,
    imageDataUrl: `data:image/png;base64,${Buffer.from(
      await response.arrayBuffer()
    ).toString("base64")}`,
    expiresAt: new Date(expiresAt).toISOString(),
    pollAfterMs: upstreamPollIntervalMs
  };
}

export async function pollQqQrLogin(
  rootDir: string,
  loginId: string,
  ownerNonce: string
): Promise<QqQrLoginPollResult | null> {
  removeExpiredSessions();
  const session = qrSessions.get(loginId);

  if (!session || !isSessionOwner(session, ownerNonce)) return null;

  const now = Date.now();
  if (now >= session.expiresAt && !isTerminalState(session.state)) {
    setSessionState(session, "expired", "二维码已失效，请重新获取");
  }

  if (isTerminalState(session.state)) return toPollResult(session, 0);
  if (session.processing) return toPollResult(session, backgroundPollIntervalMs);

  const elapsedSincePoll = now - session.lastPolledAt;
  if (elapsedSincePoll < upstreamPollIntervalMs) {
    return toPollResult(session, upstreamPollIntervalMs - elapsedSincePoll);
  }

  session.lastPolledAt = now;
  const cookieMap = new Map<string, string>([["qrsig", session.qrsig]]);
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
  url.searchParams.set("u1", "https://graph.qq.com/oauth2.0/login_jump");
  url.searchParams.set("ptqrtoken", String(session.ptqrtoken));
  url.searchParams.set("ptredirect", "0");
  url.searchParams.set("h", "1");
  url.searchParams.set("t", "1");
  url.searchParams.set("g", "1");
  url.searchParams.set("from_ui", "1");
  url.searchParams.set("ptlang", "2052");
  url.searchParams.set("action", `0-0-${now}`);
  url.searchParams.set("js_ver", "23111510");
  url.searchParams.set("js_type", "1");
  url.searchParams.set("pt_uistyle", "40");
  url.searchParams.set("aid", "716027609");
  url.searchParams.set("daid", "383");
  url.searchParams.set("pt_3rd_aid", "100497308");

  let response: Response;
  let body: string;

  try {
    response = await fetchWithTimeout(url, {
      headers: { Cookie: serializeCookies(cookieMap) }
    });
    addResponseCookies(cookieMap, response.headers);
    body = await response.text();
  } catch {
    setSessionState(session, "error", "QQ 登录状态查询失败，请重新获取二维码");
    return toPollResult(session, 0);
  }
  const code = body.match(/^ptuiCB\('(\d+)'/)?.[1];

  if (code === "65" || body.includes("已失效")) {
    setSessionState(session, "expired", "二维码已失效，请重新获取");
    return toPollResult(session, 0);
  }

  if (code === "67" || body.includes("认证中")) {
    setSessionState(session, "scanned", "已扫码，请在手机上确认登录");
    return toPollResult(session, upstreamPollIntervalMs);
  }

  if (code !== "0" && !body.includes("登录成功")) {
    setSessionState(session, "pending", "请使用 QQ 音乐或 QQ 扫码");
    return toPollResult(session, upstreamPollIntervalMs);
  }

  const checkSigUrl = body.match(/'(https?:\/\/[^']+)'/)?.[1];
  if (!checkSigUrl) {
    setSessionState(session, "error", "QQ 登录确认地址解析失败，请重新获取二维码");
    return toPollResult(session, 0);
  }

  session.processing = true;
  setSessionState(session, "authorizing", "正在完成 QQ 音乐授权");
  void completeQqQrLogin(rootDir, session, checkSigUrl, cookieMap);
  return toPollResult(session, backgroundPollIntervalMs);
}

async function completeQqQrLogin(
  rootDir: string,
  session: QqQrSession,
  checkSigUrl: string,
  cookieMap: Map<string, string>
) {
  try {
    const checkSigResponse = await fetchWithTimeout(checkSigUrl, {
      redirect: "manual",
      headers: { Cookie: serializeCookies(cookieMap) }
    });
    addResponseCookies(cookieMap, checkSigResponse.headers);

    const pSkey = cookieMap.get("p_skey");
    if (!pSkey) throw new Error("QQ 登录确认失败，请重新扫码");

    const authorizeData = new FormData();
    authorizeData.append("response_type", "code");
    authorizeData.append("client_id", "100497308");
    authorizeData.append(
      "redirect_uri",
      "https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/"
    );
    authorizeData.append("scope", "get_user_info,get_app_friends");
    authorizeData.append("state", "state");
    authorizeData.append("switch", "");
    authorizeData.append("from_ptlogin", "1");
    authorizeData.append("src", "1");
    authorizeData.append("update_auth", "1");
    authorizeData.append("openapi", "1010_1030");
    authorizeData.append("g_tk", String(getGtk(pSkey)));
    authorizeData.append("auth_time", new Date().toString());
    authorizeData.append("ui", randomUUID().toUpperCase());

    const authorizeResponse = await fetchWithTimeout(
      "https://graph.qq.com/oauth2.0/authorize",
      {
        redirect: "manual",
        method: "POST",
        body: authorizeData,
        headers: { Cookie: serializeCookies(cookieMap) }
      }
    );
    addResponseCookies(cookieMap, authorizeResponse.headers);

    const location = authorizeResponse.headers.get("location");
    const authorizationCode = location
      ? new URL(location).searchParams.get("code")
      : "";
    if (
      authorizeResponse.status < 300 ||
      authorizeResponse.status >= 400 ||
      !authorizationCode
    ) {
      throw new Error("QQ 音乐授权失败，请重新扫码");
    }

    const loginResponse = await fetchWithTimeout(
      "https://u.y.qq.com/cgi-bin/musicu.fcg",
      {
        method: "POST",
        body: JSON.stringify({
          comm: { g_tk: getGtk(pSkey), platform: "yqq", ct: 24, cv: 0 },
          req: {
            module: "QQConnectLogin.LoginServer",
            method: "QQLogin",
            param: { code: authorizationCode }
          }
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: serializeCookies(cookieMap)
        }
      }
    );
    addResponseCookies(cookieMap, loginResponse.headers);
    if (!loginResponse.ok) throw new Error("QQ 音乐登录凭据交换失败");
    const loginCredentials = addLoginResponseCredentials(
      cookieMap,
      await loginResponse.text()
    );
    console.info("[qq-login] credential exchange", {
      bodyMusicId: loginCredentials.musicId,
      bodyMusicKey: loginCredentials.musicKey,
      cookieFields: [...cookieMap.keys()].filter((name) =>
        ["uin", "qqmusic_uin", "qm_keyst", "qqmusic_key", "music_key", "wxskey"].includes(name)
      )
    });

    setSessionState(session, "verifying_account", "正在验证 QQ 音乐账号");
    const authentication = await authenticateAndSaveQqCookie(
      rootDir,
      serializeCookies(cookieMap),
      { probePlayback: false }
    );
    if (!authentication.user) {
      throw new Error(authentication.status.message ?? "QQ 音乐账号验证失败");
    }

    setSessionState(session, "verifying_playback", "账号已验证，正在检查歌曲播放能力");
    const status = await probeAndSaveQqPlayback(rootDir, authentication.user);
    if (!status.playbackKeyReady) {
      throw new Error(status.message ?? "QQ 音乐播放能力验证失败，请重新扫码");
    }
    session.user = authentication.user;
    session.status = status;
    setSessionState(
      session,
      "ready",
      status.playbackKeyReady
        ? "QQ 音乐登录成功，播放授权已就绪"
        : status.message ?? "QQ 音乐账号已登录，播放授权暂不可用"
    );
  } catch (error) {
    setSessionState(
      session,
      "error",
      error instanceof Error ? error.message : "QQ 音乐登录失败，请重新扫码"
    );
  } finally {
    session.processing = false;
  }
}

function toPollResult(session: QqQrSession, pollAfterMs: number) {
  return {
    state: session.state,
    message: session.message,
    pollAfterMs,
    ...(session.status ? { status: session.status } : {}),
    ...(session.user ? { user: session.user } : {})
  };
}

function setSessionState(session: QqQrSession, state: QqQrLoginState, message: string) {
  session.state = state;
  session.message = message;
  if (isTerminalState(state)) {
    session.qrsig = "";
    session.ptqrtoken = 0;
  }
}

function isTerminalState(state: QqQrLoginState) {
  return state === "ready" || state === "expired" || state === "error";
}

function isSessionOwner(session: QqQrSession, ownerNonce: string) {
  if (!ownerNonce) return false;
  const supplied = Buffer.from(hashOwnerNonce(ownerNonce), "hex");
  const expected = Buffer.from(session.ownerNonceHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function hashOwnerNonce(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function fetchWithTimeout(input: string | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
}

function readSetCookiePairs(headers: Headers) {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const values = extendedHeaders.getSetCookie?.();
  if (values?.length) {
    return values.map((value) => value.split(";")[0]?.trim()).filter(Boolean);
  }
  return (headers.get("set-cookie") ?? "")
    .split(/,(?=\s*[A-Za-z_][A-Za-z0-9_]*=)/)
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean);
}

function addResponseCookies(cookieMap: Map<string, string>, headers: Headers) {
  for (const pair of readSetCookiePairs(headers)) {
    const [name, value] = parseCookiePair(pair);
    if (name && value) cookieMap.set(name, value);
  }
}

function parseCookiePair(pair: string): [string, string] {
  const separatorIndex = pair.indexOf("=");
  return separatorIndex > 0
    ? [pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1)]
    : ["", ""];
}

function serializeCookies(cookieMap: Map<string, string>) {
  return [...cookieMap]
    .filter(([name, value]) => name && value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function addLoginResponseCredentials(cookieMap: Map<string, string>, responseText: string) {
  let parsed: {
    code?: number;
    req?: {
      code?: number;
      data?: {
        musicid?: string | number;
        strMusicid?: string;
        musickey?: string;
      };
    };
  };

  try {
    parsed = JSON.parse(responseText) as typeof parsed;
  } catch {
    return { musicId: false, musicKey: false };
  }

  if (Number(parsed.code ?? 0) !== 0 || Number(parsed.req?.code ?? 0) !== 0) {
    throw new Error("QQ 音乐登录凭据交换失败");
  }

  const data = parsed.req?.data;
  const musicId = String(data?.strMusicid ?? data?.musicid ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  const musicKey = String(data?.musickey ?? "").trim();

  if (musicId) {
    cookieMap.set("uin", musicId);
    cookieMap.set("qqmusic_uin", musicId);
  }
  if (musicKey) {
    cookieMap.set("qqmusic_key", musicKey);
    cookieMap.set("qm_keyst", musicKey);
  }

  return { musicId: Boolean(musicId), musicKey: Boolean(musicKey) };
}

function hash33(value: string) {
  let hash = 0;
  for (const character of value) hash += (hash << 5) + character.charCodeAt(0);
  return hash & 0x7fffffff;
}

function getGtk(pSkey: string) {
  let hash = 5381;
  for (const character of pSkey) hash += (hash << 5) + character.charCodeAt(0);
  return hash & 0x7fffffff;
}

function removeExpiredSessions() {
  const cutoff = Date.now() - qrSessionRetentionMs;
  for (const [loginId, session] of qrSessions) {
    if (session.expiresAt < cutoff) qrSessions.delete(loginId);
  }
}
