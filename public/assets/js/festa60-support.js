import {
  ATTENDING_PLAN_TOTALS,
  BASE_FEES,
  COHORTS,
  CURRENT_PRICING_VERSION,
  FEE_PERIOD_LABELS,
  FEE_PERIODS,
  FUNDRAISING_CONFIG,
  RECEPTION_ATTENDANCE,
  attendingPlanAmount,
  danceTicketBenefit,
  feePeriodForDate,
  noReceptionDiscount,
  ticketLineAmount,
} from "./festa60-pricing.js";

const calculator = document.querySelector("[data-support-calculator]");

if (calculator) initializeCalculator(calculator);

document.querySelectorAll("[data-support-goals]").forEach(renderSupportGoals);

function initializeCalculator(form) {
  const cohortSelect = form.querySelector("#support-cohort");
  const receptionSelect = form.querySelector("#support-reception");
  const periodSelect = form.querySelector("#support-period");
  if (!cohortSelect || !receptionSelect || !periodSelect) return;

  const scope = form.closest("main") || form;
  const cohortLabels = {
    obog: `${COHORTS.eleven_over.graduation_year_to}年度以前卒部`,
    obog_6_10: `${COHORTS.six_ten.graduation_year_from}〜${COHORTS.six_ten.graduation_year_to}年度卒部`,
    obog_5_under: `${COHORTS.five_under.graduation_year_from}〜${COHORTS.five_under.graduation_year_to}年度卒部`,
  };
  const planBases = { standard: BASE_FEES.obog.regular, ...ATTENDING_PLAN_TOTALS };

  periodSelect.value = feePeriodForDate(new Date());

  function updatePrices() {
    const cohort = Object.hasOwn(cohortLabels, cohortSelect.value) ? cohortSelect.value : "";
    const reception = RECEPTION_ATTENDANCE.includes(receptionSelect.value) ? receptionSelect.value : "attending";
    const period = FEE_PERIODS.includes(periodSelect.value) ? periodSelect.value : feePeriodForDate(new Date());
    const planAmounts = { ...planBases };

    if (cohort) {
      planAmounts.standard = ticketLineAmount(cohort, period, reception, CURRENT_PRICING_VERSION);
      Object.keys(ATTENDING_PLAN_TOTALS).forEach((tier) => {
        planAmounts[tier] = attendingPlanAmount(tier, cohort, period, reception, CURRENT_PRICING_VERSION);
      });
    }

    setText(scope, "[data-support-total]", cohort ? formatCurrency(planAmounts.standard) : "—");
    setText(scope, "[data-support-price-heading]", cohort ? "あなたの料金" : "基準料金（FESTA＋懇親会）");
    setText(scope, "[data-support-conditions]", cohort
      ? `${cohortLabels[cohort]}／${reception === "attending" ? "FESTA＋懇親会" : "FESTAのみ"}／${FEE_PERIOD_LABELS[period]}`
      : "卒部年度を選ぶと、割引後の本人料金を確認できます。");

    const periodDiscount = BASE_FEES.obog.regular - BASE_FEES.obog[period];
    const cohortDiscount = cohort ? BASE_FEES.obog[period] - BASE_FEES[cohort][period] : 0;
    const discounts = [
      ["申込時期", periodDiscount],
      ["卒部年次", cohortDiscount],
      ["FESTAのみ", noReceptionDiscount(reception, CURRENT_PRICING_VERSION)],
    ].filter(([, amount]) => amount > 0).map(([label, amount]) => `${label} ${formatCurrency(amount)}引き`);
    setText(scope, "[data-support-discount]", cohort
      ? discounts.join(" ＋ ") || "割引なし"
      : "");

    const tickets = cohort ? danceTicketBenefit(cohort) : null;
    setText(scope, "[data-support-standard-tickets]", tickets
      ? `${formatCurrency(tickets.unit_amount_jpy)}券 × ${tickets.count}枚`
      : "300円券 × 2〜3枚");

    scope.querySelectorAll("[data-support-plan-amount]").forEach((element) => {
      const plan = element.dataset.supportPlanAmount;
      if (Object.hasOwn(planAmounts, plan)) element.textContent = formatCurrency(planAmounts[plan]);
    });
    scope.querySelectorAll("[data-support-plan-base]").forEach((element) => {
      const plan = element.dataset.supportPlanBase || element.parentElement?.querySelector("[data-support-plan-amount]")?.dataset.supportPlanAmount;
      element.hidden = !cohort;
      if (Object.hasOwn(planBases, plan)) element.textContent = `基準料金${formatCurrency(planBases[plan])}`;
    });
  }

  updatePrices();
  [cohortSelect, receptionSelect, periodSelect].forEach((select) => select.addEventListener("change", updatePrices));
  form.addEventListener("submit", (event) => { event.preventDefault(); });
  form.hidden = false;
  scope.querySelectorAll("[data-support-calculator-fallback]").forEach((element) => { element.hidden = true; });
}

function setText(scope, selector, value) {
  scope.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

function formatCurrency(value) {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

function renderSupportGoals(list) {
  // Keep amounts shared; explain spending priorities once in the surrounding copy.
  const items = FUNDRAISING_CONFIG.goals.map((goal) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const allocation = document.createElement("span");
    const compact = (value) => `${new Intl.NumberFormat("ja-JP").format(value / 10000)}万円`;
    title.textContent = `${goal.label} ${compact(goal.amount_jpy)}`;
    allocation.textContent = `現役支援 約${compact(goal.active_support_jpy)}｜FESTA充実 約${compact(goal.festa_enhancement_jpy)}`;
    item.append(title, allocation);
    return item;
  });
  list.replaceChildren(...items);
}
