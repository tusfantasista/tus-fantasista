/* Play the site's silent introduction once, then show the exact official poster. */
(() => {
  "use strict";

  const stage = document.querySelector("[data-keyvisual-opening]");
  if (!stage) return;

  const artwork = stage.querySelector(".keyvisual-artwork");
  const video = stage.querySelector(".keyvisual-opening-video");
  const toggle = stage.querySelector("[data-keyvisual-toggle]");
  if (!artwork || !video || !toggle || !video.canPlayType('video/mp4; codecs="avc1.64001f"')) {
    stage.dataset.openingView = "poster";
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  const initialBounds = artwork.getBoundingClientRect();
  let inView = initialBounds.top < window.innerHeight && initialBounds.bottom > 0;
  let wantsPlayback = true;
  let preview = true;
  let ended = false;
  let unavailable = false;

  video.muted = true;

  function syncPlayback() {
    const blocked = reducedMotion.matches || connection?.saveData || unavailable;
    stage.dataset.openingView = !blocked && preview ? "intro" : "poster";
    toggle.hidden = Boolean(blocked);
    toggle.textContent = ended ? "もう一度再生" : wantsPlayback ? "映像を一時停止" : "映像を再生";

    if (blocked || !wantsPlayback || !inView || document.hidden) {
      video.pause();
      return;
    }

    if (!video.hasAttribute("src")) video.src = video.dataset.src;
    if (!video.paused) return;

    video.play().catch((error) => {
      if (error.name === "AbortError") return;
      wantsPlayback = false;
      preview = false;
      syncPlayback();
    });
  }

  toggle.addEventListener("click", () => {
    wantsPlayback = !wantsPlayback;
    if (wantsPlayback) {
      if (ended) video.currentTime = 0;
      ended = false;
      preview = true;
    }
    syncPlayback();
  });
  video.addEventListener("ended", () => {
    ended = true;
    preview = false;
    wantsPlayback = false;
    syncPlayback();
  });
  video.addEventListener("error", () => {
    unavailable = true;
    syncPlayback();
  });

  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);
  connection?.addEventListener?.("change", syncPlayback);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(artwork);
  }

  syncPlayback();
})();
