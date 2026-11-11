const root = document.querySelector("[data-video-stats]");

if (root) {
  const refresh = root.querySelector("[data-video-stats-refresh]");
  const message = root.querySelector("[data-video-stats-message]");
  const values = root.querySelector("[data-video-stats-values]");
  const updated = root.querySelector("[data-video-stats-updated]");
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  });

  function formatDate(value) {
    if (!value) return "記録なし";
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? "日時不明" : dateFormatter.format(date);
  }

  async function loadStats() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    values.hidden = true;
    message.hidden = false;
    message.className = "admin-message";
    message.textContent = "動画の再生状況を取得しています。";
    updated.textContent = "取得中";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("/api/festa60/admin/video-stats", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        throw new Error("authentication");
      }
      const stats = result?.stats;
      if (!response.ok || !result?.ok || !Number.isSafeInteger(stats?.starts) || stats.starts < 0
          || !Number.isSafeInteger(stats?.completions) || stats.completions < 0) {
        throw new Error("unavailable");
      }

      root.querySelector("[data-video-starts]").textContent = stats.starts.toLocaleString("ja-JP");
      root.querySelector("[data-video-completions]").textContent = stats.completions.toLocaleString("ja-JP");
      root.querySelector("[data-video-first-start]").textContent = `初回 ${formatDate(stats.first_started_at)}`;
      root.querySelector("[data-video-last-start]").textContent = `最新 ${formatDate(stats.last_started_at)}`;
      root.querySelector("[data-video-last-complete]").textContent = `最新 ${formatDate(stats.last_completed_at)}`;
      updated.textContent = `最終更新 ${dateFormatter.format(new Date())}（日本時間）`;
      message.hidden = true;
      values.hidden = false;
    } catch (error) {
      message.className = "admin-message admin-message--error";
      message.textContent = error.message === "authentication"
        ? "動画の集計を見るには認証が必要です。ページを再読み込みして認証してください。"
        : "動画の集計を取得できませんでした。時間をおいて「動画の集計を更新」を押してください。";
      updated.textContent = "取得失敗";
    } finally {
      clearTimeout(timeout);
      refresh.disabled = false;
    }
  }

  refresh.addEventListener("click", loadStats);
  loadStats();
}
