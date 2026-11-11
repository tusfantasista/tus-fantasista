const video = document.querySelector("#pr-video video");

if (video && globalThis.crypto?.randomUUID) {
  trackPlayback(video);
}

function trackPlayback(player) {
  const playbackId = crypto.randomUUID();
  const pendingEvents = new Set();
  const retryDelays = [1000, 4000, 12000, 30000];
  let started = false;
  let completed = false;
  let sending = false;
  let retryTimer;
  let failedAttempts = 0;

  function enqueue(event) {
    pendingEvents.add(event);
    sendPending();
  }

  async function sendPending() {
    if (sending || !pendingEvents.size) return;
    clearTimeout(retryTimer);
    sending = true;
    const event = pendingEvents.values().next().value;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let retry = false;

    try {
      const response = await fetch("/api/festa60/video-events", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ video_id: "festa60-pr", playback_id: playbackId, event }),
        keepalive: true,
        signal: controller.signal,
      });
      if (response.status === 204) {
        pendingEvents.delete(event);
        failedAttempts = 0;
      } else if (response.status === 429 || response.status >= 500) {
        retry = true;
      } else {
        pendingEvents.delete(event);
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
      if (delay !== undefined) retryTimer = setTimeout(sendPending, delay);
    } else {
      sendPending();
    }
  }

  player.addEventListener("playing", () => {
    if (started) return;
    started = true;
    enqueue("start");
  });

  player.addEventListener("ended", () => {
    if (!started || completed || !Number.isFinite(player.duration) || player.duration <= 0) return;
    let watchedSeconds = 0;
    const played = player.played;
    for (let index = 0; index < played.length; index += 1) {
      watchedSeconds += Math.max(0, Math.min(played.end(index), player.duration) - Math.max(0, played.start(index)));
    }
    if (watchedSeconds / player.duration < 0.9) return;
    completed = true;
    enqueue("complete");
  });

  window.addEventListener("online", sendPending);
  window.addEventListener("pagehide", sendPending);
}
