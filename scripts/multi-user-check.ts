import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAuthenticatedUser,
  createSessionToken,
  getUserDataDir,
  readEncryptedUserSecret,
  readAuthenticatedUser,
  revokeUserSessions,
  verifySessionToken,
  writeEncryptedUserSecret
} from "../server/auth.js";
import { appendChatTurn, readChatHistory } from "../server/chat.js";
import { appendTrackFeedback, readTrackFeedback } from "../server/feedback.js";
import { appendPlaybackHistory, readPlaybackHistory } from "../server/history.js";
import { appendPlaybackQueue, readPlaybackQueue } from "../server/queue.js";
import { createRouter } from "../server/router.js";

process.env.AI_RADIO_SESSION_SECRET =
  "redio-multi-user-check-secret-with-at-least-32-characters";
process.env.AI_RADIO_MUSIC_PROVIDER = "local";
process.env.AI_RADIO_PUBLIC_DEMO = "0";

const rootDir = await mkdtemp(join(tmpdir(), "redio-multi-user-"));
const firstUser = createAuthenticatedUser("qq", "10001");
const secondUser = createAuthenticatedUser("qq", "20002");
const plan = {
  episode: 1,
  say: "给第一位用户的测试节目。",
  play: [
    {
      title: "First User Track",
      artist: "Redio Test",
      audioUrl: "/audio/local-focus.wav",
      audioLabel: "测试音频",
      source: "local" as const,
      playbackStatus: "fallback" as const,
      isFallback: true
    }
  ],
  reason: "验证账号数据隔离。",
  segue: "fade" as const
};

try {
  assert.notEqual(firstUser.storageKey, secondUser.storageKey);
  assert.deepEqual(
    verifySessionToken(createSessionToken(firstUser)),
    firstUser
  );
  assert.equal(
    verifySessionToken(`${createSessionToken(firstUser)}tampered`),
    null
  );

  await writeEncryptedUserSecret(
    rootDir,
    firstUser,
    "qq-cookie",
    "uin=10001; qm_keyst=secret-playback-key"
  );
  assert.equal(
    await readEncryptedUserSecret(rootDir, firstUser, "qq-cookie"),
    "uin=10001; qm_keyst=secret-playback-key"
  );
  const encryptedFile = await readFile(
    join(getUserDataDir(rootDir, firstUser), "qq-cookie.enc.json"),
    "utf8"
  );
  assert.equal(encryptedFile.includes("secret-playback-key"), false);
  const bridgeManifest = JSON.parse(
    await readFile(
      new URL("../bridge-extension/manifest.json", import.meta.url),
      "utf8"
    )
  ) as {
    version?: string;
    content_scripts?: Array<{ matches?: string[] }>;
  };
  const bridgeMatches = bridgeManifest.content_scripts?.flatMap(
    (entry) => entry.matches ?? []
  ) ?? [];

  assert.equal(bridgeManifest.version, "0.1.5");
  assert.equal(bridgeMatches.includes("https://www.halou.net.cn/*"), true);

  await appendChatTurn(
    rootDir,
    firstUser,
    "今天心情不错",
    "听起来今天很适合把节奏放松一点。"
  );
  await appendPlaybackHistory(rootDir, firstUser, {
    userMessage: "来一首歌",
    say: plan.say,
    play: plan.play,
    reason: plan.reason,
    segue: plan.segue,
    episode: plan.episode
  });
  await appendPlaybackQueue(rootDir, firstUser, plan);
  await appendTrackFeedback(rootDir, firstUser, {
    action: "like",
    title: plan.play[0].title,
    artist: plan.play[0].artist,
    source: "local"
  });

  assert.equal((await readChatHistory(rootDir, firstUser)).length, 2);
  assert.equal((await readPlaybackHistory(rootDir, firstUser)).length, 1);
  assert.equal((await readPlaybackQueue(rootDir, firstUser)).length, 1);
  assert.equal((await readTrackFeedback(rootDir, firstUser)).length, 1);
  assert.deepEqual(await readChatHistory(rootDir, secondUser), []);
  assert.deepEqual(await readPlaybackHistory(rootDir, secondUser), []);
  assert.deepEqual(await readPlaybackQueue(rootDir, secondUser), []);
  assert.deepEqual(await readTrackFeedback(rootDir, secondUser), []);

  const server = createServer((request, response) => {
    void createRouter(rootDir)(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const unauthenticated = await fetch(`${baseUrl}/api/chat`);
    const authenticated = await fetch(`${baseUrl}/api/chat`, {
      headers: {
        Cookie: `redio_session=${createSessionToken(firstUser)}`
      }
    });
    const health = await fetch(`${baseUrl}/api/health`);
    process.env.AI_RADIO_PUBLIC_DEMO = "1";
    const publicBridgeLogin = await fetch(`${baseUrl}/api/qq/login/cookie`, {
      method: "POST"
    });

    assert.equal(unauthenticated.status, 401);
    assert.equal(authenticated.status, 200);
    assert.equal((await authenticated.json() as unknown[]).length, 2);
    assert.equal(health.status, 200);
    assert.equal(publicBridgeLogin.status, 400);

    const sessionToken = createSessionToken(firstUser, Date.now() - 10);
    await revokeUserSessions(rootDir, firstUser);
    const revokedRequest = {
      headers: {
        cookie: `redio_session=${sessionToken}`
      }
    } as Parameters<typeof readAuthenticatedUser>[1];
    assert.equal(
      await readAuthenticatedUser(rootDir, revokedRequest),
      null
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  console.log("[ok] signed sessions, encrypted credentials, chat persistence, and user isolation");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
