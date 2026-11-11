import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as pricing from "../public/assets/js/festa60-pricing.js";
import { resolveEarlyCoupon } from "../public/festa60-coupons.js";

const workerSource = await readFile(new URL("../public/_worker.js", import.meta.url), "utf8");
function extract(startMarker, endMarker) {
  const start = workerSource.indexOf(startMarker);
  const end = workerSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Cannot extract ${startMarker}`);
  return workerSource.slice(start, end);
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

const createdAt = Date.parse("2026-11-11T03:00:00.000Z");
const couponExpiresAt = createdAt + 5 * 60 * 1000;
const previewExpiresAt = createdAt + 30 * 60 * 1000;
let clock = createdAt;
let externalCalls = 0;
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const env = {
  ENVIRONMENT: "staging",
  // Synthetic test-only signing material, never a configured/live Stripe key.
  STRIPE_SECRET_KEY: "sk_test_coupon_pricing_fixture_only",
  FESTA60_EARLY_COUPONS: JSON.stringify([{ code: "TEST_ONLY_EARLY", expires_at: new Date(couponExpiresAt).toISOString() }]),
};

const context = vm.createContext({
  Date: TestDate,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  __name: (value) => value,
  fetch: async () => { externalCalls += 1; throw new Error("Coupon-pricing tests must not call Stripe or any network service"); },
  CURRENT_PRICING_VERSION: pricing.CURRENT_PRICING_VERSION,
  DEFAULT_PRICING_EFFECTIVE_AT: pricing.DEFAULT_PRICING_EFFECTIVE_AT,
  normalizePricingVersion: pricing.normalizePricingVersion,
  normalizeTicketType: pricing.normalizeTicketType,
  buildPaymentLineItems: pricing.buildPaymentLineItems,
  lineItemsTotal: pricing.lineItemsTotal,
  donationEquivalentForTicket: pricing.donationEquivalentForTicket,
  danceTicketBenefit: pricing.danceTicketBenefit,
  companionDanceTicketBenefit: pricing.companionDanceTicketBenefit,
});
vm.runInContext(`
  ${extract("function environmentName", "function positiveIntegerEnv")}
  ${extract("function newId", "// api/festa60/_lib/db.js")}
  ${extract("async function findMemberMatch", "async function createPayment")}
  ${extract("async function audit", "// api/festa60/_lib/email.js")}
  ${extract("function stableStringify", "async function updateStripePaymentIntentForApplication")}
  this.testApi = { bankDecisionPayload, bankPreviewPayloadHash, createBankPreviewToken,
    readBankPreviewToken, verifyBankPreviewToken, insertApplication };
`, context);
const api = context.testApi;

const companions = [
  { full_name: "検証用同伴者A", relationship: "家族", attendee_type: "adult", reception_attendance: "attending" },
  { full_name: "検証用同伴者B", relationship: "家族", attendee_type: "child", reception_attendance: "without_reception" },
  { full_name: "検証用同伴者C", relationship: "家族", attendee_type: "preschool", reception_attendance: "attending" },
];
function payloadFor(ticketType, coupon) {
  return {
    action: "preview_bank_transfer",
    payment_method: "bank_transfer",
    application_code: "FESTA-TEST-COUPON",
    client_submission_id: "11111111-1111-4111-8111-111111111111",
    ticket_type: ticketType,
    fee_period: coupon?.applied ? coupon.fee_period : "year_end",
    ...(coupon?.applied ? { coupon_code: coupon.code, coupon_applied: true } : {}),
    pricing_version: pricing.CURRENT_PRICING_VERSION,
    pricing_effective_at: pricing.DEFAULT_PRICING_EFFECTIVE_AT,
    reception_attendance: "attending",
    full_name: "検証用 申込者",
    full_name_kana: "ケンショウヨウ モウシコミシャ",
    family_name: "検証用",
    given_name: "申込者",
    family_name_kana: "ケンショウヨウ",
    given_name_kana: "モウシコミシャ",
    email: "coupon-pricing-test@example.com",
    phone: "090-1234-5678",
    graduation_year: 2012,
    school_lineage: "tus_obog",
    privacy_consent: true,
    cancellation_policy_consent: true,
    photo_consent: true,
    companions: structuredClone(companions),
    companion_count: companions.length,
  };
}

const coupon = resolveEarlyCoupon(env, " test_only_early ", "obog", new Date(clock));
assert.deepEqual(coupon, { ok: true, applied: true, code: "TEST_ONLY_EARLY", fee_period: "early" });
const couponPayload = payloadFor("obog", coupon);
const decision = plain(api.bankDecisionPayload({
  ...couponPayload, bank_preview_token: "not-a-decision-field", turnstile_token: "not-a-decision-field", pay_now: false,
}));
assert.equal(decision.coupon_code, coupon.code);
assert.equal(decision.coupon_applied, true);
assert.equal(decision.fee_period, "early");
for (const field of ["action", "bank_preview_token", "turnstile_token", "pay_now", "payment_method"]) {
  assert.equal(Object.hasOwn(decision, field), false);
}

const couponContext = { applied: coupon.applied, code: coupon.code, fee_period: coupon.fee_period };
const quote = {
  preview_id: "preview-test-only",
  payment_intent_id: "pi_test_only",
  customer_id: "cus_test_only",
  amount: 22000,
  pricing_version: pricing.CURRENT_PRICING_VERSION,
  pricing_effective_at: pricing.DEFAULT_PRICING_EFFECTIVE_AT,
  payload_hash: await api.bankPreviewPayloadHash(couponPayload),
  coupon_context: couponContext,
  expires_at: previewExpiresAt,
};
const token = await api.createBankPreviewToken(env, quote);
assert.deepEqual(plain(await api.readBankPreviewToken(env, token)), quote);

clock = couponExpiresAt + 1;
assert.equal(resolveEarlyCoupon(env, coupon.code, "obog", new Date(clock)).error, "coupon_expired");
assert.deepEqual(plain(await api.verifyBankPreviewToken(env, token, {
  ...couponPayload, action: "confirm_bank_transfer", bank_preview_token: token,
})), quote, "signed bank quote survives coupon expiry until its own preview deadline");

for (const changed of [
  { coupon_code: "ANOTHER_CODE" },
  { coupon_applied: false },
  { fee_period: "year_end" },
]) {
  await assert.rejects(api.verifyBankPreviewToken(env, token, { ...couponPayload, ...changed }),
    /申込内容が変更/, `decision hash binds ${Object.keys(changed)[0]}`);
}
const [encodedQuote, signature] = token.split(".");
const tamperedQuote = JSON.parse(Buffer.from(encodedQuote, "base64url").toString("utf8"));
tamperedQuote.coupon_context.fee_period = "regular";
const forgedToken = `${Buffer.from(JSON.stringify(tamperedQuote)).toString("base64url")}.${signature}`;
await assert.rejects(api.readBankPreviewToken(env, forgedToken), /確認情報が無効/,
  "coupon context cannot be altered without invalidating the signature");

const legacyPayload = payloadFor("obog", null);
const legacyQuote = { ...quote, payload_hash: await api.bankPreviewPayloadHash(legacyPayload) };
delete legacyQuote.coupon_context;
const legacyToken = await api.createBankPreviewToken(env, legacyQuote);
assert.deepEqual(plain(await api.verifyBankPreviewToken(env, legacyToken, legacyPayload)), legacyQuote,
  "existing previews without coupon context remain valid");
clock = previewExpiresAt + 1;
await assert.rejects(api.readBankPreviewToken(env, token), /確認期限が切れ/);
clock = createdAt;

function recordingDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return { bind(...values) {
        return {
          async first() {
            assert.match(sql, /^SELECT \* FROM members /, "only member lookups are expected");
            return null;
          },
          async run() {
            const match = /INSERT INTO ([a-z_]+)\s*\(([\s\S]*?)\)\s*VALUES/.exec(sql);
            assert.ok(match, "all writes must be explicit INSERTs");
            const table = match[1];
            assert.ok(["applications", "payment_line_items", "companions", "consents", "attendance", "audit_logs"].includes(table));
            const columns = match[2].split(",").map((column) => column.trim());
            assert.equal(columns.length, values.length, `${table} SQL columns and bindings align`);
            const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
            if (!rows.has(table)) rows.set(table, []);
            rows.get(table).push(row);
            return { success: true, meta: { changes: 1 } };
          },
        };
      } };
    },
  };
}

function storedCompanionItems(rows) {
  return rows.filter((row) => row.item_type === "companion").map((row) => ({
    label: row.label, quantity: row.quantity, unit_amount_jpy: row.unit_amount_jpy,
    amount_jpy: row.amount_jpy, metadata: JSON.parse(row.metadata_json),
  }));
}
for (const [ticketType, couponTicketAmount, ordinaryTicketAmount, expectedDonation] of [
  ["obog", 13000, 14000, 0],
  ["obog__gold", 48000, 49000, 25000],
  ["obog_staff__gold", 41500, 42000, 25000],
]) {
  const validatedCoupon = resolveEarlyCoupon(env, coupon.code, ticketType, new Date(clock));
  assert.equal(validatedCoupon.applied, true);
  const discountedDb = recordingDb();
  const ordinaryDb = recordingDb();
  const discounted = plain(await api.insertApplication(discountedDb, payloadFor(ticketType, validatedCoupon)));
  const ordinary = plain(await api.insertApplication(ordinaryDb, payloadFor(ticketType, null)));
  const application = discountedDb.rows.get("applications")[0];
  const items = discountedDb.rows.get("payment_line_items");
  const ordinaryItems = ordinaryDb.rows.get("payment_line_items");

  assert.equal(application.fee_period, "early");
  assert.equal(application.total_amount_jpy, couponTicketAmount + 9000);
  assert.equal(discounted.total_amount_jpy, application.total_amount_jpy);
  assert.equal(ordinary.total_amount_jpy, ordinaryTicketAmount + 9000);
  assert.equal(application.donation_equivalent_jpy, expectedDonation, "coupon does not discount the support donation");
  assert.equal(items.reduce((total, item) => total + item.amount_jpy, 0), application.total_amount_jpy,
    "persisted application total equals the persisted positive payment line items");
  assert.equal(discounted.line_items.reduce((total, item) => total + item.amount_jpy, 0), application.total_amount_jpy);
  assert.equal(items.length, 3, "free preschool companion does not create a zero/negative payment line");
  assert.ok(items.every((item) => item.quantity > 0 && item.unit_amount_jpy > 0 && item.amount_jpy > 0));

  const ticket = items.find((item) => item.item_type === "ticket");
  assert.equal(ticket.amount_jpy, couponTicketAmount);
  assert.match(ticket.label, /超早期クーポン適用/);
  const metadata = JSON.parse(ticket.metadata_json);
  assert.equal(metadata.fee_period, "early");
  assert.equal(metadata.coupon_code, validatedCoupon.code);
  assert.equal(metadata.coupon_type, "early_fee");
  assert.deepEqual(storedCompanionItems(items), storedCompanionItems(ordinaryItems),
    "coupon leaves companion prices, labels and metadata unchanged");
  assert.deepEqual(storedCompanionItems(items).map((item) => item.amount_jpy), [8000, 1000]);
  assert.ok(items.filter((item) => item.item_type === "companion").every((item) =>
    !Object.hasOwn(JSON.parse(item.metadata_json), "coupon_code") && !item.label.includes("クーポン")));
  assert.equal(application.companion_count, companions.length);
  assert.equal(discountedDb.rows.get("companions").length, companions.length);
  assert.equal(application.quantity, 1 + companions.length);
}
assert.equal(externalCalls, 0, "no Stripe, mail, Turnstile or other network call occurred");
console.log("PASS coupon pricing: signed preview retains validated coupon through coupon expiry, hash/signature tampering rejected, legacy preview compatibility, actual application/line-item persistence and unchanged companion/support amounts; no Stripe calls");
