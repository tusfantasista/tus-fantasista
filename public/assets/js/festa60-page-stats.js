const root = document.querySelector("[data-page-stats]");

if (root) {
  const pageIds = ["festa60-home", "festa60-register"];
  const refresh = root.querySelector("[data-page-stats-refresh]");
  const period = root.querySelector("[data-page-stats-period]");
  const message = root.querySelector("[data-page-stats-message]");
  const values = root.querySelector("[data-page-stats-values]");
  const updated = root.querySelector("[data-page-stats-updated]");
  const timelinePanel = root.querySelector("[data-page-stats-timeline]");
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
  });
  let requestSequence = 0;
  let activeController;

  function formatDate(value) {
    if (!value) return "記録なし";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "日時不明" : dateFormatter.format(date);
  }

  function validTimeline(timeline, days) {
    return timeline?.timezone === "Asia/Tokyo" && timeline.days === days
      && /^\d{4}-\d{2}-\d{2}$/.test(timeline.from) && /^\d{4}-\d{2}-\d{2}$/.test(timeline.to)
      && Array.isArray(timeline.rows) && timeline.rows.length === days
      && timeline.rows.every((row, index) => row.date === new Date(Date.parse(`${timeline.from}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10)
        && Number.isSafeInteger(row.home_views) && row.home_views >= 0
        && Number.isSafeInteger(row.register_views) && row.register_views >= 0)
      && timeline.rows[days - 1].date === timeline.to;
  }

  function renderTimeline(timeline) {
    const rows = timeline.rows;
    root.querySelector("[data-page-stats-range]").textContent = `${timeline.from}〜${timeline.to}（日本時間・${timeline.days}日間）`;
    const chart = root.querySelector("[data-page-stats-chart]");
    const width = 880;
    const height = 260;
    const left = 58;
    const right = 26;
    const top = 24;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maximum = Math.max(1, ...rows.flatMap((row) => [row.home_views, row.register_views]));
    const ceiling = Math.ceil(maximum / 4) * 4;
    const x = (index) => left + index * plotWidth / (rows.length - 1);
    const y = (count) => top + plotHeight * (1 - count / ceiling);
    const grid = Array.from({ length: 5 }, (_, index) => {
      const count = ceiling * index / 4;
      return `<line x1="${left}" x2="${width - right}" y1="${y(count)}" y2="${y(count)}" class="page-stats-grid"/><text x="${left - 12}" y="${y(count) + 4}" text-anchor="end" class="page-stats-axis">${count.toLocaleString("ja-JP")}</text>`;
    }).join("");
    const tickIndexes = timeline.days === 7
      ? rows.map((_, index) => index)
      : [...new Set(Array.from({ length: 5 }, (_, index) => Math.round(index * (rows.length - 1) / 4)))];
    const labels = tickIndexes.map((index) => `<text x="${x(index)}" y="${height - 13}" text-anchor="middle" class="page-stats-axis">${rows[index].date.slice(5).replace("-", "/")}</text>`).join("");
    const series = [
      { key: "home_views", name: "FESTAトップページ", style: "home" },
      { key: "register_views", name: "申込ページ", style: "register" },
    ].map(({ key, name, style }) => {
      const points = rows.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
      const dots = rows.map((row, index) => `<circle cx="${x(index)}" cy="${y(row[key])}" r="2.8" class="page-stats-dot page-stats-dot--${style}"><title>${row.date} ${name} ${row[key].toLocaleString("ja-JP")}回</title></circle>`).join("");
      return `<polyline points="${points}" class="page-stats-line page-stats-line--${style}"/>${dots}`;
    }).join("");
    // Dates and counts have been validated above; no applicant text enters SVG markup.
    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="page-stats-chart-title page-stats-chart-description"><title id="page-stats-chart-title">ページ閲覧数の日別推移</title><desc id="page-stats-chart-description">${timeline.from}から${timeline.to}までの日本時間の日別閲覧回数です。正確な数値は下の日別表で確認できます。</desc>${grid}${labels}${series}</svg>`;
    const body = root.querySelector("[data-page-stats-daily]");
    const tableRows = rows.slice().reverse().map((row) => {
      const tr = document.createElement("tr");
      const date = document.createElement("th");
      date.scope = "row";
      date.textContent = row.date;
      tr.append(date);
      for (const key of ["home_views", "register_views"]) {
        const cell = document.createElement("td");
        cell.textContent = row[key].toLocaleString("ja-JP");
        tr.append(cell);
      }
      return tr;
    });
    body.replaceChildren(...tableRows);
  }

  async function loadStats() {
    const sequence = ++requestSequence;
    activeController?.abort();
    const days = Number(period?.value || 30);
    refresh.disabled = true;
    values.hidden = true;
    timelinePanel.hidden = true;
    message.hidden = false;
    message.className = "admin-message";
    message.textContent = "ページの閲覧数を取得しています。";
    updated.textContent = "取得中";
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/festa60/admin/page-stats?days=${days}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (sequence !== requestSequence) return;
      if (response.status === 401 || response.status === 403) throw new Error("authentication");
      if (!response.ok || !result?.ok || !pageIds.every((id) =>
        Number.isSafeInteger(result.stats?.[id]?.views) && result.stats[id].views >= 0)
        || !validTimeline(result.stats.timeline, days)) {
        throw new Error("unavailable");
      }
      for (const id of pageIds) {
        const card = root.querySelector(`[data-page-stats-page="${id}"]`);
        const stats = result.stats[id];
        card.querySelector("[data-page-views]").textContent = stats.views.toLocaleString("ja-JP");
        card.querySelector("[data-page-first-view]").textContent = `初回 ${formatDate(stats.first_viewed_at)}`;
        card.querySelector("[data-page-last-view]").textContent = `最新 ${formatDate(stats.last_viewed_at)}`;
      }
      renderTimeline(result.stats.timeline);
      updated.textContent = `最終更新 ${dateFormatter.format(new Date())}（日本時間）`;
      message.hidden = true;
      values.hidden = false;
      timelinePanel.hidden = false;
    } catch (error) {
      if (sequence !== requestSequence) return;
      message.className = "admin-message admin-message--error";
      message.textContent = error.message === "authentication"
        ? "ページの集計を見るには認証が必要です。ページを再読み込みして認証してください。"
        : "ページの集計を取得できませんでした。時間をおいて更新してください。";
      updated.textContent = "取得失敗";
    } finally {
      clearTimeout(timeout);
      if (sequence === requestSequence) refresh.disabled = false;
    }
  }

  refresh.addEventListener("click", loadStats);
  period?.addEventListener("change", loadStats);
  loadStats();
}
