import { isPortOpen, requestHealth, services } from "./service-utils.mjs";

let hasFailure = false;

for (const service of services) {
  const portOpen = await isPortOpen(service.port);

  if (!portOpen) {
    hasFailure = true;
    console.log(`[fail] ${service.label} port ${service.port} is not listening`);
    continue;
  }

  const health = await requestHealth(service.healthUrl);
  const statusText = health.status > 0 ? `HTTP ${health.status}` : "no HTTP response";

  if (!health.ok) {
    hasFailure = true;
    console.log(`[fail] ${service.label} is listening, but health check failed (${statusText})`);
    continue;
  }

  console.log(`[ok] ${service.label} ready: ${service.url} (${statusText})`);
}

if (hasFailure) {
  process.exitCode = 1;
}
