import { enforceRateLimit } from "./cloudflare-protection.js";

const PAGE_IDS = ["festa60-home", "festa60-register"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "no-store" };

function errorResponse(error, status, headers = {}) {
  return Response.json({ ok: false, error }, { status, headers: { ...NO_STORE, ...headers } });
}

export async function onRequestPageEvents({ request, env }) {
  if (request.method !== "POST") return errorResponse("method_not_allowed", 405, { allow: "POST" });
  const origin = request.headers.get("origin");
  const sameOrigin = origin
    ? origin === new URL(request.url).origin
    : request.headers.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin) return errorResponse("forbidden", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("unsupported_media_type", 415);
  }
  const rateLimited = await enforceRateLimit(request, env, "PAGE_EVENTS_RATE_LIMITER", "festa60-page-events");
  if (rateLimited) return rateLimited;

  const reader = request.body?.getReader();
  if (!reader) return errorResponse("invalid_page_event", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  let event;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return errorResponse("payload_too_large", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    event = JSON.parse(body);
  } catch {
    return errorResponse("invalid_page_event", 400);
  }
  if (!PAGE_IDS.includes(event?.page_id) || typeof event.view_id !== "string" || !UUID_V4.test(event.view_id)) {
    return errorResponse("invalid_page_event", 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO page_views (page_id, view_id, viewed_at) VALUES (?, ?, ?)
       ON CONFLICT (page_id, view_id) DO NOTHING`
    ).bind(event.page_id, event.view_id.toLowerCase(), new Date().toISOString()).run();
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch {
    return errorResponse("page_metrics_unavailable", 503);
  }
}

export async function readPageStats(env, days = 30, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw new RangeError("Unsupported page statistics period.");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError("Invalid statistics date.");
  const dayMs = 24 * 60 * 60 * 1000;
  const jstOffset = 9 * 60 * 60 * 1000;
  const today = new Date(now.getTime() + jstOffset).toISOString().slice(0, 10);
  const todayLabel = Date.parse(`${today}T00:00:00.000Z`);
  const firstLabel = todayLabel - (days - 1) * dayMs;
  const from = new Date(firstLabel).toISOString().slice(0, 10);
  const lowerBound = new Date(firstLabel - jstOffset).toISOString();
  const upperBound = new Date(todayLabel + dayMs - jstOffset).toISOString();
  const [rows, dailyRows] = await Promise.all([
    env.DB.prepare(
    `SELECT page_id, COUNT(*) AS views,
            MIN(viewed_at) AS first_viewed_at, MAX(viewed_at) AS last_viewed_at
     FROM page_views GROUP BY page_id`
    ).all(),
    env.DB.prepare(
      `SELECT date(viewed_at, '+9 hours') AS view_date, page_id, COUNT(*) AS views
       FROM page_views WHERE viewed_at >= ? AND viewed_at < ?
       GROUP BY view_date, page_id ORDER BY view_date, page_id`
    ).bind(lowerBound, upperBound).all(),
  ]);
  const stats = Object.fromEntries(PAGE_IDS.map((id) => [id, {
    views: 0, first_viewed_at: null, last_viewed_at: null,
  }]));
  for (const row of rows.results || []) {
    if (PAGE_IDS.includes(row.page_id)) {
      stats[row.page_id] = {
        views: Number(row.views),
        first_viewed_at: row.first_viewed_at,
        last_viewed_at: row.last_viewed_at,
      };
    }
  }
  const timelineRows = Array.from({ length: days }, (_, index) => ({
    date: new Date(firstLabel + index * dayMs).toISOString().slice(0, 10),
    home_views: 0,
    register_views: 0,
  }));
  const byDate = new Map(timelineRows.map((row) => [row.date, row]));
  for (const row of dailyRows.results || []) {
    const day = byDate.get(row.view_date);
    if (!day) continue;
    if (row.page_id === "festa60-home") day.home_views = Number(row.views);
    if (row.page_id === "festa60-register") day.register_views = Number(row.views);
  }
  stats.timeline = { timezone: "Asia/Tokyo", days, from, to: today, rows: timelineRows };
  return stats;
}
