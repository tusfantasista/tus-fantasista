import assert from "node:assert/strict";
import { resolveEarlyCoupon, onRequestCoupon } from "../public/festa60-coupons.js";

const ORIGIN = "https://example.com";
const URL = `${ORIGIN}/api/festa60/coupon`;
const NOW = "2026-11-11T03:00:00.000Z";
const TEST_CODE = "TEST_ONLY-EARLY_1";
const OTHER_TEST_CODE = "UNSUBMITTED_TEST_SECRET";
const startsAt = "2026-11-11T12:00:00+09:00";
const expiresAt = "2026-11-11T13:00:00+09:00";
const validEntries = [{ code: TEST_CODE, starts_at: startsAt, expires_at: expiresAt }];
const allowLimiter = { async limit() { return { success: true }; } };
const forbiddenCalls = { db: 0, network: 0, stripe: 0 };

function environment(configuration = JSON.stringify(validEntries)) {
  const env = { COUPON_RATE_LIMITER: allowLimiter };
  if (configuration !== undefined) env.FESTA60_EARLY_COUPONS = configuration;
  Object.defineProperties(env, {
    DB: { value: { prepare(sql) {
      assert.match(sql, /^SELECT (code, starts_at, expires_at, disabled_at FROM festa60_coupons|code, owner, payload_hash, preview_id, application_id, application_code, reserved_at, used_at FROM coupon_redemptions) WHERE code = \?/);
      return { bind() { return { async first() { return null; } }; } };
    } } },
    STRIPE_SECRET_KEY: { get() { forbiddenCalls.stripe += 1; throw new Error("Coupon lookup must not access Stripe"); } },
  });
  return env;
}

function resolve(code = TEST_CODE, ticketType = "obog", options = {}) {
  return resolveEarlyCoupon(options.env ?? environment(), code, ticketType, new Date(options.now ?? NOW));
}

function assertFailure(result, error, status = 400) {
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(result.status, status);
  assert.match(result.message, /[ぁ-んァ-ヶ一-龠]/, "user error is in Japanese");
  assert.deepEqual(Object.keys(result).sort(), ["ok", "status", "error", "message"].sort());
}

function request(payload, options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (!options.omitOrigin) headers.set("origin", options.origin ?? ORIGIN);
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  return new Request(URL, {
    method: options.method ?? "POST",
    headers,
    ...(options.noBody ? {} : { body: options.rawBody ?? JSON.stringify(payload) }),
  });
}

async function api(payload, options = {}) {
  const response = await onRequestCoupon({ request: request(payload, options), env: options.env ?? environment() });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const body = await response.json();
  return { response, body };
}

// Empty coupons are a no-op even if no codes are configured or the configuration
// is broken. Clearing the optional field must never block a normal application.
for (const code of [undefined, null, "", " \t\n　"]) {
  assert.deepEqual(await resolveEarlyCoupon({}, code, "absent_donation_5000"), { ok: true, applied: false, code: "" });
  assert.deepEqual(await resolveEarlyCoupon({ FESTA60_EARLY_COUPONS: "broken" }, code, "obog"), { ok: true, applied: false, code: "" });
}

const success = { ok: true, applied: true, code: TEST_CODE, fee_period: "early" };
assert.deepEqual(await resolve(`  ${TEST_CODE.toLowerCase()}  `), success);
for (const base of ["obog", "obog_6_10", "obog_5_under", "obog_staff", "obog_staff_6_10", "obog_staff_5_under"]) {
  for (const support of ["", "__bronze", "__silver", "__gold", "__platinum"]) {
    assert.deepEqual(await resolve(TEST_CODE, `${base}${support}`), success, `${base}${support} is eligible`);
  }
}
assert.deepEqual(await resolve(TEST_CODE, "young_obog"), success, "shared pricing legacy cohort is normalized");
assert.deepEqual(await resolve(TEST_CODE, "premium_gold"), success, "shared pricing legacy support tier is normalized");
for (const ticketType of [
  "absent_donation_5000", "absent_donation_10000", "absent_donation_30000",
  "current_student", "unknown", "__proto__", "constructor", "toString", "", null, 123, ["obog"],
]) assertFailure(await resolve(TEST_CODE, ticketType), "coupon_ineligible");

for (const code of [0, false, [TEST_CODE], { code: TEST_CODE }, "a".repeat(65), "with space", "日本語", "ß", "a/b", "a.b"]) {
  assertFailure(await resolve(code), "coupon_invalid");
}
const maxLengthCode = "a".repeat(64);
assert.deepEqual(await resolve(maxLengthCode, "obog", {
  env: environment(JSON.stringify([{ code: maxLengthCode, expires_at: expiresAt }])),
}), { ok: true, applied: true, code: maxLengthCode.toUpperCase(), fee_period: "early" });

for (const env of [{}, { FESTA60_EARLY_COUPONS: undefined }, environment(""), environment("  "), environment("[]")]) {
  assertFailure(await resolve(TEST_CODE, "obog", { env }), "coupon_invalid");
}
assertFailure(await resolve("UNISSUED-CODE"), "coupon_invalid");
assertFailure(await resolve(TEST_CODE, "obog", { now: "2026-11-11T02:59:59.999Z" }), "coupon_invalid");
assert.deepEqual(await resolve(TEST_CODE, "obog", { now: "2026-11-11T03:00:00.000Z" }), success, "start boundary is inclusive");
assert.deepEqual(await resolve(TEST_CODE, "obog", { now: "2026-11-11T03:59:59.999Z" }), success);
assertFailure(await resolve(TEST_CODE, "obog", { now: "2026-11-11T04:00:00.000Z" }), "coupon_expired");
assertFailure(await resolve(TEST_CODE, "obog", { now: "2026-11-11T04:00:00.001Z" }), "coupon_expired");
assert.deepEqual(await resolve(TEST_CODE, "obog", {
  env: environment(JSON.stringify([{ code: TEST_CODE, expires_at: expiresAt }])),
}), success, "start date is optional, expiry is not");

const invalidConfigurations = [
  "{", "null", "{}", "1", JSON.stringify("text"), [],
  JSON.stringify([null]), JSON.stringify([[]]), JSON.stringify([{}]),
  JSON.stringify([{ code: TEST_CODE }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: null }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "2026-12-01" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "2026-12-01T23:59:59" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "2026-02-30T23:59:59Z" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "2026-11-11T24:00:00Z" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: "2026-11-11T12:00:00+24:00" }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: expiresAt, starts_at: null }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: expiresAt, starts_at: expiresAt }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: expiresAt, starts_at: "2026-12-01T00:00:00Z" }]),
  JSON.stringify([{ code: "", expires_at: expiresAt }]),
  JSON.stringify([{ code: "非ASCII", expires_at: expiresAt }]),
  JSON.stringify([{ code: "ß", expires_at: expiresAt }]),
  JSON.stringify([{ code: "a".repeat(65), expires_at: expiresAt }]),
  JSON.stringify([{ code: TEST_CODE, expires_at: expiresAt }, { code: ` ${TEST_CODE.toLowerCase()} `, expires_at: expiresAt }]),
  JSON.stringify([...validEntries, { code: OTHER_TEST_CODE }]),
];
for (const configuration of invalidConfigurations) {
  const result = await resolve(TEST_CODE, "obog", { env: environment(configuration) });
  assertFailure(result, "coupon_configuration_error", 503);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(TEST_CODE), false);
  assert.equal(serialized.includes(OTHER_TEST_CODE), false);
  assert.equal(serialized.includes("expires_at"), false);
}
assertFailure(await resolve(TEST_CODE, "obog", { now: "not a date" }), "coupon_configuration_error", 503);
assert.deepEqual(await resolve(TEST_CODE, "obog", {
  env: environment(JSON.stringify([{ code: TEST_CODE, expires_at: "2028-02-29T23:59:59Z" }])),
}), success, "a real leap day remains valid");

const originalDate = globalThis.Date;
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const warnings = [];
try {
  globalThis.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [originalDate.parse(NOW)])); }
    static now() { return originalDate.parse(NOW); }
  };
  globalThis.fetch = async () => {
    forbiddenCalls.network += 1;
    throw new Error("Coupon tests must never make network calls");
  };
  console.warn = (...values) => warnings.push(JSON.stringify(values));

  const validPayload = { coupon_code: TEST_CODE.toLowerCase(), ticket_type: "obog__gold" };
  const accepted = await api(validPayload);
  assert.equal(accepted.response.status, 200);
  assert.deepEqual(accepted.body, success);
  assert.deepEqual(Object.keys(accepted.body).sort(), ["ok", "applied", "code", "fee_period"].sort());
  const cleared = await api({ coupon_code: "", ticket_type: "obog" }, { env: {} });
  assert.equal(cleared.response.status, 200);
  assert.deepEqual(cleared.body, { ok: true, applied: false, code: "" });

  const unconfigured = await api(validPayload, { env: {} });
  assert.equal(unconfigured.response.status, 400);
  assert.equal(unconfigured.body.error, "coupon_invalid");
  const unavailable = await api(validPayload, { env: environment("{private broken setting") });
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.body.error, "coupon_configuration_error");
  assert.equal(JSON.stringify(unavailable.body).includes("private broken setting"), false);
  const expired = await api(validPayload, { env: environment(JSON.stringify([{ code: TEST_CODE, expires_at: NOW }])) });
  assert.equal(expired.response.status, 400);
  assert.equal(expired.body.error, "coupon_expired");
  const ineligible = await api({ ...validPayload, ticket_type: "absent_donation_5000" });
  assert.equal(ineligible.response.status, 400);
  assert.equal(ineligible.body.error, "coupon_ineligible");
  assert.equal((await api({ ...validPayload, ticket_type: "__proto__" })).response.status, 400);
  const invalidType = await api({ ...validPayload, coupon_code: [TEST_CODE] });
  assert.equal(invalidType.response.status, 400);
  assert.equal(invalidType.body.error, "coupon_invalid");

  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const rejected = await api(null, { method, noBody: true });
    assert.equal(rejected.response.status, 405);
    assert.equal(rejected.response.headers.get("allow"), "POST");
  }
  for (const options of [
    { origin: "https://unrelated.example" }, { origin: "null" }, { omitOrigin: true },
    { omitOrigin: true, headers: { "sec-fetch-site": "cross-site" } },
    { origin: "https://unrelated.example", headers: { "sec-fetch-site": "same-origin" } },
  ]) assert.equal((await api(validPayload, options)).response.status, 403);
  assert.equal((await api(validPayload, {
    omitOrigin: true, headers: { "sec-fetch-site": "same-origin" },
  })).response.status, 200);
  assert.equal((await api(validPayload, { headers: { "content-type": "text/plain" } })).response.status, 415);

  for (const rawBody of ["{", "null", "[]", '"text"', "1", new Uint8Array([0xff])]) {
    assert.equal((await api(null, { rawBody })).response.status, 400);
  }
  assert.equal((await api(null, { noBody: true })).response.status, 400);
  const boundaryBody = JSON.stringify(validPayload).padEnd(1024, " ");
  assert.equal((await api(null, { rawBody: boundaryBody })).response.status, 200);
  assert.equal((await api(null, { rawBody: boundaryBody + " " })).response.status, 413);
  assert.equal((await api({ ...validPayload, padding: "あ".repeat(350) })).response.status, 413,
    "the size limit uses bytes, not JavaScript string length");
  assert.equal((await api(null, {
    rawBody: boundaryBody + " ", headers: { "content-length": "1" },
  })).response.status, 413, "a false Content-Length does not evade the stream limit");

  let limiterCalls = 0;
  const rateLimitedEnv = environment(JSON.stringify([...validEntries, { code: OTHER_TEST_CODE, expires_at: expiresAt }]));
  rateLimitedEnv.COUPON_RATE_LIMITER = {
    async limit({ key }) {
      limiterCalls += 1;
      assert.match(key, /^festa60-coupons:[0-9a-f]{24}$/);
      assert.equal(key.includes("198.51.100.8"), false);
      return { success: false };
    },
  };
  const limited = await api(validPayload, {
    env: rateLimitedEnv, headers: { "cf-connecting-ip": "198.51.100.8" },
  });
  assert.equal(limiterCalls, 1);
  assert.equal(limited.response.status, 429);
  assert.equal(limited.body.error, "rate_limited");
  assert.equal(limited.response.headers.get("retry-after"), "60");
  const outwardData = JSON.stringify({ body: limited.body, warnings });
  for (const privateValue of [TEST_CODE, OTHER_TEST_CODE, expiresAt, "FESTA60_EARLY_COUPONS", "198.51.100.8"]) {
    assert.equal(outwardData.includes(privateValue), false, "neither rate response nor logs expose config/client details");
  }
  assert.deepEqual(forbiddenCalls, { db: 0, network: 0, stripe: 0 });
  console.log("PASS coupons: eligibility, normalization, no configured defaults, required expiry and boundaries, fail-closed config, bounded same-origin API, private rate limiting; no external calls or issued codes");
} finally {
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}
