import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import worker from "../public/_worker.js";

const oldMigration = await readFile(new URL("../migrations/20261111_add_pr_video_metrics.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/20261113_add_short_video_metrics.sql", import.meta.url), "utf8");
const catalogue = JSON.parse(await readFile(new URL("../public/assets/data/festa60-shorts.json", import.meta.url), "utf8"));
const shorts = catalogue.items;
assert.equal(shorts.length, 24);
assert.equal(new Set(shorts.map((clip) => clip.id)).size, 24);

const NOW = "2026-11-13T03:00:00.000Z";
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return RealDate.parse(NOW); }
}
globalThis.Date = FixedDate;
const database = new DatabaseSync(":memory:");
database.exec(oldMigration);
const legacyA = randomUUID();
const legacyB = randomUUID();
const insert = "INSERT INTO video_playbacks (video_id, playback_id, started_at, completed_at) VALUES (?, ?, ?, ?)";
database.prepare(insert).run("festa60-pr", legacyA, "2026-11-01T00:00:00.000Z", "2026-11-01T00:02:00.000Z");
database.prepare(insert).run("festa60-pr", legacyB, "2026-11-02T00:00:00.000Z", null);
database.exec("CREATE TABLE unrelated_fixture (value TEXT); INSERT INTO unrelated_fixture VALUES ('preserve');");
const originalRows = database.prepare("SELECT * FROM video_playbacks ORDER BY playback_id").all();
const originalColumns = database.prepare("PRAGMA table_info(video_playbacks)").all();

// D1 migrations apply rolls a failed migration back. Exercise the same atomic
// SQLite rebuild locally, including a deliberate error after the DROP/RENAME.
database.exec("BEGIN IMMEDIATE");
try {
  database.exec(migration);
  assert.throws(() => database.prepare(insert).run("not-public", randomUUID(), NOW, null), /CHECK/);
  database.exec("ROLLBACK");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
assert.deepEqual(database.prepare("SELECT * FROM video_playbacks ORDER BY playback_id").all(), originalRows);
assert.match(database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'video_playbacks'").get().sql, /video_id = 'festa60-pr'/);
assert.equal(database.prepare("SELECT name FROM sqlite_schema WHERE name = 'video_playbacks_v2'").get(), undefined);
database.exec("BEGIN IMMEDIATE");
database.exec(migration);
database.exec("COMMIT");
assert.deepEqual(database.prepare("SELECT * FROM video_playbacks ORDER BY playback_id").all(), originalRows);
assert.deepEqual(database.prepare("PRAGMA table_info(video_playbacks)").all(), originalColumns);
const indices = database.prepare("PRAGMA index_list(video_playbacks)").all();
assert.equal(indices.filter((index) => index.origin === "pk" && index.unique === 1).length, 1);
assert.ok(indices.some((index) => index.name === "idx_video_playbacks_started_at"));
assert.ok(indices.some((index) => index.name === "idx_video_playbacks_completed_at"));
assert.equal(database.prepare("SELECT value FROM unrelated_fixture").get().value, "preserve");

function statement(sql, values = []) {
  return {
    bind(...bound) { return statement(sql, bound); },
    async run() { const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
    async first(column) { const row = database.prepare(sql).get(...values); return column ? row?.[column] ?? null : row ?? null; },
    async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
  };
}
const token = "short-video-metrics-test-only";
const limiter = { async limit() { return { success: true }; } };
const env = new Proxy({ ENVIRONMENT: "staging", ADMIN_API_TOKEN: token, DB: { prepare: (sql) => statement(sql) } }, {
  get(target, key) { return typeof key === "string" && key.endsWith("_RATE_LIMITER") ? limiter : target[key]; },
});
const origin = "https://example.com";
function dispatch(request) { return worker.fetch(request, env, { waitUntil() {} }); }
async function send(video, playback, event, expected = 204) {
  const response = await dispatch(new Request(`${origin}/api/festa60/video-events`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ video_id: video, playback_id: playback, event }),
  }));
  assert.equal(response.status, expected, `${video}: ${event}`);
}
async function stats(days = 30, status = 200) {
  const response = await dispatch(new Request(`${origin}/api/festa60/admin/video-stats?days=${days}`, { headers: { "x-admin-token": token } }));
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return response.json();
}
try {
  const before = await stats();
  assert.deepEqual(before.stats, { starts: 2, completions: 1, first_started_at: originalRows.map((row) => row.started_at).sort()[0], last_started_at: "2026-11-02T00:00:00.000Z", last_completed_at: "2026-11-01T00:02:00.000Z" });
  assert.equal(before.videos.length, 25);
  assert.equal(before.videos.filter((entry) => entry.kind === "pr").length, 10);
  assert.equal(before.videos.filter((entry) => entry.kind === "history").length, 14);
  assert.deepEqual(before.videos.filter((entry) => entry.kind !== "full").map((entry) => entry.video_id).sort(), shorts.map((clip) => clip.id).sort());
  assert.ok(before.videos.filter((entry) => entry.kind !== "full").every((entry) => entry.starts === 0 && entry.completions === 0 && entry.completion_rate === null));
  assert.equal(before.summary.starts, 2);
  assert.equal(before.summary.completion_rate, .5);

  // Every published short must be accepted by both Worker validation and SQL.
  for (const clip of shorts) {
    const playback = randomUUID();
    await send(clip.id, playback, "complete"); // completion can arrive before start
    await Promise.all([send(clip.id, playback, "start"), send(clip.id, playback, "complete"), send(clip.id, playback.toUpperCase(), "start")]);
  }
  const all = await stats();
  assert.equal(all.summary.starts, 26);
  assert.equal(all.summary.completions, 25);
  assert.deepEqual(all.stats, before.stats, "short watches never overwrite the original PR counters");
  assert.ok(all.videos.filter((entry) => entry.kind !== "full").every((entry) => entry.starts === 1 && entry.completions === 1 && entry.completion_rate === 1));
  for (const id of ["festa60-short-pr00", "festa60-short-pr11", "festa60-short-h00", "festa60-short-h15", "festa60-short-PR01", "festa60-short-pr01-extra", "festa60-short-h1"]) {
    await send(id, randomUUID(), "start", 400);
    assert.throws(() => database.prepare(insert).run(id, randomUUID(), NOW, null), /CHECK/);
  }
  assert.equal((await stats()).summary.starts, all.summary.starts);

  const sharedPlayback = randomUUID();
  await send("festa60-short-pr01", sharedPlayback, "start");
  await send("festa60-short-h14", sharedPlayback, "start");
  assert.equal((await stats()).summary.starts, 28, "different videos are independent even if a playback UUID is reused");

  database.exec("DELETE FROM video_playbacks");
  const fixtures = [
    ["festa60-short-pr01", "2026-11-06T14:59:59.999Z", "2026-11-06T15:00:00.000Z"],
    ["festa60-short-pr01", "2026-11-06T15:00:00.000Z", "2026-11-12T15:00:00.000Z"],
    ["festa60-short-h14", "2026-11-13T14:59:59.999Z", null],
    ["festa60-short-h14", "2026-11-13T15:00:00.000Z", null],
    ["festa60-pr", "2026-11-13T00:00:00.000Z", "2026-11-13T00:01:00.000Z"],
    ["festa60-short-h01", "2025-01-01T00:00:00.000Z", "2025-01-01T00:01:00.000Z"],
  ];
  const playbackIds = fixtures.map(([id, started, completed]) => {
    const playback = randomUUID(); database.prepare(insert).run(id, playback, started, completed); return playback;
  });
  const seven = await stats(7);
  assert.equal(seven.summary.starts, 6);
  assert.equal(seven.summary.completions, 4);
  assert.equal(seven.summary.completion_rate, 4 / 6);
  assert.equal(seven.timeline.timezone, "Asia/Tokyo");
  assert.equal(seven.timeline.from, "2026-11-07");
  assert.equal(seven.timeline.to, "2026-11-13");
  assert.equal(seven.timeline.rows.length, 7);
  assert.equal(seven.timeline.rows[0].starts, 1);
  assert.equal(seven.timeline.rows[0].completions, 1);
  assert.equal(seven.timeline.rows.at(-1).starts, 2);
  assert.equal(seven.timeline.rows.at(-1).completions, 2);
  assert.equal(seven.timeline.rows.reduce((sum, day) => sum + day.starts, 0), 3);
  assert.equal(seven.timeline.rows.reduce((sum, day) => sum + day.completions, 0), 3);
  assert.ok(seven.timeline.rows.every((day) => day.videos.length === 25));
  assert.equal(seven.timeline.rows[0].videos.find((entry) => entry.video_id === "festa60-short-pr01").completions, 1);
  for (const days of [30, 90]) {
    const longer = await stats(days);
    assert.deepEqual(longer.summary, seven.summary, "period affects the timeline, not all-time counters");
    assert.equal(longer.timeline.rows.length, days);
  }
  for (const invalid of [0, 14, "07", "7%3BDROP%20TABLE%20video_playbacks"]) await stats(invalid, 400);
  const serialized = JSON.stringify(seven);
  assert.ok(playbackIds.every((id) => !serialized.includes(id)), "no playback identifiers leave the aggregate endpoint");
  assert.equal((await dispatch(new Request(`${origin}/api/festa60/admin/video-stats`))).status, 401);
  console.log("PASS short video metrics: data-preserving atomic migration/rollback, finite catalogue, retry/out-of-order deduplication, legacy compatibility, per-video zero/count/rate, JST boundaries and private aggregate responses");
} finally {
  globalThis.Date = RealDate;
  database.close();
}
