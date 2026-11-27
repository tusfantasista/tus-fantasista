import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import worker from "../public/_worker.js";

const origin = "https://festa-upgrade.test";
const adminUrl = origin + "/api/festa60/admin/applications";
const applicationId = "app_fixture";
const applicationCode = "FESTA-TEST-000001";
const originalIntentId = "pi_fixture_bronze";
const customerId = "cus_fixture";
const adminToken = "test-admin-token";
const signingSecret = "webhook-fixture";
const originalAmount = 26000;
const migration = await readFile(
  new URL("../migrations/20261127_add_application_plan_upgrades.sql", import.meta.url), "utf8"
);
const depositMigration = await readFile(
  new URL("../migrations/20261127_add_gold_plan_deposits.sql", import.meta.url), "utf8"
);

function fixture({ balance = 20000, originalCustomer = customerId } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE applications (
      id TEXT PRIMARY KEY, application_code TEXT, member_id TEXT, full_name TEXT,
      full_name_kana TEXT, email TEXT, phone TEXT, family_name TEXT, given_name TEXT,
      family_name_kana TEXT, given_name_kana TEXT, graduation_year INTEGER, school_lineage TEXT,
      postal_code TEXT, address TEXT, prefecture TEXT, city TEXT, street_address TEXT, building TEXT,
      ticket_type TEXT, fee_period TEXT, reception_attendance TEXT, companion_count INTEGER,
      match_status TEXT, quantity INTEGER, expected_transfer_name TEXT, actual_transfer_name TEXT,
      match_confidence REAL, status TEXT, payment_status TEXT, payment_method TEXT,
      payment_provider TEXT, external_payment_id TEXT, admin_note TEXT, attendance_status TEXT,
      total_amount_jpy INTEGER, created_at TEXT, updated_at TEXT, paid_at TEXT, cancelled_at TEXT,
      refunded_at TEXT, pricing_version TEXT, pricing_effective_at TEXT, donation_equivalent_jpy INTEGER,
      supporter_publication_consent INTEGER, supporter_publication_name TEXT, supporter_include_maiden_name INTEGER,
      supporter_joint_name TEXT, supporter_anonymous INTEGER, supporter_badge_preference TEXT,
      supporter_message TEXT, application_received_email_sent_at TEXT, maiden_name TEXT
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY, application_id TEXT, stripe_checkout_session_id TEXT, stripe_payment_intent_id TEXT,
      stripe_customer_id TEXT, stripe_event_id TEXT, status TEXT, amount_total INTEGER, currency TEXT,
      amount_received_jpy INTEGER, amount_remaining_jpy INTEGER, partial_payment_at TEXT,
      partial_payment_email_sent_at TEXT, instructions_email_sent_at TEXT, payment_confirmed_email_sent_at TEXT,
      unreconciled_amount_jpy INTEGER, cash_balance_attention_at TEXT, cash_balance_alert_email_sent_at TEXT,
      payment_method TEXT, payment_provider TEXT, created_at TEXT, updated_at TEXT, paid_at TEXT,
      refunded_at TEXT, cancelled_at TEXT
    );
    CREATE TABLE members (id TEXT PRIMARY KEY, member_code TEXT, full_name TEXT);
    CREATE TABLE companions (application_id TEXT, full_name TEXT, attendee_type TEXT, reception_attendance TEXT);
    CREATE TABLE payment_line_items (
      id TEXT PRIMARY KEY, application_id TEXT, item_type TEXT, label TEXT, quantity INTEGER,
      unit_amount_jpy INTEGER, amount_jpy INTEGER, metadata_json TEXT, created_at TEXT
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor TEXT, action TEXT, target_type TEXT, target_id TEXT,
      details_json TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT
    );
    CREATE TABLE stripe_events (
      id TEXT PRIMARY KEY, event_type TEXT, status TEXT, payload_json TEXT, created_at TEXT, processed_at TEXT
    );
    CREATE TABLE bank_transfer_previews (
      id TEXT PRIMARY KEY, stripe_payment_intent_id TEXT, stripe_customer_id TEXT, amount_total_jpy INTEGER,
      amount_received_jpy INTEGER, amount_remaining_jpy INTEGER, status TEXT, application_id TEXT,
      applicant_email TEXT, applicant_name TEXT, hosted_instructions_url TEXT, expires_at TEXT,
      created_at TEXT, updated_at TEXT
    );
  `);
  sqlite.exec(migration);
  sqlite.exec(depositMigration);
  sqlite.prepare(`
    INSERT INTO applications (
      id, application_code, full_name, email, graduation_year, school_lineage, ticket_type, fee_period,
      reception_attendance, companion_count, quantity, status, payment_status, payment_method,
      payment_provider, external_payment_id, attendance_status, total_amount_jpy, donation_equivalent_jpy,
      created_at, paid_at, application_received_email_sent_at
    ) VALUES (?, ?, '検証用 申込者', 'participant@example.invalid', 1980, 'tus_obog', 'obog__bronze', 'early',
      'attending', 1, 2, 'confirmed', 'paid', 'bank_transfer', 'stripe', ?, 'confirmed', ?, 3500,
      '2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z', '2026-10-12T00:00:00Z')
  `).run(applicationId, applicationCode, originalIntentId, originalAmount);
  sqlite.prepare(`
    INSERT INTO payments (
      id, application_id, stripe_payment_intent_id, stripe_customer_id, amount_total, currency,
      amount_received_jpy, amount_remaining_jpy, status, payment_method, payment_provider,
      unreconciled_amount_jpy, created_at, updated_at, paid_at, payment_confirmed_email_sent_at
    ) VALUES ('pay_fixture', ?, ?, ?, ?, 'jpy', ?, 0, 'paid', 'bank_transfer', 'stripe', ?,
      '2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z', '2026-10-13T00:00:00Z', '2026-10-13T00:00:00Z')
  `).run(applicationId, originalIntentId, customerId, originalAmount, originalAmount, balance);
  sqlite.prepare("INSERT INTO companions VALUES (?, '検証用 同伴者', 'adult', 'attending')").run(applicationId);
  sqlite.prepare(`
    INSERT INTO payment_line_items VALUES
      ('pli_ticket', ?, 'ticket', 'ブロンズ', 1, 18000, 18000, '{}', '2026-10-12T00:00:00Z'),
      ('pli_companion', ?, 'companion', '同伴者', 1, 8000, 8000, '{}', '2026-10-12T00:00:00Z')
  `).run(applicationId, applicationId);

  function statement(sql, values = []) {
    const run = () => ({ success: true, meta: { changes: sqlite.prepare(sql).run(...values).changes } });
    return {
      bind(...bound) { return statement(sql, bound); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...values);
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
      async run() { return run(); },
      runInBatch: run
    };
  }

  const env = {
    ENVIRONMENT: "staging",
    ADMIN_API_TOKEN: adminToken,
    STRIPE_SECRET_KEY: "sk_test_fixture_only",
    STRIPE_WEBHOOK_SECRET: signingSecret,
    EMAIL_WEBHOOK_URL: "https://mail.example.invalid/webhook",
    DB: {
      prepare: statement,
      async batch(statements) {
        sqlite.exec("BEGIN");
        try {
          const results = statements.map((entry) => entry.runInBatch());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      }
    }
  };
  const original = {
    id: originalIntentId, customer: originalCustomer, amount: originalAmount,
    amount_received: originalAmount, status: "succeeded", currency: "jpy",
    payment_method_types: ["customer_balance"], livemode: false
  };
  const intents = new Map();
  const charges = new Map();
  const idempotentCreates = new Map();
  const debits = [];
  const unexpected = [];

  async function stripeFetch(url, options = {}) {
    const method = options.method || "GET";
    const headers = new Headers(options.headers);
    if (!url.startsWith("https://api.stripe.com/v1/")) {
      unexpected.push(`${method} ${url}`);
      throw new Error("Fixture rejects all other outbound requests");
    }
    assert.equal(headers.get("authorization"), "Bearer sk_test_fixture_only");
    const path = new URL(url).pathname;
    const form = new URLSearchParams(options.body);
    if (method === "GET" && path === `/v1/customers/${customerId}/cash_balance`) {
      return Response.json({ customer: customerId, available: { jpy: balance }, livemode: false });
    }
    if (method === "GET" && path === `/v1/payment_intents/${originalIntentId}`) {
      return Response.json(original);
    }
    if (method === "POST" && path === "/v1/payment_intents") {
      const key = headers.get("idempotency-key");
      assert.ok(key, "a duplicate create must resolve to the same Stripe intent");
      assert.equal(form.get("customer"), customerId);
      assert.equal(form.get("currency"), "jpy");
      assert.equal(form.get("payment_method_types[0]"), "customer_balance");
      assert.notEqual(form.get("confirm"), "true", "CRM must link the intent before payment");
      assert.equal(form.has("receipt_email"), false);
      assert.equal(form.has("payment_method_options[customer_balance][funding_type]"), false);
      const depositId = form.get("metadata[festa60_plan_deposit_id]");
      const upgradeId = form.get("metadata[festa60_plan_upgrade_id]");
      assert.ok(Boolean(depositId) !== Boolean(upgradeId), "Stripe intent has exactly one ledger kind");
      const metadata = depositId
        ? { festa60_plan_deposit_id: depositId }
        : { festa60_plan_upgrade_id: upgradeId };
      let intent = idempotentCreates.get(key);
      if (!intent) {
        intent = {
          id: `pi_fixture_upgrade_${intents.size + 1}`, customer: customerId,
          amount: Number(form.get("amount")), amount_received: 0,
          currency: "jpy", status: "requires_payment_method", payment_method_types: ["customer_balance"],
          livemode: false, metadata
        };
        intents.set(intent.id, intent);
        idempotentCreates.set(key, intent);
      }
      assert.equal(intent.amount, Number(form.get("amount")));
      return Response.json({ ...intent, status: "requires_payment_method", amount_received: 0 });
    }
    const [, intentId, operation] = /^\/v1\/payment_intents\/([^/]+)(?:\/(confirm))?$/.exec(path) || [];
    const intent = intents.get(intentId);
    if (intent && method === "GET" && !operation) return Response.json(intent);
    if (intent && method === "POST" && operation === "confirm") {
      assert.equal(form.get("payment_method_data[type]"), "customer_balance");
      assert.equal(form.has("payment_method_options[customer_balance][funding_type]"), false);
      const depositId = intent.metadata.festa60_plan_deposit_id;
      const table = depositId ? "application_plan_upgrade_deposits" : "application_plan_upgrades";
      const link = sqlite.prepare(`SELECT id FROM ${table} WHERE stripe_payment_intent_id = ?`).get(intentId);
      assert.equal(link?.id, depositId ?? intent.metadata.festa60_plan_upgrade_id);
      if (intent.status === "succeeded") {
        return Response.json({ error: { message: "PaymentIntent is already succeeded." } }, { status: 400 });
      }
      assert.ok(balance >= intent.amount);
      balance -= intent.amount;
      debits.push(intent.amount);
      intent.status = "succeeded";
      intent.amount_received = intent.amount;
      intent.latest_charge = `ch_fixture_${charges.size + 1}`;
      charges.set(intent.latest_charge, {
        id: intent.latest_charge, customer: customerId, payment_intent: intentId,
        amount: intent.amount, amount_refunded: 0, refunded: false,
        currency: "jpy", paid: true, status: "succeeded", metadata: intent.metadata
      });
      return Response.json(intent);
    }
    const charge = charges.get(path.slice("/v1/charges/".length));
    if (method === "GET" && path.startsWith("/v1/charges/") && charge) return Response.json(charge);
    unexpected.push(`${method} ${path}`);
    throw new Error(`Unexpected Stripe fixture request ${method} ${path}`);
  }

  const workerContext = { waitUntil() {} };
  const adminHeaders = { "x-admin-token": adminToken };
  async function administer(payload, { token = adminToken, confirmation = applicationCode } = {}) {
    const response = await worker.fetch(new Request(`${adminUrl}/${applicationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin, ...(token ? { "x-admin-token": token } : {}) },
      body: JSON.stringify({
        ...payload, confirm_application_code: confirmation, sendEmail: true
      })
    }), env, workerContext);
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json() : await response.text();
    return { status: response.status, body };
  }
  function upgrade(targetTier = "silver", { expectedDifference, ...options } = {}) {
    return administer({
      action: "apply_plan_upgrade", target_tier: targetTier, expected_difference_jpy: expectedDifference
    }, options);
  }
  function deposit(options) {
    return administer({ action: "apply_gold_deposit" }, options);
  }
  async function webhook(id, type, object) {
    const body = JSON.stringify({ id, type, livemode: false, data: { object } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${body}`).digest("hex");
    const response = await worker.fetch(new Request(origin + "/api/festa60/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body
    }), env, workerContext);
    return { status: response.status, body: await response.json() };
  }
  async function adminView() {
    const response = await worker.fetch(new Request(adminUrl, { headers: adminHeaders }), env, workerContext);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.applications.length, 1, "the existing application is reused");
    assert.equal(body.participation_summary.confirmed_festa_attendee_count, 2, "the adult companion remains registered");
    return body.applications[0];
  }
  async function adminExport() {
    const response = await worker.fetch(new Request(origin + "/api/festa60/admin/export", {
      headers: adminHeaders
    }), env, workerContext);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/csv/);
    const [keys, values] = (await response.text()).split("\n").map((line) => line.split(","));
    assert.equal(values.length, keys.length, "fixture values are simple unquoted cells");
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  }
  async function publicSummary() {
    const response = await worker.fetch(new Request(origin + "/api/festa60/public-summary"), env, workerContext);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.summary;
  }
  return {
    sqlite, stripeFetch, upgrade, deposit, webhook, adminView, adminExport, publicSummary, intents, charges, debits, unexpected,
    row: () => sqlite.prepare("SELECT * FROM applications").get(),
    originalPayment: () => sqlite.prepare("SELECT * FROM payments").get(),
    upgrades: () => sqlite.prepare("SELECT * FROM application_plan_upgrades ORDER BY applied_at").all(),
    depositRow: () => sqlite.prepare("SELECT * FROM application_plan_upgrade_deposits").get(),
    auditCount: (action) => sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = ?").get(action).count,
    cashBalance: () => balance,
    fund: (amount) => { balance += amount; }
  };
}

async function runFixture(options, check) {
  const f = fixture(options);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = f.stripeFetch;
  try {
    await check(f);
    assert.deepEqual(f.unexpected, [], "upgrade handling never starts another payment type or sends email");
  } finally {
    globalThis.fetch = originalFetch;
    f.sqlite.close();
  }
}

function ok(result) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  return result.body;
}

function persistedBronze(f) {
  const app = f.row();
  assert.equal(app.ticket_type, "obog__bronze");
  assert.equal(app.total_amount_jpy, originalAmount);
  assert.equal(app.payment_status, "paid");
  assert.equal(app.attendance_status, "confirmed");
  assert.equal(f.upgrades().length, 0);
  assert.deepEqual(f.debits, []);
}

await runFixture({}, async (f) => {
  assert.equal((await f.upgrade("silver", { token: null })).status, 401);
  assert.equal((await f.upgrade("silver", { confirmation: "FESTA-TEST-WRONG" })).status, 400);
  assert.equal((await f.upgrade("gold")).status, 409, "direct Bronze to Gold is outside this operator flow");
  persistedBronze(f);

  for (const result of await Promise.all([f.upgrade(), f.upgrade()])) {
    assert.deepEqual(ok(result), {
      ok: true, application_code: applicationCode, plan_tier: "silver",
      difference_jpy: 10000, cash_balance_jpy: 10000
    });
  }
  assert.equal(f.intents.size, 1);
  assert.deepEqual(f.debits, [10000], "concurrent retries debit the balance once");
  assert.equal(ok(await f.upgrade()).cash_balance_jpy, 10000);
  assert.equal(f.cashBalance(), 10000);
  assert.equal(f.upgrades().length, 1);
  assert.equal(f.upgrades()[0].status, "applied");
  assert.equal(f.auditCount("application.plan_upgrade_applied"), 1);
  assert.equal(f.row().paid_at, "2026-10-13T00:00:00Z");
  assert.equal(f.row().donation_equivalent_jpy, 10200);
  assert.equal(f.originalPayment().stripe_payment_intent_id, originalIntentId);
  assert.equal(f.originalPayment().amount_total, originalAmount);
  assert.equal(f.originalPayment().amount_received_jpy, originalAmount);
  assert.equal(f.originalPayment().payment_confirmed_email_sent_at, "2026-10-13T00:00:00Z");
  const silver = await f.adminView();
  assert.equal(silver.ticket_type, "obog__silver");
  assert.equal(silver.amount_total, 36000);
  assert.equal(silver.amount_received_jpy, 36000);
  assert.equal(silver.unreconciled_amount_jpy, 10000);
  assert.equal(silver.companion_fee_total, 8000);
  assert.equal(silver.plan_upgrade_amount_jpy, 10000);
  const exportedSilver = await f.adminExport();
  assert.equal(exportedSilver.amount_received_jpy, "36000");
  assert.equal(exportedSilver.unreconciled_amount_jpy, "10000");

  const [intent] = f.intents.values();
  ok(await f.webhook("evt_fixture_succeeded", "payment_intent.succeeded", intent));
  assert.equal(ok(await f.webhook("evt_fixture_succeeded", "payment_intent.succeeded", intent)).duplicate, true);
  assert.equal(f.row().total_amount_jpy, 36000, "success delivery cannot reapply the upgrade");
  assert.equal(f.auditCount("application.plan_upgrade_applied"), 1);
  ok(await f.webhook("evt_fixture_stale_balance", "cash_balance.funds_available", {
    customer: customerId, available: { jpy: 20000 }
  }));
  assert.equal(f.originalPayment().unreconciled_amount_jpy, 10000, "delayed funds events use the current Stripe balance");

  const gold = await f.upgrade("gold");
  assert.equal(gold.status, 409);
  assert.equal(gold.body.error, "insufficient_cash_balance");
  assert.equal(gold.body.difference_jpy, 20000);
  assert.equal(gold.body.cash_balance_jpy, 10000);
  assert.equal(f.intents.size, 1, "an unfunded upgrade does not create another Stripe intent");

  ok(await f.webhook("evt_fixture_refunded", "charge.refunded", {
    id: "ch_fixture_upgrade", customer: customerId, payment_intent: intent.id,
    currency: "jpy", amount: 10000, amount_refunded: 10000, refunded: true, metadata: intent.metadata
  }));
  assert.equal(f.upgrades()[0].status, "review");
  assert.equal(f.upgrades()[0].refunded_amount_jpy, 10000);
  assert.equal(f.row().payment_status, "paid");
  assert.equal(f.row().attendance_status, "confirmed");
  assert.equal(f.originalPayment().status, "paid");
  assert.equal(f.auditCount("application.plan_upgrade_review"), 1);
  const afterRefund = await f.adminView();
  assert.equal(afterRefund.plan_upgrade_needs_review, 1);
  assert.equal(afterRefund.amount_received_jpy, originalAmount);
  assert.equal((await f.upgrade("gold")).body.error, "upgrade_review_required");
});

await runFixture({ balance: 9999 }, async (f) => {
  const result = await f.upgrade();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "insufficient_cash_balance");
  assert.equal(f.intents.size, 0);
  persistedBronze(f);
});

await runFixture({ originalCustomer: "cus_wrong_fixture" }, async (f) => {
  const result = await f.upgrade();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "original_payment_not_verified");
  assert.equal(f.intents.size, 0);
  persistedBronze(f);
});

await runFixture({}, async (f) => {
  f.sqlite.exec("UPDATE payments SET updated_at = NULL");
  assert.equal(ok(await f.upgrade()).cash_balance_jpy, 10000);
  assert.equal(f.originalPayment().unreconciled_amount_jpy, 10000);
  f.fund(10000);
  const upgradeToGold = ok(await f.upgrade("gold"));
  assert.equal(upgradeToGold.plan_tier, "gold");
  assert.equal(upgradeToGold.difference_jpy, 20000);
  assert.equal(upgradeToGold.cash_balance_jpy, 0);
  assert.deepEqual(f.debits, [10000, 20000]);
  const gold = await f.adminView();
  assert.equal(gold.amount_total, 56000);
  assert.equal(gold.amount_received_jpy, 56000);
  assert.equal(gold.donation_equivalent_jpy, 25000);
});

await runFixture({}, async (f) => {
  assert.equal((await f.deposit({ token: null })).status, 401);
  assert.equal((await f.deposit()).status, 409, "an already confirmed Silver plan is required");
  assert.equal(f.depositRow(), undefined);
  persistedBronze(f);
  ok(await f.upgrade());
  assert.equal((await f.deposit({ confirmation: "FESTA-TEST-WRONG" })).status, 400);

  const summaryBeforeDeposit = await f.publicSummary();
  const expectedDeposit = {
    ok: true, application_code: applicationCode, plan_tier: "silver",
    deposit_amount_jpy: 10000, cash_balance_jpy: 0, gold_remaining_jpy: 10000
  };
  for (const result of await Promise.all([f.deposit(), f.deposit()])) {
    assert.deepEqual(ok(result), expectedDeposit);
  }
  assert.deepEqual(ok(await f.deposit()), expectedDeposit);
  const deposit = f.depositRow();
  assert.equal(deposit.amount_jpy, 10000);
  assert.equal(deposit.status, "applied");
  assert.equal(f.intents.size, 2);
  assert.deepEqual(f.debits, [10000, 10000], "retries of a deposit debit it once");
  assert.equal(f.cashBalance(), 0);

  const intent = f.intents.get(deposit.stripe_payment_intent_id);
  ok(await f.webhook("evt_fixture_deposit_paid", "payment_intent.succeeded", intent));
  assert.equal(ok(await f.webhook("evt_fixture_deposit_paid", "payment_intent.succeeded", intent)).duplicate, true);
  assert.deepEqual(f.debits, [10000, 10000]);

  const silver = await f.adminView();
  assert.equal(silver.ticket_type, "obog__silver");
  assert.equal(silver.amount_total, 36000);
  assert.equal(silver.amount_received_jpy, 36000);
  assert.equal(silver.donation_equivalent_jpy, 10200);
  assert.equal(silver.unreconciled_amount_jpy, 0);
  assert.equal(silver.plan_upgrade_deposit_amount_jpy, 10000);
  assert.equal(silver.plan_upgrade_deposit_status, "applied");
  const silverExport = await f.adminExport();
  assert.equal(silverExport.plan_upgrade_deposit_amount_jpy, "10000");
  assert.equal(silverExport.amount_received_jpy, "36000");
  const summaryAfterDeposit = await f.publicSummary();
  assert.deepEqual(summaryAfterDeposit.plan_counts, summaryBeforeDeposit.plan_counts);
  assert.equal(summaryAfterDeposit.donation_equivalent_jpy, summaryBeforeDeposit.donation_equivalent_jpy);

  const beforeFunding = await f.upgrade("gold", { expectedDifference: 10000 });
  assert.equal(beforeFunding.status, 409);
  assert.equal(beforeFunding.body.error, "insufficient_cash_balance");
  assert.equal(beforeFunding.body.difference_jpy, 10000);
  assert.equal(beforeFunding.body.cash_balance_jpy, 0);
  f.fund(10000);
  const staleAmount = await f.upgrade("gold", { expectedDifference: 20000 });
  assert.equal(staleAmount.status, 409);
  assert.equal(f.cashBalance(), 10000, "a stale confirmed amount cannot debit the balance");
  const applied = ok(await f.upgrade("gold", { expectedDifference: 10000 }));
  assert.equal(applied.plan_tier, "gold");
  assert.equal(applied.difference_jpy, 10000);
  assert.equal(applied.deposit_credit_jpy, 10000);
  assert.equal(applied.cash_balance_jpy, 0);
  const gold = await f.adminView();
  assert.equal(gold.amount_total, 56000);
  assert.equal(gold.amount_received_jpy, 56000);
  assert.equal(gold.donation_equivalent_jpy, 25000);
  assert.equal(gold.plan_upgrade_deposit_amount_jpy, 0);
  assert.equal(f.upgrades().find((upgrade) => upgrade.to_ticket_type === "obog__gold").deposit_id, deposit.id);
  assert.deepEqual(f.debits, [10000, 10000, 10000], "Gold uses the held deposit and collects only 10,000 more");
  assert.equal((await f.publicSummary()).donation_equivalent_jpy, 25000);

  const charge = f.charges.get(intent.latest_charge);
  charge.amount_refunded = 10000;
  charge.refunded = true;
  ok(await f.webhook("evt_fixture_credited_deposit_refunded", "charge.refunded", charge));
  assert.equal(f.depositRow().status, "review");
  const afterRefund = await f.adminView();
  assert.equal(afterRefund.ticket_type, "obog__gold");
  assert.equal(afterRefund.payment_status, "paid");
  assert.equal(afterRefund.amount_received_jpy, 46000);
  assert.equal(afterRefund.plan_upgrade_needs_review, 1);
});

await runFixture({}, async (f) => {
  ok(await f.upgrade());
  ok(await f.deposit());
  const intent = f.intents.get(f.depositRow().stripe_payment_intent_id);
  const charge = f.charges.get(intent.latest_charge);
  charge.amount_refunded = 10000;
  charge.refunded = true;
  f.fund(10000);
  const beforeRefundWebhook = await f.upgrade("gold", { expectedDifference: 10000 });
  assert.equal(beforeRefundWebhook.status, 409);
  assert.equal(beforeRefundWebhook.body.error, "deposit_review_required");
  assert.deepEqual(f.debits, [10000, 10000], "a deposit already refunded in Stripe cannot be reused");
  ok(await f.webhook("evt_fixture_deposit_refunded", "charge.refunded", charge));
  assert.equal(f.depositRow().status, "refunded");
  assert.equal(f.depositRow().refunded_amount_jpy, 10000);
  const silver = await f.adminView();
  assert.equal(silver.ticket_type, "obog__silver");
  assert.equal(silver.amount_received_jpy, 36000);
  assert.equal(silver.donation_equivalent_jpy, 10200);
  assert.equal(silver.payment_status, "paid");
  assert.equal(silver.attendance_status, "confirmed");
  assert.equal(silver.plan_upgrade_deposit_amount_jpy, 0);
});

await runFixture({ balance: 19999 }, async (f) => {
  ok(await f.upgrade());
  const result = await f.deposit();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "insufficient_cash_balance");
  assert.equal(f.depositRow(), undefined);
  assert.equal(f.cashBalance(), 9999);
  assert.deepEqual(f.debits, [10000]);
});

await runFixture({}, async (f) => {
  ok(await f.upgrade());
  f.fund(10000);
  const results = await Promise.all([f.deposit(), f.upgrade("gold", { expectedDifference: 20000 })]);
  assert.ok(results.every(({ status }) => status === 200 || status === 409), JSON.stringify(results));
  assert.ok(results.some(({ status }) => status === 200));
  const row = await f.adminView();
  const isGold = row.ticket_type === "obog__gold";
  assert.equal(row.amount_received_jpy, isGold ? 56000 : 36000);
  assert.equal(row.plan_upgrade_deposit_amount_jpy, isGold ? 0 : 10000);
  assert.equal(f.cashBalance(), isGold ? 0 : 10000);
});

console.log("PASS FESTA plan upgrades and deposits: signed webhooks, paid totals, retained funds, concurrency and verification failures.");
