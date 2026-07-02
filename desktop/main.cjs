const { app, BrowserWindow, ipcMain, session } = require("electron");

const appUrl = process.env.REDIO_APP_URL || "http://127.0.0.1:5173/";
const qqLoginPartition = "persist:redio-qqmusic-login";
const qqLoginUrl = "https://y.qq.com/n/ryqq/profile";
const qqWarmupUrl = "https://y.qq.com/n/ryqq/player";

const qqCookiePriority = [
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

let mainWindow = null;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 820,
    minWidth: 390,
    minHeight: 720,
    title: "Redio",
    backgroundColor: "#10111f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: `${__dirname}/preload.cjs`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await mainWindow.loadURL(appUrl);
}

function parseCookieHeader(cookieText) {
  const out = {};

  String(cookieText || "")
    .split(";")
    .forEach((part) => {
      const raw = part.trim();
      const index = raw.indexOf("=");

      if (index <= 0) {
        return;
      }

      out[raw.slice(0, index).trim()] = raw.slice(index + 1).trim();
    });

  return out;
}

function normalizeQqUin(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function qqCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin;
  const uin = normalizeQqUin(rawUin);
  const musicKey =
    obj.qm_keyst ||
    obj.qqmusic_key ||
    obj.music_key ||
    obj.p_skey ||
    obj.skey ||
    obj.psrf_qqaccess_token ||
    obj.psrf_qqrefresh_token ||
    obj.wxrefresh_token ||
    obj.wxskey ||
    "";

  return !!(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const rawUin =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin;
  const uin = normalizeQqUin(rawUin);
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";

  return !!(uin && playbackKey);
}

function isQqCookieDomain(domain) {
  const normalized = String(domain || "").replace(/^\./, "").toLowerCase();
  return normalized === "qq.com" || normalized.endsWith(".qq.com") || normalized.endsWith("qqmusic.qq.com");
}

function buildQqCookieHeader(cookies) {
  const picked = new Map();

  for (const cookie of cookies || []) {
    if (!cookie || !cookie.name || !isQqCookieDomain(cookie.domain)) {
      continue;
    }

    picked.set(cookie.name, cookie.value || "");
  }

  const ordered = [];

  for (const name of qqCookiePriority) {
    if (picked.has(name)) {
      ordered.push([name, picked.get(name)]);
      picked.delete(name);
    }
  }

  for (const entry of picked.entries()) {
    ordered.push(entry);
  }

  return ordered
    .filter(([name, value]) => name && value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function readQqCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildQqCookieHeader(cookies);
}

async function openQqMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(qqLoginPartition);
  const initialCookie = await readQqCookieHeader(cookieSession);

  if (qqCookieHasPlaybackLogin(initialCookie)) {
    return { ok: true, cookie: initialCookie, reused: true, partial: false };
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      title: "QQ 音乐登录",
      backgroundColor: "#111111",
      autoHideMenuBar: true,
      webPreferences: {
        partition: qqLoginPartition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }

      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readQqCookieHeader(cookieSession);

        if (qqCookieHasPlaybackLogin(cookie)) {
          finish({ ok: true, cookie, partial: false });
          return;
        }

        if (qqCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL(qqWarmupUrl).catch(() => {});
            }
          }, 900);
        }
      } catch (error) {
        console.warn("QQ login cookie check failed:", error.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch(() => {});
      }

      return { action: "deny" };
    });

    loginWindow.webContents.on("did-finish-load", () => {
      checkCookies();
      loginWindow.webContents
        .executeJavaScript(
          `
          setTimeout(() => {
            const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|登陆/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) loginNode.click();
          }, 700);
        `,
          true
        )
        .catch(() => {});
    });

    loginWindow.on("ready-to-show", () => loginWindow.show());
    loginWindow.on("closed", async () => {
      if (settled) {
        return;
      }

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      try {
        const cookie = await readQqCookieHeader(cookieSession);
        resolve(
          qqCookieHasLogin(cookie)
            ? { ok: true, cookie, partial: !qqCookieHasPlaybackLogin(cookie) }
            : { ok: false, cancelled: true, message: "QQ 登录窗口已关闭" }
        );
      } catch (error) {
        resolve({ ok: false, error: error.message || "QQ 登录窗口已关闭" });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(qqLoginUrl).catch((error) => {
      finish({ ok: false, error: error.message });
    });
  });
}

ipcMain.handle("qq-music-open-login", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return openQqMusicLoginWindow(owner);
});

ipcMain.handle("qq-music-clear-login", async () => {
  const cookieSession = session.fromPartition(qqLoginPartition);
  await cookieSession.clearStorageData({
    storages: ["cookies", "localstorage", "indexdb", "cachestorage"]
  });
  return { ok: true };
});

app.whenReady().then(createMainWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
