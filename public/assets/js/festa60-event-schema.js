import {
  APPLICATION_DEADLINE_ISO,
  BASE_FEES,
  COHORTS,
  CURRENT_PRICING_VERSION,
  FEE_PERIOD_LABELS,
  RECEPTION_ATTENDANCE,
  feePeriodForDate,
  isApplicationOpen,
  ticketLineAmount,
} from "./festa60-pricing.js";

const registrationUrl = "https://tus-fantasista-festa60.pages.dev/festa60-register/";
const cohortLabels = {
  obog_5_under: `${COHORTS.five_under.graduation_year_from}〜${COHORTS.five_under.graduation_year_to}年度卒部`,
  obog_6_10: `${COHORTS.six_ten.graduation_year_from}〜${COHORTS.six_ten.graduation_year_to}年度卒部`,
  obog: `${COHORTS.eleven_over.graduation_year_to}年度以前卒部・学習院桜友会`,
};
const offerPeriods = {
  early: { validThrough: "2026-10-31T23:59:59+09:00" },
  year_end: { validThrough: "2026-12-31T23:59:59+09:00" },
  regular: { validThrough: APPLICATION_DEADLINE_ISO },
};

export function buildEventOffers(now = new Date()) {
  if (!isApplicationOpen(now)) return [];
  const period = feePeriodForDate(now);
  const validity = offerPeriods[period];
  return Object.entries(cohortLabels).flatMap(([cohort, label]) => RECEPTION_ATTENDANCE.map((reception) => ({
    "@type": "Offer",
    name: `通常参加（${label}／${reception === "attending" ? "FESTA＋懇親会" : "FESTAのみ"}）`,
    description: `${FEE_PERIOD_LABELS[period]}の本人1名の料金。同伴者料金は別途です。`,
    url: registrationUrl,
    price: ticketLineAmount(cohort, period, reception, CURRENT_PRICING_VERSION),
    priceCurrency: "JPY",
    availability: "https://schema.org/InStock",
    // The published opening announcement confirms the date, not a time.
    validFrom: "2026-08-30",
    ...validity,
    priceValidUntil: validity.validThrough.slice(0, 10),
  })));
}

export function buildEventPriceCopy(now = new Date()) {
  if (!isApplicationOpen(now)) {
    return { heading: "参加申込の受付は終了しました", example: "詳しくは事務局へお問い合わせください。", attending: "受付終了", festaOnly: "受付終了" };
  }
  const period = feePeriodForDate(now);
  const discount = BASE_FEES.obog.regular - BASE_FEES.obog[period];
  const deadline = offerPeriods[period].validThrough.slice(0, 10).split("-").map(Number);
  const heading = discount > 0
    ? `${deadline[0]}年${deadline[1]}月${deadline[2]}日まで、${period === "early" ? "超早期" : "早期"}申込<strong>${formatAmount(discount)}引き</strong>`
    : `${deadline[0]}年${deadline[1]}月${deadline[2]}日まで、参加申込受付中`;
  const attending = ticketLineAmount("obog_5_under", period, "attending", CURRENT_PRICING_VERSION);
  const festaOnly = ticketLineAmount("obog_5_under", period, "without_reception", CURRENT_PRICING_VERSION);
  return {
    heading,
    example: `${cohortLabels.obog_5_under}の方は、FESTA＋懇親会が${formatAmount(attending)}、FESTAのみが${formatAmount(festaOnly)}です。卒部年次割引${discount > 0 ? `と${period === "early" ? "超早期" : "早期"}申込割引` : ""}を反映しています。`,
    attending: formatRange(attending, ticketLineAmount("obog", period, "attending", CURRENT_PRICING_VERSION)),
    festaOnly: formatRange(festaOnly, ticketLineAmount("obog", period, "without_reception", CURRENT_PRICING_VERSION)),
  };
}

function formatRange(min, max) {
  return `${min.toLocaleString("ja-JP")}〜${formatAmount(max)}`;
}

function formatAmount(amount) {
  return `${amount.toLocaleString("ja-JP")}円`;
}

export function refreshEventSchema(scope, now = new Date()) {
  const element = scope.querySelector("#festa60-event-schema");
  if (!element) return;
  const event = JSON.parse(element.textContent);
  const offers = buildEventOffers(now);
  if (offers.length) event.offers = offers;
  else delete event.offers;
  element.textContent = JSON.stringify(event, null, 2);
  const copy = buildEventPriceCopy(now);
  const heading = scope.querySelector("[data-event-price-heading]");
  const example = scope.querySelector("[data-event-price-example]");
  if (heading) heading.innerHTML = copy.heading;
  if (example) example.textContent = copy.example;
  const attending = scope.querySelector("[data-event-price-attending]");
  const festaOnly = scope.querySelector("[data-event-price-festa-only]");
  if (attending) attending.textContent = copy.attending;
  if (festaOnly) festaOnly.textContent = copy.festaOnly;
}

if (typeof document !== "undefined" && document.querySelector("#festa60-event-schema")) {
  const refresh = () => refreshEventSchema(document);
  refresh();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("focus", refresh);
  window.setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 60_000);
}
