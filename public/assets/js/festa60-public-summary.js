import { FUNDRAISING_CONFIG, REGISTRATION_STATUS } from "./festa60-pricing.js";

const roots = document.querySelectorAll("[data-festa60-public-summary]");

roots.forEach((root) => renderMilestones(root, FUNDRAISING_CONFIG.goals));
document.querySelectorAll("[data-fundraising-goals]").forEach((list) => renderGoalList(list, FUNDRAISING_CONFIG));
document.querySelectorAll("[data-fundraising-final-target]").forEach((element) => {
  element.textContent = `最終目標 ${formatCompactCurrency(FUNDRAISING_CONFIG.final_target_jpy)}`;
});

if (roots.length && REGISTRATION_STATUS === "open") {
  loadPublicSummary();
} else if (roots.length) {
  roots.forEach(renderSummaryUnavailable);
}

function renderSummaryUnavailable(root) {
  setText(root, "[data-summary-participants]", "集計中");
  setText(root, "[data-summary-companions]", "受付開始後に集計");
  setText(root, "[data-summary-supporters]", "受付開始後に集計");
  setText(root, "[data-summary-donation]", "受付開始後に集計");
  setText(root, "[data-summary-plan-counts]", "参加・寄付の受付開始後に表示します。");
  setText(root, "[data-summary-updated]", "受付開始時期は改めてご案内します");
  setText(root, "[data-summary-decades]", "参加申込の受付開始後に、卒部年代の広がりを表示します。");
  setText(root, "[data-summary-attendance-status]", `参加目標${formatNumber(FUNDRAISING_CONFIG.participant_target_count)}名／参加申込受付中`);
  const attendanceBar = root.querySelector("[data-summary-attendance-progress-bar]");
  if (attendanceBar) attendanceBar.style.width = "0%";
  const supportBar = root.querySelector("[data-summary-progress-bar]");
  if (supportBar) supportBar.style.width = "0%";
  setText(root, "[data-summary-next-goal]", `まずは${FUNDRAISING_CONFIG.goals[0].label}${formatCompactCurrency(FUNDRAISING_CONFIG.primary_target_jpy)}`);
  root.dataset.summaryState = "unavailable";
}

async function loadPublicSummary() {
  try {
    const response = await fetch("/api/festa60/public-summary?v=20261012-2", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`summary_${response.status}`);
    const payload = await response.json();
    const summary = payload.summary || payload;
    roots.forEach((root) => renderSummary(root, summary));
  } catch (error) {
    roots.forEach((root) => {
      setText(root, "[data-summary-updated]", "集計情報を取得できませんでした");
      root.dataset.summaryState = "error";
    });
  }
}

function renderSummary(root, summary) {
  const participantText = summary.participant_count_visible
    ? `${formatNumber(summary.obog_participant_count)}名`
    : "参加申込受付中";
  const planCounts = summary.plan_counts || {};
  const participantPlans = [
    ["プラチナ", planCounts.platinum],
    ["ゴールド", planCounts.gold],
    ["シルバー", planCounts.silver],
    ["ブロンズ", planCounts.bronze],
  ];
  const absentPlans = [
    ["プレミアム", planCounts.absent_donation_30000],
    ["アドバンス", planCounts.absent_donation_10000],
    ["スタンダード", planCounts.absent_donation_5000],
  ];
  const parts = [];
  if (participantPlans.some(([, value]) => Number(value) > 0)) {
    parts.push(participantPlans.map(([label, value]) => `${label}${formatNumber(value)}名`).join("・"));
  }
  if (absentPlans.some(([, value]) => Number(value) > 0)) {
    parts.push(`欠席者向け ${absentPlans.map(([label, value]) => `${label}${formatNumber(value)}名`).join("・")}`);
  }
  if (Number(planCounts.additional_donation) > 0) {
    parts.push(`追加寄付 ${formatNumber(planCounts.additional_donation)}名`);
  }

  setText(root, "[data-summary-participants]", participantText);
  setText(root, "[data-summary-companions]", summary.participant_count_visible ? `${formatNumber(summary.companion_count)}名` : "集計中");
  setText(root, "[data-summary-supporters]", `${formatNumber(summary.supporter_count)}名`);
  setText(root, "[data-summary-donation]", formatCurrency(summary.donation_equivalent_jpy));
  setText(root, "[data-summary-plan-counts]", parts.length ? parts.join(" / ") : "寄付プランのお申し込みを受付中です。");
  setText(root, "[data-summary-updated]", summary.last_updated_at ? `${formatDate(summary.last_updated_at)}更新` : "受付開始");
  renderAttendanceProgress(root, summary);
  renderSupporterList(root, summary.supporters || []);

  const current = Math.max(0, Number(summary.donation_equivalent_jpy || 0));
  const primary = Number(summary.primary_target_jpy || FUNDRAISING_CONFIG.primary_target_jpy);
  const goals = summary.goals?.length ? summary.goals : FUNDRAISING_CONFIG.goals;
  const scaleMax = Number(goals.at(-1)?.amount_jpy || FUNDRAISING_CONFIG.goals.at(-1).amount_jpy);
  const remaining = Math.max(0, primary - current);
  const progressBar = root.querySelector("[data-summary-progress-bar]");
  if (progressBar) {
    progressBar.style.width = `${Math.min(100, current / scaleMax * 100)}%`;
    const progress = progressBar.parentElement;
    progress?.setAttribute("aria-valuemax", String(FUNDRAISING_CONFIG.final_target_jpy));
    progress?.setAttribute("aria-valuenow", String(Math.min(current, FUNDRAISING_CONFIG.final_target_jpy)));
  }
  renderMilestones(root, goals);
  setText(root, "[data-summary-next-goal]", current < primary
    ? `まずは${goals[0]?.label || "第1目標"}${formatCompactCurrency(primary)}まで、あと${formatCurrency(remaining)}`
    : nextGoalText(current, goals));
  root.dataset.summaryState = "ready";
}

function renderAttendanceProgress(root, summary) {
  const isVisible = Boolean(summary.participant_count_visible);
  const current = Math.max(0, Number(summary.obog_participant_count || 0));
  const target = Math.max(1, Number(summary.participant_target_count || FUNDRAISING_CONFIG.participant_target_count));
  const remaining = Math.max(0, Number(summary.participant_target_remaining_count ?? target - current));
  const decades = Array.isArray(summary.participating_decades) ? summary.participating_decades : [];
  const bar = root.querySelector("[data-summary-attendance-progress-bar]");
  if (bar) {
    bar.style.width = `${isVisible ? Math.min(100, current / target * 100) : 0}%`;
    const progress = bar.parentElement;
    progress?.setAttribute("aria-valuemax", String(target));
    progress?.setAttribute("aria-valuenow", String(isVisible ? Math.min(current, target) : 0));
  }
  setText(root, "[data-summary-decades]", isVisible
    ? decades.length
      ? `参加している卒部年代：${decades.join("・")}`
      : current === 0
        ? "参加している卒部年代：参加申込はまだありません。"
        : "参加している卒部年代：卒部年度が登録された申込から表示します。"
    : "参加している卒部年代は集計中です。");
  setText(root, "[data-summary-attendance-status]", isVisible
    ? `参加目標${formatNumber(target)}名まで、あと${formatNumber(remaining)}名`
    : `参加目標${formatNumber(target)}名／現在は参加申込受付中`);
}

function renderMilestones(root, goals) {
  const milestones = root.querySelector("[data-summary-milestones]");
  if (!milestones || !goals.length) return;
  const scaleMax = Number(goals.at(-1).amount_jpy || 1);
  milestones.innerHTML = goals
    .filter((goal) => goal.key !== "stretch")
    .map((goal) => `<span style="--position:${Math.min(100, Number(goal.amount_jpy) / scaleMax * 100)}%">${escapeHtml(formatCompactCurrency(goal.amount_jpy))}</span>`)
    .join("");
}

function renderGoalList(list, config) {
  list.innerHTML = config.goals.map((goal) => `
    <li>
      <strong>${escapeHtml(goal.label)} ${escapeHtml(formatCompactCurrency(goal.amount_jpy))}</strong>
      <span>現役支援 約${escapeHtml(formatCompactCurrency(goal.active_support_jpy))}｜FESTA充実 約${escapeHtml(formatCompactCurrency(goal.festa_enhancement_jpy))}</span>
      ${goal.note ? `<small>${escapeHtml(goal.note)}</small>` : ""}
    </li>`).join("");
}

function renderSupporterList(root, supporters) {
  const list = root.closest("main")?.querySelector("[data-summary-supporter-list]") || root.querySelector("[data-summary-supporter-list]");
  if (!list || !supporters.length) return;
  const planLabels = {
    platinum: "プラチナ",
    gold: "ゴールド",
    silver: "シルバー",
    bronze: "ブロンズ",
    absent_donation_30000: "プレミアム（欠席者向け）",
    absent_donation_10000: "アドバンス（欠席者向け）",
    absent_donation_5000: "スタンダード（欠席者向け）",
    additional_donation: "追加寄付"
  };
  list.innerHTML = Object.keys(planLabels).map((plan) => {
    const entries = supporters.filter((supporter) => supporter.plan === plan);
    if (!entries.length) return "";
    return `<section><h4>${escapeHtml(planLabels[plan])}</h4><ul>${entries.map((supporter) => `<li><strong>${escapeHtml(supporter.display_name)}</strong>${supporter.message ? `<span>${escapeHtml(supporter.message)}</span>` : ""}</li>`).join("")}</ul></section>`;
  }).join("");
  list.hidden = false;
}

function nextGoalText(current, goals) {
  const next = goals.find((goal) => current < Number(goal.amount_jpy));
  if (!next) return "ストレッチ目標を達成しました。ありがとうございます。";
  return `${next.label} ${formatCurrency(next.amount_jpy)}まで、あと${formatCurrency(Number(next.amount_jpy) - current)}`;
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(Number(value || 0));
}

function formatCurrency(value) {
  return `${formatNumber(value)}円`;
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0);
  return amount >= 10000 && amount % 10000 === 0 ? `${formatNumber(amount / 10000)}万円` : formatCurrency(amount);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
