const DEFAULT_RETRY_AFTER_SECONDS = 60;
const LOCAL_WINDOW_MS = DEFAULT_RETRY_AFTER_SECONDS * 1000;
const MAX_LOCAL_KEYS = 2048;
const LOCAL_LIMITS = {
  CONTACT_RATE_LIMITER: 10,
  APPLICATION_RATE_LIMITER: 30,
  PUBLIC_SUMMARY_RATE_LIMITER: 60,
};
const localWindows = new Map();

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

function userAgentClass(request) {
  const value = String(request.headers.get("user-agent") || "").toLowerCase();
  if (!value) return "unknown";
  if (/bot|crawler|spider|scan|curl|wget|python|headless|httpclient/.test(value)) return "automated";
  if (value.includes("mozilla/")) return "browser";
  return "other";
}

async function privacySafeClientKey(request, scope) {
  const ipAddress = request.headers.get("cf-connecting-ip") || "unknown";
  const input = new TextEncoder().encode(`${scope}\u0000${ipAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${scope}:${hash}`;
}

function rateLimitLog(request, bindingName, enforcement) {
  const url = new URL(request.url);
  return {
    event: "api_rate_limited",
    binding: bindingName,
    enforcement,
    method: request.method,
    path: url.pathname,
    country: request.cf?.country || "unknown",
    colo: request.cf?.colo || "unknown",
    user_agent_class: userAgentClass(request),
  };
}

function enforceLocalWindow(key, bindingName) {
  const limit = LOCAL_LIMITS[bindingName];
  if (!limit) return true;

  const now = Date.now();
  const windowStart = Math.floor(now / LOCAL_WINDOW_MS) * LOCAL_WINDOW_MS;
  const storageKey = `${bindingName}:${key}`;
  const current = localWindows.get(storageKey);
  const next = !current || current.windowStart !== windowStart
    ? { count: 1, windowStart }
    : { count: current.count + 1, windowStart };
  localWindows.set(storageKey, next);

  if (localWindows.size > MAX_LOCAL_KEYS) {
    for (const [candidateKey, value] of localWindows) {
      if (value.windowStart < windowStart) localWindows.delete(candidateKey);
    }
    while (localWindows.size > MAX_LOCAL_KEYS) {
      localWindows.delete(localWindows.keys().next().value);
    }
  }

  return next.count <= limit;
}

function rateLimitedResponse(request, bindingName, enforcement) {
  console.warn(rateLimitLog(request, bindingName, enforcement));
  return json(
    {
      ok: false,
      error: "rate_limited",
      message: "アクセスが集中しています。少し時間をおいてから、もう一度お試しください。",
    },
    {
      status: 429,
      headers: { "retry-after": String(DEFAULT_RETRY_AFTER_SECONDS) },
    },
  );
}

export async function enforceRateLimit(request, env, bindingName, scope) {
  const limiter = env?.[bindingName];
  const key = await privacySafeClientKey(request, scope);

  if (!limiter || typeof limiter.limit !== "function") {
    return enforceLocalWindow(key, bindingName)
      ? null
      : rateLimitedResponse(request, bindingName, "isolate");
  }

  try {
    const result = await limiter.limit({ key });
    if (result?.success !== false) return null;

    return rateLimitedResponse(request, bindingName, "binding");
  } catch {
    console.error({
      event: "rate_limit_check_failed",
      binding: bindingName,
      method: request.method,
      path: new URL(request.url).pathname,
    });
    return enforceLocalWindow(key, bindingName)
      ? null
      : rateLimitedResponse(request, bindingName, "isolate_fallback");
  }
}

export function publicSummaryCacheKey(request) {
  const url = new URL(request.url);
  // Isolate the new visibility policy from cached summaries that hid small counts.
  url.search = "summary_revision=20261012-1";
  return new Request(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
}
