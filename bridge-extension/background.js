const QQ_LOGIN_URL = "https://y.qq.com/n/ryqq/profile";
const QQ_PLAYER_URL = "https://y.qq.com/n/ryqq/player";
const QQ_COOKIE_PRIORITY = [
  "uin",
  "qqmusic_uin",
  "wxuin",
  "login_type",
  "qm_keyst",
  "qqmusic_key",
  "music_key",
  "p_skey",
  "skey",
  "psrf_qqopenid",
  "psrf_qqunionid",
  "psrf_qqaccess_token",
  "psrf_qqrefresh_token",
  "wxopenid",
  "wxunionid",
  "wxrefresh_token",
  "wxskey",
  "p_uin",
  "ptcz",
  "RK"
];
const QQ_COOKIE_NAMES = new Set(QQ_COOKIE_PRIORITY);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "REDIO_BRIDGE_GET_STATUS") {
    respond(getQqCookiePayload(), sendResponse);
    return true;
  }

  if (message.type === "REDIO_BRIDGE_SYNC_QQ_COOKIE") {
    respond(getQqCookiePayload(), sendResponse);
    return true;
  }

  if (message.type === "REDIO_BRIDGE_OPEN_QQ_LOGIN") {
    respond(openQqLogin(), sendResponse);
    return true;
  }

  if (message.type === "REDIO_BRIDGE_WARMUP_QQ_PLAYBACK") {
    respond(warmupQqPlayback(), sendResponse);
    return true;
  }

  return false;
});

function respond(promise, sendResponse) {
  Promise.resolve(promise)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Redio Bridge 请求失败"
      });
    });
}

async function openQqLogin() {
  const initial = await getQqCookiePayload();
  if (initial.ok && initial.status.playbackKeyReady) {
    return {
      ...initial,
      reused: true
    };
  }

  const loginTab = await chrome.tabs.create({
    active: true,
    url: QQ_LOGIN_URL
  });

  return {
    ...initial,
    opened: true,
    tabId: loginTab.id,
    message: "QQ 音乐登录页已打开"
  };
}

async function warmupQqPlayback() {
  const tabs = await chrome.tabs.query({ url: "https://y.qq.com/*" });
  const targetTab = tabs.find((tab) => tab.active) || tabs[0];

  if (targetTab?.id) {
    await chrome.tabs.update(targetTab.id, {
      active: true,
      url: QQ_PLAYER_URL
    });
    return {
      ok: true,
      opened: true,
      tabId: targetTab.id,
      message: "QQ 音乐播放页已打开，正在生成播放票据"
    };
  }

  const playerTab = await chrome.tabs.create({
    active: true,
    url: QQ_PLAYER_URL
  });

  return {
    ok: true,
    opened: true,
    tabId: playerTab.id,
    message: "QQ 音乐播放页已打开，正在生成播放票据"
  };
}

async function getQqCookiePayload() {
  const [apiCookies, pageCookies] = await Promise.all([
    chrome.cookies.getAll({}),
    readQqPageCookies()
  ]);
  const cookies = [...apiCookies, ...pageCookies];
  const cookieText = buildCookieHeader(cookies);
  const status = readQqLoginStatusFromCookie(cookieText);
  const qqCookies = cookies.filter(
    (cookie) => isQqCookieDomain(cookie?.domain) && QQ_COOKIE_NAMES.has(cookie?.name)
  );
  const cookieNames = [...new Set(qqCookies.map((cookie) => cookie.name).filter(Boolean))].sort();

  return {
    ok: status.loggedIn,
    cookie: cookieText,
    status,
    diagnostics: {
      cookieCount: qqCookies.length,
      cookieNames,
      pageCookieCount: pageCookies.length
    },
    message: status.loggedIn
      ? status.playbackKeyReady
        ? "QQ 音乐播放授权已就绪"
        : "QQ 账号态已检测到，但播放票据不完整"
      : "未检测到 QQ 音乐登录态"
  };
}

async function readQqPageCookies() {
  const tabs = await chrome.tabs.query({ url: ["https://y.qq.com/*", "https://*.y.qq.com/*"] });
  const responses = await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return null;
      return chrome.tabs.sendMessage(tab.id, {
        type: "REDIO_BRIDGE_READ_QQ_PAGE_COOKIE"
      }).catch(() => null);
    })
  );

  return responses.flatMap((response) => parsePageCookieResponse(response));
}

function parsePageCookieResponse(response) {
  if (!response?.cookie || !response?.hostname) return [];

  return String(response.cookie)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index <= 0) return null;
      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
        domain: response.hostname,
        secure: true
      };
    })
    .filter(Boolean);
}

function buildCookieHeader(cookies) {
  const picked = new Map();
  for (const cookie of cookies || []) {
    if (
      !cookie ||
      !cookie.name ||
      !QQ_COOKIE_NAMES.has(cookie.name) ||
      !isQqCookieDomain(cookie.domain)
    ) {
      continue;
    }
    const current = picked.get(cookie.name);
    if (!current || cookiePriority(cookie.name, cookie) > cookiePriority(cookie.name, current)) {
      picked.set(cookie.name, cookie);
    }
  }

  const ordered = [];
  for (const name of QQ_COOKIE_PRIORITY) {
    if (!picked.has(name)) continue;
    ordered.push([name, picked.get(name).value || ""]);
    picked.delete(name);
  }
  picked.forEach((cookie, name) => ordered.push([name, cookie.value || ""]));

  return ordered
    .filter(([name, value]) => name && value != null && String(value) !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function cookiePriority(name, cookie) {
  const domain = String(cookie?.domain || "").replace(/^\./, "").toLowerCase();
  const value = String(cookie?.value || "");
  let score = 0;

  if (["uin", "qqmusic_uin", "wxuin", "p_uin"].includes(name)) {
    score += normalizeQqUin(value) ? 1000 : -1000;
  }

  if (["qm_keyst", "qqmusic_key", "music_key", "wxskey"].includes(name)) {
    score += value ? 800 : -800;
  }

  if (domain === "qq.com") score += 50;
  if (domain === "y.qq.com") score += 40;
  if (domain.endsWith(".y.qq.com")) score += 30;
  if (cookie?.secure) score += 4;
  if (cookie?.value) score += 2;
  return score;
}

function isQqCookieDomain(domain) {
  const normalized = String(domain || "").replace(/^\./, "").toLowerCase();
  return normalized === "qq.com" || normalized.endsWith(".qq.com") || normalized.endsWith("qqmusic.qq.com");
}

function readQqLoginStatusFromCookie(cookieText) {
  const obj = parseCookieString(cookieText);
  const userId = qqCookieUin(obj);
  const playbackKey = qqCookiePlaybackKey(obj);

  return {
    provider: "qq",
    loggedIn: Boolean(userId),
    hasCookie: Boolean(String(cookieText || "").trim()),
    userId: userId || undefined,
    nickname: qqCookieNickname(obj, userId) || (userId ? `QQ ${userId}` : undefined),
    avatarUrl: userId ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=100` : undefined,
    playbackKeyReady: Boolean(userId && playbackKey)
  };
}

function parseCookieString(cookieText) {
  const obj = {};
  for (const part of String(cookieText || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    obj[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return obj;
}

function qqCookieUin(obj) {
  const candidates = Number(obj.login_type) === 2
    ? [obj.wxuin, obj.uin, obj.qqmusic_uin, obj.p_uin]
    : [obj.uin, obj.qqmusic_uin, obj.wxuin, obj.p_uin];

  for (const candidate of candidates) {
    const normalized = normalizeQqUin(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeQqUin(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return /^0+$/.test(digits) ? "" : digits.replace(/^0+/, "");
}

function qqCookiePlaybackKey(obj) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";
}

function qqCookieNickname(obj, userId) {
  const candidates = [
    obj[`ptnick_${userId}`],
    obj.ptnick,
    obj.qq_nickname
  ];
  for (const value of candidates) {
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}
