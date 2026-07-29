import { request } from "node:http";
import net from "node:net";

const coreServices = [
  {
    key: "frontend",
    label: "Frontend",
    command: ["npm", "run", "dev"],
    port: 5173,
    url: "http://127.0.0.1:5173/",
    healthUrl: "http://127.0.0.1:5173/"
  },
  {
    key: "api",
    label: "API",
    command: ["npm", "run", "dev:api"],
    port: 8788,
    url: "http://127.0.0.1:8788/api/now",
    healthUrl: "http://127.0.0.1:8788/api/health"
  }
];

const optionalServices = [
  {
    key: "netease",
    label: "NetEase API",
    command: ["npm", "run", "dev:netease"],
    port: 3000,
    url: "http://127.0.0.1:3000/",
    healthUrl: "http://127.0.0.1:3000/"
  }
];

export const services =
  process.env.AI_RADIO_ENABLE_NETEASE_SERVICE === "1"
    ? [...coreServices, ...optionalServices]
    : coreServices;

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function isPortOpen(port) {
  const hosts = ["127.0.0.1", "::1"];

  for (const host of hosts) {
    const open = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });

      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        resolve(false);
      });
      socket.setTimeout(600, () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (open) {
      return true;
    }
  }

  return false;
}

export async function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

export async function requestHealth(url) {
  return new Promise((resolve) => {
    const req = request(url, { method: "GET", timeout: 2500 }, (res) => {
      res.resume();
      resolve({
        ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400),
        status: res.statusCode ?? 0
      });
    });

    req.once("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
    req.once("error", () => {
      resolve({ ok: false, status: 0 });
    });
    req.end();
  });
}
