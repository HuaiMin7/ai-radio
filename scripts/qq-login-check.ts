import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllowedQqAudioUrl } from "../server/qq-audio-host.js";
import { createRouter } from "../server/router.js";

process.env.AI_RADIO_SESSION_SECRET =
  "redio-qq-login-check-session-secret-at-least-32-characters";
process.env.AI_RADIO_CREDENTIAL_SECRET =
  "redio-qq-login-check-credential-secret-at-least-32-characters";
process.env.AI_RADIO_PUBLIC_DEMO = "0";
process.env.AI_RADIO_QQ_LOGIN_RATE_LIMIT_PER_MINUTE = "120";

const rootDir = await mkdtemp(join(tmpdir(), "redio-qq-login-"));
const realFetch = globalThis.fetch;
let upstreamQrPollCount = 0;
let observedVkeyAuthPlacement = false;

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);

  if (url.hostname === "127.0.0.1") return realFetch(input, init);

  if (url.pathname.endsWith("/ptqrshow")) {
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "Set-Cookie": "qrsig=test-qrsig; Path=/; HttpOnly" }
    });
  }

  if (url.pathname.endsWith("/ptqrlogin")) {
    upstreamQrPollCount += 1;
    if (upstreamQrPollCount === 1) {
      return new Response(
        "ptuiCB('66','0','','0','二维码未失效','测试');",
        { status: 200 }
      );
    }
    return new Response(
      "ptuiCB('0','0','https://ssl.ptlogin2.qq.com/checksig','0','登录成功','测试');",
      { status: 200 }
    );
  }

  if (url.pathname.endsWith("/checksig")) {
    return new Response(null, {
      status: 302,
      headers: { "Set-Cookie": "p_skey=test-pskey; Path=/; HttpOnly" }
    });
  }

  if (url.hostname === "graph.qq.com") {
    return new Response(null, {
      status: 302,
      headers: { Location: "https://y.qq.com/callback?code=test-code" }
    });
  }

  if (url.pathname.endsWith("/musicu.fcg")) {
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (payload.req) {
      return Response.json({
        code: 0,
        req: {
          code: 0,
          data: {
            musicid: 12345,
            musickey: "test-playback-key"
          }
        }
      });
    }

    if (payload.songinfo) {
      return Response.json({
        songinfo: {
          data: {
            track_info: {
              mid: "probe-mid",
              name: "We Never",
              singer: [{ name: "Hi Noise" }],
              file: { media_mid: "probe-media-mid" }
            }
          }
        }
      });
    }

    const comm = payload.comm as { ct?: number; authst?: string } | undefined;
    const request = payload.req_0 as {
      param?: { authst?: string };
    } | undefined;
    assert.equal(comm?.ct, 24);
    assert.equal(comm?.authst, undefined);
    assert.equal(request?.param?.authst, "test-playback-key");
    observedVkeyAuthPlacement = true;

    return Response.json({
      req_0: {
        data: {
          sip: ["https://dl.stream.qqmusic.qq.com/"],
          midurlinfo: [
            { filename: "M500probe-media-mid.mp3", purl: "probe.mp3", result: 0 }
          ]
        }
      }
    });
  }

  if (url.pathname.includes("smartbox_new.fcg")) {
    return Response.json({
      data: {
        song: {
          itemlist: [{ mid: "probe-mid", name: "We Never", singer: "Hi Noise" }]
        }
      }
    });
  }

  if (url.pathname.includes("fcg_get_profile_homepage.fcg")) {
    return Response.json({ data: { creator: { nick: "二维码测试账号" } } });
  }

  if (url.hostname.endsWith("stream.qqmusic.qq.com")) {
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 206,
      headers: {
        "Content-Range": "bytes 0-3/4",
        "Content-Type": "audio/mpeg"
      }
    });
  }

  throw new Error(`Unexpected upstream request: ${url}`);
};

const server = createServer((request, response) => {
  void createRouter(rootDir)(request, response);
});

try {
  assert.equal(isAllowedQqAudioUrl(new URL("https://dl.stream.qqmusic.qq.com/a.mp3")), true);
  assert.equal(isAllowedQqAudioUrl(new URL("https://aqqmusic.tc.qq.com/a.mp3")), true);
  assert.equal(isAllowedQqAudioUrl(new URL("https://evilaqqmusic.tc.qq.com/a.mp3")), false);
  assert.equal(isAllowedQqAudioUrl(new URL("https://y.qq.com/a.mp3")), false);
  assert.equal(isAllowedQqAudioUrl(new URL("https://evilqq.com/a.mp3")), false);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const createdResponse = await realFetch(`${baseUrl}/api/qq/login/qr`, {
    method: "POST"
  });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json() as {
    loginId: string;
    imageDataUrl: string;
  };
  const ownerCookie = createdResponse.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("redio_login="))
    ?.split(";")[0];
  assert(ownerCookie);
  assert.match(created.imageDataUrl, /^data:image\/png;base64,/);

  const browserB = await realFetch(`${baseUrl}/api/qq/login/qr/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId: created.loginId })
  });
  assert.equal(browserB.status, 404);
  assert.equal(
    browserB.headers.getSetCookie().some((cookie) => cookie.startsWith("redio_session=")),
    false
  );

  process.env.AI_RADIO_PUBLIC_DEMO = "1";
  const publicCookieLogin = await realFetch(`${baseUrl}/api/qq/login/cookie`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cookie: "uin=12345; qm_keyst=forged-playback-key"
    })
  });
  assert.equal(publicCookieLogin.status, 403);
  assert.equal(
    publicCookieLogin.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("redio_session=")),
    false
  );
  process.env.AI_RADIO_PUBLIC_DEMO = "0";

  let ownerResult: {
    state: string;
    message?: string;
    status?: { playbackKeyReady?: boolean };
  } = { state: "pending" };
  let ownerResponse: Response | null = null;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    ownerResponse = await realFetch(`${baseUrl}/api/qq/login/qr/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie
      },
      body: JSON.stringify({ loginId: created.loginId })
    });
    assert.equal(ownerResponse.status, 200);
    ownerResult = await ownerResponse.json() as typeof ownerResult;
    if (ownerResult.state === "ready" || ownerResult.state === "error") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(ownerResult.state, "ready", ownerResult.message);
  assert.equal(ownerResult.status?.playbackKeyReady, true);
  assert.equal(upstreamQrPollCount, 2);
  assert.equal(observedVkeyAuthPlacement, true);

  const sessionCookie = ownerResponse?.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("redio_session="))
    ?.split(";")[0];
  assert(sessionCookie);

  const statusResponse = await realFetch(`${baseUrl}/api/qq/login/status`, {
    headers: { Cookie: sessionCookie }
  });
  const status = await statusResponse.json() as { loggedIn: boolean; playbackKeyReady: boolean };
  assert.equal(status.loggedIn, true);
  assert.equal(status.playbackKeyReady, true);

  console.log(
    "[ok] owner-bound QR login, public Cookie-login guard, async authorization, poll throttling, and playback probe"
  );
} finally {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(rootDir, { recursive: true, force: true });
}
