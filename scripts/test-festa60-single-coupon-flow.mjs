import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { randomUUID, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import * as pricing from '../public/assets/js/festa60-pricing.js';
import { resolveEarlyCoupon, reserveCoupon, bindCouponPreview, markCouponUsed, releaseCouponReservation } from '../public/festa60-coupons.js';

// Execute the production request orchestration and bank/token/persistence functions.
// Application/customer/payment service effects are confined to an in-memory DB
// and an idempotency-aware fetch fixture. No network or real payment is used.
const source = await readFile(new URL('../public/_worker.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/20261111_add_crm_coupons.sql', import.meta.url), 'utf8');
const usageMigration = await readFile(new URL('../migrations/20261111_add_coupon_redemptions.sql', import.meta.url), 'utf8');
const extract = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing production function ${start}`);
  return source.slice(a, b);
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Flow barrier timed out')), 3000); })]); }
  finally { clearTimeout(timer); }
}
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: init.status || 200, headers: { 'content-type': 'application/json' } });

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(migration + usageMigration);
  db.exec(`CREATE TABLE applications (id TEXT PRIMARY KEY, application_code TEXT, client_submission_id TEXT UNIQUE,
      total_amount_jpy INTEGER, payment_provider TEXT, payment_status TEXT);
    CREATE TABLE payments (id TEXT PRIMARY KEY, application_id TEXT, stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT, payment_provider TEXT, created_at TEXT);
    CREATE TABLE bank_transfer_previews (id TEXT PRIMARY KEY, stripe_payment_intent_id TEXT UNIQUE,
      stripe_customer_id TEXT, amount_total_jpy INTEGER, amount_received_jpy INTEGER, amount_remaining_jpy INTEGER,
      currency TEXT, payload_hash TEXT, status TEXT, applicant_email TEXT, applicant_name TEXT,
      hosted_instructions_url TEXT, expires_at TEXT, created_at TEXT, updated_at TEXT,
      pricing_version TEXT, pricing_effective_at TEXT, donation_equivalent_jpy INTEGER, application_id TEXT);`);
  const at = new Date().toISOString();
  db.prepare(`INSERT INTO festa60_coupons VALUES (?, 'FLOW_TEST', '', NULL, '2099-01-01T00:00:00.000Z', NULL, ?, ?)`)
    .run(randomUUID(), at, at);
  const hooks = {};
  const effects = { customerCreates: 0, intentCreates: 0, customerDeletes: 0, intentCancels: 0, appInserts: 0, customerRequests: 0 };
  const customers = new Map(), intents = new Map(), sessions = new Map();
  const allow = { async limit() { return { success: true }; } };
  function statement(sql, values = []) {
    return {
      bind(...bound) { return statement(sql, bound); },
      async first(column) { const row = db.prepare(sql).get(...values); return column ? (row?.[column] ?? null) : row || null; },
      async run() { const result = db.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
      async all() { return { success: true, results: db.prepare(sql).all(...values) }; },
    };
  }
  const env = { DB: { prepare: statement }, ENVIRONMENT: 'staging', STRIPE_SECRET_KEY: 'test-only-signing-fixture',
    APPLICATION_RATE_LIMITER: allow, COUPON_RATE_LIMITER: allow };
  function bankDetails(intent) { return { amount: intent.amount, hosted_instructions_url: `https://example.invalid/instructions/${intent.id}` }; }
  async function fakeFetch(url, options = {}) {
    const method = options.method || 'GET';
    if (url === 'https://api.stripe.com/v1/customers' && method === 'POST') {
      effects.customerRequests += 1;
      const key = options.headers['idempotency-key'];
      let customer = customers.get(key);
      if (!customer) { customer = { id: `cus_${randomUUID()}` }; customers.set(key, customer); effects.customerCreates += 1; }
      if (hooks.customerBarrier) await hooks.customerBarrier();
      return json(customer);
    }
    if (/^https:\/\/api.stripe.com\/v1\/customers\//.test(url) && method === 'DELETE') {
      effects.customerDeletes += 1; return json({ deleted: true });
    }
    if (url === 'https://api.stripe.com/v1/payment_intents' && method === 'POST') {
      if (hooks.failIntentOnce) { hooks.failIntentOnce = false; return json({ error: { message: 'test idempotency request in progress' } }, { status: 409 }); }
      const key = options.headers['idempotency-key'];
      let intent = intents.get(key);
      const params = new URLSearchParams(options.body);
      if (!intent) {
        intent = { id: `pi_${randomUUID()}`, amount: Number(params.get('amount')), customer: params.get('customer'),
          currency: 'jpy', status: 'requires_action' };
        intents.set(key, intent); effects.intentCreates += 1;
      }
      assert.equal(intent.amount, Number(params.get('amount')), 'same Stripe idempotency key must retain the amount');
      assert.equal(intent.customer, params.get('customer'), 'same Stripe idempotency key must retain the customer');
      return json(intent);
    }
    throw new Error(`Unexpected fixture fetch ${method} ${url}`);
  }
  const findIntent = (id) => [...intents.values()].find((entry) => entry.id === id);
  const appById = async (_db, id) => db.prepare('SELECT * FROM applications WHERE id = ?').get(id) || null;
  const context = vm.createContext({
    crypto: webcrypto, Date, TextEncoder, TextDecoder, URLSearchParams, btoa, atob, console: { error() {} },
    __name: (value) => value, json,
    badRequest: (message, details) => json({ ok: false, message, details }, { status: 400 }),
    serverError: (error) => json({ ok: false, fixture_error: error.message }, { status: 500 }),
    readJson: (request) => request.json(), enforceRateLimit: async () => null, isApplicationOpen: () => true,
    feePeriodForDate: () => 'year_end', activePricingVersion: () => pricing.CURRENT_PRICING_VERSION,
    pricingEffectiveAt: () => pricing.DEFAULT_PRICING_EFFECTIVE_AT,
    validateApplication: () => ({ ok: true }), STAFF_TICKET_TYPES: pricing.STAFF_TICKET_TYPES,
    normalizeTicketType: pricing.normalizeTicketType, splitTicketType: pricing.splitTicketType,
    normalizePricingVersion: pricing.normalizePricingVersion, CURRENT_PRICING_VERSION: pricing.CURRENT_PRICING_VERSION,
    LEGACY_PRICING_VERSION: pricing.LEGACY_PRICING_VERSION, DEFAULT_PRICING_EFFECTIVE_AT: pricing.DEFAULT_PRICING_EFFECTIVE_AT,
    lineItemsTotal: pricing.lineItemsTotal, buildPaymentLineItems: pricing.buildPaymentLineItems,
    donationEquivalentForTicket: pricing.donationEquivalentForTicket,
    resolveEarlyCoupon, reserveCoupon, bindCouponPreview, markCouponUsed, releaseCouponReservation,
    requireDb: (value) => value.DB, requireStripeSecret: (value) => value.STRIPE_SECRET_KEY,
    scheduleExpiredBankTransferPreviewCleanup() {}, bankPreviewTtlMs: () => 30 * 60 * 1000,
    nowIso: () => new Date().toISOString(), bankTransferDetails: bankDetails, numberOrNull: (value) => value ?? null,
    fetch: fakeFetch,
    verifyTurnstile: async () => ({ ok: true, skipped: true }), getClientMeta: () => ({}),
    retrieveStripePaymentIntent: async (_secret, id) => structuredClone(findIntent(id)),
    listBankPreviewCashBalanceTransactions: async () => [],
    cancelStripePaymentIntent: async (_secret, id) => {
      effects.intentCancels += 1;
      if (hooks.cancelBarrier) await hooks.cancelBarrier();
      const intent = findIntent(id); intent.status = 'canceled'; return structuredClone(intent);
    },
    getApplicationById: appById, hydrateApplicationLineItems: async (_db, app) => app,
    insertApplication: async (_db, payload) => {
      if (hooks.insertBarrier) await hooks.insertBarrier();
      const application = { id: `app_${randomUUID()}`, application_code: `FESTA-FLOW-${effects.appInserts + 1}`,
        client_submission_id: payload.client_submission_id, total_amount_jpy: pricing.lineItemsTotal(pricing.buildPaymentLineItems(payload, [])),
        payment_provider: 'stripe', payment_status: 'unpaid' };
      db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(...Object.values(application));
      effects.appInserts += 1; return application;
    },
    createCheckoutSession: async ({ application }) => {
      const session = { id: `cs_${application.id}`, url: `https://example.invalid/pay/${application.id}` };
      sessions.set(session.id, session); return { session, metadata: {} };
    },
    createPayment: async (_db, app, session) => {
      const id = `pay_${randomUUID()}`;
      db.prepare('INSERT INTO payments (id, application_id, stripe_checkout_session_id, stripe_payment_intent_id, payment_provider) VALUES (?, ?, ?, NULL, ?)').run(id, app.id, session.id, 'stripe'); return id;
    },
    retrieveStripeCheckoutSession: async (_secret, id) => sessions.get(id), publicBaseUrl: () => 'https://example.invalid',
    updateStripePaymentIntentForApplication: async (_secret, id) => structuredClone(findIntent(id)),
    createBankTransferPayment: async (_db, app, intent) => {
      const id = `pay_${randomUUID()}`;
      db.prepare('INSERT INTO payments (id, application_id, stripe_checkout_session_id, stripe_payment_intent_id, payment_provider) VALUES (?, ?, NULL, ?, ?)').run(id, app.id, intent.id, 'stripe'); return id;
    },
    bankTransferInstructionsUrl: (intent) => bankDetails(intent).hosted_instructions_url,
    bankTransferAmountReceived: () => 0, bankTransferAmountRemaining: (intent) => intent.amount,
    sendPaymentEmailOnce: async () => ({ sent: false, skipped: true }), renderBankTransferInstructionsEmail: () => ({}),
  });
  vm.runInContext(`
    ${extract('async function createBankTransferPreviewCustomer', 'async function claimExpiredBankTransferPreview')}
    ${extract('function observedBankPreviewFunding', 'async function listBankPreviewCashBalanceTransactions')}
    ${extract('function stableStringify', 'async function updateStripePaymentIntentForApplication')}
    ${extract('function couponFailureResponse', '__name(onRequestPost6,')}
    this.testApi = { onRequestPost6, getBankTransferPreview };
  `, context);
  async function call(payload, action = 'submit_online', token) {
    const response = await context.testApi.onRequestPost6({ env, waitUntil() {}, request: new Request('https://example.invalid/api/festa60/applications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, action, payment_method: ['preview_bank_transfer', 'confirm_bank_transfer', 'cancel_bank_preview'].includes(action) ? 'bank_transfer' : 'stripe',
        ...(token ? { bank_preview_token: token } : {}) }),
    }) });
    return { status: response.status, body: await response.json() };
  }
  const claim = () => db.prepare("SELECT * FROM coupon_redemptions WHERE code = 'FLOW_TEST'").get();
  return { db, env, hooks, effects, call, claim, close: () => db.close(), findIntent };
}
function payload(owner = randomUUID()) {
  return { client_submission_id: owner, coupon_code: 'FLOW_TEST', ticket_type: 'obog', support_tier: 'none',
    family_name: 'Fixture', given_name: 'Only', family_name_kana: 'ふぃくすちゃ', given_name_kana: 'おんりー',
    email: 'single-use-test@example.invalid', phone: '00000000000', school_lineage: 'tus_obog', graduation_year: '2010',
    reception_attendance: 'attending', companions: [], companion_count: '0' };
}
function success(result) { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; }

{
  const f = fixture();
  try {
    const a = payload(), b = payload();
    const results = await Promise.all([f.call(a), f.call(b)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(f.effects.appInserts, 1, 'different owners cannot both create discounted applications');
    assert.ok(f.claim().used_at);
    const winner = results[0].status === 200 ? a : b;
    const before = { ...f.claim() };
    const retry = success(await f.call(winner));
    assert.equal(retry.duplicate_submission, true);
    assert.equal(f.effects.appInserts, 1);
    assert.deepEqual({ ...f.claim() }, before, 'retry retains the same used application and timestamp');
  } finally { f.close(); }
}
{
  const f = fixture();
  try {
    const a = payload();
    f.hooks.failIntentOnce = true;
    assert.equal((await f.call(a, 'preview_bank_transfer')).status, 502);
    assert.equal(f.effects.customerDeletes, 0, 'an idempotency failure must not delete the shared customer');
    success(await f.call(a, 'preview_bank_transfer'));
    const original = { ...f.db.prepare('SELECT * FROM bank_transfer_previews').get() };
    const again = success(await f.call(a, 'preview_bank_transfer'));
    assert.equal(again.expires_at, original.expires_at, 'retry preserves the original quote deadline');
    assert.equal(f.effects.customerCreates, 1);
    assert.equal(f.effects.intentCreates, 1);
    assert.equal(f.effects.intentCancels, 0);
  } finally { f.close(); }
}
{
  const f = fixture();
  try {
    const a = payload(), gate = deferred(); let arrivals = 0;
    f.hooks.customerBarrier = async () => { if (++arrivals === 2) gate.resolve(); await bounded(gate.promise); };
    const results = await Promise.all([f.call(a, 'preview_bank_transfer'), f.call(a, 'preview_bank_transfer')]);
    results.forEach(success);
    assert.equal(arrivals, 2, 'the fixture forces both requests into shared creation/persistence');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM bank_transfer_previews').get().count, 1);
    assert.equal(f.effects.customerCreates, 1);
    assert.equal(f.effects.intentCreates, 1);
    assert.equal(f.effects.intentCancels, 0, 'duplicate persistence must not cancel the shared PI');
    assert.equal(f.effects.customerDeletes, 0);
  } finally { f.close(); }
}
{
  const f = fixture();
  try {
    const a = payload(), b = payload();
    const quote = success(await f.call(a, 'preview_bank_transfer'));
    const entered = deferred(), release = deferred();
    f.hooks.insertBarrier = async () => { entered.resolve(); await release.promise; };
    const confirmation = f.call(a, 'confirm_bank_transfer', quote.bank_preview_token);
    await bounded(entered.promise); // Confirm owns preview.status='confirming', app is not saved yet.
    assert.equal((await f.call(a, 'cancel_bank_preview', quote.bank_preview_token)).status, 409);
    assert.equal((await f.call(b)).status, 409);
    assert.equal(f.effects.intentCancels, 0);
    release.resolve(); success(await confirmation);
    assert.equal(f.effects.appInserts, 1);
    assert.ok(f.claim().used_at);
    assert.equal(f.claim().owner, a.client_submission_id);
  } finally { f.close(); }
}
{
  const f = fixture();
  try {
    const a = payload(), b = payload();
    const quote = success(await f.call(a, 'preview_bank_transfer'));
    const entered = deferred(), release = deferred();
    f.hooks.cancelBarrier = async () => { entered.resolve(); await release.promise; };
    const cancellation = f.call(a, 'cancel_bank_preview', quote.bank_preview_token);
    await bounded(entered.promise); // Cancel owns preview.status='cancelling', PI is not canceled yet.
    assert.equal((await f.call(a, 'confirm_bank_transfer', quote.bank_preview_token)).status, 409);
    assert.equal((await f.call(b)).status, 409, 'reservation stays locked while PI cancellation is uncertain');
    assert.equal(f.effects.appInserts, 0);
    release.resolve(); success(await cancellation);
    assert.equal(f.claim(), undefined, 'no-funds confirmed cancellation may release the unused code');
    success(await f.call(b));
    assert.equal(f.effects.appInserts, 1);
    assert.equal(f.claim().owner, b.client_submission_id);
    assert.ok(f.claim().used_at);
  } finally { f.close(); }
}
console.log('PASS single-use flow: actual request orchestration, atomic cross-owner claim, retry identity, shared bank idempotency/persistence, and confirm/cancel race barriers; memory fixtures only');
