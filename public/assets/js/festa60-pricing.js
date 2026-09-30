export const LEGACY_PRICING_VERSION = "festa60-2026-v1";
export const CURRENT_PRICING_VERSION = "festa60-2026-v2";
export const DEFAULT_PRICING_EFFECTIVE_AT = "2026-08-10T00:00:00+09:00";
export const APPLICATION_DEADLINE_ISO = "2027-01-31T23:59:59+09:00";
export const REGISTRATION_STATUS = "open";
export const REGISTRATION_STATUS_MESSAGE = "参加申込を受け付けています。";

export const FEE_PERIODS = ["early", "year_end", "regular"];
export const RECEPTION_ATTENDANCE = ["attending", "without_reception"];
export const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "cancelled", "refunded"];

export const COHORTS = {
  eleven_over: { graduation_year_to: 2015 },
  six_ten: { graduation_year_from: 2016, graduation_year_to: 2020 },
  five_under: { graduation_year_from: 2021, graduation_year_to: 2025 },
};

export const BASE_FEES = {
  obog: { early: 13000, year_end: 14000, regular: 15000 },
  obog_6_10: { early: 11000, year_end: 12000, regular: 13000 },
  obog_5_under: { early: 9000, year_end: 10000, regular: 11000 },
  current_student: { early: 4000, year_end: 4000, regular: 4000 },
};

export const ATTENDING_PLAN_TOTALS = {
  platinum: 100000,
  gold: 50000,
  silver: 30000,
  bronze: 20000,
};

export const ATTENDING_DONATION_EQUIVALENTS = {
  platinum: 70000,
  gold: 25000,
  silver: 10200,
  bronze: 3500,
};

export const ABSENT_DONATION_TOTALS = {
  absent_donation_30000: 30000,
  absent_donation_10000: 10000,
  absent_donation_5000: 5000,
};

export const ABSENT_DONATION_EQUIVALENTS = { ...ABSENT_DONATION_TOTALS };

export const SUPPORT_TIER_BENEFITS = {
  platinum: { count: 25, unit_amount_jpy: 600 },
  gold: { count: 20, unit_amount_jpy: 500 },
  silver: { count: 12, unit_amount_jpy: 400 },
  bronze: { count: 5, unit_amount_jpy: 300 },
};

export const STANDARD_DANCE_TICKET_BENEFITS = {
  obog: { count: 3, unit_amount_jpy: 300 },
  obog_6_10: { count: 2, unit_amount_jpy: 300 },
  obog_5_under: { count: 2, unit_amount_jpy: 300 },
};

export const STAFF_TICKET_TYPES = ["obog_staff", "obog_staff_6_10", "obog_staff_5_under"];

const VERSION_CONFIG = {
  [LEGACY_PRICING_VERSION]: {
    no_reception_discount_jpy: 2000,
    companion_fees: {
      adult: { attending: 8000, without_reception: 6000 },
      child: { attending: 3000, without_reception: 1000 },
      preschool: { attending: 0, without_reception: 0 },
    },
  },
  [CURRENT_PRICING_VERSION]: {
    no_reception_discount_jpy: 4000,
    companion_fees: {
      adult: { attending: 8000, without_reception: 4000 },
      child: { attending: 3000, without_reception: 1000 },
      preschool: { attending: 0, without_reception: 0 },
    },
  },
};

export const FUNDRAISING_CONFIG = {
  primary_target_jpy: 600000,
  final_target_jpy: 1500000,
  participant_target_count: 120,
  participant_count_public_threshold: 20,
  allocation: { active_support: 2 / 3, festa_enhancement: 1 / 3 },
  fm_dress_estimate_min_jpy: 900000,
  fm_dress_estimate_max_jpy: 1000000,
  goals: [
    { key: "first", label: "第1目標", amount_jpy: 600000, active_support_jpy: 400000, festa_enhancement_jpy: 200000 },
    { key: "second", label: "第2目標", amount_jpy: 1000000, active_support_jpy: 670000, festa_enhancement_jpy: 330000 },
    { key: "fm_dress", label: "FMドレス目標", amount_jpy: 1350000, active_support_jpy: 900000, festa_enhancement_jpy: 450000, note: "ドレス更新費を約90万円とした場合の到達点。正式見積もり後に調整します。" },
    { key: "final", label: "最終目標", amount_jpy: 1500000, active_support_jpy: 1000000, festa_enhancement_jpy: 500000, note: "ドレス更新額が90万円の場合、約10万円を現役支援基金へ積み立てます。" },
    { key: "stretch", label: "ストレッチ目標", amount_jpy: 1800000, active_support_jpy: 1200000, festa_enhancement_jpy: 600000, note: "基金を積み増し、部で使う三面鏡・音響機器などの備品購入や修繕を検討します。" },
  ],
};

export const FEE_PERIOD_LABELS = {
  early: "超早期申込（2026年10月31日まで）",
  year_end: "早期申込（2026年11月1日〜12月31日）",
  regular: "通常申込（2027年1月1日〜1月31日）",
};

export const SUPPORT_PLAN_DETAILS = {
  bronze: { title: "ブロンズ（プラン料金20,000円）", benefits: ["300円券×5枚", "当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー（予定）"] },
  silver: { title: "シルバー（プラン料金30,000円）", benefits: ["400円券×12枚", "当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー（予定）"] },
  gold: { title: "ゴールド（プラン料金50,000円）", benefits: ["500円券×20枚", "当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー（予定）"] },
  platinum: { title: "プラチナ（プラン料金100,000円）", benefits: ["600円券×25枚", "当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー（予定）"] },
};

export const ABSENT_PLAN_DETAILS = {
  absent_donation_5000: { title: "スタンダード（5,000円）", benefits: ["当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー", "定形郵便等で配送予定"] },
  absent_donation_10000: { title: "アドバンス（10,000円）", benefits: ["当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー", "写真スタンド", "レターパックで配送予定"] },
  absent_donation_30000: { title: "プレミアム（30,000円）", benefits: ["当日の集合写真", "現役からのお礼のメッセージ", "60周年記念オリジナルステッカー", "写真盾", "記念品", "宅急便コンパクトで配送予定"] },
};

export function normalizePricingVersion(version) {
  return Object.hasOwn(VERSION_CONFIG, version) ? version : CURRENT_PRICING_VERSION;
}

export function pricingVersionForDate(date = new Date(), effectiveAt = DEFAULT_PRICING_EFFECTIVE_AT) {
  const instant = date instanceof Date ? date : new Date(date);
  const effective = new Date(effectiveAt);
  if (Number.isNaN(instant.getTime()) || Number.isNaN(effective.getTime())) return CURRENT_PRICING_VERSION;
  return instant.getTime() >= effective.getTime() ? CURRENT_PRICING_VERSION : LEGACY_PRICING_VERSION;
}

export function pricingConfig(version = CURRENT_PRICING_VERSION) {
  return VERSION_CONFIG[normalizePricingVersion(version)];
}

export function isApplicationOpen(date = new Date()) {
  if (REGISTRATION_STATUS !== "open") return false;
  const instant = date instanceof Date ? date : new Date(date);
  return !Number.isNaN(instant.getTime()) && instant.getTime() <= new Date(APPLICATION_DEADLINE_ISO).getTime();
}

export function feePeriodForDate(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) return "regular";
  const jstDate = new Date(instant.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (jstDate <= "2026-10-31") return "early";
  if (jstDate <= "2026-12-31") return "year_end";
  return "regular";
}

export function splitTicketType(ticketType) {
  const legacy = {
    premium: "obog__gold",
    donation_only: "obog__gold",
    premium_gold: "obog__gold",
    premium_silver: "obog__silver",
    premium_bronze: "obog__bronze",
  };
  const value = legacy[ticketType] || String(ticketType || "obog");
  const [rawBase, rawSupport = "none"] = value.split("__");
  const baseTicketType = rawBase === "young_obog" ? "obog_6_10" : rawBase;
  const supportTier = Object.hasOwn(ATTENDING_PLAN_TOTALS, rawSupport) ? rawSupport : "none";
  return { base_ticket_type: baseTicketType || "obog", support_tier: supportTier };
}

export function normalizeTicketType(ticketType, supportTier = "none") {
  const parsed = splitTicketType(ticketType);
  const normalizedSupport = Object.hasOwn(ATTENDING_PLAN_TOTALS, supportTier) ? supportTier : parsed.support_tier;
  return normalizedSupport === "none" ? parsed.base_ticket_type : `${parsed.base_ticket_type}__${normalizedSupport}`;
}

export function publicBaseTicketType(baseTicketType) {
  if (baseTicketType === "obog_staff_6_10") return "obog_6_10";
  if (baseTicketType === "obog_staff_5_under") return "obog_5_under";
  if (baseTicketType === "obog_staff") return "obog";
  return baseTicketType;
}

export function isStaffTicketType(baseTicketType) {
  return STAFF_TICKET_TYPES.includes(baseTicketType);
}

export function noReceptionDiscount(receptionAttendance, pricingVersion = CURRENT_PRICING_VERSION) {
  return receptionAttendance === "without_reception" ? pricingConfig(pricingVersion).no_reception_discount_jpy : 0;
}

export function staffApplicationPeriodDiscount(feePeriod) {
  if (feePeriod === "early") return 2000;
  if (feePeriod === "year_end") return 1000;
  return 0;
}

export function staffGraduationDiscount(baseTicketType) {
  const publicType = publicBaseTicketType(baseTicketType);
  if (publicType === "obog_6_10") return 2000;
  if (publicType === "obog_5_under") return 4000;
  return 0;
}

export function staffParticipationAmount(baseTicketType, feePeriod, receptionAttendance, pricingVersion = CURRENT_PRICING_VERSION) {
  const discountedParticipationFee = Math.max(0, BASE_FEES.obog.regular - staffApplicationPeriodDiscount(feePeriod) - staffGraduationDiscount(baseTicketType));
  return Math.max(0, Math.round(discountedParticipationFee * 0.5) - noReceptionDiscount(receptionAttendance, pricingVersion));
}

export function danceTicketBenefit(ticketType) {
  const { base_ticket_type: baseTicketType, support_tier: supportTier } = splitTicketType(ticketType);
  const benefit = SUPPORT_TIER_BENEFITS[supportTier] || STANDARD_DANCE_TICKET_BENEFITS[publicBaseTicketType(baseTicketType)] || { count: 0, unit_amount_jpy: 0 };
  return { ...benefit, total_amount_jpy: benefit.count * benefit.unit_amount_jpy };
}

export function companionDanceTicketBenefit(ticketType, companions = []) {
  const adultCount = Array.isArray(companions) ? companions.filter((companion) => companion.attendee_type === "adult").length : Math.max(0, Number(companions || 0));
  const unitAmount = adultCount ? danceTicketBenefit(ticketType).unit_amount_jpy || 300 : 0;
  return { count: adultCount, unit_amount_jpy: unitAmount, total_amount_jpy: adultCount * unitAmount };
}

export function ticketLineAmount(ticketType, feePeriod, receptionAttendance, pricingVersion = CURRENT_PRICING_VERSION) {
  const { base_ticket_type: baseTicketType } = splitTicketType(ticketType);
  if (Object.hasOwn(ABSENT_DONATION_TOTALS, baseTicketType)) return ABSENT_DONATION_TOTALS[baseTicketType];
  if (isStaffTicketType(baseTicketType)) return staffParticipationAmount(baseTicketType, feePeriod, receptionAttendance, pricingVersion);
  if (baseTicketType === "current_student") return receptionAttendance === "attending" ? BASE_FEES.current_student[feePeriod] : 0;
  const base = BASE_FEES[baseTicketType]?.[feePeriod] ?? BASE_FEES.obog[feePeriod];
  return Math.max(0, base - noReceptionDiscount(receptionAttendance, pricingVersion));
}

export function attendingPlanAmount(supportTier, baseTicketType, feePeriod, receptionAttendance = "attending", pricingVersion = CURRENT_PRICING_VERSION) {
  const planBase = ATTENDING_PLAN_TOTALS[supportTier];
  if (!planBase) return ticketLineAmount(baseTicketType, feePeriod, receptionAttendance, pricingVersion);
  if (isStaffTicketType(baseTicketType)) {
    const donationAddOn = Math.max(0, planBase - BASE_FEES.obog.regular);
    return donationAddOn + staffParticipationAmount(baseTicketType, feePeriod, receptionAttendance, pricingVersion);
  }
  const discountedStandardFee = BASE_FEES[baseTicketType]?.[feePeriod] ?? BASE_FEES.obog[feePeriod];
  const combinedDiscount = Math.max(0, BASE_FEES.obog.regular - discountedStandardFee);
  return Math.max(0, planBase - combinedDiscount - noReceptionDiscount(receptionAttendance, pricingVersion));
}

export function donationEquivalentForTicket(ticketType) {
  const { base_ticket_type: baseTicketType, support_tier: supportTier } = splitTicketType(ticketType);
  if (Object.hasOwn(ABSENT_DONATION_EQUIVALENTS, baseTicketType)) return ABSENT_DONATION_EQUIVALENTS[baseTicketType];
  return ATTENDING_DONATION_EQUIVALENTS[supportTier] || 0;
}

export function buildPaymentLineItems(payload, companions = [], pricingVersion = CURRENT_PRICING_VERSION) {
  const normalizedTicket = normalizeTicketType(payload.ticket_type);
  const normalizedPeriod = FEE_PERIODS.includes(payload.fee_period) ? payload.fee_period : "regular";
  const normalizedReception = RECEPTION_ATTENDANCE.includes(payload.reception_attendance) ? payload.reception_attendance : "attending";
  const { base_ticket_type: baseTicketType, support_tier: supportTier } = splitTicketType(normalizedTicket);
  const isAbsentDonation = Object.hasOwn(ABSENT_DONATION_TOTALS, baseTicketType);
  const ticketAmountJpy = !isAbsentDonation && supportTier !== "none"
    ? attendingPlanAmount(supportTier, baseTicketType, normalizedPeriod, normalizedReception, pricingVersion)
    : ticketLineAmount(baseTicketType, normalizedPeriod, normalizedReception, pricingVersion);
  const items = [];
  if (ticketAmountJpy > 0) {
    const danceTicket = danceTicketBenefit(normalizedTicket);
    items.push({
      item_type: isAbsentDonation ? "donation" : "ticket",
      label: ticketLabel(normalizedTicket),
      quantity: 1,
      unit_amount_jpy: ticketAmountJpy,
      amount_jpy: ticketAmountJpy,
      metadata: {
        ticket_type: normalizedTicket,
        pricing_version: normalizePricingVersion(pricingVersion),
        fee_period: normalizedPeriod,
        reception_attendance: normalizedReception,
        donation_equivalent_jpy: donationEquivalentForTicket(normalizedTicket),
        dance_ticket_count: danceTicket.count,
        dance_ticket_unit_amount_jpy: danceTicket.unit_amount_jpy,
        dance_ticket_total_amount_jpy: danceTicket.total_amount_jpy,
      },
    });
  }
  const companionTicketUnitAmount = danceTicketBenefit(normalizedTicket).unit_amount_jpy || 300;
  if (!isAbsentDonation) companions.forEach((companion, index) => {
    const type = ["adult", "child", "preschool"].includes(companion.attendee_type) ? companion.attendee_type : "adult";
    const companionReception = RECEPTION_ATTENDANCE.includes(companion.reception_attendance) ? companion.reception_attendance : normalizedReception;
    const amount = pricingConfig(pricingVersion).companion_fees[type][companionReception];
    const danceTicketCount = type === "adult" ? 1 : 0;
    if (amount <= 0) return;
    items.push({
      item_type: "companion",
      label: `同伴者${index + 1} ${type === "adult" ? "大人（中学生以上）" : type === "child" ? "子供（小学生）" : "未就学児（無料）"}`,
      quantity: 1,
      unit_amount_jpy: amount,
      amount_jpy: amount,
      metadata: {
        attendee_type: type,
        relationship: companion.relationship || "",
        reception_attendance: companionReception,
        dance_ticket_count: danceTicketCount,
        dance_ticket_unit_amount_jpy: danceTicketCount ? companionTicketUnitAmount : 0,
        dance_ticket_total_amount_jpy: danceTicketCount * companionTicketUnitAmount,
      },
    });
  });
  return items;
}

export function lineItemsTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.amount_jpy || 0), 0);
}

export function ticketAmount(ticketType, companions = 0, feePeriod = "regular", receptionAttendance = "attending", pricingVersion = CURRENT_PRICING_VERSION) {
  const companionRows = Array.isArray(companions) ? companions : Array.from({ length: Number(companions || 0) }, () => ({ attendee_type: "adult" }));
  return lineItemsTotal(buildPaymentLineItems({ ticket_type: ticketType, fee_period: feePeriod, reception_attendance: receptionAttendance }, companionRows, pricingVersion));
}

export function ticketLabel(ticketType) {
  const { base_ticket_type: baseTicketType, support_tier: supportTier } = splitTicketType(ticketType);
  if (Object.hasOwn(ABSENT_DONATION_TOTALS, baseTicketType)) {
    if (baseTicketType.endsWith("30000")) return "60周年記念FESTA 欠席者寄付 プレミアム（30,000円）";
    if (baseTicketType.endsWith("10000")) return "60周年記念FESTA 欠席者寄付 アドバンス（10,000円）";
    return "60周年記念FESTA 欠席者寄付 スタンダード（5,000円）";
  }
  const publicType = publicBaseTicketType(baseTicketType);
  const cohort = publicType === "obog_5_under" ? " OBOG 1〜5年目" : publicType === "obog_6_10" ? " OBOG 6〜10年目" : publicType === "current_student" ? " 現役部員" : " OBOG";
  const staff = isStaffTicketType(baseTicketType) ? " 役員・当日手伝い" : "";
  if (supportTier === "none") return `60周年記念FESTA${cohort}${staff}参加費`;
  const tier = supportTier === "platinum" ? "プラチナ" : supportTier === "gold" ? "ゴールド" : supportTier === "silver" ? "シルバー" : "ブロンズ";
  return `60周年記念FESTA${staff} 参加プラン ${tier}`;
}
