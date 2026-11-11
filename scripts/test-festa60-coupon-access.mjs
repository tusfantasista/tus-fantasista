import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../public/_worker.js';
import { couponPermissions } from '../public/festa60-coupon-access.js';

const origin = 'https://example.invalid';
const issuer = 'issuer@example.invalid';
const other = 'viewer@example.invalid';
const database = new DatabaseSync(':memory:');
for (const file of ['20261111_add_crm_coupons.sql', '20261111_add_coupon_redemptions.sql']) {
  database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
}
function statement(sql, values = []) {
  return { bind: (...args) => statement(sql, args),
    async first() { return database.prepare(sql).get(...values) ?? null; },
    async all() { return { results: database.prepare(sql).all(...values) }; },
    async run() { return { meta: { changes: database.prepare(sql).run(...values).changes } }; } };
}
const env = { ENVIRONMENT: 'production', DB: { prepare: statement },
  FESTA60_COUPON_ISSUERS: `${issuer}, SECOND@example.invalid`,
  COUPON_ADMIN_RATE_LIMITER: { async limit() { return { success: true }; } } };
function request(method, email, payload, suffix = '', headers = {}) {
  return new Request(`${origin}/api/festa60/admin/coupons${suffix}`, { method,
    headers: { ...(email ? { 'cf-access-authenticated-user-email': email } : {}),
      origin, 'content-type': 'application/json', ...headers },
    ...(payload ? { body: JSON.stringify(payload) } : {}) });
}
const dispatch = (req, currentEnv = env) => worker.fetch(req, currentEnv, { waitUntil() {} });
try {
  for (const [email, allowed] of [[issuer, true], ['ISSUER@EXAMPLE.INVALID', true], ['second@example.invalid', true],
    [other, false], [`x${issuer}`, false], [`${issuer}.attacker`, false], ['', false]]) {
    assert.equal(couponPermissions(request('GET', email), env).can_issue, allowed);
  }
  assert.equal(couponPermissions(request('GET', issuer), {}).can_issue, false);
  assert.equal(couponPermissions(request('GET', null, null, '', { 'cf-access-jwt-assertion': 'test-only-identity-without-email' }), env).can_issue, false);
  assert.equal((await dispatch(request('GET', null))).status, 401);
  const read = await (await dispatch(request('GET', other))).json();
  assert.deepEqual(read.permissions, { can_issue: false, can_manage: false });
  assert.deepEqual(read.coupons, []);
  const payload = { code: 'QA_ONLY', expires_at: '2099-01-01T00:00:00+09:00' };
  assert.equal((await dispatch(request('POST', other, payload))).status, 403);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM festa60_coupons').get().n, 0);
  const createResponse = await dispatch(request('POST', issuer, payload));
  assert.equal(createResponse.status, 201);
  const { coupon } = await createResponse.json();
  const patch = { enabled: false, expected_updated_at: coupon.updated_at };
  assert.equal((await dispatch(request('PATCH', other, patch, `/${coupon.id}`))).status, 403);
  assert.equal(database.prepare('SELECT disabled_at FROM festa60_coupons').get().disabled_at, null);
  assert.equal((await dispatch(request('PATCH', issuer, patch, `/${coupon.id}`))).status, 200);
  const preview = { ...env, ENVIRONMENT: 'staging', ADMIN_API_TOKEN: 'local-test-only' };
  assert.equal((await dispatch(request('POST', null, payload, '', { 'x-admin-token': 'local-test-only' }), preview)).status, 403);
  console.log('PASS coupon issuer permissions: exact authenticated emails, case normalization, missing identity/config fail closed, read-only CRM users, protected POST/PATCH and no token-only issuance; local fixtures only');
} finally { database.close(); }
