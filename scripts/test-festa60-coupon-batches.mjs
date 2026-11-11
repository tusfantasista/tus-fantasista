import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  onRequestAdminCouponBatch, onRequestAdminCoupons, resolveEarlyCoupon,
  reserveCoupon, markCouponUsed,
} from "../public/festa60-coupons.js";

const ORIGIN = "https://example.com";
const API_URL = `${ORIGIN}/api/festa60/admin/coupons/batch`;
const ACTOR = "batch-local-test-admin";
const allowLimiter = { async limit() { return { success: true }; } };
const migrations = await Promise.all([
  "20261111_add_crm_coupons.sql", "20261111_add_coupon_redemptions.sql", "20261112_add_coupon_issue_batches.sql",
].map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));
const fixtures = [];
function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(migrations[0]);
  const columns = database.prepare("PRAGMA table_info(festa60_coupons)").all().map((row) => row.name);
  database.exec(migrations[1]);
  database.exec(migrations[2]);
  database.exec(migrations[2]);
  assert.deepEqual(database.prepare("PRAGMA table_info(festa60_coupons)").all().map((row) => row.name), columns,
    "batch migration never alters existing coupon columns");
  const controls = { failAt: null, throwAfterCommit: false, commits: 0, batchCalls: 0, maxStatements: 0, maxBindings: 0 };
  let queue = Promise.resolve();
  function statement(sql, values = []) {
    return {
      sql, values,
      bind(...bound) {
        controls.maxBindings = Math.max(controls.maxBindings, bound.length);
        assert.ok(bound.length <= 100, "each D1 statement stays within 100 bound parameters");
        return statement(sql, bound);
      },
      async first() { return database.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
      async run() { return { success: true, meta: { changes: database.prepare(sql).run(...values).changes } }; },
    };
  }
  const db = {
    prepare: (sql) => statement(sql),
    batch(statements) {
      controls.batchCalls += 1;
      controls.maxStatements = Math.max(controls.maxStatements, statements.length);
      const task = queue.then(() => {
        database.exec("BEGIN");
        try {
          const results = statements.map((entry, index) => {
            if (index === controls.failAt) { controls.failAt = null; throw new Error("LOCAL_PRIVATE_INJECTED_FAILURE"); }
            return { success: true, meta: { changes: database.prepare(entry.sql).run(...entry.values).changes } };
          });
          database.exec("COMMIT");
          controls.commits += 1;
          if (controls.throwAfterCommit) {
            controls.throwAfterCommit = false;
            throw new Error("LOCAL_PRIVATE_AMBIGUOUS_TRANSPORT_FAILURE");
          }
          return results;
        } catch (error) {
          if (database.isTransaction) database.exec("ROLLBACK");
          throw error;
        }
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  const item = {
    database, controls,
    env: { DB: db, COUPON_ADMIN_RATE_LIMITER: allowLimiter },
    totals() {
      return Object.fromEntries(["festa60_coupons", "coupon_issue_batches", "coupon_issue_batch_items"]
        .map((table) => [table, database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
    },
  };
  fixtures.push(item);
  return item;
}
const payload = (changes = {}) => ({
  request_id: randomUUID(), count: 3, label: " 一括発行テスト ",
  starts_at: "2026-11-12T08:00:00+09:00", expires_at: "2099-12-31T23:59:59+09:00", ...changes,
});
async function call(item, body, options = {}) {
  const method = options.method ?? "POST";
  const headers = new Headers();
  if (method === "POST") {
    headers.set("content-type", "application/json");
    if (!options.omitOrigin) headers.set("origin", options.origin ?? ORIGIN);
  }
  for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
  const response = await onRequestAdminCouponBatch({
    request: new Request(API_URL, { method, headers,
      ...(method === "POST" ? { body: options.rawBody ?? JSON.stringify(body) } : {}),
    }), env: options.env ?? item.env, actor: options.actor === null ? undefined : ACTOR,
  });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return { status: response.status, body: await response.json() };
}
const codes = (result) => result.body.coupons.map((coupon) => coupon.code);
const originalDate = globalThis.Date;
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const originalCrypto = globalThis.crypto;
let clock = Date.parse("2026-11-12T00:00:00.000Z");
let networkCalls = 0;
const warnings = [];
try {
  globalThis.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("Batch tests must not issue real codes or contact a service"); };
  console.warn = (...values) => warnings.push(JSON.stringify(values));
  const item = fixture();
  assert.deepEqual((await call(item, undefined, { method: "GET" })).body, { ok: true, batches: [] });
  const requested = payload();
  const issued = await call(item, requested);
  assert.equal(issued.status, 201);
  assert.equal(issued.body.replayed, false);
  assert.match(issued.body.batch_id, /^[0-9a-f-]{36}$/);
  assert.equal(issued.body.coupons.length, 3);
  assert.equal(new Set(codes(issued)).size, 3);
  for (const coupon of issued.body.coupons) {
    assert.match(coupon.code, /^F60-[0-9A-F]{16}$/);
    assert.equal(coupon.label, "一括発行テスト");
    assert.equal(coupon.starts_at, "2026-11-11T23:00:00.000Z");
    assert.equal(coupon.expires_at, "2099-12-31T14:59:59.000Z");
    assert.equal(coupon.usage_state, "unused");
    assert.equal((await resolveEarlyCoupon(item.env, coupon.code, "obog", new Date(clock))).applied, true);
  }
  const normalizedReplay = await call(item, {
    ...requested, request_id: requested.request_id.toUpperCase(), label: "一括発行テスト",
    starts_at: "2026-11-11T23:00:00Z", expires_at: "2099-12-31T14:59:59Z",
  });
  assert.equal(normalizedReplay.status, 200);
  assert.equal(normalizedReplay.body.replayed, true);
  assert.equal(normalizedReplay.body.batch_id, issued.body.batch_id);
  assert.deepEqual(codes(normalizedReplay), codes(issued));
  assert.equal(item.controls.batchCalls, 1, "normalized replay never attempts new issuance");
  for (const changes of [{ count: 4 }, { label: "別の用途" }, { expires_at: "2099-12-30T00:00:00Z" }]) {
    const conflict = await call(item, { ...requested, ...changes });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "coupon_batch_conflict");
  }
  assert.deepEqual(item.totals(), { festa60_coupons: 3, coupon_issue_batches: 1, coupon_issue_batch_items: 3 });

  const claim = { code: codes(issued)[0], owner: randomUUID(), payloadHash: createHash("sha256").update("batch-single-use-test").digest("hex") };
  await reserveCoupon(item.env, claim);
  await markCouponUsed(item.env, { ...claim, applicationId: "app_batch_test", applicationCode: "FESTA-BATCH-TEST" });
  const replayWithUsage = await call(item, requested);
  assert.deepEqual(codes(replayWithUsage), codes(issued));
  assert.equal(replayWithUsage.body.coupons[0].usage_state, "used", "retry does not regenerate or reset a consumed code");

  const coupon = replayWithUsage.body.coupons[0];
  const editResponse = await onRequestAdminCoupons({
    env: item.env, actor: ACTOR, params: { id: coupon.id }, request: new Request(`${ORIGIN}/api/festa60/admin/coupons/${coupon.id}`, {
      method: "PATCH", headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ expected_updated_at: coupon.updated_at, label: "発行後に変更", expires_at: "2098-01-01T00:00:00Z" }),
    }),
  });
  assert.equal(editResponse.status, 200);
  const history = await call(item, undefined, { method: "GET" });
  const snapshot = history.body.batches[0];
  assert.deepEqual(snapshot.codes, codes(issued));
  assert.equal(snapshot.label, "一括発行テスト");
  assert.equal(snapshot.expires_at, "2099-12-31T14:59:59.000Z", "history retains issue-time settings after a coupon edit");
  assert.equal(snapshot.count, 3);
  assert.equal(Object.hasOwn(snapshot, "request_id"), false);
  assert.equal(Object.hasOwn(snapshot, "payload_hash"), false);

  const raced = fixture();
  const sameIntent = payload({ count: 4 });
  const race = await Promise.all([call(raced, sameIntent), call(raced, sameIntent)]);
  assert.deepEqual(race.map((result) => result.status).sort(), [200, 201]);
  assert.deepEqual(codes(race[0]), codes(race[1]));
  assert.equal(race[0].body.batch_id, race[1].body.batch_id);
  assert.equal(raced.controls.commits, 1);
  assert.deepEqual(raced.totals(), { festa60_coupons: 4, coupon_issue_batches: 1, coupon_issue_batch_items: 4 });
  const raceDifferent = fixture();
  const changedIntent = payload({ count: 1 });
  const conflictRace = await Promise.all([
    call(raceDifferent, changedIntent), call(raceDifferent, { ...changedIntent, count: 2 }),
  ]);
  assert.deepEqual(conflictRace.map((result) => result.status).sort(), [201, 409]);
  const winningCount = conflictRace.find((result) => result.status === 201).body.coupons.length;
  assert.equal(raceDifferent.totals().festa60_coupons, winningCount);
  assert.equal(raceDifferent.controls.commits, 1);

  const maximum = fixture();
  const hundred = await call(maximum, payload({ count: 100 }));
  assert.equal(hundred.status, 201);
  assert.equal(codes(hundred).length, 100);
  assert.equal(new Set(codes(hundred)).size, 100);
  assert.equal(maximum.controls.maxStatements, 21);
  assert.equal(maximum.controls.maxBindings, 70);
  assert.deepEqual(maximum.totals(), { festa60_coupons: 100, coupon_issue_batches: 1, coupon_issue_batch_items: 100 });

  const failed = fixture();
  failed.controls.failAt = 2; // Header and first 10 coupon inserts executed already.
  const retriable = payload({ count: 15 });
  const rejected = await call(failed, retriable);
  assert.equal(rejected.status, 503);
  assert.equal(JSON.stringify(rejected.body).includes("LOCAL_PRIVATE"), false);
  assert.deepEqual(failed.totals(), { festa60_coupons: 0, coupon_issue_batches: 0, coupon_issue_batch_items: 0 },
    "a mid-batch error rolls back the header, every coupon and every relation");
  assert.equal((await call(failed, retriable)).status, 201, "a fully rolled-back intent can be retried safely");
  assert.equal(failed.totals().festa60_coupons, 15);

  const ambiguous = fixture();
  ambiguous.controls.throwAfterCommit = true;
  const ambiguousIntent = payload({ count: 5 });
  const recovered = await call(ambiguous, ambiguousIntent);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.replayed, true);
  assert.equal(recovered.body.coupons.length, 5);
  assert.deepEqual(codes(await call(ambiguous, ambiguousIntent)), codes(recovered));
  assert.equal(ambiguous.totals().festa60_coupons, 5, "a response/transport failure after commit never issues more codes");

  const collision = fixture();
  collision.database.prepare(`INSERT INTO festa60_coupons
    (id,code,expires_at,created_at,updated_at) VALUES (?,?,?,?,?)`)
    .run(randomUUID(), "F60-0000000000000000", "2099-12-31T00:00:00Z", "2026-11-12T00:00:00Z", "2026-11-12T00:00:00Z");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
    subtle: originalCrypto.subtle, randomUUID: originalCrypto.randomUUID.bind(originalCrypto),
    getRandomValues(bytes) { bytes.fill(0); return bytes; },
  } });
  assert.equal((await call(collision, payload({ count: 1 }))).status, 503);
  assert.deepEqual(collision.totals(), { festa60_coupons: 1, coupon_issue_batches: 0, coupon_issue_batch_items: 0 },
    "a real unique-code constraint failure also rolls back the whole batch");
  Object.defineProperty(globalThis, "crypto", cryptoDescriptor);

  const corrupted = fixture();
  const corruptionIntent = payload({ count: 2 });
  await call(corrupted, corruptionIntent);
  corrupted.database.exec("DELETE FROM coupon_issue_batch_items WHERE position = 0");
  assert.equal((await call(corrupted, corruptionIntent)).status, 503, "an incomplete batch is never acknowledged or regenerated");
  assert.equal((await call(corrupted, undefined, { method: "GET" })).status, 503);
  assert.equal(corrupted.totals().festa60_coupons, 2);

  const invalid = fixture();
  for (const badCount of [0, -1, 101, 1.5, "10", true, null]) {
    assert.equal((await call(invalid, payload({ count: badCount }))).body.error, "coupon_invalid_count");
  }
  for (const badId of [undefined, "", "not-a-uuid", [randomUUID()]]) {
    assert.equal((await call(invalid, payload({ request_id: badId }))).body.error, "coupon_invalid_request_id");
  }
  for (const changes of [
    { expires_at: "2026-12-01T12:00:00" }, { expires_at: "2026-02-30T00:00:00Z" },
    { starts_at: "2099-12-31T23:59:59+09:00" }, { label: "x".repeat(81) }, { code: "USER_CANNOT_SUPPLY_BATCH_CODES" },
  ]) assert.equal((await call(invalid, payload(changes))).status, 400);
  assert.equal((await call(invalid, payload(), { actor: null })).status, 401);
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal((await call(invalid, undefined, { method })).status, 405);
  }
  for (const options of [{ origin: "https://other.example" }, { omitOrigin: true }, { origin: "null" }]) {
    assert.equal((await call(invalid, payload(), options)).status, 403);
  }
  assert.equal((await call(invalid, payload(), { headers: { "content-type": "text/plain" } })).status, 415);
  for (const rawBody of ["{", "null", "[]"]) assert.equal((await call(invalid, null, { rawBody })).status, 400);
  assert.equal((await call(invalid, { ...payload(), padding: "あ".repeat(1400) })).status, 413);
  assert.equal((await call(invalid, payload(), { env: {} })).status, 503);
  assert.equal((await call(invalid, undefined, { method: "GET", env: {} })).status, 503);
  assert.equal((await call(invalid, payload(), { env: { ...invalid.env, COUPON_ADMIN_RATE_LIMITER: { async limit() { return { success: false }; } } } })).status, 429);
  assert.deepEqual(invalid.totals(), { festa60_coupons: 0, coupon_issue_batches: 0, coupon_issue_batch_items: 0 });
  const boundaryJson = JSON.stringify(payload({ count: 1 }));
  const boundaryBody = boundaryJson + " ".repeat(4096 - Buffer.byteLength(boundaryJson));
  assert.equal((await call(invalid, null, { rawBody: boundaryBody })).status, 201);
  assert.equal((await call(invalid, null, { rawBody: boundaryBody + " " })).status, 413);

  const recent = fixture();
  const issuedHistory = [];
  for (let index = 0; index < 22; index += 1) {
    clock += 1;
    const result = await call(recent, payload({ count: 1, label: `履歴${index}` }));
    assert.equal(result.status, 201);
    issuedHistory.push(result);
  }
  const recentResult = await call(recent, undefined, { method: "GET" });
  assert.equal(recentResult.body.batches.length, 20);
  assert.deepEqual(recentResult.body.batches.map((batch) => batch.batch_id), issuedHistory.slice(-20).reverse().map((result) => result.body.batch_id));
  for (const batch of recentResult.body.batches) {
    assert.equal(batch.count, 1);
    assert.equal(batch.codes.length, 1);
  }
  assert.equal(networkCalls, 0);
  assert.equal(JSON.stringify(warnings).includes(requested.request_id), false);
  console.log("PASS coupon batches: real atomic SQLite transactions, 100-code parameter limits, same/different payload races, normalized replay, rollback/unique-collision/ambiguous-commit recovery, persistent single-use state and issue-time history; local fixtures only");
} finally {
  for (const item of fixtures) item.database.close();
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
}
