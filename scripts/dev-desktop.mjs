import { spawn } from "node:child_process";
import { isPortOpen, requestHealth, services, waitForPort } from "./service-utils.mjs";

const children = [];
const desktopEnv = {
  ...process.env,
  AI_RADIO_MUSIC_PROVIDER: process.env.AI_RADIO_MUSIC_PROVIDER || "qq"
};

function startChild(command, args, label) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: desktopEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.push(child);

  child.stdout.on("data", (chunk) => writePrefixed(label, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(label, chunk));
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[${label}] exited with ${reason}`);
  });

  return child;
}

function writePrefixed(label, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim()) {
      console.log(`[${label}] ${line}`);
    }
  }
}

async function ensureBaseServices() {
  const missingServices = [];

  for (const service of services) {
    if (!(await isPortOpen(service.port))) {
      missingServices.push(service);
    }
  }

  if (missingServices.length > 0) {
    console.log("[start] Base services: npm run dev:all");
    startChild("npm", ["run", "dev:all"], "services");
  } else {
    console.log("[reuse] Base services already running");
  }

  for (const service of services) {
    const ready = await waitForPort(service.port, 30000);

    if (!ready) {
      throw new Error(`${service.label} did not open port ${service.port}`);
    }

    const health = await requestHealth(service.healthUrl);

    if (!health.ok) {
      throw new Error(`${service.label} health check failed`);
    }

    console.log(`[ok] ${service.label}: ${service.url}`);
  }
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }
}

process.once("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.once("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

try {
  await ensureBaseServices();
  console.log("[start] Desktop: npm run desktop");
  const desktop = startChild("npm", ["run", "desktop"], "desktop");

  desktop.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
} catch (error) {
  shutdown();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
