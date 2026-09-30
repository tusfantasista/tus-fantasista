import assert from "node:assert/strict";

import {
  ABSENT_DONATION_TOTALS,
  ATTENDING_DONATION_EQUIVALENTS,
  ATTENDING_PLAN_TOTALS,
  BASE_FEES,
  CURRENT_PRICING_VERSION,
  FEE_PERIOD_LABELS,
  FUNDRAISING_CONFIG,
  LEGACY_PRICING_VERSION,
  REGISTRATION_STATUS,
  SUPPORT_TIER_BENEFITS,
  attendingPlanAmount,
  buildPaymentLineItems,
  donationEquivalentForTicket,
  feePeriodForDate,
  isApplicationOpen,
  lineItemsTotal,
  pricingVersionForDate,
  staffParticipationAmount,
  ticketAmount,
} from "../public/assets/js/festa60-pricing.js";

const cohorts = ["obog", "obog_6_10", "obog_5_under"];
const periods = ["early", "year_end", "regular"];
const receptions = ["attending", "without_reception"];
const plans = ["none", "bronze", "silver", "gold", "platinum"];

let assertions = 0;
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};

equal(feePeriodForDate(new Date("2026-10-15T15:00:00Z")), "early", "October 16 retains extended early discount");
equal(REGISTRATION_STATUS, "open", "registration is open");
equal(FEE_PERIOD_LABELS.early, "超早期申込（2026年10月31日まで）", "early application label ends on October 31");
equal(FEE_PERIOD_LABELS.year_end, "早期申込（2026年11月1日〜12月31日）", "year-end application label starts on November 1");
equal(feePeriodForDate(new Date("2026-10-31T14:59:59Z")), "early", "early period includes October 31 in Japan");
equal(feePeriodForDate(new Date("2026-10-31T15:00:00Z")), "year_end", "year-end period starts November 1 in Japan");
equal(isApplicationOpen(new Date("2026-10-31T15:00:00Z")), true, "registration stays open during the extended early period");

for (const cohort of cohorts) {
  for (const period of periods) {
    for (const reception of receptions) {
      for (const plan of plans) {
        const periodAndCohortDiscount = BASE_FEES.obog.regular - BASE_FEES[cohort][period];
        const receptionDiscount = reception === "without_reception" ? 4000 : 0;
        const expected = plan === "none"
          ? BASE_FEES[cohort][period] - receptionDiscount
          : ATTENDING_PLAN_TOTALS[plan] - periodAndCohortDiscount - receptionDiscount;
        const ticketType = plan === "none" ? cohort : `${cohort}__${plan}`;
        equal(
          ticketAmount(ticketType, [], period, reception, CURRENT_PRICING_VERSION),
          expected,
          `${ticketType}/${period}/${reception}`,
        );
      }
    }
  }
}

equal(ticketAmount("obog", [], "regular", "without_reception", LEGACY_PRICING_VERSION), 13000, "legacy reception discount remains 2,000 yen");
equal(ticketAmount("obog", [], "regular", "without_reception", CURRENT_PRICING_VERSION), 11000, "current reception discount is 4,000 yen");
equal(pricingVersionForDate("2026-08-09T23:59:59+09:00"), LEGACY_PRICING_VERSION, "legacy version before effective instant");
equal(pricingVersionForDate("2026-08-10T00:00:00+09:00"), CURRENT_PRICING_VERSION, "current version at effective instant");

const companions = [
  { attendee_type: "adult", reception_attendance: "attending" },
  { attendee_type: "adult", reception_attendance: "without_reception" },
  { attendee_type: "child", reception_attendance: "attending" },
  { attendee_type: "child", reception_attendance: "without_reception" },
  { attendee_type: "preschool", reception_attendance: "attending" },
];
const companionItems = buildPaymentLineItems(
  { ticket_type: "obog__gold", fee_period: "regular", reception_attendance: "attending" },
  companions,
  CURRENT_PRICING_VERSION,
);
equal(lineItemsTotal(companionItems), 50000 + 8000 + 4000 + 3000 + 1000, "multiple companion total");
equal(companionItems.filter((item) => item.item_type === "companion").length, 4, "free preschool is not charged");
equal(companionItems[1].metadata.dance_ticket_unit_amount_jpy, 500, "adult companion receives the applicant plan ticket denomination");

for (const [tier, amount] of Object.entries(ATTENDING_DONATION_EQUIVALENTS)) {
  equal(donationEquivalentForTicket(`obog__${tier}`), amount, `${tier} donation equivalent`);
  equal(
    SUPPORT_TIER_BENEFITS[tier].count * SUPPORT_TIER_BENEFITS[tier].unit_amount_jpy,
    { platinum: 15000, gold: 10000, silver: 4800, bronze: 1500 }[tier],
    `${tier} dance ticket face value`,
  );
}

for (const [ticketType, amount] of Object.entries(ABSENT_DONATION_TOTALS)) {
  equal(ticketAmount(ticketType, companions, "early", "without_reception", CURRENT_PRICING_VERSION), amount, `${ticketType} ignores attendance discounts and companions`);
  equal(donationEquivalentForTicket(ticketType), amount, `${ticketType} entire amount is donation equivalent`);
}

equal(staffParticipationAmount("obog_staff", "early", "attending", CURRENT_PRICING_VERSION), 6500, "staff early discount is applied before half");
equal(staffParticipationAmount("obog_staff_6_10", "early", "attending", CURRENT_PRICING_VERSION), 5500, "staff cohort and early discounts are applied before half");
equal(staffParticipationAmount("obog_staff_5_under", "early", "attending", CURRENT_PRICING_VERSION), 4500, "staff young cohort and early discounts are applied before half");
equal(staffParticipationAmount("obog_staff", "early", "without_reception", CURRENT_PRICING_VERSION), 2500, "staff reception deduction is applied after half");
equal(attendingPlanAmount("gold", "obog_staff", "early", "without_reception", CURRENT_PRICING_VERSION), 35000 + 2500, "staff donation add-on is never halved");

equal(FUNDRAISING_CONFIG.primary_target_jpy, 600000, "first fundraising target");
equal(FUNDRAISING_CONFIG.final_target_jpy, 1500000, "final fundraising target");
equal(FUNDRAISING_CONFIG.participant_target_count, 120, "participant target");
equal(FUNDRAISING_CONFIG.goals.find((goal) => goal.key === "fm_dress")?.amount_jpy, 1350000, "FM dress target is centralized");
equal(FUNDRAISING_CONFIG.participant_count_public_threshold, 20, "participant count visibility threshold");

console.log(`PASS festa60 pricing matrix (${assertions} assertions)`);
