import { splitTicketType } from "./assets/js/festa60-pricing.js";
import { enforceRateLimit } from "./cloudflare-protection.js";

const ELIGIBLE_BASE_TICKETS = new Set([
  "obog", "obog_6_10", "obog_5_under",
  "obog_staff", "obog_staff_6_10", "obog_staff_5_under",
]);
const CODE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_BODY_BYTES = 1024;

function failure(error, message, status = 400) {
  return { ok: false, status, error, message };
}

function invalidCoupon() {
  return failure("coupon_invalid", "クーポンコードをご確認ください。");
}

function invalidConfiguration() {
  return failure("coupon_configuration_error", "現在クーポンをご利用いただけません。時間をおいてお試しください。", 503);
}

function normalizeCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Check before uppercasing so non-ASCII letters cannot become valid ASCII.
  return CODE_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null;
}

function isEligibleTicket(ticketType) {
  if (typeof ticketType !== "string" || !ticketType.trim()) return false;
  try {
    return ELIGIBLE_BASE_TICKETS.has(splitTicketType(ticketType).base_ticket_type);
  } catch {
    // Unknown input must remain an ordinary validation error even if a shared
    // legacy alias lookup does not handle that particular string.
    return false;
  }
}

function configuredInstant(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]
      || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return null;
  const instant = Date.parse(value.trim());
  return Number.isFinite(instant) ? instant : null;
}

export function resolveEarlyCoupon(env, code, ticketType, now = new Date()) {
  if (code === undefined || code === null || (typeof code === "string" && !code.trim())) {
    return { ok: true, applied: false, code: "" };
  }
  const normalized = normalizeCode(code);
  if (!normalized) return invalidCoupon();
  if (!isEligibleTicket(ticketType)) {
    return failure("coupon_ineligible", "この参加区分ではクーポンをご利用いただけません。");
  }

  const configuration = env?.FESTA60_EARLY_COUPONS;
  // No configuration means no active coupons. No implicit/default code exists.
  if (configuration === undefined || configuration === null
      || (typeof configuration === "string" && !configuration.trim())) return invalidCoupon();
  if (typeof configuration !== "string") return invalidConfiguration();

  let entries;
  try {
    entries = JSON.parse(configuration);
  } catch {
    return invalidConfiguration();
  }
  if (!Array.isArray(entries)) return invalidConfiguration();

  const configured = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalidConfiguration();
    const entryCode = normalizeCode(entry.code);
    const expiresAt = configuredInstant(entry.expires_at);
    const startsAt = Object.hasOwn(entry, "starts_at") ? configuredInstant(entry.starts_at) : null;
    if (!entryCode || configured.has(entryCode) || expiresAt === null
        || (Object.hasOwn(entry, "starts_at") && (startsAt === null || startsAt >= expiresAt))) {
      return invalidConfiguration();
    }
    configured.set(entryCode, { startsAt, expiresAt });
  }

  const candidate = configured.get(normalized);
  if (!candidate) return invalidCoupon();
  const currentInstant = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(currentInstant)) return invalidConfiguration();
  if (candidate.startsAt !== null && currentInstant < candidate.startsAt) return invalidCoupon();
  if (currentInstant >= candidate.expiresAt) {
    return failure("coupon_expired", "このクーポンの有効期限は終了しました。");
  }
  return { ok: true, applied: true, code: normalized, fee_period: "early" };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readBoundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return { error: "bad_request", status: 400 };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: "payload_too_large", status: 413 };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const payload = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "bad_request", status: 400 };
    return { payload };
  } catch {
    return { error: "bad_request", status: 400 };
  }
}

export async function onRequestCoupon({ request, env }) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed", message: "この方法ではクーポンを確認できません。" }, 405, { allow: "POST" });
  }
  const origin = request.headers.get("origin");
  const sameOrigin = origin
    ? origin === new URL(request.url).origin
    : request.headers.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin) return json({ ok: false, error: "forbidden", message: "同じサイトから操作してください。" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "unsupported_media_type", message: "送信内容をご確認ください。" }, 415);
  }
  const rateLimited = await enforceRateLimit(request, env, "COUPON_RATE_LIMITER", "festa60-coupons");
  if (rateLimited) return rateLimited;
  const parsed = await readBoundedJson(request);
  if (!parsed.payload) return json({ ok: false, error: parsed.error, message: "送信内容をご確認ください。" }, parsed.status);
  const result = resolveEarlyCoupon(env, parsed.payload.coupon_code, parsed.payload.ticket_type);
  if (result.ok) return json(result);
  const { status, ...payload } = result;
  return json(payload, status);
}
