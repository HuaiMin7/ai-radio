chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "REDIO_BRIDGE_READ_QQ_PAGE_COOKIE") return false;

  sendResponse({
    cookie: document.cookie || "",
    hostname: window.location.hostname
  });
  return false;
});
