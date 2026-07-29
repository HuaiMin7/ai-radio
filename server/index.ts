import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertAuthConfiguration } from "./auth.js";
import { createRouter } from "./router.js";

loadEnvFile(process.cwd());
assertAuthConfiguration();

const host = process.env.AI_RADIO_API_HOST ?? "127.0.0.1";
const configuredPort = Number(process.env.AI_RADIO_API_PORT ?? "8788");
const port = Number.isInteger(configuredPort) && configuredPort > 0
  ? configuredPort
  : 8788;

const router = createRouter(process.cwd());

const server = createServer((request, response) => {
  void router(request, response);
});

server.listen(port, host, () => {
  console.log(`AI Radio API listening at http://${host}:${port}`);
});

function loadEnvFile(rootDir: string) {
  try {
    const env = readFileSync(join(rootDir, ".env"), "utf8");

    for (const line of env.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional. Defaults keep the local mock provider working.
  }
}
