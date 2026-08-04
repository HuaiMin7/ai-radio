// QQ QR authorization flow adapted from sansenjian/qq-music-api (MIT).
// See THIRD_PARTY_NOTICES.md.
import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "./auth.js";
import {
  authenticateAndSaveQqCookie,
  type QqLoginStatus
} from "./qq-music.js";

type QqQrSession = {
  qrsig: string;
  ptqrtoken: number;
  createdAt: number;
};

export type QqQrLoginPollResult =
  | {
      state: "pending" | "scanned" | "expired";
      message: string;
    }
  | {
      state: "complete";
      message: string;
      status: QqLoginStatus;
      user: AuthenticatedUser;
    };

const qrSessions = new Map<string, QqQrSession>();
const qrSessionLifetimeMs = 3 * 60 * 1000;
const requestTimeoutMs = 10_000;

export async function createQqQrLogin() {
  removeExpiredSessions();

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
  url.searchParams.set(
    "u1",
    "https://graph.qq.com/oauth2.0/login_jump"
  );

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error("QQ 音乐登录二维码获取失败");
  }

  const qrsig = readSetCookiePairs(response.headers)
    .map(parseCookiePair)
    .find(([name]) => name === "qrsig")?.[1];

  if (!qrsig) {
    throw new Error("QQ 音乐没有返回二维码登录凭据");
  }

  const sessionId = randomUUID();
  const createdAt = Date.now();

  qrSessions.set(sessionId, {
    qrsig,
    ptqrtoken: hash33(qrsig),
    createdAt
  });

  return {
    sessionId,
    imageDataUrl: `data:image/png;base64,${Buffer.from(
      await response.arrayBuffer()
    ).toString("base64")}`,
    expiresAt: new Date(createdAt + qrSessionLifetimeMs).toISOString()
  };
}

export async function pollQqQrLogin(
  rootDir: string,
  sessionId: string
): Promise<QqQrLoginPollResult> {
  // 原先只在新建二维码时清理，废弃会话可能长期滞留。
  // 轮询时也顺带清一次，保证字典不积压。
  removeExpiredSessions();

  const session = qrSessions.get(sessionId);

  if (!session || Date.now() - session.createdAt >= qrSessionLifetimeMs) {
    qrSessions.delete(sessionId);
    return {
      state: "expired",
      message: "二维码已失效，请重新获取"
    };
  }

  const cookieMap = new Map<string, string>([["qrsig", session.qrsig]]);
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
  url.searchParams.set(
    "u1",
    "https://graph.qq.com/oauth2.0/login_jump"
  );
  url.searchParams.set("ptqrtoken", String(session.ptqrtoken));
  url.searchParams.set("ptredirect", "0");
  url.searchParams.set("h", "1");
  url.searchParams.set("t", "1");
  url.searchParams.set("g", "1");
  url.searchParams.set("from_ui", "1");
  url.searchParams.set("ptlang", "2052");
  url.searchParams.set("action", `0-0-${Date.now()}`);
  url.searchParams.set("js_ver", "23111510");
  url.searchParams.set("js_type", "1");
  url.searchParams.set("pt_uistyle", "40");
  url.searchParams.set("aid", "716027609");
  url.searchParams.set("daid", "383");
  url.searchParams.set("pt_3rd_aid", "100497308");

  const response = await fetchWithTimeout(url, {
    headers: {
      Cookie: serializeCookies(cookieMap)
    }
  });
  addResponseCookies(cookieMap, response.headers);
  const body = await response.text();
  const code = body.match(/^ptuiCB\('(\d+)'/)?.[1];

  if (code === "65" || body.includes("已失效")) {
    qrSessions.delete(sessionId);
    return {
      state: "expired",
      message: "二维码已失效，请重新获取"
    };
  }

  if (code === "67" || body.includes("认证中")) {
    return {
      state: "scanned",
      message: "已扫码，请在手机上确认登录"
    };
  }

  if (code !== "0" && !body.includes("登录成功")) {
    return {
      state: "pending",
      message: "请使用 QQ 音乐或 QQ 扫码"
    };
  }

  const checkSigUrl = body.match(/'(https?:\/\/[^']+)'/)?.[1];

  if (!checkSigUrl) {
    throw new Error("QQ 登录确认地址解析失败");
  }

  const checkSigResponse = await fetchWithTimeout(checkSigUrl, {
    redirect: "manual",
    headers: {
      Cookie: serializeCookies(cookieMap)
    }
  });
  addResponseCookies(cookieMap, checkSigResponse.headers);

  const pSkey = cookieMap.get("p_skey");

  if (!pSkey) {
    throw new Error("QQ 登录确认失败，请重新扫码");
  }

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
      headers: {
        Cookie: serializeCookies(cookieMap)
      }
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
        comm: {
          g_tk: getGtk(pSkey),
          platform: "yqq",
          ct: 24,
          cv: 0
        },
        req: {
          module: "QQConnectLogin.LoginServer",
          method: "QQLogin",
          param: {
            code: authorizationCode
          }
        }
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: serializeCookies(cookieMap)
      }
    }
  );
  addResponseCookies(cookieMap, loginResponse.headers);

  if (!loginResponse.ok) {
    throw new Error("QQ 音乐登录凭据交换失败");
  }

  const authentication = await authenticateAndSaveQqCookie(
    rootDir,
    serializeCookies(cookieMap)
  );

  if (!authentication.user) {
    throw new Error(
      authentication.status.message ?? "QQ 音乐账号验证失败"
    );
  }

  qrSessions.delete(sessionId);

  return {
    state: "complete",
    message: "QQ 音乐登录成功",
    status: authentication.status,
    user: authentication.user
  };
}

function fetchWithTimeout(input: string | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
}

function readSetCookiePairs(headers: Headers) {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
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

    if (name && value) {
      cookieMap.set(name, value);
    }
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

function hash33(value: string) {
  let hash = 0;

  for (const character of value) {
    hash += (hash << 5) + character.charCodeAt(0);
  }

  return hash & 0x7fffffff;
}

function getGtk(pSkey: string) {
  let hash = 5381;

  for (const character of pSkey) {
    hash += (hash << 5) + character.charCodeAt(0);
  }

  return hash & 0x7fffffff;
}

function removeExpiredSessions() {
  const cutoff = Date.now() - qrSessionLifetimeMs;

  for (const [sessionId, session] of qrSessions) {
    if (session.createdAt < cutoff) {
      qrSessions.delete(sessionId);
    }
  }
}
