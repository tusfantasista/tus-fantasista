export function couponPermissions(request, env) {
  const email = String(request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const configured = env.FESTA60_COUPON_ISSUERS;
  const allowed = typeof configured === "string"
    ? configured.split(/[\s,;]+/).filter(Boolean).map((value) => value.toLowerCase()) : [];
  const permitted = Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && allowed.includes(email));
  return { can_issue: permitted, can_manage: permitted };
}
