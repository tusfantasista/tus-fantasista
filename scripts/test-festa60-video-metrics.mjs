import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import worker from "../public/_worker.js";

const ORIGIN = "https://example.com";
const EVENT_URL = `${ORIGIN}/api/festa60/video-events`;
const STATS_URL = `${ORIGIN}/api/festa60/admin/video-stats`;
const ADMIN_TOKEN = "video-metrics-test-only";

// Exercise the real Worker router/auth and SQL against an isolated SQLite DB.
// No production binding, credentials, requests or application records are used.
const database = new DatabaseSync(":memory:");
const migration = await readFile(new URL("../migrations/20261111_add_pr_video_metrics.sql", import.meta.url), "utf8");
database.exec(migration);

function statement(sql, values = []) {
  return {
    bind(...boundValues) { return statement(sql, boundValues); },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { success: true, meta: { changes: result.changes }, results: [] };
    },
    async first(column) {
      const row = database.prepare(sql).get(...values);
      return column ? (row?.[column] ?? null) : (row ?? null);
    },
    async all() {
      return { success: true, results: database.prepare(sql).all(...values) };
    },
  };
}

const allowLimiter = { async limit() { return { success: true }; } };
const env = new Proxy({
  ENVIRONMENT: "staging",
  ADMIN_API_TOKEN: ADMIN_TOKEN,
  DB: {
    prepare: (sql) => statement(sql),
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const entry of statements) results.push(await entry.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  },
}, {
  get(target, key) {
    // Rate limiting has its own tests. Keep these integration fixtures focused
    // on counting semantics even when concurrent requests share a test IP.
    return typeof key === "string" && key.endsWith("_RATE_LIMITER")
      ? allowLimiter : target[key];
  },
});

function dispatch(request, requestEnv = env) {
  return worker.fetch(request, requestEnv, { waitUntil() {} });
}

function eventRequest(payload, options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (!options.omitOrigin) headers.set("origin", options.origin ?? ORIGIN);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  return new Request(EVENT_URL, {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(payload),
  });
}

async function sendEvent(playbackId, event, options = {}) {
  const response = await dispatch(eventRequest({
    video_id: "festa60-pr", playback_id: playbackId, event,
  }, options));
  assert.equal(response.status, 204, `${event} must be acknowledged`);
  assert.equal(await response.text(), "", "204 response has no payload");
}

async function stats() {
  const response = await dispatch(new Request(STATS_URL, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(Object.keys(payload.stats).sort(), [
    "starts", "completions", "first_started_at", "last_started_at", "last_completed_at",
  ].sort());
  assert.equal(Number.isInteger(payload.stats.starts), true);
  assert.equal(Number.isInteger(payload.stats.completions), true);
  assert.ok(payload.stats.completions <= payload.stats.starts);
  return payload.stats;
}

function row(playbackId) {
  return database.prepare("SELECT * FROM video_playbacks WHERE video_id = ? AND playback_id = ?")
    .get("festa60-pr", playbackId);
}

try {
  assert.deepEqual(await stats(), {
    starts: 0, completions: 0,
    first_started_at: null, last_started_at: null, last_completed_at: null,
  });

  // Public visitors must not gain access to aggregate administration endpoints.
  const anonymousStats = await dispatch(new Request(STATS_URL));
  assert.equal(anonymousStats.status, 401);
  const productionBypass = await dispatch(new Request(STATS_URL, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  }), { ENVIRONMENT: "production", ADMIN_API_TOKEN: ADMIN_TOKEN, DB: env.DB });
  assert.equal(productionBypass.status, 401, "production rejects preview token bypass");

  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const response = await dispatch(new Request(EVENT_URL, {
      method, headers: { origin: ORIGIN },
    }));
    assert.equal(response.status, 405, `video-events rejects ${method}`);
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await dispatch(new Request(STATS_URL, {
      method, headers: { "x-admin-token": ADMIN_TOKEN },
    }));
    assert.equal(response.status, 405, `video-stats rejects ${method}`);
  }

  const playbackA = randomUUID();
  await sendEvent(playbackA, "start");
  const firstStart = row(playbackA).started_at;
  assert.ok(Number.isFinite(Date.parse(firstStart)), "start gets a server timestamp");
  await sendEvent(playbackA, "start");
  assert.equal(row(playbackA).started_at, firstStart, "retry preserves first start");
  assert.equal(row(playbackA).completed_at, null);
  assert.equal((await stats()).starts, 1);
  assert.equal((await stats()).completions, 0);

  await sendEvent(playbackA, "complete");
  const firstComplete = row(playbackA).completed_at;
  assert.ok(Number.isFinite(Date.parse(firstComplete)), "completion gets a server timestamp");
  await sendEvent(playbackA, "complete");
  assert.equal(row(playbackA).completed_at, firstComplete, "retry preserves first completion");

  // Different beacon requests can arrive out of order. A completion must still
  // represent exactly one start, and a delayed start must not erase completion.
  const playbackB = randomUUID();
  await sendEvent(playbackB, "complete");
  const completionBeforeStart = { ...row(playbackB) };
  await sendEvent(playbackB, "start");
  assert.deepEqual({ ...row(playbackB) }, completionBeforeStart);
  assert.equal((await stats()).starts, 2);
  assert.equal((await stats()).completions, 2);

  // Repeated, concurrent start/complete delivery is deduplicated in SQL, rather
  // than relying on JavaScript flags or a read-then-write check in the Worker.
  const playbackC = randomUUID();
  await Promise.all(Array.from({ length: 12 }, (_, index) =>
    sendEvent(playbackC, index % 2 === 0 ? "start" : "complete")));
  assert.equal((await stats()).starts, 3);
  assert.equal((await stats()).completions, 3);

  // Same-origin Fetch Metadata may support requests whose Origin is absent.
  const playbackD = randomUUID();
  await sendEvent(playbackD, "start", {
    omitOrigin: true, headers: { "sec-fetch-site": "same-origin" },
  });
  const beforeInvalidRequests = await stats();

  for (const payload of [
    null,
    [],
    {},
    { video_id: "other-video", playback_id: randomUUID(), event: "start" },
    { video_id: "festa60-pr", playback_id: "not-a-uuid", event: "start" },
    { video_id: "festa60-pr", playback_id: randomUUID(), event: "pause" },
    { video_id: "festa60-pr", playback_id: randomUUID(), event: ["start"] },
    { video_id: "festa60-pr", playback_id: randomUUID(), event: "START" },
    { video_id: "festa60-pr", playback_id: 123, event: "start" },
    { video_id: "festa60-pr", playback_id: [randomUUID()], event: "start" },
    { video_id: "festa60-pr", playback_id: randomUUID(), event: null },
  ]) {
    const response = await dispatch(eventRequest(payload));
    assert.equal(response.status, 400, `reject malformed input: ${JSON.stringify(payload)}`);
  }

  const malformedJson = await dispatch(eventRequest(null, { rawBody: "{" }));
  assert.equal(malformedJson.status, 400);

  const oversized = await dispatch(eventRequest({
    video_id: "festa60-pr", playback_id: randomUUID(), event: "start", padding: "x".repeat(1100),
  }));
  assert.ok([400, 413].includes(oversized.status), "body over 1024 bytes is rejected");

  const oversizedUtf8 = await dispatch(eventRequest({
    video_id: "festa60-pr", playback_id: randomUUID(), event: "start", padding: "あ".repeat(350),
  }));
  assert.ok([400, 413].includes(oversizedUtf8.status), "size limit counts UTF-8 bytes, not JS characters");

  const boundaryBody = JSON.stringify({ video_id: "festa60-pr", playback_id: playbackA, event: "start" });
  const boundary = await dispatch(eventRequest(null, { rawBody: boundaryBody.padEnd(1024, " ") }));
  assert.equal(boundary.status, 204, "a valid request exactly 1024 bytes long is accepted");

  const wrongContentType = await dispatch(eventRequest({
    video_id: "festa60-pr", playback_id: randomUUID(), event: "start",
  }, { headers: { "content-type": "text/plain" } }));
  assert.equal(wrongContentType.status, 415, "public event endpoint accepts JSON only");

  for (const options of [
    { origin: "https://unrelated.example" },
    { origin: "null" },
    { omitOrigin: true },
    { omitOrigin: true, headers: { "sec-fetch-site": "cross-site" } },
    { omitOrigin: true, headers: { "sec-fetch-site": "same-site" } },
    // An explicitly foreign Origin must not be overridden by Fetch Metadata.
    { origin: "https://unrelated.example", headers: { "sec-fetch-site": "same-origin" } },
  ]) {
    const response = await dispatch(eventRequest({
      video_id: "festa60-pr", playback_id: randomUUID(), event: "start",
    }, options));
    assert.equal(response.status, 403, "reject requests without same-origin evidence");
  }
  assert.deepEqual(await stats(), beforeInvalidRequests, "rejected requests never change counts");

  // Prove the date aggregates come from playback rows, not page views,
  // segment downloads or the order in which the aggregate endpoint is called.
  database.prepare(`UPDATE video_playbacks SET started_at = ?, completed_at = ?
    WHERE video_id = 'festa60-pr' AND playback_id = ?`)
    .run("2026-11-01T01:00:00.000Z", "2026-11-01T01:02:00.000Z", playbackA);
  database.prepare(`UPDATE video_playbacks SET started_at = ?, completed_at = ?
    WHERE video_id = 'festa60-pr' AND playback_id = ?`)
    .run("2026-11-02T01:00:00.000Z", "2026-11-02T01:02:00.000Z", playbackB);
  database.prepare(`UPDATE video_playbacks SET started_at = ?, completed_at = ?
    WHERE video_id = 'festa60-pr' AND playback_id = ?`)
    .run("2026-11-03T01:00:00.000Z", "2026-11-03T01:02:00.000Z", playbackC);
  database.prepare(`UPDATE video_playbacks SET started_at = ?, completed_at = NULL
    WHERE video_id = 'festa60-pr' AND playback_id = ?`)
    .run("2026-11-04T01:00:00.000Z", playbackD);
  const finalStats = await stats();
  assert.deepEqual(finalStats, {
    starts: 4, completions: 3,
    first_started_at: "2026-11-01T01:00:00.000Z",
    last_started_at: "2026-11-04T01:00:00.000Z",
    last_completed_at: "2026-11-03T01:02:00.000Z",
  });
  assert.deepEqual(await stats(), finalStats, "reading stats does not count a view");

  const serialized = JSON.stringify(finalStats);
  for (const playbackId of [playbackA, playbackB, playbackC, playbackD]) {
    assert.equal(serialized.includes(playbackId), false, "aggregate response excludes playback identifiers");
  }
  console.log("PASS video metrics: real Worker routes, admin auth, same-origin validation, bounded JSON, SQL retry/concurrency deduplication, out-of-order completion, date aggregates and private identifiers");
} finally {
  database.close();
}
