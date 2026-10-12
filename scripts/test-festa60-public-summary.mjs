import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../public/_worker.js";

// Older summary revisions must not be reused after changing the attendance target scope.
globalThis.caches = { default: {
  match: async (key) => [
    "https://example.com/api/festa60/public-summary",
    "https://example.com/api/festa60/public-summary?summary_revision=20261012-1",
    "https://example.com/api/festa60/public-summary?summary_revision=20261012-2",
  ].includes(key.url)
    ? new Response(JSON.stringify({ ok: true, summary: { participant_count_visible: false } }))
    : null,
  async put() {},
} };

async function summaryFor(participantCount, extraApplications = []) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE applications (
      id INTEGER PRIMARY KEY, ticket_type TEXT, graduation_year INTEGER,
      companion_count INTEGER DEFAULT 0, donation_equivalent_jpy INTEGER,
      supporter_publication_consent INTEGER DEFAULT 0,
      supporter_anonymous INTEGER DEFAULT 1, supporter_joint_name TEXT,
      supporter_include_maiden_name INTEGER DEFAULT 0, maiden_name TEXT,
      supporter_publication_name TEXT, full_name TEXT, supporter_message TEXT,
      updated_at TEXT, payment_status TEXT, cancelled_at TEXT,
      refunded_at TEXT, status TEXT
    );
    CREATE TABLE payment_line_items (application_id INTEGER, item_type TEXT, amount_jpy INTEGER);
  `);
  const insert = database.prepare(`INSERT INTO applications
    (ticket_type, graduation_year, companion_count, donation_equivalent_jpy,
     full_name, updated_at, payment_status, status, cancelled_at, refunded_at)
    VALUES (?, ?, ?, ?, '非公開の検証用氏名', '2026-10-12T00:00:00Z', ?, ?, ?, ?)`);
  for (let index = 0; index < participantCount; index += 1) {
    insert.run(index === 0 ? "obog__bronze" : "obog_staff", index === 0 ? 1988 : 2012,
      index === 0 ? 2 : 0, index === 0 ? 3500 : 0, "paid", "confirmed", null, null);
  }
  insert.run("absent_donation_5000", null, 0, 5000, "paid", "confirmed", null, null);
  // Each cancellation/refund marker excludes the record independently, even if
  // the other state fields disagree. None may add participants, support or money.
  for (const [paymentStatus, status, cancelledAt, refundedAt] of [
    ["cancelled", "confirmed", null, null],
    ["refunded", "confirmed", null, null],
    ["paid", "cancelled", null, null],
    ["paid", "refunded", null, null],
    ["paid", "confirmed", "2026-10-11", null],
    ["paid", "confirmed", null, "2026-10-11"],
    ["unpaid", "cancelled", null, null],
    ["pending", "confirmed", "2026-10-11", null],
    ["unpaid", "confirmed", null, "2026-10-11"],
  ]) {
    insert.run("obog__platinum", 2022, 3, 70000, paymentStatus, status, cancelledAt, refundedAt);
  }
  for (const application of extraApplications) {
    const result = insert.run(application.ticketType || "obog__gold", 2004, 3,
      application.donation ?? 25000, application.paymentStatus, "payment_pending", null, null);
    if (application.additionalDonation) {
      database.prepare("INSERT INTO payment_line_items VALUES (?, 'additional_donation', ?)")
        .run(result.lastInsertRowid, application.additionalDonation);
    }
    if (application.publicName) {
      database.prepare(`UPDATE applications SET supporter_publication_consent = 1,
        supporter_anonymous = 0, supporter_publication_name = ? WHERE id = ?`)
        .run(application.publicName, result.lastInsertRowid);
    }
  }

  try {
    const response = await worker.fetch(new Request("https://example.com/api/festa60/public-summary"), {
      ENVIRONMENT: "staging",
      // An old dashboard setting must not keep fewer than 20 participants hidden.
      PUBLIC_PARTICIPANT_COUNT_THRESHOLD: "20",
      DB: { prepare: (sql) => ({ all: async () => ({ results: database.prepare(sql).all() }) }) },
    }, { waitUntil() {} });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(JSON.stringify(payload).includes("非公開の検証用氏名"), false);
    return payload.summary;
  } finally {
    database.close();
  }
}

for (const count of [0, 1, 7, 19, 20, 118, 119, 120]) {
  const summary = await summaryFor(count);
  assert.equal(summary.participant_count_visible, true, `${count} participants are visible`);
  assert.equal(summary.participant_count_threshold, 0);
  assert.equal(summary.obog_participant_count, count);
  assert.equal(summary.companion_count, count > 0 ? 2 : 0);
  assert.equal(summary.participant_target_remaining_count, Math.max(0, 120 - count - (count > 0 ? 2 : 0)));
  assert.deepEqual(summary.participating_decades, count === 0 ? [] : count === 1 ? ["1980年代"] : ["1980年代", "2010年代"]);
  assert.equal(summary.supporter_count, count > 0 ? 2 : 1);
  assert.equal(summary.donation_equivalent_jpy, count > 0 ? 8500 : 5000);
  assert.deepEqual(summary.supporters, []);
  assert.deepEqual(Object.keys(summary).sort(), [
    "participant_count_visible", "participant_count_threshold", "participant_target_count",
    "participant_target_remaining_count", "obog_participant_count", "companion_count",
    "participating_decades", "supporter_count", "plan_counts", "donation_equivalent_jpy",
    "primary_target_jpy", "primary_target_remaining_jpy", "goals", "allocation", "supporters", "last_updated_at",
  ].sort());
}

// Incomplete payment does not suppress an active application or its support.
for (const paymentStatus of ["unpaid", "pending", "partially_funded", null]) {
  const summary = await summaryFor(0, [{ paymentStatus, additionalDonation: 2500 }]);
  assert.equal(summary.obog_participant_count, 1, `${paymentStatus}: active application included`);
  assert.equal(summary.companion_count, 3);
  assert.equal(summary.participant_target_remaining_count, 116);
  assert.deepEqual(summary.participating_decades, ["2000年代"]);
  assert.equal(summary.supporter_count, 2);
  assert.equal(summary.plan_counts.gold, 1);
  assert.equal(summary.plan_counts.additional_donation, 1);
  assert.equal(summary.plan_counts.platinum, 0);
  assert.equal(summary.donation_equivalent_jpy, 32500);
  assert.deepEqual(summary.supporters, []);
}

const absentSummary = await summaryFor(0, [{
  paymentStatus: "unpaid", ticketType: "absent_donation_10000", donation: 10000,
  publicName: "公開同意済みの検証名",
}]);
assert.equal(absentSummary.obog_participant_count, 0);
assert.equal(absentSummary.companion_count, 0);
assert.equal(absentSummary.participant_target_remaining_count, 120);
assert.deepEqual(absentSummary.participating_decades, []);
assert.equal(absentSummary.supporter_count, 2);
assert.equal(absentSummary.plan_counts.absent_donation_10000, 1);
assert.equal(absentSummary.donation_equivalent_jpy, 15000);
assert.deepEqual(absentSummary.supporters, [{
  plan: "absent_donation_10000", display_name: "公開同意済みの検証名", message: null,
}]);
delete globalThis.caches;
console.log("PASS public summary: OBOG + companion attendance target including 120 and overflow, unpaid/pending support, cancellation/refund exclusion, cache and privacy");
