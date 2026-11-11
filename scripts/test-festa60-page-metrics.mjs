import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { onRequestPageEvents, readPageStats } from "../public/festa60-page-metrics.js";

const ORIGIN = "https://example.com";
const PAGE_IDS = ["festa60-home", "festa60-register"];
const STATS_NOW = new Date("2026-11-11T15:00:00.000Z");
const database = new DatabaseSync(":memory:");
database.exec(await readFile(new URL("../migrations/20261111_add_page_metrics.sql", import.meta.url), "utf8"));

function statement(sql, values = []) {
  return {
    bind(...boundValues) { return statement(sql, boundValues); },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { success: true, meta: { changes: result.changes } };
    },
    async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
  };
}

const env = {
  DB: { prepare: (sql) => statement(sql) },
  PAGE_EVENTS_RATE_LIMITER: { async limit() { return { success: true }; } },
};

function request(payload, options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (!options.omitOrigin) headers.set("origin", options.origin ?? ORIGIN);
  for (const [name, value] of Object.entries(options.headers || {})) headers.set(name, value);
  return new Request(`${ORIGIN}/api/festa60/page-events`, {
    method: options.method || "POST",
    headers,
    ...(options.method === "GET" ? {} : { body: options.body ?? JSON.stringify(payload) }),
  });
}

async function send(payload, options = {}, requestEnv = env) {
  return onRequestPageEvents({ request: request(payload, options), env: requestEnv });
}

async function view(pageId, viewId = randomUUID(), options = {}) {
  const response = await send({ page_id: pageId, view_id: viewId }, options);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("cache-control"), "no-store");
  return viewId;
}

function emptyTimeline(days = 30) {
  const to = "2026-11-12";
  const first = Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86400000;
  const rows = Array.from({ length: days }, (_, index) => ({
    date: new Date(first + index * 86400000).toISOString().slice(0, 10), home_views: 0, register_views: 0,
  }));
  return { timezone: "Asia/Tokyo", days, from: rows[0].date, to, rows };
}
function statsFixture(days = 30) {
  return {
    ...Object.fromEntries(PAGE_IDS.map((id) => [id, { views: 0, first_viewed_at: null, last_viewed_at: null }])),
    timeline: emptyTimeline(days),
  };
}
const emptyStats = statsFixture();

try {
  assert.deepEqual(await readPageStats(env, 30, STATS_NOW), emptyStats);
  const firstId = await view("festa60-home");
  const firstTimestamp = database.prepare("SELECT viewed_at FROM page_views WHERE view_id = ?").get(firstId).viewed_at;
  assert.ok(Number.isFinite(Date.parse(firstTimestamp)));
  await view("festa60-home", firstId);
  await view("festa60-home", firstId.toUpperCase());
  assert.equal((await readPageStats(env, 30, STATS_NOW))["festa60-home"].views, 1);
  assert.equal(database.prepare("SELECT viewed_at FROM page_views WHERE view_id = ?").get(firstId).viewed_at, firstTimestamp);

  const concurrentId = randomUUID();
  await Promise.all(Array.from({ length: 12 }, () => view("festa60-home", concurrentId)));
  assert.equal((await readPageStats(env, 30, STATS_NOW))["festa60-home"].views, 2);
  await view("festa60-register", firstId);
  await view("festa60-register", randomUUID(), { omitOrigin: true, headers: { "sec-fetch-site": "same-origin" } });
  assert.equal((await readPageStats(env, 30, STATS_NOW))["festa60-register"].views, 2);
  const beforeInvalid = await readPageStats(env, 30, STATS_NOW);

  for (const payload of [
    null, [], {}, { page_id: "arbitrary-page", view_id: randomUUID() },
    { page_id: "festa60-home", view_id: "not-a-uuid" },
    { page_id: "festa60-home", view_id: [randomUUID()] },
    { page_id: ["festa60-home"], view_id: randomUUID() },
    { page_id: "festa60-home", view_id: "00000000-0000-1000-8000-000000000000" },
    { page_id: "festa60-home", view_id: "00000000-0000-4000-7000-000000000000" },
  ]) assert.equal((await send(payload)).status, 400);
  assert.equal((await send(null, { body: "{" })).status, 400);
  assert.equal((await send(null, { body: "" })).status, 400);
  for (const padding of ["x".repeat(1024), "あ".repeat(350)]) {
    assert.equal((await send({ page_id: "festa60-home", view_id: randomUUID(), padding })).status, 413);
  }
  const boundary = JSON.stringify({ page_id: "festa60-home", view_id: firstId }).padEnd(1024, " ");
  assert.equal((await send(null, { body: boundary })).status, 204);
  assert.equal((await send({ page_id: "festa60-home", view_id: randomUUID() }, {
    headers: { "content-type": "text/plain" },
  })).status, 415);
  for (const options of [
    { origin: "null" }, { origin: "https://other.example" }, { omitOrigin: true },
    { omitOrigin: true, headers: { "sec-fetch-site": "same-site" } },
    { origin: "https://other.example", headers: { "sec-fetch-site": "same-origin" } },
  ]) assert.equal((await send({ page_id: "festa60-home", view_id: randomUUID() }, options)).status, 403);
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const response = await send({}, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
  const denied = await send({ page_id: "festa60-home", view_id: randomUUID() }, {}, {
    ...env, PAGE_EVENTS_RATE_LIMITER: { async limit() { return { success: false }; } },
  });
  assert.equal(denied.status, 429);
  assert.equal((await send({ page_id: "festa60-home", view_id: randomUUID() }, {}, {
    ...env, DB: undefined,
  })).status, 503);
  assert.deepEqual(await readPageStats(env, 30, STATS_NOW), beforeInvalid);

  database.prepare("UPDATE page_views SET viewed_at = ? WHERE page_id = ? AND view_id = ?")
    .run("2026-11-01T00:00:00.000Z", "festa60-home", firstId);
  database.prepare("UPDATE page_views SET viewed_at = ? WHERE page_id = ? AND view_id = ?")
    .run("2026-11-11T00:00:00.000Z", "festa60-home", concurrentId);
  const stats = await readPageStats(env, 30, STATS_NOW);
  assert.equal(stats["festa60-home"].first_viewed_at, "2026-11-01T00:00:00.000Z");
  assert.equal(stats["festa60-home"].last_viewed_at, "2026-11-11T00:00:00.000Z");
  assert.deepEqual(await readPageStats(env, 30, STATS_NOW), stats, "reading totals does not count a view");
  assert.equal(JSON.stringify(stats).includes(firstId), false);
  assert.deepEqual(database.prepare("PRAGMA table_info(page_views)").all().map((row) => row.name), ["page_id", "view_id", "viewed_at"]);

  // UTC timestamps must be grouped into Japan's calendar day, with a zero for
  // every missing date and a half-open UTC range at the selected JST boundaries.
  database.exec("DELETE FROM page_views");
  for (const [pageId, viewedAt] of [
    ["festa60-home", "2025-01-01T00:00:00.000Z"],
    ["festa60-home", "2026-11-05T14:59:59.999Z"],
    ["festa60-home", "2026-11-05T15:00:00.000Z"],
    ["festa60-home", "2026-11-11T14:59:59.999Z"],
    ["festa60-register", "2026-11-11T15:00:00.000Z"],
    ["festa60-home", "2026-11-12T14:59:59.999Z"],
    ["festa60-register", "2026-11-12T15:00:00.000Z"],
  ]) database.prepare("INSERT INTO page_views (page_id, view_id, viewed_at) VALUES (?, ?, ?)").run(pageId, randomUUID(), viewedAt);
  for (const days of [7, 30, 90]) {
    const result = await readPageStats(env, days, STATS_NOW);
    assert.equal(result["festa60-home"].views, 5, "period changes never change all-time totals");
    assert.equal(result["festa60-register"].views, 2);
    const timeline = result.timeline;
    assert.equal(timeline.timezone, "Asia/Tokyo");
    assert.equal(timeline.days, days);
    assert.equal(timeline.rows.length, days);
    assert.equal(timeline.to, "2026-11-12");
    assert.equal(timeline.from, { 7: "2026-11-06", 30: "2026-10-14", 90: "2026-08-15" }[days]);
    assert.deepEqual(timeline.rows.at(-1), { date: "2026-11-12", home_views: 1, register_views: 1 });
    assert.deepEqual(timeline.rows.find((row) => row.date === "2026-11-11"), { date: "2026-11-11", home_views: 1, register_views: 0 });
    assert.equal(timeline.rows.some((row) => row.date === "2026-11-13"), false, "next JST midnight is excluded");
    assert.equal(timeline.rows.reduce((sum, row) => sum + row.home_views + row.register_views, 0), days === 7 ? 4 : 5);
    assert.deepEqual(timeline.rows.find((row) => row.date === "2026-11-10"), { date: "2026-11-10", home_views: 0, register_views: 0 });
  }
  const beforeMidnight = await readPageStats(env, 7, new Date("2026-11-11T14:59:59.999Z"));
  assert.equal(beforeMidnight.timeline.to, "2026-11-11");
  assert.equal(beforeMidnight.timeline.from, "2026-11-05");
  assert.equal(beforeMidnight.timeline.rows.reduce((sum, row) => sum + row.home_views + row.register_views, 0), 3);
  for (const days of [0, 1, 31, 365, "7"]) await assert.rejects(readPageStats(env, days, STATS_NOW), RangeError);
  await assert.rejects(readPageStats(env, 7, new Date("invalid")), RangeError);
} finally {
  database.close();
}

const pageSource = await readFile(new URL("../public/assets/js/festa60-page-metrics.js", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function simulatePage(pathname) {
  const listeners = new Map();
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  let fail = true;
  vm.runInNewContext(pageSource, {
    window: { location: { pathname }, addEventListener(name, listener) { listeners.set(name, listener); } },
    crypto: { randomUUID }, AbortController,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) { fail = false; throw new Error("offline"); }
      return { status: 204 };
    },
  });
  await tick();
  return { listeners, requests };
}

for (const [pathname, expectedPage] of [["/festa-60th/", "festa60-home"], ["/festa60-register/", "festa60-register"]]) {
  const page = await simulatePage(pathname);
  assert.equal(page.requests.length, 1);
  assert.equal(JSON.parse(page.requests[0].options.body).page_id, expectedPage);
  page.listeners.get("online")();
  await tick();
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[0].options.body, page.requests[1].options.body);
  assert.equal(page.requests[1].options.credentials, "omit");
  assert.equal(page.requests[1].options.keepalive, true);
  page.listeners.get("pagehide")();
  page.listeners.get("online")();
  await tick();
  assert.equal(page.requests.length, 2, "acknowledged page views are never repeated");
  const anotherLoad = await simulatePage(pathname);
  assert.notEqual(JSON.parse(page.requests[0].options.body).view_id, JSON.parse(anotherLoad.requests[0].options.body).view_id);
}
assert.equal((await simulatePage("/festa60-admin/")).requests.length, 0);
assert.equal((await simulatePage("/festa-60th/program/")).requests.length, 0);

const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, {
    hidden: false, disabled: false, textContent: "", innerHTML: "", value: "30", children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, listener) { this[name] = listener; },
    querySelector(selector) { return element(`${key} ${selector}`); },
  });
  return elements.get(key);
}
let adminResponse = { status: 200, ok: true, json: async () => ({ ok: true, stats: emptyStats }) };
let adminFetch = async () => adminResponse;
let createdElements = 0;
vm.runInNewContext(await readFile(new URL("../public/assets/js/festa60-page-stats.js", import.meta.url), "utf8"), {
  document: { querySelector: () => ({ querySelector: element }), createElement: (tag) => element(`created-${tag}-${++createdElements}`) },
  Intl, Date, AbortController, setTimeout, clearTimeout,
  fetch: async (url, options) => {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.match(url, /\?days=(7|30|90)$/);
    return adminFetch(url, options);
  },
});
await tick();
assert.equal(element('[data-page-stats-page="festa60-home"] [data-page-views]').textContent, "0");
assert.equal(element("[data-page-stats-values]").hidden, false);
assert.equal(element("[data-page-stats-timeline]").hidden, false);
assert.equal(element("[data-page-stats-daily]").children.length, 30);
assert.match(element("[data-page-stats-chart]").innerHTML, /role="img"/);
assert.match(element("[data-page-stats-range]").textContent, /30日間/);
adminResponse = { status: 500, ok: false, json: async () => ({ ok: false }) };
element("[data-page-stats-refresh]").click();
await tick();
assert.equal(element("[data-page-stats-values]").hidden, true);
assert.equal(element("[data-page-stats-timeline]").hidden, true);
assert.match(element("[data-page-stats-message]").textContent, /取得できません/);
adminResponse = { status: 401, ok: false, json: async () => null };
element("[data-page-stats-refresh]").click();
await tick();
assert.match(element("[data-page-stats-message]").textContent, /認証/);
assert.equal(element("[data-page-stats-refresh]").disabled, false);

const pending = [];
adminFetch = (url, options) => new Promise((resolve) => pending.push({ url, options, resolve }));
element("[data-page-stats-period]").value = "7";
element("[data-page-stats-period]").change();
element("[data-page-stats-period]").value = "90";
element("[data-page-stats-period]").change();
assert.equal(pending[0].options.signal.aborted, true);
pending[1].resolve({ status: 200, ok: true, json: async () => ({ ok: true, stats: statsFixture(90) }) });
await tick();
assert.match(element("[data-page-stats-range]").textContent, /90日間/);
assert.equal(element("[data-page-stats-daily]").children.length, 90);
pending[0].resolve({ status: 200, ok: true, json: async () => ({ ok: true, stats: statsFixture(7) }) });
await tick();
assert.match(element("[data-page-stats-range]").textContent, /90日間/, "late responses never overwrite the latest period");
assert.equal(element("[data-page-stats-refresh]").disabled, false);
adminFetch = async () => ({ status: 200, ok: true, json: async () => ({ ok: true, stats: { ...statsFixture(90), timeline: { ...emptyTimeline(90), rows: [] } } }) });
element("[data-page-stats-refresh]").click();
await tick();
assert.equal(element("[data-page-stats-timeline]").hidden, true, "invalid or failed loads never leave an old graph visible");
assert.match(element("[data-page-stats-message]").textContent, /取得できません/);

console.log("PASS page metrics: bounded anonymous events, atomic deduplication, all-time totals, JST daily ranges/midnight boundaries, zero-fill, accessible chart/table, period race protection and admin failure states");
