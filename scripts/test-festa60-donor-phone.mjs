import assert from "node:assert/strict";
import worker from "../public/_worker.js";

const APPLICATION_URL = "https://example.com/api/festa60/applications";
const STAFF_CODE = "donor-phone-test-only";
const FIXED_NOW = Date.parse("2026-11-11T03:00:00.000Z");
const originalDate = globalThis.Date;
const originalFetch = globalThis.fetch;
const forbiddenCalls = { db: 0, fetch: 0, background: 0 };
let requestCount = 0;

// These tests stop at the real application's validation response. A deliberate,
// independent privacy-consent error prevents even valid phones from reaching
// database, Turnstile, Stripe or email work.
const env = {
  ENVIRONMENT: "staging",
  STAFF_PAYMENT_ACCESS_CODE: STAFF_CODE,
  APPLICATION_RATE_LIMITER: { async limit() { return { success: true }; } },
};
Object.defineProperty(env, "DB", {
  get() {
    forbiddenCalls.db += 1;
    throw new Error("Donor-phone tests must never access a database");
  },
});

const cohorts = [
  ["obog", 2012],
  ["obog_6_10", 2018],
  ["obog_5_under", 2024],
  ["obog_staff", 2012],
  ["obog_staff_6_10", 2018],
  ["obog_staff_5_under", 2024],
];
const donorPlans = [
  ...["absent_donation_5000", "absent_donation_10000", "absent_donation_30000"]
    .map((ticketType) => ({ ticketType, graduationYear: 2012 })),
  ...cohorts.flatMap(([ticketType, graduationYear]) =>
    ["bronze", "silver", "gold", "platinum"].map((supportTier) => ({
      ticketType: `${ticketType}__${supportTier}`, graduationYear,
    }))),
];
const nonDonorPlans = [
  ...cohorts.map(([ticketType, graduationYear]) => ({ ticketType, graduationYear })),
  { ticketType: "current_student", graduationYear: 2026 },
];
const actions = ["submit_online", "preview_bank_transfer"];

function application(plan, action, phone) {
  return {
    action,
    client_submission_id: "11111111-1111-4111-8111-111111111111",
    family_name: "検証用",
    given_name: "申込者",
    family_name_kana: "ケンショウヨウ",
    given_name_kana: "モウシコミシャ",
    email: "donor-phone-test@example.com",
    phone,
    ticket_type: plan.ticketType,
    ...(plan.supportTier ? { support_tier: plan.supportTier } : {}),
    graduation_year: plan.graduationYear,
    school_lineage: "tus_obog",
    reception_attendance: "attending",
    payment_method: action === "preview_bank_transfer" ? "bank_transfer" : "stripe",
    staff_access_code: STAFF_CODE,
    companion_count: 0,
    companions: [],
    postal_code: "1234567",
    prefecture: "東京都",
    city: "検証区",
    street_address: "検証町1-2-3",
    privacy_consent: false,
    photo_consent: true,
    cancellation_policy_consent: true,
  };
}

async function errorsFor(plan, action, phone) {
  const response = await worker.fetch(new Request(APPLICATION_URL, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.com" },
    body: JSON.stringify(application(plan, action, phone)),
  }), env, {
    waitUntil() {
      forbiddenCalls.background += 1;
      throw new Error("Donor-phone tests must not schedule background work");
    },
  });
  requestCount += 1;
  assert.equal(response.status, 400, `${plan.ticketType}/${action} stops at validation`);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.error, "bad_request");
  assert.equal(result.details?.privacy_consent, "required", "independent error stops downstream work");
  // current_student is not a public API ticket today; it must still not acquire
  // a donor-phone requirement. Keep its unrelated ticket rejection explicit.
  const allowedErrors = plan.ticketType === "current_student"
    ? ["phone", "privacy_consent", "ticket_type"] : ["phone", "privacy_consent"];
  assert.deepEqual(Object.keys(result.details).filter((key) => !allowedErrors.includes(key)), [],
    `fixture has no unrelated validation errors: ${plan.ticketType}`);
  return result.details;
}

try {
  // Avoid a future CI run failing only because the application deadline passed.
  globalThis.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
    static now() { return FIXED_NOW; }
  };
  globalThis.fetch = async () => {
    forbiddenCalls.fetch += 1;
    throw new Error("Donor-phone tests must never call external services");
  };

  for (const action of actions) {
    for (const plan of donorPlans) {
      for (const phone of [undefined, "", " \t\n　"]) {
        const errors = await errorsFor(plan, action, phone);
        assert.equal(errors.phone, "required_for_donor",
          `${plan.ticketType}/${action}: absent or blank donor phone is required`);
      }
      const errors = await errorsFor(plan, action, "090-1234-5678");
      assert.equal(Object.hasOwn(errors, "phone"), false,
        `${plan.ticketType}/${action}: string phone satisfies the requirement`);
    }

    // Public submissions can represent a support tier in its own field. Exercise
    // normalization in the real route, rather than testing only combined tickets.
    for (const [ticketType, graduationYear] of cohorts) {
      const plan = { ticketType, graduationYear, supportTier: "gold" };
      assert.equal((await errorsFor(plan, action, "")).phone, "required_for_donor");
      assert.equal(Object.hasOwn(await errorsFor(plan, action, "+81 90 1234 5678"), "phone"), false);
    }

    for (const plan of nonDonorPlans) {
      for (const phone of [undefined, "", " \t　", "03-1234-5678"]) {
        const errors = await errorsFor(plan, action, phone);
        assert.equal(Object.hasOwn(errors, "phone"), false,
          `${plan.ticketType}/${action}: a non-donor's phone remains optional`);
      }
    }

    for (const plan of [donorPlans[0], donorPlans[3], donorPlans[15]]) {
      for (const phone of [null, 9012345678, true, ["090-1234-5678"], { number: "090-1234-5678" }]) {
        const errors = await errorsFor(plan, action, phone);
        assert.equal(typeof errors.phone, "string", `${plan.ticketType}: non-string donor phone is rejected`);
        assert.ok(errors.phone.length > 0);
      }
    }
  }

  assert.deepEqual(forbiddenCalls, { db: 0, fetch: 0, background: 0 },
    "no DB, Stripe, Turnstile, mail or background work is invoked");
  console.log(`PASS donor phone: ${requestCount} real-route validation requests across donation/support tiers, optional non-donors, payment paths and non-string inputs; no external calls`);
} finally {
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
}
