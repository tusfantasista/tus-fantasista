const root = document.querySelector("[data-page-stats]");

if (root) {
  const pageIds = ["festa60-home", "festa60-register"];
  const refresh = root.querySelector("[data-page-stats-refresh]");
  const message = root.querySelector("[data-page-stats-message]");
  const values = root.querySelector("[data-page-stats-values]");
  const updated = root.querySelector("[data-page-stats-updated]");
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
  });

  function formatDate(value) {
    if (!value) return "記録なし";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "日時不明" : dateFormatter.format(date);
  }

  async function loadStats() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    values.hidden = true;
    message.hidden = false;
    message.className = "admin-message";
    message.textContent = "ページの閲覧数を取得しています。";
    updated.textContent = "取得中";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/festa60/admin/page-stats", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) throw new Error("authentication");
      if (!response.ok || !result?.ok || !pageIds.every((id) =>
        Number.isSafeInteger(result.stats?.[id]?.views) && result.stats[id].views >= 0)) {
        throw new Error("unavailable");
      }
      for (const id of pageIds) {
        const card = root.querySelector(`[data-page-stats-page="${id}"]`);
        const stats = result.stats[id];
        card.querySelector("[data-page-views]").textContent = stats.views.toLocaleString("ja-JP");
        card.querySelector("[data-page-first-view]").textContent = `初回 ${formatDate(stats.first_viewed_at)}`;
        card.querySelector("[data-page-last-view]").textContent = `最新 ${formatDate(stats.last_viewed_at)}`;
      }
      updated.textContent = `最終更新 ${dateFormatter.format(new Date())}（日本時間）`;
      message.hidden = true;
      values.hidden = false;
    } catch (error) {
      message.className = "admin-message admin-message--error";
      message.textContent = error.message === "authentication"
        ? "ページの集計を見るには認証が必要です。ページを再読み込みして認証してください。"
        : "ページの集計を取得できませんでした。時間をおいて更新してください。";
      updated.textContent = "取得失敗";
    } finally {
      clearTimeout(timeout);
      refresh.disabled = false;
    }
  }

  refresh.addEventListener("click", loadStats);
  loadStats();
}
