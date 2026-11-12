const trackedPlayers = new WeakMap();
const retryDelays = [1000, 4000, 12000, 30000];

function createPlaybackId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newSession(videoId) {
  return {
    videoId, playbackId: createPlaybackId(), started: false, completed: false,
    pending: new Set(), sending: false, failedAttempts: 0, retryTimer: null,
    ranges: [], lastTime: null, lastWallTime: null,
  };
}

function appendRange(session, start, end) {
  const ranges = [...session.ranges, [Math.max(0, start), end]].sort((a, b) => a[0] - b[0]);
  session.ranges = ranges.reduce((merged, range) => {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 0.08) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
    return merged;
  }, []);
}

async function sendPending(session) {
  if (!session.playbackId || session.sending || !session.pending.size) return;
  clearTimeout(session.retryTimer);
  session.sending = true;
  const event = session.pending.values().next().value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let retry = false;
  try {
    const response = await fetch("/api/festa60/video-events", {
      method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ video_id: session.videoId, playback_id: session.playbackId, event }),
      keepalive: true, signal: controller.signal,
    });
    if (response.status === 204) {
      session.pending.delete(event);
      session.failedAttempts = 0;
    } else if (response.status === 429 || response.status >= 500) retry = true;
    else session.pending.delete(event);
  } catch {
    retry = true;
  } finally {
    clearTimeout(timeout);
    session.sending = false;
  }
  if (retry) {
    const delay = retryDelays[session.failedAttempts++];
    if (delay !== undefined) session.retryTimer = setTimeout(() => sendPending(session), delay);
  } else if (session.pending.size) sendPending(session);
}

function enqueue(session, event) {
  session.pending.add(event);
  sendPending(session);
}

/** Bind once; every explicit selection starts an anonymous playback session. */
export function setVideoMetrics(player, videoId) {
  let state = trackedPlayers.get(player);
  if (state) {
    sendPending(state.session);
    state.session = newSession(videoId);
    player.dataset.videoId = videoId;
    return;
  }
  state = { session: newSession(videoId) };
  trackedPlayers.set(player, state);
  player.dataset.videoId = videoId;
  const resetCursor = () => {
    state.session.lastTime = player.currentTime;
    state.session.lastWallTime = performance.now();
  };
  const accumulate = (force = false) => {
    const session = state.session;
    const current = player.currentTime;
    const wall = performance.now();
    if (session.started && !session.completed && !player.seeking && (force || !player.paused)
      && session.lastTime !== null && session.lastWallTime !== null) {
      const advance = current - session.lastTime;
      const elapsed = Math.max(0, (wall - session.lastWallTime) / 1000);
      // A seek is never watched time, even when it lands on the final frame.
      if (advance > 0 && advance <= Math.max(0.8, elapsed * Math.max(0.25, player.playbackRate || 1) + 0.45)) {
        appendRange(session, session.lastTime, current);
      }
    }
    session.lastTime = current;
    session.lastWallTime = wall;
  };
  player.addEventListener("playing", () => {
    if (state.session.completed) state.session = newSession(state.session.videoId);
    const session = state.session;
    if (!session.started) {
      session.started = true;
      enqueue(session, "start");
    }
    resetCursor();
  });
  player.addEventListener("timeupdate", () => accumulate());
  player.addEventListener("pause", () => accumulate(true));
  player.addEventListener("seeking", () => {
    state.session.lastTime = null;
    state.session.lastWallTime = null;
  });
  player.addEventListener("seeked", resetCursor);
  player.addEventListener("ratechange", resetCursor);
  player.addEventListener("ended", () => {
    accumulate(true);
    const session = state.session;
    if (!session.started || session.completed || !Number.isFinite(player.duration) || player.duration <= 0) return;
    const watched = session.ranges.reduce((total, range) => total + Math.max(0, Math.min(range[1], player.duration) - Math.max(0, range[0])), 0);
    if (watched / player.duration < 0.9) return;
    session.completed = true;
    enqueue(session, "complete");
  });
  window.addEventListener("online", () => sendPending(state.session));
  window.addEventListener("pagehide", () => {
    accumulate(true);
    sendPending(state.session);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("play", (event) => {
    const active = event.target;
    if (!active.matches?.("video[data-short-player], video[data-video-id]")) return;
    document.querySelectorAll("video[data-short-player], video[data-video-id]").forEach((player) => {
      if (player !== active && !player.paused) player.pause();
    });
  }, true);
  document.querySelectorAll("video[data-video-id]").forEach((player) => setVideoMetrics(player, player.dataset.videoId));
  const legacy = document.querySelector("#pr-video video:not([data-short-player]):not([data-video-id])");
  if (legacy) setVideoMetrics(legacy, "festa60-pr");
}
