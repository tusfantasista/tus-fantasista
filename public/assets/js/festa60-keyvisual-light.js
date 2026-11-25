/* Keep the official poster visible and animate only light masked to its films. */
(() => {
  "use strict";

  const stage = document.querySelector("[data-keyvisual-light]");
  if (!stage) return;

  const artwork = stage.querySelector(".keyvisual-artwork");
  const light = stage.querySelector(".keyvisual-film-light");
  const toggle = stage.querySelector("[data-keyvisual-toggle]");
  if (!artwork || !light || !toggle || !window.CSS?.supports("mask-image", "linear-gradient(black, black)")) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  let inView = !("IntersectionObserver" in window);
  let userPaused = false;

  function syncMotion() {
    const blocked = reducedMotion.matches || connection?.saveData;
    const active = !blocked && !userPaused && inView && !document.hidden;

    stage.dataset.motionState = active ? "running" : "paused";
    light.hidden = Boolean(blocked);
    toggle.hidden = Boolean(blocked);
    toggle.textContent = userPaused ? "フィルムの光を再生" : "フィルムの光を一時停止";
  }

  toggle.addEventListener("click", () => {
    userPaused = !userPaused;
    syncMotion();
  });
  document.addEventListener("visibilitychange", syncMotion);
  reducedMotion.addEventListener("change", syncMotion);
  connection?.addEventListener?.("change", syncMotion);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncMotion();
    }, { threshold: 0.16 });
    observer.observe(artwork);
  }

  syncMotion();
})();
