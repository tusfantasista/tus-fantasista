const pageId = new Map([
  ["/festa-60th/", "festa60-home"],
  ["/festa-60th", "festa60-home"],
  ["/festa60-register/", "festa60-register"],
  ["/festa60-register", "festa60-register"],
]).get(window.location.pathname);

if (pageId && globalThis.crypto?.randomUUID) {
  recordPageView(pageId);
}

function recordPageView(page) {
  const payload = JSON.stringify({ page_id: page, view_id: crypto.randomUUID() });
  const retryDelays = [1000, 4000, 12000, 30000];
  let acknowledged = false;
  let sending = false;
  let retryTimer;
  let failedAttempts = 0;

  async function sendView() {
    if (acknowledged || sending) return;
    clearTimeout(retryTimer);
    sending = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let retry = false;
    try {
      const response = await fetch("/api/festa60/page-events", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
        signal: controller.signal,
      });
      if (response.status === 204) {
        acknowledged = true;
      } else {
        retry = response.status === 429 || response.status >= 500;
        acknowledged = !retry;
      }
    } catch {
      retry = true;
    } finally {
      clearTimeout(timeout);
      sending = false;
    }
    if (retry) {
      const delay = retryDelays[failedAttempts];
      failedAttempts += 1;
      if (delay !== undefined) retryTimer = setTimeout(sendView, delay);
    }
  }

  window.addEventListener("online", sendView);
  window.addEventListener("pagehide", sendView);
  sendView();
}
