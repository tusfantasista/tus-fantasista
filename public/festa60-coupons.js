import { splitTicketType } from "./assets/js/festa60-pricing.js";
import { enforceRateLimit } from "./cloudflare-protection.js";

const ELIGIBLE_BASE_TICKETS = new Set([
  "obog", "obog_6_10", "obog_5_under",
  "obog_staff", "obog_staff_6_10", "obog_staff_5_under",
]);
const CODE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_BODY_BYTES = 1024;
const ADMIN_BODY_BYTES = 4096;
const COUPON_COLUMNS = "id, code, label, starts_at, expires_at, disabled_at, created_at, updated_at";
const CLAIM_COLUMNS = "code, owner, payload_hash, preview_id, application_id, application_code, reserved_at, used_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const INTERNAL_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const CRM_COUPON_SELECT = `SELECT ${COUPON_COLUMNS.split(", ").map((column) => `c.${column}`).join(", ")},
  CASE WHEN r.used_at IS NOT NULL THEN 'used' WHEN r.code IS NOT NULL THEN 'reserved' ELSE 'unused' END AS usage_state,
  r.reserved_at, r.used_at, r.application_code
  FROM festa60_coupons c LEFT JOIN coupon_redemptions r ON r.code = c.code`;

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

function evaluateCoupon(normalized, startsAt, expiresAt, now) {
  const currentInstant = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(currentInstant) || expiresAt === null
      || (startsAt !== null && startsAt >= expiresAt)) return invalidConfiguration();
  if (startsAt !== null && currentInstant < startsAt) return invalidCoupon();
  if (currentInstant >= expiresAt) {
    return failure("coupon_expired", "このクーポンの有効期限は終了しました。");
  }
  return { ok: true, applied: true, code: normalized, fee_period: "early" };
}

export async function resolveEarlyCoupon(env, code, ticketType, now = new Date(), context = {}) {
  if (code === undefined || code === null || (typeof code === "string" && !code.trim())) {
    return { ok: true, applied: false, code: "" };
  }
  const normalized = normalizeCode(code);
  if (!normalized) return invalidCoupon();
  if (!isEligibleTicket(ticketType)) {
    return failure("coupon_ineligible", "この参加区分ではクーポンをご利用いただけません。");
  }

  try {
    if (env?.DB) {
      const result = await readCouponClaim(env, normalized);
      if (!result.ok) return result;
      if (result.claim) {
        const claim = result.claim;
        if (typeof context.owner === "string" && UUID.test(context.owner)
            && claim.owner === context.owner.toLowerCase()) {
          if (context.payloadHash !== undefined
              && (typeof context.payloadHash !== "string" || !HASH.test(context.payloadHash)
                || claim.payload_hash !== context.payloadHash.toLowerCase())) return claimConflict();
          // A recorded owner can finish/retry the already reserved application,
          // even after a new-use deadline or CRM stop. No new owner can do so.
          return { ok: true, applied: true, code: normalized, fee_period: "early" };
        }
        return claim.used_at
          ? failure("coupon_used", "このクーポンはすでに申込に使用されています。", 409)
          : failure("coupon_reserved", "このクーポンは別の申込で利用手続き中です。", 409);
      }
      const managed = await env.DB.prepare(
        "SELECT code, starts_at, expires_at, disabled_at FROM festa60_coupons WHERE code = ? LIMIT 1",
      ).bind(normalized).first();
      if (managed) {
        // A managed record is authoritative, including stopped/expired codes.
        // Removing or changing an env setting cannot reactivate a stopped code.
        if (managed.disabled_at !== null && managed.disabled_at !== undefined) return invalidCoupon();
        const startsAt = managed.starts_at === null ? null : configuredInstant(managed.starts_at);
        if (managed.starts_at !== null && startsAt === null) return invalidConfiguration();
        return evaluateCoupon(normalized, startsAt, configuredInstant(managed.expires_at), now);
      }
    }
  } catch {
    // Do not fall back to env after an unavailable table/database: doing so
    // could unknowingly reactivate a CRM-disabled coupon.
    return invalidConfiguration();
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
  return evaluateCoupon(normalized, candidate.startsAt, candidate.expiresAt, now);
}

function claimConflict() {
  return failure("coupon_conflict", "クーポンの利用情報が一致しません。申込内容を確認してください。", 409);
}

function claimInput({ code, owner, payloadHash } = {}) {
  const normalized = normalizeCode(code);
  if (!normalized || typeof owner !== "string" || !UUID.test(owner)
      || typeof payloadHash !== "string" || !HASH.test(payloadHash)) return null;
  return { code: normalized, owner: owner.toLowerCase(), payloadHash: payloadHash.toLowerCase() };
}

function sameClaim(claim, input) {
  return claim && claim.owner === input.owner && claim.payload_hash === input.payloadHash;
}

function uniqueConflict(error) {
  return /UNIQUE constraint failed:\s*coupon_redemptions\./i.test(String(error?.message ?? ""));
}

export async function readCouponClaim(env, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return claimConflict();
  try {
    if (!env?.DB) return invalidConfiguration();
    const claim = await env.DB.prepare(`SELECT ${CLAIM_COLUMNS} FROM coupon_redemptions WHERE code = ? LIMIT 1`)
      .bind(normalized).first();
    return { ok: true, claim: claim ?? null };
  } catch {
    return invalidConfiguration();
  }
}

export async function reserveCoupon(env, options = {}) {
  const input = claimInput(options);
  if (!input || (options.previewId !== undefined && options.previewId !== null
      && (typeof options.previewId !== "string" || !INTERNAL_ID.test(options.previewId)))) return claimConflict();
  try {
    if (!env?.DB) return invalidConfiguration();
    const inserted = await env.DB.prepare(
      `INSERT INTO coupon_redemptions (code, owner, payload_hash, preview_id, reserved_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING ${CLAIM_COLUMNS}`,
    ).bind(input.code, input.owner, input.payloadHash, options.previewId ?? null, new Date().toISOString()).first();
    const found = await readCouponClaim(env, input.code);
    if (!found.ok) return found;
    if (!sameClaim(found.claim, input)) return claimConflict();
    const claim = found.claim;
    if (options.previewId !== undefined && options.previewId !== null && claim.preview_id !== options.previewId) {
      // A retry must not silently turn an in-progress online application into a
      // bank preview. Preview binding is an explicit verified server operation.
      return claimConflict();
    }
    return { ok: true, claim, acquired: Boolean(inserted) };
  } catch (error) {
    return uniqueConflict(error) ? claimConflict() : invalidConfiguration();
  }
}

export async function bindCouponPreview(env, options = {}) {
  const input = claimInput(options);
  if (!input || typeof options.previewId !== "string" || !INTERNAL_ID.test(options.previewId)) return claimConflict();
  try {
    if (!env?.DB) return invalidConfiguration();
    const updated = await env.DB.prepare(
      `UPDATE coupon_redemptions SET preview_id = ?
       WHERE code = ? AND owner = ? AND payload_hash = ? AND used_at IS NULL
         AND (preview_id IS NULL OR preview_id = ?) RETURNING ${CLAIM_COLUMNS}`,
    ).bind(options.previewId, input.code, input.owner, input.payloadHash, options.previewId).first();
    if (updated) return { ok: true, claim: updated };
    const found = await readCouponClaim(env, input.code);
    if (!found.ok) return found;
    return sameClaim(found.claim, input) && found.claim.preview_id === options.previewId
      ? { ok: true, claim: found.claim } : claimConflict();
  } catch (error) {
    return uniqueConflict(error) ? claimConflict() : invalidConfiguration();
  }
}

export async function markCouponUsed(env, options = {}) {
  const input = claimInput(options);
  if (!input || typeof options.applicationId !== "string" || !INTERNAL_ID.test(options.applicationId)
      || typeof options.applicationCode !== "string" || !INTERNAL_ID.test(options.applicationCode)) return claimConflict();
  try {
    if (!env?.DB) return invalidConfiguration();
    const updated = await env.DB.prepare(
      `UPDATE coupon_redemptions
       SET application_id = ?, application_code = ?, used_at = COALESCE(used_at, ?)
       WHERE code = ? AND owner = ? AND payload_hash = ?
         AND ((used_at IS NULL AND application_id IS NULL)
           OR (application_id = ? AND application_code = ?)) RETURNING ${CLAIM_COLUMNS}`,
    ).bind(options.applicationId, options.applicationCode, new Date().toISOString(), input.code, input.owner,
      input.payloadHash, options.applicationId, options.applicationCode).first();
    return updated ? { ok: true, claim: updated } : claimConflict();
  } catch (error) {
    return uniqueConflict(error) ? claimConflict() : invalidConfiguration();
  }
}

export async function releaseCouponReservation(env, { previewId } = {}) {
  if (typeof previewId !== "string" || !INTERNAL_ID.test(previewId)) return claimConflict();
  try {
    if (!env?.DB) return invalidConfiguration();
    // The caller must first verify cancellation and absence of received funds.
    // Elapsed time alone must never release a bank-transfer reservation.
    const removed = await env.DB.prepare(
      "DELETE FROM coupon_redemptions WHERE preview_id = ? AND used_at IS NULL RETURNING code",
    ).bind(previewId).first();
    return { ok: true, released: Boolean(removed) };
  } catch {
    return invalidConfiguration();
  }
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readBoundedJson(request, maxBytes = MAX_BODY_BYTES) {
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
      if (size > maxBytes) {
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
  const result = await resolveEarlyCoupon(env, parsed.payload.coupon_code, parsed.payload.ticket_type);
  if (result.ok) return json(result);
  const { status, ...payload } = result;
  return json(payload, status);
}

function adminFailure(error, message, status = 400) {
  return json({ ok: false, error, message }, status);
}

function unavailableAdmin() {
  return adminFailure("coupon_configuration_error", "クーポンを取得・保存できませんでした。時間をおいてお試しください。", 503);
}

function validateAdminFields(payload, existing = null) {
  const allowed = new Set(existing
    ? ["label", "starts_at", "expires_at", "enabled", "expected_updated_at"]
    : ["code", "label", "starts_at", "expires_at"]);
  if (Object.keys(payload).some((field) => !allowed.has(field))) {
    return { response: adminFailure("coupon_invalid_fields", "クーポンコードは変更できません。入力内容をご確認ください。") };
  }
  if (existing && (typeof payload.expected_updated_at !== "string" || !payload.expected_updated_at)) {
    return { response: adminFailure("coupon_invalid_version", "一覧を更新して、最新のクーポン情報で操作してください。") };
  }
  if (existing && !Object.keys(payload).some((field) => field !== "expected_updated_at")) {
    return { response: adminFailure("coupon_invalid_fields", "変更する内容を指定してください。") };
  }
  const label = Object.hasOwn(payload, "label") ? payload.label : (existing?.label ?? "");
  if (typeof label !== "string" || [...label.trim()].length > 80) {
    return { response: adminFailure("coupon_invalid_label", "管理用メモは80文字以内で入力してください。") };
  }
  const rawStart = Object.hasOwn(payload, "starts_at") ? payload.starts_at : existing?.starts_at;
  const noStart = rawStart === undefined || rawStart === null || (typeof rawStart === "string" && !rawStart.trim());
  const startsAt = noStart ? null : configuredInstant(rawStart);
  const expiresAt = configuredInstant(Object.hasOwn(payload, "expires_at") ? payload.expires_at : existing?.expires_at);
  if (expiresAt === null || (!noStart && startsAt === null) || (startsAt !== null && startsAt >= expiresAt)) {
    return { response: adminFailure("coupon_invalid_dates", "期限と開始日時を、タイムゾーン付きの正しい日時で指定してください。期限は開始日時より後にしてください。") };
  }
  if (Object.hasOwn(payload, "enabled") && typeof payload.enabled !== "boolean") {
    return { response: adminFailure("coupon_invalid_enabled", "有効・停止の指定をご確認ください。") };
  }
  return {
    label: label.trim(),
    starts_at: startsAt === null ? null : new Date(startsAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  };
}

export async function onRequestAdminCoupons({ request, env, params = {}, actor }) {
  // The Worker wrapper must authenticate with assertAdmin before calling this
  // handler. Require its authenticated actor as an additional integration guard.
  if (typeof actor !== "string" || !actor.trim()) {
    return adminFailure("unauthorized", "クーポンの管理には認証が必要です。", 401);
  }
  const method = request.method;
  if (!["GET", "POST", "PATCH"].includes(method)
      || (params.id && method !== "PATCH")) {
    return json({ ok: false, error: "method_not_allowed", message: "この方法ではクーポンを操作できません。" }, 405, { allow: "GET, POST, PATCH" });
  }
  if (method === "GET") {
    try {
      if (!env?.DB) return unavailableAdmin();
      const result = await env.DB.prepare(`${CRM_COUPON_SELECT} ORDER BY c.created_at DESC, c.id DESC`).all();
      return json({ ok: true, coupons: result.results ?? [] });
    } catch {
      return unavailableAdmin();
    }
  }

  const origin = request.headers.get("origin");
  const sameOrigin = origin
    ? origin === new URL(request.url).origin
    : request.headers.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin) return adminFailure("forbidden", "同じサイトから操作してください。", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return adminFailure("unsupported_media_type", "送信内容をご確認ください。", 415);
  }
  const limited = await enforceRateLimit(request, env, "COUPON_ADMIN_RATE_LIMITER", "festa60-admin-coupons");
  if (limited) return limited;
  const parsed = await readBoundedJson(request, ADMIN_BODY_BYTES);
  if (!parsed.payload) return adminFailure(parsed.error, "送信内容をご確認ください。", parsed.status);
  const payload = parsed.payload;

  try {
    if (!env?.DB) return unavailableAdmin();
    if (method === "POST") {
      const fields = validateAdminFields(payload);
      if (fields.response) return fields.response;
      let code;
      if (payload.code === undefined || (typeof payload.code === "string" && !payload.code.trim())) {
        const random = crypto.getRandomValues(new Uint8Array(8));
        code = `F60-${Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
      } else {
        code = normalizeCode(payload.code);
      }
      if (!code) return adminFailure("coupon_invalid_code", "コードは英数字・ハイフン・アンダースコアの64文字以内で入力してください。");
      const now = new Date().toISOString();
      let created;
      try {
        created = await env.DB.prepare(
          `INSERT INTO festa60_coupons (id, code, label, starts_at, expires_at, disabled_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?) RETURNING ${COUPON_COLUMNS}`,
        ).bind(crypto.randomUUID(), code, fields.label, fields.starts_at, fields.expires_at, now, now).first();
      } catch (error) {
        if (/UNIQUE constraint failed:\s*festa60_coupons\.code/i.test(String(error?.message ?? ""))) {
          return adminFailure("coupon_code_exists", "このコードはすでに登録されています。別のコードを指定してください。", 409);
        }
        return unavailableAdmin();
      }
      if (!created) return unavailableAdmin();
      const withUsage = await env.DB.prepare(`${CRM_COUPON_SELECT} WHERE c.id = ?`).bind(created.id).first();
      return withUsage ? json({ ok: true, coupon: withUsage }, 201) : unavailableAdmin();
    }

    if (typeof params.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
      return adminFailure("coupon_invalid_id", "操作するクーポンを一覧から選んでください。");
    }
    const existing = await env.DB.prepare(`SELECT ${COUPON_COLUMNS} FROM festa60_coupons WHERE id = ?`).bind(params.id).first();
    if (!existing) return adminFailure("coupon_not_found", "クーポンが見つかりません。一覧を更新してください。", 404);
    const fields = validateAdminFields(payload, existing);
    if (fields.response) return fields.response;
    if (payload.expected_updated_at !== existing.updated_at) {
      return adminFailure("coupon_conflict", "他の操作で更新されています。一覧を更新してやり直してください。", 409);
    }
    const previousInstant = configuredInstant(existing.updated_at);
    if (previousInstant === null) return unavailableAdmin();
    const updatedAt = new Date(Math.max(Date.now(), previousInstant + 1)).toISOString();
    const disabledAt = payload.enabled === true ? null
      : payload.enabled === false ? (existing.disabled_at ?? updatedAt) : existing.disabled_at;
    const updated = await env.DB.prepare(
      `UPDATE festa60_coupons SET label = ?, starts_at = ?, expires_at = ?, disabled_at = ?, updated_at = ?
       WHERE id = ? AND updated_at = ? RETURNING ${COUPON_COLUMNS}`,
    ).bind(fields.label, fields.starts_at, fields.expires_at, disabledAt, updatedAt, params.id, payload.expected_updated_at).first();
    if (!updated) return adminFailure("coupon_conflict", "他の操作で更新されています。一覧を更新してやり直してください。", 409);
    const withUsage = await env.DB.prepare(`${CRM_COUPON_SELECT} WHERE c.id = ?`).bind(updated.id).first();
    return withUsage ? json({ ok: true, coupon: withUsage }) : unavailableAdmin();
  } catch {
    return unavailableAdmin();
  }
}
