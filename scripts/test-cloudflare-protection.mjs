import assert from "node:assert/strict";
import { enforceRateLimit, publicSummaryCacheKey } from "../public/cloudflare-protection.js";

const request = new Request("https://example.com/api/festa60/public-summary?bypass=1", {
  headers: {
    "cf-connecting-ip": "203.0.113.25",
    "user-agent": "ExampleCrawler/1.0",
  },
});

const allowedKeys = [];
const allowed = await enforceRateLimit(
  request,
  {
    TEST_LIMITER: {
      async limit({ key }) {
        allowedKeys.push(key);
        return { success: true };
      },
    },
  },
  "TEST_LIMITER",
  "summary",
);
assert.equal(allowed, null);
assert.equal(allowedKeys.length, 1);
assert.match(allowedKeys[0], /^summary:[a-f0-9]{24}$/);
assert.equal(allowedKeys[0].includes("203.0.113.25"), false);

const originalWarn = console.warn;
const warnings = [];
console.warn = (...items) => warnings.push(items);
try {
  const blocked = await enforceRateLimit(
    request,
    { TEST_LIMITER: { limit: async () => ({ success: false }) } },
    "TEST_LIMITER",
    "summary",
  );
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
  const body = await blocked.json();
  assert.equal(body.error, "rate_limited");
  assert.equal(JSON.stringify(warnings).includes("203.0.113.25"), false);
} finally {
  console.warn = originalWarn;
}

const withoutBinding = await enforceRateLimit(request, {}, "MISSING_LIMITER", "summary");
assert.equal(withoutBinding, null);

for (let attempt = 0; attempt < 10; attempt += 1) {
  const response = await enforceRateLimit(request, {}, "CONTACT_RATE_LIMITER", "contact-fallback");
  assert.equal(response, null);
}
const locallyBlocked = await enforceRateLimit(request, {}, "CONTACT_RATE_LIMITER", "contact-fallback");
assert.equal(locallyBlocked.status, 429);

const cacheKey = publicSummaryCacheKey(request);
assert.equal(cacheKey.method, "GET");
assert.equal(cacheKey.url, "https://example.com/api/festa60/public-summary?summary_revision=20261012-2");
assert.equal(publicSummaryCacheKey(new Request("https://example.com/api/festa60/public-summary?other=2")).url, cacheKey.url);

console.log("Cloudflare protection tests passed.");
