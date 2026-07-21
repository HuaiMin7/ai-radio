const BRIDGE_SOURCE = "redio-bridge-extension";
const PAGE_SOURCE = "redio-web";

window.postMessage({
  source: BRIDGE_SOURCE,
  type: "REDIO_BRIDGE_READY",
  version: chrome.runtime.getManifest().version
}, window.location.origin);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE || !message.id) return;

  if (message.type === "REDIO_BRIDGE_PING") {
    window.postMessage({
      source: BRIDGE_SOURCE,
      type: "REDIO_BRIDGE_PONG",
      id: message.id,
      version: chrome.runtime.getManifest().version
    }, window.location.origin);
    return;
  }

  if (
    message.type !== "REDIO_BRIDGE_GET_STATUS" &&
    message.type !== "REDIO_BRIDGE_OPEN_QQ_LOGIN" &&
    message.type !== "REDIO_BRIDGE_WARMUP_QQ_PLAYBACK" &&
    message.type !== "REDIO_BRIDGE_SYNC_QQ_COOKIE"
  ) {
    return;
  }

  chrome.runtime.sendMessage({
    type: message.type
  }, (response) => {
    window.postMessage({
      source: BRIDGE_SOURCE,
      type: `${message.type}_RESULT`,
      id: message.id,
      response: response ?? {
        ok: false,
        error: chrome.runtime.lastError?.message ?? "Redio Bridge 没有返回结果"
      }
    }, window.location.origin);
  });
});
