import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { onRequestAdminCoupons, onRequestCoupon, resolveEarlyCoupon } from "../public/festa60-coupons.js";
import worker from "../public/_worker.js";

const ORIGIN = "https://example.com";
const ADMIN_URL = `${ORIGIN}/api/festa60/admin/coupons`;
const ACTOR = "coupon-test-admin";
const ADMIN_TOKEN = "coupon-test-only-token";
let clock = Date.parse("2026-11-11T03:00:00.000Z");
const originalDate = globalThis.Date;
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let networkCalls = 0;
const warnings = [];

const database = new DatabaseSync(":memory:");
const migration = await readFile(new URL("../migrations/20261111_add_crm_coupons.sql", import.meta.url), "utf8");
database.exec(migration);
database.exec(migration); // Applying the additive migration twice is harmless.
database.exec(await readFile(new URL("../migrations/20261111_add_coupon_redemptions.sql", import.meta.url), "utf8"));
function statement(sql, values = []) {
  return {
    bind(...boundValues) { return statement(sql, boundValues); },
    async first(column) {
      const row = database.prepare(sql).get(...values);
      return column ? (row?.[column] ?? null) : (row ?? null);
    },
    async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { success: true, meta: { changes: result.changes } };
    },
  };
}
const allowLimiter = { async limit() { return { success: true }; } };
const env = {
  ENVIRONMENT: "staging",
  ADMIN_API_TOKEN: ADMIN_TOKEN,
  DB: { prepare: (sql) => statement(sql) },
  COUPON_RATE_LIMITER: allowLimiter,
  COUPON_ADMIN_RATE_LIMITER: allowLimiter,
  FESTA60_EARLY_COUPONS: JSON.stringify([
    { code: "CRM_TEST_MANUAL", expires_at: "2026-12-31T23:59:59+09:00" },
    { code: "LEGACY_TEST_ONLY", expires_at: "2026-12-31T23:59:59+09:00" },
  ]),
};

function adminRequest(method = "GET", payload, options = {}) {
  const headers = new Headers();
  if (method !== "GET") {
    headers.set("content-type", "application/json");
    if (!options.omitOrigin) headers.set("origin", options.origin ?? ORIGIN);
  }
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  return new Request(`${ADMIN_URL}${options.id ? `/${options.id}` : ""}`, {
    method,
    headers,
    ...(payload !== undefined || options.rawBody !== undefined ? { body: options.rawBody ?? JSON.stringify(payload) } : {}),
  });
}
async function admin(method = "GET", payload, options = {}) {
  const response = await onRequestAdminCoupons({
    request: adminRequest(method, payload, options),
    env: options.env ?? env,
    params: options.id ? { id: options.id } : {},
    actor: options.actor === null ? undefined : ACTOR,
  });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  return { response, body };
}
async function edit(coupon, updates, options = {}) {
  return admin("PATCH", { expected_updated_at: coupon.updated_at, ...updates }, { id: coupon.id, ...options });
}
function lookup(code, at = clock, requestEnv = env) {
  return resolveEarlyCoupon(requestEnv, code, "obog__gold", new Date(at));
}
function stored(id) {
  return { ...database.prepare("SELECT * FROM festa60_coupons WHERE id = ?").get(id),
    usage_state: "unused", reserved_at: null, used_at: null, application_code: null };
}
function count() { return database.prepare("SELECT COUNT(*) AS n FROM festa60_coupons").get().n; }

try {
  globalThis.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("CRM coupon tests must not call an external service"); };
  console.warn = (...values) => warnings.push(JSON.stringify(values));

  assert.deepEqual((await admin()).body, { ok: true, coupons: [] });
  assert.equal((await admin("GET", undefined, { actor: null })).response.status, 401);
  const initial = await admin("POST", {
    code: " crm_test_manual ", label: " 検証用メモ ",
    starts_at: "2026-11-11T11:59:00+09:00", expires_at: "2026-11-12T12:00:00+09:00",
  });
  assert.equal(initial.response.status, 201);
  let coupon = initial.body.coupon;
  assert.match(coupon.id, /^[0-9a-f-]{36}$/);
  assert.equal(coupon.code, "CRM_TEST_MANUAL");
  assert.equal(coupon.label, "検証用メモ");
  assert.equal(coupon.starts_at, "2026-11-11T02:59:00.000Z");
  assert.equal(coupon.expires_at, "2026-11-12T03:00:00.000Z");
  assert.equal(coupon.disabled_at, null);
  assert.deepEqual(stored(coupon.id), coupon);
  assert.deepEqual(await lookup(" crm_test_manual "), {
    ok: true, applied: true, code: "CRM_TEST_MANUAL", fee_period: "early",
  });
  assert.equal((await lookup(coupon.code, Date.parse(coupon.starts_at) - 1)).error, "coupon_invalid");
  assert.equal((await lookup(coupon.code, Date.parse(coupon.starts_at))).applied, true);
  assert.equal((await lookup(coupon.code, Date.parse(coupon.expires_at))).error, "coupon_expired",
    "CRM expiry wins over a later expiry in legacy environment settings");

  const generated = await admin("POST", { code: " ", expires_at: "2026-11-30T23:59:59+09:00" });
  assert.equal(generated.response.status, 201);
  assert.match(generated.body.coupon.code, /^[2-9A-HJ-NP-Z]{6}$/);
  assert.equal(generated.body.coupon.label, "");
  assert.equal(generated.body.coupon.starts_at, null);
  assert.equal((await admin()).body.coupons.length, 2);
  const duplicate = await admin("POST", { code: "crm_test_manual", expires_at: "2026-12-01T00:00:00Z" });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error, "coupon_code_exists");
  assert.equal(count(), 2);

  const stopped = await edit(coupon, { enabled: false });
  assert.equal(stopped.response.status, 200);
  assert.ok(stopped.body.coupon.disabled_at);
  assert.ok(Date.parse(stopped.body.coupon.updated_at) > Date.parse(coupon.updated_at),
    "optimistic version changes even when two edits share the same millisecond");
  const stale = await edit(coupon, { label: "古い画面からの変更" });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error, "coupon_conflict");
  coupon = stopped.body.coupon;
  assert.equal((await lookup(coupon.code)).error, "coupon_invalid", "disabled CRM row never falls back to a valid env code");
  assert.equal((await lookup("LEGACY_TEST_ONLY")).applied, true, "unknown CRM code still supports a configured legacy code");
  assert.equal((await lookup("LEGACY_TEST_ONLY", clock, { FESTA60_EARLY_COUPONS: env.FESTA60_EARLY_COUPONS })).applied, true,
    "environment-only installations remain supported without a DB binding");

  const renewed = await edit(coupon, {
    enabled: true, label: "", starts_at: null, expires_at: "2026-12-02T12:00:00+09:00",
  });
  assert.equal(renewed.response.status, 200);
  coupon = renewed.body.coupon;
  assert.equal(coupon.disabled_at, null);
  assert.equal(coupon.label, "");
  assert.equal(coupon.starts_at, null);
  assert.equal((await lookup(coupon.code, Date.parse("2026-11-12T03:00:00.001Z"))).applied, true,
    "extending expiry reactivates an expired coupon");

  const concurrent = await Promise.all([
    edit(coupon, { label: "管理者A" }), edit(coupon, { label: "管理者B" }),
  ]);
  assert.deepEqual(concurrent.map((result) => result.response.status).sort(), [200, 409],
    "the SQL version predicate permits exactly one concurrent edit");
  coupon = concurrent.find((result) => result.response.status === 200).body.coupon;
  assert.deepEqual(stored(coupon.id), coupon);
  const simultaneousCreation = await Promise.all([
    admin("POST", { code: "SAME_TEST_CODE", expires_at: "2026-12-01T00:00:00Z" }),
    admin("POST", { code: "same_test_code", expires_at: "2026-12-01T00:00:00Z" }),
  ]);
  assert.deepEqual(simultaneousCreation.map((result) => result.response.status).sort(), [201, 409]);

  const beforeInvalid = count();
  for (const payload of [
    {}, { expires_at: "" }, { expires_at: "2026-11-12T12:00:00" },
    { expires_at: "2026-02-30T00:00:00Z" },
    { expires_at: "2026-11-12T12:00:00+09:00", starts_at: "2026-11-12T12:00:00+09:00" },
    { expires_at: "2026-11-12T12:00:00+09:00", starts_at: "2026-11-13T12:00:00+09:00" },
    { expires_at: "2026-11-12T12:00:00+09:00", code: "bad code" },
    { expires_at: "2026-11-12T12:00:00+09:00", code: "日本語" },
    { expires_at: "2026-11-12T12:00:00+09:00", code: "X'; DROP TABLE festa60_coupons; --" },
    { expires_at: "2026-11-12T12:00:00+09:00", code: ["ARRAY_CODE"] },
    { expires_at: "2026-11-12T12:00:00+09:00", label: "あ".repeat(81) },
  ]) assert.equal((await admin("POST", payload)).response.status, 400);
  for (const changes of [
    { code: "CHANGED_CODE" }, { enabled: "true" }, { expires_at: "2026-11-12T12:00:00" },
    { label: "a".repeat(81) }, {},
  ]) assert.equal((await edit(coupon, changes)).response.status, 400);
  assert.equal((await admin("PATCH", { label: "missing version" }, { id: coupon.id })).response.status, 400);
  assert.equal((await admin("PATCH", { label: "unknown", expected_updated_at: coupon.updated_at }, { id: randomUUID() })).response.status, 404);
  assert.equal(count(), beforeInvalid);
  assert.deepEqual(stored(coupon.id), coupon, "invalid/stale requests never overwrite data");
  for (const method of ["DELETE", "PUT", "OPTIONS"]) {
    assert.equal((await admin(method, undefined, { id: coupon.id })).response.status, 405);
  }
  assert.equal(count(), beforeInvalid, "there is no delete operation");

  const validCreation = { expires_at: "2026-12-01T00:00:00Z" };
  for (const options of [
    { origin: "https://other.example" }, { origin: "null" }, { omitOrigin: true },
    { omitOrigin: true, headers: { "sec-fetch-site": "cross-site" } },
    { origin: "https://other.example", headers: { "sec-fetch-site": "same-origin" } },
  ]) assert.equal((await admin("POST", validCreation, options)).response.status, 403);
  assert.equal((await admin("POST", validCreation, { headers: { "content-type": "text/plain" } })).response.status, 415);
  for (const rawBody of ["{", "null", "[]", '"text"']) {
    assert.equal((await admin("POST", null, { rawBody })).response.status, 400);
  }
  const boundary = JSON.stringify(validCreation).padEnd(4096, " ");
  assert.equal((await admin("POST", null, { rawBody: boundary })).response.status, 201);
  assert.equal((await admin("POST", null, { rawBody: boundary + " " })).response.status, 413);
  assert.equal((await admin("POST", { ...validCreation, label: "あ".repeat(1400) })).response.status, 413);
  assert.equal((await admin("POST", validCreation, { omitOrigin: true, headers: { "sec-fetch-site": "same-origin" } })).response.status, 201);

  const rateEnv = { ...env, COUPON_ADMIN_RATE_LIMITER: { async limit() { return { success: false }; } } };
  assert.equal((await admin("POST", validCreation, { env: rateEnv })).response.status, 429);
  const unavailableEnv = { ...env, DB: { prepare() { throw new Error("private SQL/DB error TEST_ONLY_INTERNAL"); } } };
  const unavailableLookup = await lookup("LEGACY_TEST_ONLY", clock, unavailableEnv);
  assert.equal(unavailableLookup.status, 503, "database failure never bypasses a possible CRM stop via env fallback");
  for (const method of ["GET", "POST"]) {
    const unavailable = await admin(method, method === "POST" ? validCreation : undefined, { env: unavailableEnv });
    assert.equal(unavailable.response.status, 503);
    assert.equal(JSON.stringify(unavailable.body).includes("TEST_ONLY_INTERNAL"), false);
  }
  let emptyDbReads = 0;
  const emptyEnv = { get DB() { emptyDbReads += 1; throw new Error("empty code must not read DB"); } };
  assert.deepEqual(await lookup(" ", clock, emptyEnv), { ok: true, applied: false, code: "" });
  assert.equal(emptyDbReads, 0);

  const publicResponse = await onRequestCoupon({ env, request: new Request(`${ORIGIN}/api/festa60/coupon`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ coupon_code: coupon.code, ticket_type: "obog" }),
  }) });
  assert.equal(publicResponse.status, 200);
  const publicBody = await publicResponse.json();
  assert.deepEqual(Object.keys(publicBody).sort(), ["ok", "applied", "code", "fee_period"].sort());
  for (const secret of ["LEGACY_TEST_ONLY", "label", "expires_at", "created_at", coupon.id]) {
    assert.equal(JSON.stringify(publicBody).includes(secret), false, "public validation does not list managed codes or CRM details");
  }

  // The actual Worker wrapper, rather than only this module, retains its existing
  // Access/preview-token boundary for the newly added admin collection route.
  for (const [requestEnv, headers, expectedStatus] of [
    [env, {}, 401],
    [env, { "x-admin-token": ADMIN_TOKEN }, 200],
    [{ ...env, ENVIRONMENT: "production" }, { "x-admin-token": ADMIN_TOKEN }, 401],
  ]) {
    const response = await worker.fetch(new Request(ADMIN_URL, { headers }), requestEnv, { waitUntil() {} });
    assert.equal(response.status, expectedStatus);
    if (expectedStatus === 200) assert.equal((await response.json()).coupons.length, count());
  }

  // Schema constraints also protect code normalization if a future caller
  // bypasses the administrative handler's validation.
  assert.throws(() => database.prepare(`INSERT INTO festa60_coupons
    (id,code,expires_at,created_at,updated_at) VALUES (?,?,?,?,?)`)
    .run(randomUUID(), "lowercase", "2026-12-01T00:00:00Z", NOW(), NOW()), /CHECK constraint/);
  assert.equal(networkCalls, 0);
  assert.equal(JSON.stringify(warnings).includes("CRM_TEST_MANUAL"), false);
  for (const legacyGeneratedCode of ["7ABC8XYZ", "F60-0123456789ABCDEF"]) {
    const legacyGenerated = await admin("POST", { code: legacyGeneratedCode, expires_at: "2099-12-31T00:00:00Z" });
    assert.equal(legacyGenerated.response.status, 201);
    assert.equal((await lookup(legacyGeneratedCode.toLowerCase())).code, legacyGeneratedCode,
      "previously issued 8-character and long codes stay usable without being shortened");
    assert.ok((await admin()).body.coupons.some((item) => item.code === legacyGeneratedCode));
  }

  console.log("PASS CRM coupons: real additive SQLite migration, issue/list/edit/stop/extend, generated codes, concurrent/stale/duplicate protection, DB-first public lookup and env compatibility, bounded admin API, safe DB errors and real Worker auth; local fixtures only");
} finally {
  database.close();
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

function NOW() { return new Date(clock).toISOString(); }
