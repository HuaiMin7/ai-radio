import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

export type AuthenticatedUser = {
  provider: "qq";
  accountId: string;
  storageKey: string;
};

type SessionPayload = {
  version: 1;
  provider: "qq";
  accountId: string;
  issuedAt: number;
  expiresAt: number;
};

type EncryptedSecret = {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

const sessionCookieName = "redio_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const ephemeralSecret = randomBytes(32).toString("hex");

export function assertAuthConfiguration() {
  const configuredSecret = process.env.AI_RADIO_SESSION_SECRET?.trim() ?? "";

  if (
    process.env.AI_RADIO_PUBLIC_DEMO === "1" &&
    configuredSecret.length < 32
  ) {
    throw new Error(
      "AI_RADIO_SESSION_SECRET must contain at least 32 characters in public mode"
    );
  }
}

export function createAuthenticatedUser(
  provider: AuthenticatedUser["provider"],
  accountId: string
): AuthenticatedUser {
  const normalizedAccountId = accountId.trim();

  if (!/^\d+$/.test(normalizedAccountId)) {
    throw new Error("Invalid music account identifier");
  }

  return {
    provider,
    accountId: normalizedAccountId,
    storageKey: createHash("sha256")
      .update(`${provider}:${normalizedAccountId}`)
      .digest("hex")
      .slice(0, 32)
  };
}

export async function readAuthenticatedUser(
  rootDir: string,
  request: IncomingMessage
) {
  const token = readCookie(request.headers.cookie, sessionCookieName);
  const payload = token ? verifySessionPayload(token) : null;

  if (!payload) {
    return null;
  }

  const user = createAuthenticatedUser(payload.provider, payload.accountId);
  const revokedBefore = await readSessionRevokedBefore(rootDir, user);

  return payload.issuedAt > revokedBefore ? user : null;
}

export function setAuthenticatedUser(
  request: IncomingMessage,
  response: ServerResponse,
  user: AuthenticatedUser
) {
  const token = createSessionToken(user);
  const secure =
    process.env.AI_RADIO_SECURE_COOKIES === "1" ||
    request.headers["x-forwarded-proto"] === "https";

  response.setHeader(
    "Set-Cookie",
    [
      `${sessionCookieName}=${token}`,
      "Path=/",
      `Max-Age=${sessionMaxAgeSeconds}`,
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : ""
    ]
      .filter(Boolean)
      .join("; ")
  );
}

export function clearAuthenticatedUser(
  request: IncomingMessage,
  response: ServerResponse
) {
  const secure =
    process.env.AI_RADIO_SECURE_COOKIES === "1" ||
    request.headers["x-forwarded-proto"] === "https";

  response.setHeader(
    "Set-Cookie",
    [
      `${sessionCookieName}=`,
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
      secure ? "Secure" : ""
    ]
      .filter(Boolean)
      .join("; ")
  );
}

export function getUserDataDir(rootDir: string, user: AuthenticatedUser) {
  return join(rootDir, "data", "users", user.storageKey);
}

export async function writeEncryptedUserSecret(
  rootDir: string,
  user: AuthenticatedUser,
  name: "qq-cookie",
  value: string
) {
  const userDir = getUserDataDir(rootDir, user);
  const path = join(userDir, `${name}.enc.json`);
  const encrypted = encryptSecret(value);

  await mkdir(userDir, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(encrypted)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function readEncryptedUserSecret(
  rootDir: string,
  user: AuthenticatedUser,
  name: "qq-cookie"
) {
  try {
    const raw = await readFile(
      join(getUserDataDir(rootDir, user), `${name}.enc.json`),
      "utf8"
    );
    const parsed = JSON.parse(raw) as Partial<EncryptedSecret>;

    if (
      parsed.version !== 1 ||
      typeof parsed.iv !== "string" ||
      typeof parsed.authTag !== "string" ||
      typeof parsed.ciphertext !== "string"
    ) {
      throw new Error("Invalid encrypted credential");
    }

    return decryptSecret(parsed as EncryptedSecret);
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    throw error;
  }
}

export async function deleteEncryptedUserSecret(
  rootDir: string,
  user: AuthenticatedUser,
  name: "qq-cookie"
) {
  try {
    await unlink(join(getUserDataDir(rootDir, user), `${name}.enc.json`));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

export async function revokeUserSessions(
  rootDir: string,
  user: AuthenticatedUser,
  revokedBefore = Date.now()
) {
  const userDir = getUserDataDir(rootDir, user);

  await mkdir(userDir, { recursive: true, mode: 0o700 });
  await writeFile(join(userDir, "session-revoked-before"), `${revokedBefore}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export function createSessionToken(
  user: AuthenticatedUser,
  now = Date.now()
) {
  const payload: SessionPayload = {
    version: 1,
    provider: user.provider,
    accountId: user.accountId,
    issuedAt: now,
    expiresAt: now + sessionMaxAgeSeconds * 1000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, now = Date.now()) {
  const payload = verifySessionPayload(token, now);

  return payload
    ? createAuthenticatedUser(payload.provider, payload.accountId)
    : null;
}

function verifySessionPayload(token: string, now = Date.now()) {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");

  if (!encodedPayload || !suppliedSignature || extra) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;

    if (
      payload.version !== 1 ||
      payload.provider !== "qq" ||
      typeof payload.accountId !== "string" ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= now
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function readSessionRevokedBefore(
  rootDir: string,
  user: AuthenticatedUser
) {
  try {
    const raw = await readFile(
      join(getUserDataDir(rootDir, user), "session-revoked-before"),
      "utf8"
    );
    const value = Number(raw.trim());

    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0;
    }

    throw error;
  }
}

function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);

  return {
    version: 1,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decryptSecret(secret: EncryptedSecret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(secret.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function getEncryptionKey() {
  return createHash("sha256")
    .update(`redio-user-credential:${getSessionSecret()}`)
    .digest();
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function getSessionSecret() {
  return process.env.AI_RADIO_SESSION_SECRET?.trim() || ephemeralSecret;
}

function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();

    if (key === name) {
      return part.slice(separatorIndex + 1).trim();
    }
  }

  return "";
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
