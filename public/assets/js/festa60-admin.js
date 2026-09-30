(() => {
  "use strict";

  const API_URL = "../api/festa60/admin/applications";
  const CONFIG_URL = "../api/festa60/config";

  const state = {
    applications: [],
    filtered: [],
    bankTransferAlerts: [],
    participationSummary: null,
    config: null,
    actor: "",
    filters: {
      search: "",
      payment: "active",
      plan: "all",
      sort: "newest"
    }
  };

  const elements = {
    environmentBanner: document.querySelector("#environment-banner"),
    actor: document.querySelector("#admin-actor"),
    lastUpdated: document.querySelector("#last-updated"),
    message: document.querySelector("#admin-message"),
    tableWrapper: document.querySelector("#table-wrapper"),
    tableBody: document.querySelector("#applications-body"),
    resultCount: document.querySelector("#result-count"),
    searchInput: document.querySelector("#search-input"),
    paymentFilter: document.querySelector("#payment-filter"),
    planFilter: document.querySelector("#plan-filter"),
    sortSelect: document.querySelector("#sort-select"),
    clearFilters: document.querySelector("#clear-filters"),
    refreshButton: document.querySelector("#refresh-button"),
    paymentChart: document.querySelector("#payment-chart"),
    planChart: document.querySelector("#plan-chart"),
    participantChart: document.querySelector("#participant-chart"),
    receptionChart: document.querySelector("#reception-chart"),
    cohortChart: document.querySelector("#cohort-chart"),
    absentDonationBody: document.querySelector("#absent-donation-body"),
    absentDonationTotal: document.querySelector("#absent-donation-total"),
    bankTransferAlertPanel: document.querySelector("#bank-transfer-alert-panel"),
    bankTransferAlerts: document.querySelector("#bank-transfer-alerts"),
    dialog: document.querySelector("#application-dialog"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogContent: document.querySelector("#dialog-content")
  };

  const metricElements = {
    applications: document.querySelector("#metric-applications"),
    festaAttendees: document.querySelector("#metric-festa-attendees"),
    confirmedFesta: document.querySelector("#metric-confirmed-festa"),
    receptionAttendees: document.querySelector("#metric-reception-attendees"),
    confirmedReception: document.querySelector("#metric-confirmed-reception"),
    receptionNonAttendees: document.querySelector("#metric-reception-non-attendees"),
    applicantCompanion: document.querySelector("#metric-applicant-companion"),
    attendingApplications: document.querySelector("#metric-attending-applications"),
    paid: document.querySelector("#metric-paid"),
    paidAmount: document.querySelector("#metric-paid-amount"),
    partial: document.querySelector("#metric-partial"),
    partialAmount: document.querySelector("#metric-partial-amount"),
    pending: document.querySelector("#metric-pending"),
    outstanding: document.querySelector("#metric-outstanding"),
    expectedTotal: document.querySelector("#metric-expected-total"),
    receivedTotal: document.querySelector("#metric-received-total"),
    collectionRate: document.querySelector("#metric-collection-rate"),
    donationEquivalent: document.querySelector("#metric-donation-equivalent"),
    supporters: document.querySelector("#metric-supporters"),
    bankAlerts: document.querySelector("#metric-bank-alerts")
  };

  const paymentLabels = {
    paid: "入金済み",
    partially_funded: "不足入金",
    pending: "手続中",
    unpaid: "未入金",
    cancelled: "取消",
    refunded: "返金済み",
    failed: "決済失敗",
    expired: "期限切れ",
    checkout_incomplete: "決済未完了"
  };

  const attendanceLabels = {
    confirmed: "参加確定",
    pending: "未確定",
    cancelled: "取消",
    refunded: "返金済み"
  };

  const feePeriodLabels = {
    early: "超早期申込（10月31日まで）",
    year_end: "早期申込（11月1日〜12月31日）",
    regular: "通常申込（1月1日〜1月31日）"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatYen(value) {
    return `${Number(value || 0).toLocaleString("ja-JP")}円`;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function planKey(ticketType) {
    const value = String(ticketType || "");
    if (value.includes("__platinum")) return "platinum";
    if (value.includes("__gold")) return "gold";
    if (value.includes("__silver")) return "silver";
    if (value.includes("__bronze")) return "bronze";
    if (value.startsWith("absent_donation_")) return "absent_donation";
    if (value.startsWith("obog_staff")) return "staff";
    if (value === "current_student") return "current_student";
    return "standard";
  }

  function planLabel(ticketType) {
    const value = String(ticketType || "");
    const key = planKey(value);
    if (value.startsWith("obog_staff__")) {
      const tier = value.includes("__platinum") ? "プラチナ" : value.includes("__gold") ? "ゴールド" : value.includes("__silver") ? "シルバー" : "ブロンズ";
      return `役員・お手伝い／${tier}`;
    }
    const labels = {
      platinum: "プラチナ",
      gold: "ゴールド",
      silver: "シルバー",
      bronze: "ブロンズ",
      staff: "役員・お手伝い",
      current_student: "現役",
      absent_donation: value.endsWith("30000") ? "欠席寄付 プレミアム" : value.endsWith("10000") ? "欠席寄付 アドバンス" : "欠席寄付 スタンダード",
      standard: value === "obog_6_10" ? "通常参加（卒部6〜10年目）" : value === "obog_5_under" ? "通常参加（卒部1〜5年目）" : "通常参加"
    };
    return labels[key];
  }

  function effectivePaymentStatus(application) {
    const recordedAmount = Number(application.amount_received_jpy || 0);
    const remainingAmount = Number(application.amount_remaining_jpy || 0);
    const applicationStatus = application.payment_status || application.paymentStatus || "";
    if (!["paid", "cancelled", "refunded"].includes(applicationStatus) && recordedAmount > 0 && remainingAmount > 0) {
      return "partially_funded";
    }
    if (application.latest_payment_status === "partially_funded") return "partially_funded";
    const paymentMethod = application.latest_payment_method || application.payment_method;
    const isIncompleteCheckout = paymentMethod === "stripe_checkout"
      && Boolean(application.stripe_checkout_session_id)
      && !["paid", "cancelled", "refunded"].includes(applicationStatus)
      && !application.application_received_email_sent_at
      && !application.payment_confirmed_email_sent_at;
    if (isIncompleteCheckout) return "checkout_incomplete";
    if (["failed", "expired"].includes(application.latest_payment_status)) return application.latest_payment_status;
    return applicationStatus || application.latest_payment_status || "unpaid";
  }

  function receivedAmount(application) {
    const status = effectivePaymentStatus(application);
    const recordedAmount = Number(application.amount_received_jpy || 0);
    if (status === "refunded") return 0;
    if (status === "partially_funded") return recordedAmount;
    if (status === "paid") return recordedAmount || expectedAmount(application);
    if (status === "cancelled" && (recordedAmount > 0 || application.paid_at)) {
      return recordedAmount || expectedAmount(application);
    }
    return 0;
  }

  function expectedAmount(application) {
    return Number(application.amount_total ?? application.total_amount_jpy ?? application.amount ?? 0);
  }

  function outstandingAmount(application) {
    const status = effectivePaymentStatus(application);
    if (["cancelled", "refunded", "checkout_incomplete"].includes(status)) return 0;
    return Math.max(0, expectedAmount(application) - receivedAmount(application));
  }

  function countedApplicationAmount(application) {
    const status = effectivePaymentStatus(application);
    if (["refunded", "checkout_incomplete"].includes(status)) return 0;
    if (status === "cancelled") return receivedAmount(application);
    return expectedAmount(application);
  }

  function statusBadge(status) {
    const label = paymentLabels[status] || status || "未設定";
    const className = status === "partially_funded" ? "partial" : status;
    return `<span class="admin-status admin-status--${escapeHtml(className)}">${escapeHtml(label)}</span>`;
  }

  function attendanceBadge(status, ticketType = "") {
    if (String(ticketType).startsWith("absent_donation_")) {
      return '<span class="admin-status admin-status--confirmed">欠席寄付</span>';
    }
    const normalized = status || "pending";
    const label = attendanceLabels[normalized] || normalized;
    return `<span class="admin-status admin-status--${escapeHtml(normalized)}">${escapeHtml(label)}</span>`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const error = new Error(result?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function patchJson(url, payload) {
    const response = await fetch(url, {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const error = new Error(result?.message || result?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function loadApplications() {
    elements.refreshButton.disabled = true;
    elements.message.hidden = false;
    elements.message.className = "admin-message";
    elements.message.textContent = "申込データを読み込んでいます。";
    elements.tableWrapper.hidden = true;
    try {
      const [applicationResult, configResult] = await Promise.all([
        fetchJson(API_URL),
        fetchJson(CONFIG_URL).catch(() => null)
      ]);
      state.applications = applicationResult.applications || [];
      state.participationSummary = applicationResult.participation_summary || null;
      state.bankTransferAlerts = applicationResult.bank_transfer_alerts || [];
      state.actor = applicationResult.actor || "Cloudflare Access user";
      state.config = configResult;
      elements.actor.textContent = state.actor;
      elements.environmentBanner.hidden = Boolean(configResult?.is_production);
      renderSummary();
      renderBankTransferAlerts();
      applyFilters();
      elements.lastUpdated.textContent = `最終更新 ${formatDateTime(new Date().toISOString())}`;
    } catch (error) {
      elements.message.hidden = false;
      elements.message.className = "admin-message admin-message--error";
      elements.message.textContent = error.status === 401
        ? "Cloudflare Accessの認証が必要です。ページを再読み込みして認証してください。"
        : "申込データを取得できませんでした。時間をおいて更新してください。";
      elements.lastUpdated.textContent = "取得失敗";
    } finally {
      elements.refreshButton.disabled = false;
    }
  }

  function renderSummary() {
    const applications = state.applications;
    const incomplete = applications.filter((item) => effectivePaymentStatus(item) === "checkout_incomplete");
    const formalApplications = applications.filter((item) => effectivePaymentStatus(item) !== "checkout_incomplete");
    const active = formalApplications.filter((item) => !["cancelled", "refunded"].includes(effectivePaymentStatus(item)));
    const paid = formalApplications.filter((item) => effectivePaymentStatus(item) === "paid");
    const partial = formalApplications.filter((item) => effectivePaymentStatus(item) === "partially_funded");
    const pending = formalApplications.filter((item) => ["unpaid", "pending", "failed", "expired"].includes(effectivePaymentStatus(item)));
    const expectedTotal = formalApplications.reduce((sum, item) => sum + countedApplicationAmount(item), 0);
    const receivedTotal = formalApplications.reduce((sum, item) => sum + receivedAmount(item), 0);
    const outstandingTotal = active.reduce((sum, item) => sum + outstandingAmount(item), 0);
    const collectionRate = expectedTotal > 0 ? Math.round((receivedTotal / expectedTotal) * 100) : 0;
    const participation = state.participationSummary || fallbackParticipationSummary(applications);

    metricElements.applications.textContent = `${formalApplications.length}件`;
    metricElements.festaAttendees.textContent = `${participation.festa_attendee_count}名`;
    metricElements.confirmedFesta.textContent = `入金済み・参加確定 ${participation.confirmed_festa_attendee_count}名`;
    metricElements.receptionAttendees.textContent = `${participation.reception_attendee_count}名`;
    metricElements.confirmedReception.textContent = `入金済み・参加確定 ${participation.confirmed_reception_attendee_count}名`;
    metricElements.receptionNonAttendees.textContent = `${participation.reception_non_attendee_count}名`;
    metricElements.applicantCompanion.textContent = `${participation.application_count}名 / ${participation.companion_count}名`;
    metricElements.attendingApplications.textContent = `参加申込 ${participation.application_count}件`;
    metricElements.paid.textContent = `${paid.length}件`;
    metricElements.paidAmount.textContent = formatYen(paid.reduce((sum, item) => sum + receivedAmount(item), 0));
    metricElements.partial.textContent = `${partial.length}件`;
    metricElements.partialAmount.textContent = `不足 ${formatYen(partial.reduce((sum, item) => sum + outstandingAmount(item), 0))}`;
    metricElements.pending.textContent = `${pending.length}件`;
    metricElements.outstanding.textContent = `未収 ${formatYen(outstandingTotal)}`;
    metricElements.expectedTotal.textContent = formatYen(expectedTotal);
    metricElements.receivedTotal.textContent = formatYen(receivedTotal);
    metricElements.collectionRate.textContent = `入金率 ${collectionRate}%`;
    const paidSupporters = paid.filter((item) => Number(item.donation_equivalent_jpy || 0) > 0);
    metricElements.donationEquivalent.textContent = formatYen(paidSupporters.reduce((sum, item) => sum + Number(item.donation_equivalent_jpy || 0), 0));
    metricElements.supporters.textContent = `${paidSupporters.length}名`;
    metricElements.bankAlerts.textContent = `${state.bankTransferAlerts.length}件`;

    renderBarChart(elements.paymentChart, [
      { label: "入金済み", value: paid.length, className: "paid" },
      { label: "不足入金", value: partial.length, className: "partial" },
      { label: "未入金等", value: pending.length, className: "pending" },
      { label: "決済未完了", value: incomplete.length, className: "pending" },
      { label: "取消・返金", value: formalApplications.length - active.length, className: "" }
    ]);

    renderBarChart(elements.participantChart, [
      { label: "OBOG本人", value: participation.obog_applicant_count, className: "" },
      { label: "現役本人", value: participation.current_student_applicant_count, className: "" },
      { label: "大人同伴", value: participation.adult_companion_count, className: "" },
      { label: "子供同伴", value: participation.child_companion_count, className: "" }
    ].filter((item) => item.value > 0));

    renderBarChart(elements.receptionChart, [
      { label: "OBOG本人", value: participation.obog_reception_count, className: "paid" },
      { label: "現役本人", value: participation.current_student_reception_count, className: "paid" },
      { label: "大人同伴", value: participation.adult_companion_reception_count, className: "paid" },
      { label: "子供同伴", value: participation.child_companion_reception_count, className: "paid" }
    ].filter((item) => item.value > 0));

    renderBarChart(elements.cohortChart, [
      { label: "卒部11年以上", value: participation.cohort_eleven_over_count, className: "" },
      { label: "卒部6〜10年", value: participation.cohort_six_ten_count, className: "" },
      { label: "卒部1〜5年目（OBOG1〜5年目／2021〜2025年度）", value: participation.cohort_five_under_count, className: "" },
      { label: "学習院桜友会", value: participation.cohort_gakushuin_count, className: "" },
      { label: "現役", value: participation.cohort_current_student_count, className: "" },
      { label: "年次未確認", value: participation.cohort_unknown_count, className: "pending" }
    ].filter((item) => item.value > 0));

    const planDefinitions = [
      { key: "platinum", label: "プラチナ" },
      { key: "gold", label: "ゴールド" },
      { key: "silver", label: "シルバー" },
      { key: "bronze", label: "ブロンズ" },
      { key: "standard", label: "通常参加" },
      { key: "staff", label: "役員等" },
      { key: "current_student", label: "現役" },
      { key: "absent_donation_30000", label: "欠席寄付 プレミアム", exact: true },
      { key: "absent_donation_10000", label: "欠席寄付 アドバンス", exact: true },
      { key: "absent_donation_5000", label: "欠席寄付 スタンダード", exact: true }
    ];
    const planCounts = planDefinitions
      .map((definition) => ({
        ...definition,
        value: formalApplications.filter((item) => definition.exact
          ? item.ticket_type === definition.key
          : planKey(item.ticket_type) === definition.key).length
      }))
      .filter((item) => item.value > 0)
      .map((item) => ({
        label: item.label,
        value: item.value,
        className: ""
      }));
    renderBarChart(elements.planChart, planCounts);
    renderAbsentDonationSummary(formalApplications);
  }

  function renderAbsentDonationSummary(applications) {
    const definitions = [
      { ticketType: "absent_donation_30000", label: "プレミアム", price: 30000 },
      { ticketType: "absent_donation_10000", label: "アドバンス", price: 10000 },
      { ticketType: "absent_donation_5000", label: "スタンダード", price: 5000 }
    ];
    const donationApplications = applications.filter((item) => String(item.ticket_type || "").startsWith("absent_donation_"));
    const totalExpected = donationApplications.reduce((sum, item) => sum + countedApplicationAmount(item), 0);
    const totalReceived = donationApplications.reduce((sum, item) => sum + receivedAmount(item), 0);

    elements.absentDonationTotal.textContent = `${donationApplications.length}件 / 入金 ${formatYen(totalReceived)}`;
    elements.absentDonationBody.innerHTML = definitions.map((definition) => {
      const rows = donationApplications.filter((item) => item.ticket_type === definition.ticketType);
      const paid = rows.filter((item) => effectivePaymentStatus(item) === "paid");
      const pending = rows.filter((item) => ["partially_funded", "unpaid", "pending", "failed", "expired"].includes(effectivePaymentStatus(item)));
      const cancelled = rows.filter((item) => ["cancelled", "refunded"].includes(effectivePaymentStatus(item)));
      const expected = rows.reduce((sum, item) => sum + countedApplicationAmount(item), 0);
      const received = rows.reduce((sum, item) => sum + receivedAmount(item), 0);
      const outstanding = pending.reduce((sum, item) => sum + outstandingAmount(item), 0);

      return `<tr>
        <td data-label="プラン"><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(formatYen(definition.price))}</small></td>
        <td data-label="申込"><strong>${rows.length}件</strong></td>
        <td data-label="入金済み"><strong>${paid.length}件</strong><small>${escapeHtml(formatYen(paid.reduce((sum, item) => sum + receivedAmount(item), 0)))}</small></td>
        <td data-label="不足・未入金"><strong>${pending.length}件</strong><small>未収 ${escapeHtml(formatYen(outstanding))}</small></td>
        <td data-label="取消・返金"><strong>${cancelled.length}件</strong></td>
        <td data-label="申込総額"><strong>${escapeHtml(formatYen(expected))}</strong></td>
        <td data-label="確認済み入金"><strong>${escapeHtml(formatYen(received))}</strong></td>
      </tr>`;
    }).join("");

    elements.absentDonationTotal.setAttribute(
      "aria-label",
      `欠席者向け寄付 ${donationApplications.length}件、申込総額${formatYen(totalExpected)}、確認済み入金${formatYen(totalReceived)}`
    );
  }

  function renderBankTransferAlerts() {
    const alerts = state.bankTransferAlerts;
    elements.bankTransferAlertPanel.hidden = alerts.length === 0;
    if (!alerts.length) {
      elements.bankTransferAlerts.replaceChildren();
      return;
    }
    elements.bankTransferAlerts.innerHTML = alerts.map((alert) => {
      const stripeUrl = stripePaymentUrl(alert.stripe_payment_intent_id);
      const statusLabels = {
        funds_received_before_confirmation: "申込確定前の一部入金",
        paid_before_confirmation: "申込確定前の全額入金",
        unreconciled_funds_received: "未消込残高",
        previewed: "確認期限切れ",
        confirming: "確定処理の停滞",
        application_created: "決済連携の停滞"
      };
      return `<article class="admin-bank-alert">
        <div><strong>${escapeHtml(statusLabels[alert.status] || alert.status)}</strong><span>${escapeHtml(alert.applicant_name || "氏名未確認")} / ${escapeHtml(alert.applicant_email || "-")}</span></div>
        <div><span>入金 ${escapeHtml(formatYen(alert.amount_received_jpy))} / 残額 ${escapeHtml(formatYen(alert.amount_remaining_jpy))}</span><small>${escapeHtml(formatDateTime(alert.updated_at))}</small></div>
        ${stripeUrl ? `<a class="admin-button" href="${escapeHtml(stripeUrl)}" target="_blank" rel="noopener noreferrer">決済詳細</a>` : ""}
      </article>`;
    }).join("");
  }

  function fallbackParticipationSummary(applications) {
    const attendees = applications.filter((item) => {
      const status = effectivePaymentStatus(item);
      return !["cancelled", "refunded", "checkout_incomplete"].includes(status) && planKey(item.ticket_type) !== "absent_donation";
    });
    const paid = attendees.filter((item) => effectivePaymentStatus(item) === "paid");
    const summarizePeople = (rows) => rows.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    const summarizeReception = (rows) => rows.reduce((sum, item) => {
      return sum + (item.reception_attendance === "attending" ? Number(item.quantity || 1) : 0);
    }, 0);
    const festaCount = summarizePeople(attendees);
    const receptionCount = summarizeReception(attendees);
    return {
      application_count: attendees.length,
      festa_attendee_count: festaCount,
      confirmed_festa_attendee_count: summarizePeople(paid),
      companion_count: attendees.reduce((sum, item) => sum + Number(item.companion_count || 0), 0),
      reception_attendee_count: receptionCount,
      confirmed_reception_attendee_count: summarizeReception(paid),
      reception_non_attendee_count: Math.max(0, festaCount - receptionCount),
      obog_applicant_count: attendees.filter((item) => item.ticket_type !== "current_student").length,
      current_student_applicant_count: attendees.filter((item) => item.ticket_type === "current_student").length,
      adult_companion_count: attendees.reduce((sum, item) => sum + Number(item.companion_count || 0), 0),
      child_companion_count: 0,
      obog_reception_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.reception_attendance === "attending").length,
      current_student_reception_count: attendees.filter((item) => item.ticket_type === "current_student" && item.reception_attendance === "attending").length,
      adult_companion_reception_count: 0,
      child_companion_reception_count: 0,
      cohort_eleven_over_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.school_lineage !== "gakushuin_ouyukai" && Number(item.graduation_year) > 0 && Number(item.graduation_year) <= 2015).length,
      cohort_six_ten_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.school_lineage !== "gakushuin_ouyukai" && Number(item.graduation_year) >= 2016 && Number(item.graduation_year) <= 2020).length,
      cohort_five_under_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.school_lineage !== "gakushuin_ouyukai" && Number(item.graduation_year) >= 2021 && Number(item.graduation_year) <= 2025).length,
      cohort_gakushuin_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.school_lineage === "gakushuin_ouyukai").length,
      cohort_current_student_count: attendees.filter((item) => item.ticket_type === "current_student").length,
      cohort_unknown_count: attendees.filter((item) => item.ticket_type !== "current_student" && item.school_lineage !== "gakushuin_ouyukai" && !Number(item.graduation_year)).length
    };
  }

  function renderBarChart(container, items) {
    const maximum = Math.max(1, ...items.map((item) => item.value));
    container.innerHTML = items.length
      ? items.map((item) => `
          <div class="admin-bar-row">
            <span>${escapeHtml(item.label)}</span>
            <span class="admin-bar-row__track"><span class="admin-bar-row__fill admin-bar-row__fill--${escapeHtml(item.className)}" style="width:${Math.round((item.value / maximum) * 100)}%"></span></span>
            <strong>${item.value}</strong>
          </div>`).join("")
      : '<p class="admin-empty">データがありません。</p>';
  }

  function applyFilters() {
    const normalizedSearch = state.filters.search.trim().toLocaleLowerCase("ja");
    const filtered = state.applications.filter((application) => {
      const searchable = [
        application.application_code,
        application.full_name,
        application.full_name_kana,
        application.email,
        application.graduation_year
      ].join(" ").toLocaleLowerCase("ja");
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const paymentStatus = effectivePaymentStatus(application);
      const matchesPayment = state.filters.payment === "all"
        || (state.filters.payment === "active" && !["cancelled", "refunded", "checkout_incomplete"].includes(paymentStatus))
        || paymentStatus === state.filters.payment;
      const matchesPlan = state.filters.plan === "all"
        || (state.filters.plan.startsWith("absent_donation_")
          ? application.ticket_type === state.filters.plan
          : planKey(application.ticket_type) === state.filters.plan);
      return matchesSearch && matchesPayment && matchesPlan;
    });

    filtered.sort((a, b) => {
      if (state.filters.sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (state.filters.sort === "amount_desc") return expectedAmount(b) - expectedAmount(a);
      if (state.filters.sort === "amount_asc") return expectedAmount(a) - expectedAmount(b);
      if (state.filters.sort === "code") return String(a.application_code).localeCompare(String(b.application_code), "ja");
      return new Date(b.created_at) - new Date(a.created_at);
    });

    state.filtered = filtered;
    renderTable();
  }

  function renderTable() {
    const incompleteCount = state.applications.filter((item) => effectivePaymentStatus(item) === "checkout_incomplete").length;
    const inactiveCount = state.applications.filter((item) => ["cancelled", "refunded"].includes(effectivePaymentStatus(item))).length;
    const excludedLabels = [
      inactiveCount > 0 ? `取消・返金${inactiveCount}件` : "",
      incompleteCount > 0 ? `決済未完了${incompleteCount}件` : ""
    ].filter(Boolean);
    elements.resultCount.textContent = state.filters.payment === "active" && excludedLabels.length > 0
      ? `${state.filtered.length}件（${excludedLabels.join("、")}を除外）`
      : `${state.filtered.length}件 / 全${state.applications.length}件`;
    elements.message.hidden = true;
    elements.tableWrapper.hidden = false;

    if (!state.filtered.length) {
      elements.tableBody.innerHTML = '<tr><td class="admin-empty" colspan="7">条件に一致する申込はありません。</td></tr>';
      return;
    }

    elements.tableBody.innerHTML = state.filtered.map((application) => {
      const paymentStatus = effectivePaymentStatus(application);
      const amount = expectedAmount(application);
      const received = receivedAmount(application);
      const paymentDetail = paymentStatus === "partially_funded"
        ? `入金 ${formatYen(received)} / 不足 ${formatYen(outstandingAmount(application))}`
        : paymentStatus === "paid"
          ? formatYen(received)
          : paymentStatus === "cancelled" && received > 0
            ? `返金なし ${formatYen(received)}`
            : paymentStatus === "refunded"
              ? "返金済み・0円計上"
              : "";
      return `
        <tr>
          <td data-label="受付番号"><span class="admin-table__code">${escapeHtml(application.application_code)}</span><small>${escapeHtml(formatDateTime(application.created_at))}</small></td>
          <td data-label="申込者"><span class="admin-table__name">${escapeHtml(application.full_name || "-")}</span><small>${application.graduation_year ? `${escapeHtml(application.graduation_year)}年度卒` : escapeHtml(application.school_lineage || "-")}</small></td>
          <td data-label="プラン"><span>${escapeHtml(planLabel(application.ticket_type))}</span><small>${escapeHtml(feePeriodLabels[application.fee_period] || application.fee_period || "-")}・${Number(application.quantity || 1)}名</small></td>
          <td data-label="金額"><span class="admin-table__amount">${escapeHtml(formatYen(amount))}</span><small>${escapeHtml(paymentDetail)}</small></td>
          <td data-label="入金状態">${statusBadge(paymentStatus)}</td>
          <td data-label="参加状態">${attendanceBadge(application.attendance_status, application.ticket_type)}</td>
          <td data-label="操作"><button class="admin-row-action" type="button" data-application-id="${escapeHtml(application.id)}">詳細</button></td>
        </tr>`;
    }).join("");
  }

  function detailRow(label, value) {
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd>`;
  }

  function stripePaymentUrl(paymentIntentId) {
    if (!paymentIntentId) return "";
    const prefix = state.config?.is_production ? "" : "test/";
    return `https://dashboard.stripe.com/${prefix}payments/${encodeURIComponent(paymentIntentId)}`;
  }

  function canAdjustBankTransferAmount(application) {
    const paymentMethod = application.latest_payment_method || application.payment_method;
    return String(application.ticket_type || "").startsWith("obog_staff")
      && effectivePaymentStatus(application) === "unpaid"
      && Number(application.amount_received_jpy || 0) === 0
      && Boolean(application.stripe_payment_intent_id)
      && ["bank_transfer", "customer_balance"].includes(paymentMethod);
  }

  function canRefreshBankTransferInstructions(application) {
    const paymentMethod = application.latest_payment_method || application.payment_method;
    return !["paid", "cancelled", "refunded"].includes(effectivePaymentStatus(application))
      && Boolean(application.stripe_payment_intent_id)
      && ["bank_transfer", "customer_balance"].includes(paymentMethod);
  }

  function openApplicationDetail(applicationId) {
    const application = state.applications.find((item) => item.id === applicationId);
    if (!application) return;
    const paymentStatus = effectivePaymentStatus(application);
    const stripeUrl = stripePaymentUrl(application.stripe_payment_intent_id);
    const address = [application.postal_code ? `〒${application.postal_code}` : "", application.prefecture, application.city, application.street_address, application.building]
      .filter(Boolean)
      .join(" ");

    elements.dialogTitle.textContent = `${application.application_code} ${application.full_name || ""}`;
    elements.dialogContent.innerHTML = `
      <div class="admin-detail-summary">
        ${statusBadge(paymentStatus)}
        ${attendanceBadge(application.attendance_status, application.ticket_type)}
        <span class="admin-status">${escapeHtml(planLabel(application.ticket_type))}</span>
      </div>
      <div class="admin-detail-grid">
        <section class="admin-detail-section">
          <h3>本人・連絡先</h3>
          <dl class="admin-detail-list">
            ${detailRow("氏名", application.full_name)}
            ${detailRow("ふりがな", application.full_name_kana)}
            ${detailRow("メール", application.email)}
            ${detailRow("電話番号", application.phone)}
            ${detailRow("所属区分", application.school_lineage)}
            ${detailRow("卒部年度", application.graduation_year ? `${application.graduation_year}年度` : "-")}
            ${detailRow("住所", address)}
          </dl>
        </section>
        <section class="admin-detail-section">
          <h3>申込内容</h3>
          <dl class="admin-detail-list">
            ${detailRow("受付番号", application.application_code)}
            ${detailRow("プラン", planLabel(application.ticket_type))}
            ${detailRow("寄付相当額", formatYen(application.donation_equivalent_jpy))}
            ${detailRow("料金ルール", application.pricing_version || "旧料金・未記録")}
            ${detailRow("申込時期", feePeriodLabels[application.fee_period] || application.fee_period)}
            ${detailRow("参加人数", `${Number(application.quantity || 1)}名`)}
            ${detailRow("同伴者", `${Number(application.companion_count || 0)}名`)}
            ${detailRow("同伴者の懇親会", application.companion_summary || "-")}
            ${detailRow("懇親会", application.reception_attendance === "attending" ? "参加" : "不参加")}
            ${detailRow("申込日時", formatDateTime(application.created_at))}
          </dl>
        </section>
        <section class="admin-detail-section">
          <h3>サポーター掲載・当日表示</h3>
          <dl class="admin-detail-list">
            ${detailRow("氏名掲載への同意", Number(application.supporter_publication_consent) === 1 ? "同意" : "非掲載")}
            ${detailRow("掲載名", application.supporter_publication_name)}
            ${detailRow("旧姓併記", Number(application.supporter_include_maiden_name) === 1 ? "希望" : "希望なし")}
            ${detailRow("夫妻・連名等", application.supporter_joint_name)}
            ${detailRow("匿名希望", Number(application.supporter_anonymous) === 1 ? "匿名" : "実名掲載")}
            ${detailRow("当日表示", application.supporter_badge_preference === "decline" ? "辞退" : "希望")}
            ${detailRow("応援メッセージ", application.supporter_message)}
          </dl>
        </section>
        <section class="admin-detail-section">
          <h3>入金</h3>
          <dl class="admin-detail-list">
            ${detailRow("支払予定額", formatYen(expectedAmount(application)))}
            ${detailRow("入金確認額", formatYen(receivedAmount(application)))}
            ${detailRow("不足額", formatYen(outstandingAmount(application)))}
            ${detailRow("入金状態", paymentLabels[paymentStatus] || paymentStatus)}
            ${detailRow("入金確認日", formatDateTime(application.paid_at))}
            ${detailRow("不足入金通知", formatDateTime(application.partial_payment_email_sent_at))}
            ${detailRow("振込案内メール", formatDateTime(application.instructions_email_sent_at))}
            ${detailRow("申込受付メール", formatDateTime(application.application_received_email_sent_at))}
            ${detailRow("参加確定メール", formatDateTime(application.payment_confirmed_email_sent_at))}
            ${detailRow("未消込残高", formatYen(application.unreconciled_amount_jpy))}
            ${detailRow("未消込検知日時", formatDateTime(application.cash_balance_attention_at))}
            ${detailRow("決済手段", application.latest_payment_method || application.payment_method)}
          </dl>
        </section>
        <section class="admin-detail-section">
          <h3>照合・システム</h3>
          <dl class="admin-detail-list">
            ${detailRow("照合状態", application.match_status)}
            ${detailRow("名簿コード", application.member_code)}
            ${detailRow("Stripe顧客", application.stripe_customer_id)}
            ${detailRow("PaymentIntent", application.stripe_payment_intent_id)}
            ${detailRow("Checkout", application.stripe_checkout_session_id)}
            ${detailRow("管理メモ", application.admin_note)}
          </dl>
        </section>
      </div>
      <div class="admin-detail-actions">
        ${stripeUrl ? `<a class="admin-button admin-button--primary" href="${escapeHtml(stripeUrl)}" target="_blank" rel="noopener noreferrer">Stripe決済詳細を開く</a>` : ""}
        <button class="admin-button" type="button" data-copy-value="${escapeHtml(application.application_code)}">受付番号をコピー</button>
        <a class="admin-button" href="mailto:${escapeHtml(application.email || "")}">メールを作成</a>
      </div>
      ${Number(application.donation_equivalent_jpy || 0) > 0 ? `
        <section class="admin-amount-adjustment" aria-labelledby="supporter-publication-title">
          <h3 id="supporter-publication-title">寄付者名掲載・当日表示を更新</h3>
          <p>既存申込は初期状態では非掲載です。申込者の明示的な希望を確認した場合だけ更新してください。</p>
          <div class="admin-amount-adjustment__controls admin-supporter-editor" data-supporter-editor="${escapeHtml(application.id)}">
            <label><input type="checkbox" data-supporter-field="supporter_publication_consent" ${Number(application.supporter_publication_consent) === 1 ? "checked" : ""}> 公式サイト・記念パンフレットへの掲載に同意</label>
            <label>掲載名<input type="text" maxlength="100" value="${escapeHtml(application.supporter_publication_name || application.full_name || "")}" data-supporter-field="supporter_publication_name"></label>
            <label><input type="checkbox" data-supporter-field="supporter_include_maiden_name" ${Number(application.supporter_include_maiden_name) === 1 ? "checked" : ""}> 旧姓を併記</label>
            <label>夫妻・連名等<input type="text" maxlength="100" value="${escapeHtml(application.supporter_joint_name || "")}" data-supporter-field="supporter_joint_name"></label>
            <label><input type="checkbox" data-supporter-field="supporter_anonymous" ${Number(application.supporter_anonymous) !== 0 ? "checked" : ""}> 匿名希望</label>
            <label>当日のサポーター表示
              <select data-supporter-field="supporter_badge_preference">
                <option value="display" ${application.supporter_badge_preference === "display" ? "selected" : ""}>希望</option>
                <option value="decline" ${application.supporter_badge_preference !== "display" ? "selected" : ""}>辞退</option>
              </select>
            </label>
            ${String(application.ticket_type || "").includes("__platinum") ? `<label>応援メッセージ（50字以内）<textarea maxlength="50" data-supporter-field="supporter_message">${escapeHtml(application.supporter_message || "")}</textarea></label>` : ""}
            <button class="admin-button admin-button--primary" type="button" data-save-supporter-publication="${escapeHtml(application.id)}">掲載設定を保存</button>
          </div>
          <p class="admin-amount-adjustment__message" data-supporter-message="${escapeHtml(application.id)}" role="status" aria-live="polite"></p>
        </section>` : ""}
      ${canAdjustBankTransferAmount(application) ? `
        <section class="admin-amount-adjustment" aria-labelledby="amount-adjustment-title">
          <h3 id="amount-adjustment-title">未入金の銀行振込額を訂正</h3>
          <p>Stripeへの着金がない役員・当日お手伝い申込だけが対象です。入力額はサーバー側の料金計算と一致する場合に限り反映されます。</p>
          <div class="admin-amount-adjustment__controls">
            <label>訂正後の支払予定額
              <input type="number" min="1" step="1" value="${escapeHtml(expectedAmount(application))}" data-adjusted-amount-input="${escapeHtml(application.id)}" />
            </label>
            <button class="admin-button admin-button--primary" type="button" data-adjust-bank-amount="${escapeHtml(application.id)}">金額を確認して訂正</button>
          </div>
          <p class="admin-amount-adjustment__message" data-adjust-bank-message="${escapeHtml(application.id)}" role="status" aria-live="polite"></p>
        </section>` : ""}
      ${canRefreshBankTransferInstructions(application) ? `
        <section class="admin-amount-adjustment" aria-labelledby="bank-instructions-refresh-title">
          <h3 id="bank-instructions-refresh-title">銀行振込案内の再発行</h3>
          <p>決済情報を再確認し、有効な振込案内ページを取得して申込者へ再送します。既に振込済みの場合は、二重入金を避ける注意書きも送ります。</p>
          <button class="admin-button admin-button--primary" type="button" data-refresh-bank-instructions="${escapeHtml(application.id)}">振込案内を再発行・再送</button>
          <p class="admin-amount-adjustment__message" data-refresh-bank-message="${escapeHtml(application.id)}" role="status" aria-live="polite"></p>
        </section>` : ""}`;
    elements.dialog.showModal();
  }

  async function adjustBankTransferAmount(applicationId, button) {
    const application = state.applications.find((item) => item.id === applicationId);
    const input = elements.dialogContent.querySelector(`[data-adjusted-amount-input="${CSS.escape(applicationId)}"]`);
    const message = elements.dialogContent.querySelector(`[data-adjust-bank-message="${CSS.escape(applicationId)}"]`);
    const expectedAmountJpy = Number(input?.value);
    if (!application || !Number.isSafeInteger(expectedAmountJpy) || expectedAmountJpy <= 0) {
      if (message) message.textContent = "訂正後の金額を正しく入力してください。";
      return;
    }

    button.disabled = true;
    if (input) input.disabled = true;
    if (message) message.textContent = "Stripeの着金状況と料金計算を確認しています。";
    try {
      const result = await patchJson(`${API_URL}/${encodeURIComponent(application.application_code)}`, {
        action: "adjust_unfunded_bank_transfer_amount",
        expected_amount_jpy: expectedAmountJpy,
        confirm_application_code: application.application_code,
        sendEmail: true
      });
      if (message) {
        const emailStatus = result.email_delivery?.sent ? "訂正メールも送信しました。" : "訂正メールは送信結果を確認してください。";
        message.textContent = `${formatYen(result.previous_amount_jpy)}から${formatYen(result.adjusted_amount_jpy)}へ訂正しました。${emailStatus}`;
      }
      elements.dialog.close();
      await loadApplications();
      openApplicationDetail(application.id);
    } catch (error) {
      if (message) message.textContent = `訂正できませんでした: ${error.message}`;
      button.disabled = false;
      if (input) input.disabled = false;
    }
  }

  async function refreshBankTransferInstructions(applicationId, button) {
    const application = state.applications.find((item) => item.id === applicationId);
    const message = elements.dialogContent.querySelector(`[data-refresh-bank-message="${CSS.escape(applicationId)}"]`);
    if (!application) return;
    if (!window.confirm(`${application.application_code} の振込案内を再発行し、${application.email} へ再送します。よろしいですか？`)) return;

    button.disabled = true;
    if (message) message.textContent = "決済情報を確認し、振込案内を再発行しています。";
    try {
      const result = await patchJson(`${API_URL}/${encodeURIComponent(application.application_code)}`, {
        action: "refresh_bank_transfer_instructions",
        confirm_application_code: application.application_code,
        sendEmail: true
      });
      if (message) {
        const emailStatus = result.email_delivery?.sent
          ? "申込者へ新しい案内を送信しました。"
          : `案内は再発行しましたが、メール送信結果を確認してください${result.email_delivery?.reason ? `（${result.email_delivery.reason}）` : ""}。`;
        message.textContent = `${formatYen(result.amount_remaining_jpy)}の振込案内を再発行しました。${emailStatus}`;
      }
      await loadApplications();
    } catch (error) {
      if (message) message.textContent = `再発行できませんでした: ${error.message}`;
      button.disabled = false;
    }
  }

  async function saveSupporterPublication(applicationId, button) {
    const editor = elements.dialogContent.querySelector(`[data-supporter-editor="${CSS.escape(applicationId)}"]`);
    const message = elements.dialogContent.querySelector(`[data-supporter-message="${CSS.escape(applicationId)}"]`);
    if (!editor) return;
    const field = (name) => editor.querySelector(`[data-supporter-field="${name}"]`);
    const payload = {
      action: "update_supporter_publication",
      supporter_publication_consent: Boolean(field("supporter_publication_consent")?.checked),
      supporter_publication_name: field("supporter_publication_name")?.value.trim() || "",
      supporter_include_maiden_name: Boolean(field("supporter_include_maiden_name")?.checked),
      supporter_joint_name: field("supporter_joint_name")?.value.trim() || "",
      supporter_anonymous: Boolean(field("supporter_anonymous")?.checked),
      supporter_badge_preference: field("supporter_badge_preference")?.value || "decline",
      supporter_message: field("supporter_message")?.value.trim() || ""
    };
    if (payload.supporter_publication_consent && !payload.supporter_anonymous && !payload.supporter_publication_name && !payload.supporter_joint_name) {
      if (message) message.textContent = "実名掲載する場合は掲載名または連名表記を入力してください。";
      return;
    }
    button.disabled = true;
    if (message) message.textContent = "掲載設定を保存しています。";
    try {
      await patchJson(`${API_URL}/${encodeURIComponent(applicationId)}`, payload);
      if (message) message.textContent = "掲載設定を保存しました。";
      await loadApplications();
      openApplicationDetail(applicationId);
    } catch (error) {
      if (message) message.textContent = `保存できませんでした: ${error.message}`;
      button.disabled = false;
    }
  }

  function bindEvents() {
    elements.searchInput.addEventListener("input", (event) => {
      state.filters.search = event.target.value;
      applyFilters();
    });
    elements.paymentFilter.addEventListener("change", (event) => {
      state.filters.payment = event.target.value;
      applyFilters();
    });
    elements.planFilter.addEventListener("change", (event) => {
      state.filters.plan = event.target.value;
      applyFilters();
    });
    elements.sortSelect.addEventListener("change", (event) => {
      state.filters.sort = event.target.value;
      applyFilters();
    });
    elements.clearFilters.addEventListener("click", () => {
      state.filters = { search: "", payment: "active", plan: "all", sort: "newest" };
      elements.searchInput.value = "";
      elements.paymentFilter.value = "active";
      elements.planFilter.value = "all";
      elements.sortSelect.value = "newest";
      applyFilters();
    });
    elements.refreshButton.addEventListener("click", loadApplications);
    elements.tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-id]");
      if (button) openApplicationDetail(button.dataset.applicationId);
    });
    elements.dialogContent.addEventListener("click", async (event) => {
      const supporterButton = event.target.closest("[data-save-supporter-publication]");
      if (supporterButton) {
        await saveSupporterPublication(supporterButton.dataset.saveSupporterPublication, supporterButton);
        return;
      }
      const refreshButton = event.target.closest("[data-refresh-bank-instructions]");
      if (refreshButton) {
        await refreshBankTransferInstructions(refreshButton.dataset.refreshBankInstructions, refreshButton);
        return;
      }
      const adjustmentButton = event.target.closest("[data-adjust-bank-amount]");
      if (adjustmentButton) {
        await adjustBankTransferAmount(adjustmentButton.dataset.adjustBankAmount, adjustmentButton);
        return;
      }
      const button = event.target.closest("[data-copy-value]");
      if (!button) return;
      await navigator.clipboard.writeText(button.dataset.copyValue);
      button.textContent = "コピーしました";
    });
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
  }

  bindEvents();
  loadApplications();
})();
