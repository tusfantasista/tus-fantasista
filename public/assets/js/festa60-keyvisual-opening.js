/* Play once, then light the exact official poster's two film strips. */
(() => {
  "use strict";

  const stage = document.querySelector("[data-keyvisual-opening]");
  if (!stage) return;

  const artwork = stage.querySelector(".keyvisual-artwork");
  const video = stage.querySelector(".keyvisual-opening-video");
  const toggle = stage.querySelector("[data-keyvisual-toggle]");
  const light = stage.querySelector(".keyvisual-film-light");
  const lightToggle = stage.querySelector("[data-keyvisual-light-toggle]");
  if (!artwork || !video || !toggle || !video.canPlayType('video/mp4; codecs="avc1.64001f"')) {
    stage.dataset.openingView = "poster";
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  const supportsLight = light && lightToggle && window.CSS?.supports("mask-image", "linear-gradient(black, black)");
  const initialBounds = artwork.getBoundingClientRect();
  let inView = !("IntersectionObserver" in window) || (initialBounds.top < window.innerHeight && initialBounds.bottom > 0);
  let lightInView = !("IntersectionObserver" in window);
  let wantsPlayback = true;
  let preview = true;
  let ended = false;
  let unavailable = false;
  let restarting = false;
  let lightPaused = false;

  video.muted = true;

  function syncPlayback() {
    const blocked = reducedMotion.matches || connection?.saveData || unavailable;
    stage.dataset.openingView = !blocked && preview ? "intro" : "poster";
    toggle.hidden = Boolean(blocked);
    toggle.textContent = ended ? "もう一度再生" : wantsPlayback ? "映像を一時停止" : "映像を再生";

    const showLight = Boolean(ended && !blocked && supportsLight);
    const lightActive = showLight && !lightPaused && lightInView && !document.hidden;
    stage.dataset.motionState = lightActive ? "running" : "paused";
    if (light) light.hidden = !showLight;
    if (lightToggle) {
      lightToggle.hidden = !showLight;
      lightToggle.textContent = lightPaused ? "フィルムの光を再生" : "フィルムの光を一時停止";
    }

    if (blocked || !preview || restarting || !wantsPlayback || !inView || document.hidden) {
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
      if (ended) {
        // Keep the poster in place until the first replay frame has decoded.
        restarting = true;
        preview = false;
        video.currentTime = 0;
      } else if (!restarting) {
        preview = true;
      }
      ended = false;
    }
    syncPlayback();
  });
  video.addEventListener("seeked", () => {
    if (!restarting) return;
    restarting = false;
    preview = true;
    syncPlayback();
  });
  lightToggle?.addEventListener("click", () => {
    lightPaused = !lightPaused;
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
      lightInView = entry.isIntersecting && entry.intersectionRatio >= 0.16;
      syncPlayback();
    }, { threshold: [0, 0.16] });
    observer.observe(artwork);
  }

  syncPlayback();
})();
