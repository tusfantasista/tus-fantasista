import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  resolveEarlyCoupon, readCouponClaim, reserveCoupon, bindCouponPreview,
  markCouponUsed, releaseCouponReservation, onRequestCoupon, onRequestAdminCoupons,
} from "../public/festa60-coupons.js";

const database = new DatabaseSync(":memory:");
for (const name of ["20261111_add_crm_coupons.sql", "20261111_add_coupon_redemptions.sql"]) {
  const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
  database.exec(sql);
  database.exec(sql);
}
function statement(sql, values = []) {
  return {
    bind(...boundValues) { return statement(sql, boundValues); },
    async first() { return database.prepare(sql).get(...values) ?? null; },
    async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
    async run() { return { success: true, meta: { changes: database.prepare(sql).run(...values).changes } }; },
  };
}
const allowLimiter = { async limit() { return { success: true }; } };
const env = {
  DB: { prepare: (sql) => statement(sql) },
  COUPON_RATE_LIMITER: allowLimiter, COUPON_ADMIN_RATE_LIMITER: allowLimiter,
  FESTA60_EARLY_COUPONS: JSON.stringify([{ code: "LEGACY_ENV_TEST", expires_at: "2099-12-31T23:59:59Z" }]),
};
const digest = (text) => createHash("sha256").update(text).digest("hex");
const ownerA = randomUUID();
const ownerB = randomUUID();
const hash = digest("normalized-server-application");
const base = { code: "RACE_TEST", owner: ownerA, payloadHash: hash };
function seed(code) {
  database.prepare(`INSERT INTO festa60_coupons
    (id, code, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), code, "2099-12-31T23:59:59.000Z", "2026-11-11T00:00:00.000Z", "2026-11-11T00:00:00.000Z");
}
async function lookup(code, context) {
  return resolveEarlyCoupon(env, code, "obog", new Date("2026-11-11T00:00:00Z"), context);
}
function conflict(result) { assert.equal(result.ok, false); assert.equal(result.status, 409); }
function claimCount() { return database.prepare("SELECT COUNT(*) AS n FROM coupon_redemptions").get().n; }
async function admin(method, payload, id) {
  const response = await onRequestAdminCoupons({
    request: new Request(`https://example.com/api/festa60/admin/coupons${id ? `/${id}` : ""}`, {
      method, headers: { origin: "https://example.com", "content-type": "application/json" },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env, actor: "single-use-test-admin", params: id ? { id } : {},
  });
  assert.match(response.headers.get("cache-control"), /no-store/);
  return { status: response.status, body: await response.json() };
}

const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls += 1; throw new Error("Single-use tests must not contact Stripe or any network service"); };
try {
  for (const code of ["RACE_TEST", "OTHER_TEST", "CANCEL_TEST", "UNBOUND_TEST", "DUP_PREVIEW_TEST"]) seed(code);
  assert.equal((await lookup(base.code)).applied, true);
  assert.deepEqual(await readCouponClaim(env, base.code), { ok: true, claim: null });

  const race = await Promise.all([
    reserveCoupon(env, base), reserveCoupon(env, { ...base, owner: ownerB }),
  ]);
  assert.deepEqual(race.map((result) => result.ok).sort(), [false, true]);
  assert.equal(race.filter((result) => result.acquired).length, 1);
  assert.equal(claimCount(), 1, "different owners racing for one code produce one persistent claim");
  const winner = race.find((result) => result.ok).claim;
  const winningInput = { ...base, owner: winner.owner };
  const retry = await reserveCoupon(env, winningInput);
  assert.equal(retry.ok, true);
  assert.equal(retry.acquired, false);
  assert.deepEqual(retry.claim, winner, "same-owner/hash retry preserves the original reservation");
  assert.equal((await reserveCoupon(env, { ...winningInput, previewId: null })).ok, true);
  conflict(await reserveCoupon(env, { ...winningInput, payloadHash: digest("changed application") }));
  conflict(await reserveCoupon(env, { ...winningInput, code: "OTHER_TEST" }));
  assert.equal(claimCount(), 1, "one submission owner cannot reserve a second coupon");

  const reservedPublic = await lookup(base.code);
  assert.equal(reservedPublic.error, "coupon_reserved");
  assert.equal(reservedPublic.status, 409);
  assert.equal((await lookup(base.code, { owner: winner.owner, payloadHash: hash })).applied, true);
  conflict(await lookup(base.code, { owner: winner.owner, payloadHash: digest("different payload") }));
  database.prepare("UPDATE festa60_coupons SET disabled_at = ?, expires_at = ? WHERE code = ?")
    .run("2026-11-10T00:00:00Z", "2026-11-10T00:00:00Z", base.code);
  assert.equal((await lookup(base.code, { owner: winner.owner, payloadHash: hash })).applied, true,
    "a reserved owner can finish its fixed quote after a CRM stop or expiry");
  assert.equal((await lookup(base.code)).error, "coupon_reserved");

  const preview = { ...winningInput, previewId: "bpv_test_single_use" };
  const bound = await bindCouponPreview(env, preview);
  assert.equal(bound.ok, true);
  assert.equal(bound.claim.preview_id, preview.previewId);
  assert.deepEqual((await bindCouponPreview(env, preview)).claim, bound.claim);
  conflict(await bindCouponPreview(env, { ...preview, payloadHash: digest("different payload") }));
  conflict(await bindCouponPreview(env, { ...preview, previewId: "bpv_changed" }));
  conflict(await reserveCoupon(env, { code: "DUP_PREVIEW_TEST", owner: randomUUID(), payloadHash: hash, previewId: preview.previewId }));
  assert.equal((await readCouponClaim(env, "DUP_PREVIEW_TEST")).claim, null, "a preview cannot belong to two codes");

  const application = { ...winningInput, applicationId: "app_single_use_test", applicationCode: "FESTA-TEST-001" };
  const used = await markCouponUsed(env, application);
  assert.equal(used.ok, true);
  assert.ok(used.claim.used_at);
  assert.equal(used.claim.application_id, application.applicationId);
  assert.deepEqual((await markCouponUsed(env, application)).claim, used.claim, "same-application retry is idempotent");
  conflict(await markCouponUsed(env, { ...application, applicationId: "app_another" }));
  conflict(await markCouponUsed(env, { ...application, applicationCode: "FESTA-CHANGED" }));
  assert.equal((await lookup(base.code)).error, "coupon_used");
  assert.equal((await lookup(base.code, { owner: winner.owner, payloadHash: hash })).applied, true);
  assert.equal((await reserveCoupon(env, winningInput)).acquired, false);
  assert.deepEqual(await releaseCouponReservation(env, { previewId: preview.previewId }), { ok: true, released: false });
  assert.ok((await readCouponClaim(env, base.code)).claim.used_at, "cancellation must never release an applied coupon");

  const cancelInput = { code: "CANCEL_TEST", owner: randomUUID(), payloadHash: hash, previewId: "bpv_verified_cancel_test" };
  assert.equal((await reserveCoupon(env, cancelInput)).acquired, true);
  database.prepare("UPDATE coupon_redemptions SET reserved_at = '2000-01-01T00:00:00Z' WHERE code = ?").run(cancelInput.code);
  assert.equal((await lookup(cancelInput.code)).error, "coupon_reserved", "elapsed time does not automatically release a bank reservation");
  assert.deepEqual(await releaseCouponReservation(env, { previewId: cancelInput.previewId }), { ok: true, released: true });
  assert.deepEqual(await releaseCouponReservation(env, { previewId: cancelInput.previewId }), { ok: true, released: false });
  assert.equal((await lookup(cancelInput.code)).applied, true);
  assert.equal((await reserveCoupon(env, { ...cancelInput, owner: randomUUID(), previewId: "bpv_new_owner_test" })).acquired, true);

  const unbound = { code: "UNBOUND_TEST", owner: randomUUID(), payloadHash: hash };
  await reserveCoupon(env, unbound);
  conflict(await reserveCoupon(env, { ...unbound, previewId: "bpv_added_later_test" }));
  assert.equal((await readCouponClaim(env, unbound.code)).claim.preview_id, null,
    "reserve retries cannot change an online reservation into a bank preview");
  assert.equal((await bindCouponPreview(env, { ...unbound, previewId: "bpv_added_later_test" })).claim.preview_id, "bpv_added_later_test");
  assert.equal((await lookup("LEGACY_ENV_TEST")).applied, true);
  const legacyInput = { code: "LEGACY_ENV_TEST", owner: randomUUID(), payloadHash: hash };
  await reserveCoupon(env, legacyInput);
  await markCouponUsed(env, { ...legacyInput, applicationId: "app_env_test", applicationCode: "FESTA-ENV-001" });
  assert.equal((await lookup("LEGACY_ENV_TEST")).error, "coupon_used", "environment codes share the same single-use storage");

  const listed = await admin("GET");
  const usedRow = listed.body.coupons.find((row) => row.code === base.code);
  assert.equal(usedRow.usage_state, "used");
  assert.equal(usedRow.application_code, application.applicationCode);
  assert.equal(usedRow.used_at, used.claim.used_at);
  assert.equal(listed.body.coupons.find((row) => row.code === "CANCEL_TEST").usage_state, "reserved");
  assert.equal(listed.body.coupons.find((row) => row.code === "OTHER_TEST").usage_state, "unused");
  const edited = await admin("PATCH", {
    expected_updated_at: usedRow.updated_at, enabled: true, expires_at: "2099-12-31T23:59:59Z",
  }, usedRow.id);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.coupon.usage_state, "used", "CRM re-enable/extension never clears redemption");
  assert.equal((await lookup(base.code)).error, "coupon_used");
  const adopted = await admin("POST", { code: "LEGACY_ENV_TEST", expires_at: "2099-12-31T23:59:59Z" });
  assert.equal(adopted.status, 201);
  assert.equal(adopted.body.coupon.usage_state, "used", "new CRM record preserves an already used legacy code");

  const publicResult = await onRequestCoupon({ env, request: new Request("https://example.com/api/festa60/coupon", {
    method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" },
    body: JSON.stringify({ coupon_code: base.code, ticket_type: "obog", owner: winner.owner, payloadHash: hash }),
  }) });
  assert.equal(publicResult.status, 409, "a public caller cannot request the internal owner-retry exemption");
  const publicBody = JSON.stringify(await publicResult.json());
  for (const privateField of [winner.owner, hash, application.applicationId, application.applicationCode, "payload_hash", "preview_id"]) {
    assert.equal(publicBody.includes(privateField), false);
    assert.equal(JSON.stringify(listed.body).includes(privateField), privateField === application.applicationCode);
  }

  const broken = { DB: { prepare() { throw new Error("TEST_PRIVATE_DB_ERROR"); } } };
  for (const result of [
    await readCouponClaim(broken, base.code), await reserveCoupon(broken, winningInput),
    await bindCouponPreview(broken, preview), await markCouponUsed(broken, application),
    await releaseCouponReservation(broken, { previewId: preview.previewId }),
  ]) {
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result).includes("TEST_PRIVATE_DB_ERROR"), false);
  }
  conflict(await reserveCoupon(env, { ...base, owner: "not-a-uuid" }));
  conflict(await reserveCoupon(env, { ...base, payloadHash: "legacy" }));

  // Backfill historic usage before accepting single-use requests. Bad JSON and
  // unrelated metadata must be ignored, and cancelled/refunded apps still count.
  database.exec(`CREATE TABLE applications (id TEXT PRIMARY KEY, application_code TEXT,
    client_submission_id TEXT, created_at TEXT, status TEXT);
    CREATE TABLE payment_line_items (id TEXT PRIMARY KEY, application_id TEXT, metadata_json TEXT);`);
  const historicOwner = randomUUID();
  const repeatedOwner = randomUUID();
  const app = database.prepare("INSERT INTO applications VALUES (?,?,?,?,?)");
  const line = database.prepare("INSERT INTO payment_line_items VALUES (?,?,?)");
  function historical(id, code, createdAt, status = "confirmed", owner = null) {
    app.run(id, `FESTA-${id}`, owner, createdAt, status);
    line.run(`pli-${id}`, id, JSON.stringify({ coupon_code: code, coupon_type: "early_fee" }));
  }
  historical("old_first", " backfill_same ", "2026-11-01T00:00:00Z", "cancelled", historicOwner);
  historical("old_later", "BACKFILL_SAME", "2026-11-02T00:00:00Z", "refunded", randomUUID());
  historical("old_refund", "BACKFILL_REFUND", "2026-11-03T00:00:00Z", "refunded");
  historical("old_dupa", "BACKFILL_DUP_A", "2026-11-04T00:00:00Z", "confirmed", repeatedOwner);
  historical("old_dupb", "BACKFILL_DUP_B", "2026-11-05T00:00:00Z", "confirmed", repeatedOwner);
  app.run("bad_metadata", "FESTA-BAD", null, "2026-11-01T00:00:00Z", "confirmed");
  for (const [index, metadata] of ["{", "null", "[]", JSON.stringify({ coupon_code: "WRONG_TYPE" }),
    JSON.stringify({ coupon_code: ["ARRAY_CODE"], coupon_type: "early_fee" }),
    JSON.stringify({ coupon_code: "bad code", coupon_type: "early_fee" })].entries()) {
    line.run(`bad-${index}`, "bad_metadata", metadata);
  }
  const backfill = await readFile(new URL("../migrations/20261111_backfill_coupon_redemptions.sql", import.meta.url), "utf8");
  database.exec(backfill);
  const afterBackfill = claimCount();
  database.exec(backfill);
  assert.equal(claimCount(), afterBackfill, "backfill is idempotent");
  const historic = (await readCouponClaim(env, "BACKFILL_SAME")).claim;
  assert.equal(historic.application_id, "old_first");
  assert.equal(historic.owner, historicOwner);
  assert.equal(historic.payload_hash, "legacy");
  assert.equal(historic.used_at, "2026-11-01T00:00:00Z");
  assert.ok((await readCouponClaim(env, "BACKFILL_REFUND")).claim.used_at);
  for (const code of ["BACKFILL_DUP_A", "BACKFILL_DUP_B"]) {
    assert.ok((await readCouponClaim(env, code)).claim.used_at, "legacy owner collision must not leave another historic code reusable");
  }
  assert.equal((await readCouponClaim(env, "WRONG_TYPE")).claim, null);
  assert.equal((await lookup("BACKFILL_SAME")).error, "coupon_used");
  conflict(await reserveCoupon(env, { code: "BACKFILL_SAME", owner: historicOwner, payloadHash: hash }));
  assert.equal(externalCalls, 0);
  console.log("PASS single-use coupons: atomic owner races, strict hash/application idempotence, preview binding, explicit unused-only release, private public lookup, persistent CRM usage, legacy backfill and safe DB failures; local SQLite only");
} finally {
  database.close();
  globalThis.fetch = originalFetch;
}
