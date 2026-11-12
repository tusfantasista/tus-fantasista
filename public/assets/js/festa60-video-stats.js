const root = document.querySelector("[data-video-stats]");

if (root) {
  const refresh = root.querySelector("[data-video-stats-refresh]");
  const message = root.querySelector("[data-video-stats-message]");
  const values = root.querySelector("[data-video-stats-values]");
  const breakdown = root.querySelector("[data-video-stats-breakdown]");
  const updated = root.querySelector("[data-video-stats-updated]");
  const videoRows = root.querySelector("[data-video-stats-videos]");
  const period = root.querySelector("[data-video-stats-period]");
  const target = root.querySelector("[data-video-stats-target]");
  const timeline = root.querySelector("[data-video-stats-timeline]");
  const range = root.querySelector("[data-video-stats-range]");
  const dailyRows = root.querySelector("[data-video-stats-daily]");
  const dailyNote = root.querySelector("[data-video-stats-daily-note]");
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" });
  const percentFormatter = new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 });
  const definitions = [
    { id: "festa60-pr", key: null, kind: "full" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `festa60-short-pr${String(i + 1).padStart(2, "0")}`, key: `PR${String(i + 1).padStart(2, "0")}`, kind: "pr" })),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `festa60-short-h${String(i + 1).padStart(2, "0")}`, key: `H${String(i + 1).padStart(2, "0")}`, kind: "history" })),
  ];
  const knownIds = new Set(definitions.map((item) => item.id));
  let catalogue = new Map();
  let current = null;

  function parsedDate(value) {
    if (typeof value !== "string" || !value) return null;
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDate(value) {
    const date = parsedDate(value);
    return date ? dateFormatter.format(date) : value ? "日時不明" : "記録なし";
  }
  function number(value) { return value.toLocaleString("ja-JP"); }
  function validCounts(value) {
    return Number.isSafeInteger(value?.starts) && value.starts >= 0 && Number.isSafeInteger(value?.completions) && value.completions >= 0;
  }
  function emptyCounts() { return { starts: 0, completions: 0, first_started_at: null, last_started_at: null, last_completed_at: null }; }
  function completionRate(value) { return value.starts > 0 ? percentFormatter.format(value.completions / value.starts) : "—"; }
  function kindLabel(kind) { return kind === "full" ? "全体版" : kind === "pr" ? "PR短編" : "歴史短編"; }
  function label(video) {
    if (video.video_id === "festa60-pr") return "全体版（1分55秒）";
    const item = catalogue.get(video.video_id);
    return item ? `${item.key || video.short_id} ${item.title}` : video.short_id || video.video_id;
  }
  function shareUrl(video) {
    if (video.video_id === "festa60-pr") return "/festa-60th/#pr-video-full";
    const key = video.short_id?.toLowerCase();
    return key ? `/festa-60th/shorts/?video=${encodeURIComponent(key)}` : "/festa-60th/shorts/";
  }
  function cell(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }

  async function loadCatalogue(signal) {
    try {
      const response = await fetch("/assets/data/festa60-shorts.json", { credentials: "omit", cache: "no-cache", signal });
      if (!response.ok) return false;
      const data = await response.json();
      if (!Array.isArray(data?.items)) return false;
      const next = new Map();
      for (const item of data.items) {
        if (knownIds.has(item?.id) && typeof item.title === "string" && item.title.length <= 200
          && typeof item.key === "string" && /^(PR\d{2}|H\d{2})$/.test(item.key)) next.set(item.id, { title: item.title, key: item.key });
      }
      if (next.size !== 24) return false;
      catalogue = next;
      return true;
    } catch { return false; }
  }

  function normalizeResult(result) {
    if (!result?.ok || !validCounts(result.summary || result.stats)) throw new Error("unavailable");
    const received = new Map();
    for (const item of Array.isArray(result.videos) ? result.videos : []) if (knownIds.has(item?.video_id) && validCounts(item)) received.set(item.video_id, item);
    // Keep the old full-length stats usable while a release propagates.
    const available = Array.isArray(result.videos) ? definitions : definitions.slice(0, 1);
    const legacy = validCounts(result.stats) ? result.stats : null;
    const videos = available.map((entry, order) => ({
      ...emptyCounts(), ...(received.get(entry.id) || (entry.kind === "full" ? legacy : null)),
      video_id: entry.id, short_id: entry.key, kind: entry.kind, order,
    }));
    const summary = result.summary || result.stats;
    const rawTimeline = result.timeline;
    let daily = null;
    if (rawTimeline?.timezone === "Asia/Tokyo" && Array.isArray(rawTimeline.rows)
      && /^\d{4}-\d{2}-\d{2}$/.test(rawTimeline.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(rawTimeline.to || "")) {
      const rows = rawTimeline.rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row?.date || "") && validCounts(row)).map((row) => ({
        date: row.date, starts: row.starts, completions: row.completions,
        videos: (Array.isArray(row.videos) ? row.videos : []).filter((entry) => knownIds.has(entry?.video_id) && validCounts(entry)),
      }));
      if (rows.length === rawTimeline.rows.length) daily = { ...rawTimeline, rows };
    }
    return { summary, videos, timeline: daily };
  }
  function renderSummary(stats) {
    root.querySelector("[data-video-starts]").textContent = number(stats.starts);
    root.querySelector("[data-video-completions]").textContent = number(stats.completions);
    root.querySelector("[data-video-completion-rate]").textContent = completionRate(stats);
    root.querySelector("[data-video-first-start]").textContent = `初回 ${formatDate(stats.first_started_at)}`;
    root.querySelector("[data-video-last-start]").textContent = `最新 ${formatDate(stats.last_started_at)}`;
    root.querySelector("[data-video-last-complete]").textContent = `最新 ${formatDate(stats.last_completed_at)}`;
  }
  function renderVideos(videos) {
    const sorted = [...videos].sort((a, b) => b.starts - a.starts || b.completions - a.completions || a.order - b.order);
    const rows = sorted.map((video) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th"); heading.scope = "row";
      const link = document.createElement("a"); link.href = shareUrl(video); link.target = "_blank"; link.rel = "noopener"; link.textContent = label(video);
      heading.append(link); row.append(heading, cell("td", kindLabel(video.kind)), cell("td", number(video.starts)), cell("td", number(video.completions)), cell("td", completionRate(video)));
      const started = parsedDate(video.last_started_at); const completed = parsedDate(video.last_completed_at);
      const isComplete = completed && (!started || completed >= started);
      const latest = isComplete ? video.last_completed_at : video.last_started_at;
      row.append(cell("td", latest ? `${formatDate(latest)}（${isComplete ? "完了" : "開始"}）` : "未計測"));
      return row;
    });
    videoRows.replaceChildren(...rows);
    const selected = target.value;
    const all = document.createElement("option"); all.value = "all"; all.textContent = "全動画";
    const options = videos.map((video) => { const option = document.createElement("option"); option.value = video.video_id; option.textContent = label(video); return option; });
    target.replaceChildren(all, ...options);
    target.value = selected === "all" || videos.some((video) => video.video_id === selected) ? selected : "all";
  }
  function renderDaily() {
    dailyRows.replaceChildren();
    const daily = current?.timeline;
    if (!daily) {
      timeline.hidden = true; dailyNote.hidden = false;
      dailyNote.textContent = "日別の集計を取得できませんでした。動画別の累計は上の表で確認できます。";
      return;
    }
    dailyNote.hidden = true;
    const selected = current.videos.find((video) => video.video_id === target.value);
    const rows = daily.rows.map((day) => {
      const counts = selected ? day.videos.find((video) => video.video_id === selected.video_id) || emptyCounts() : day;
      return { date: day.date, starts: counts.starts, completions: counts.completions };
    });
    const totals = rows.reduce((sum, row) => ({ starts: sum.starts + row.starts, completions: sum.completions + row.completions }), { starts: 0, completions: 0 });
    range.textContent = `${selected ? label(selected) : "全動画"}：${daily.from}〜${daily.to}（日本時間）／この期間の再生開始 ${number(totals.starts)}回・再生完了 ${number(totals.completions)}回`;
    dailyRows.replaceChildren(...rows.sort((a, b) => b.date.localeCompare(a.date)).map((day) => {
      const row = document.createElement("tr"); const heading = cell("th", day.date); heading.scope = "row";
      row.append(heading, cell("td", number(day.starts)), cell("td", number(day.completions))); return row;
    }));
    timeline.hidden = false;
  }

  async function loadStats() {
    if (refresh.disabled) return;
    refresh.disabled = true; period.disabled = true; target.disabled = true;
    values.hidden = true; breakdown.hidden = true; timeline.hidden = true; dailyNote.hidden = true;
    message.hidden = false; message.className = "admin-message";
    message.textContent = "動画の再生状況を取得しています。"; updated.textContent = "取得中";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const catalogueRequest = loadCatalogue(controller.signal);
      const days = ["7", "30", "90"].includes(period.value) ? period.value : "30";
      const response = await fetch(`/api/festa60/admin/video-stats?days=${days}`, {
        credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new Error("authentication");
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error("unavailable");
      current = normalizeResult(result);
      const namesLoaded = await catalogueRequest;
      renderSummary(current.summary); renderVideos(current.videos); renderDaily();
      updated.textContent = `最終更新 ${dateFormatter.format(new Date())}（日本時間）`;
      message.hidden = namesLoaded || catalogue.size === 24;
      if (!message.hidden) message.textContent = "動画名を取得できなかったため、ID表示で集計を確認できます。";
      values.hidden = false; breakdown.hidden = false;
    } catch (error) {
      current = null;
      message.className = "admin-message admin-message--error";
      message.textContent = error.message === "authentication"
        ? "動画の集計を見るには認証が必要です。ページを再読み込みして認証してください。"
        : "動画の集計を取得できませんでした。時間をおいて「動画の集計を更新」を押してください。";
      updated.textContent = "取得失敗";
    } finally {
      clearTimeout(timeout); controller.abort(); refresh.disabled = false; period.disabled = false; target.disabled = false;
    }
  }
  refresh.addEventListener("click", loadStats);
  period.addEventListener("change", loadStats);
  target.addEventListener("change", renderDaily);
  loadStats();
}
