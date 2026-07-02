import { spawn } from "node:child_process";
import { isPortOpen, requestHealth, services, waitForPort } from "./service-utils.mjs";

const children = [];

function startService(service) {
  const [command, ...args] = service.command;
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.push(child);

  child.stdout.on("data", (chunk) => {
    writePrefixed(service.key, chunk);
  });
  child.stderr.on("data", (chunk) => {
    writePrefixed(service.key, chunk);
  });
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[${service.key}] exited with ${reason}`);
  });

  return child;
}

function writePrefixed(key, chunk) {
  const lines = chunk.toString().split(/\r?\n/);

  for (const line of lines) {
    if (line.trim()) {
      console.log(`[${key}] ${line}`);
    }
  }
}

async function ensureService(service) {
  if (await isPortOpen(service.port)) {
    console.log(`[reuse] ${service.label} already listening on ${service.port}`);
    return;
  }

  console.log(`[start] ${service.label}: ${service.command.join(" ")}`);
  startService(service);

  const ready = await waitForPort(service.port, 30000);

  if (!ready) {
    throw new Error(`${service.label} did not open port ${service.port}`);
  }

  const health = await requestHealth(service.healthUrl);
  const statusText = health.status > 0 ? `HTTP ${health.status}` : "no HTTP response";

  if (health.ok) {
    console.log(`[ok] ${service.label} ready: ${service.url} (${statusText})`);
    return;
  }

  console.log(`[warn] ${service.label} port is open, health check returned ${statusText}`);
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
  for (const service of services) {
    await ensureService(service);
  }

  console.log("");
  console.log("Redio is ready:");
  console.log("  App: http://127.0.0.1:5173/");
  console.log("  API: http://127.0.0.1:8787/api/now");
  if (process.env.AI_RADIO_ENABLE_NETEASE_SERVICE === "1") {
    console.log("  NetEase API: http://127.0.0.1:3000/");
  }
  console.log("");
  console.log("Press Ctrl+C to stop services started by this command.");

  await new Promise(() => {});
} catch (error) {
  shutdown();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
