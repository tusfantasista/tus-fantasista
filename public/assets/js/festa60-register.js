import {
  ABSENT_DONATION_TOTALS,
  ATTENDING_DONATION_EQUIVALENTS,
  ATTENDING_PLAN_TOTALS,
  APPLICATION_DEADLINE_ISO,
  BASE_FEES,
  CURRENT_PRICING_VERSION,
  REGISTRATION_STATUS,
  REGISTRATION_STATUS_MESSAGE,
  FEE_PERIOD_LABELS,
  STAFF_TICKET_TYPES,
  SUPPORT_PLAN_DETAILS,
  ABSENT_PLAN_DETAILS,
  buildPaymentLineItems,
  lineItemsTotal,
  attendingPlanAmount as sharedAttendingPlanAmount,
  staffParticipationAmount as sharedStaffParticipationAmount,
  noReceptionDiscount as sharedNoReceptionDiscount,
  normalizeTicketType,
  feePeriodForDate as sharedFeePeriodForDate,
  pricingConfig,
  publicBaseTicketType,
} from "./festa60-pricing.js?v=20260829-1";

(function () {
  const form = document.getElementById("festa60-form");
  const message = document.getElementById("form-message");
  const companionCount = document.getElementById("companion_count");
  const companions = document.getElementById("companions");
  const applicationMode = document.getElementById("application_mode");
  const schoolLineage = document.getElementById("school_lineage");
  const graduationYear = document.getElementById("graduation_year");
  const graduationRequiredLabel = document.getElementById("graduation-required-label");
  const graduationHelp = document.getElementById("graduation-help");
  const ticketType = document.getElementById("ticket_type");
  const ticketTypeDisplay = document.getElementById("ticket_type_display");
  const supportTier = document.getElementById("support_tier");
  const phone = document.getElementById("phone");
  const phoneRequiredLabel = document.getElementById("phone-required-label");
  const couponSection = document.getElementById("coupon-section");
  const couponCode = document.getElementById("coupon_code");
  const absentDonationTier = document.getElementById("absent_donation_tier");
  const feePeriod = document.getElementById("fee_period");
  const feePeriodDisplay = document.getElementById("fee_period_display");
  const receptionAttendance = document.getElementById("reception_attendance");
  const receptionAttendanceHelp = document.getElementById("reception-attendance-help");
  const feePreview = document.getElementById("fee-preview");
  const entryPanel = document.getElementById("entry-panel");
  const registrationSteps = document.getElementById("registration-steps");
  const registrationComingSoon = document.getElementById("registration-coming-soon");
  const confirmationPanel = document.getElementById("confirmation-panel");
  const confirmationSummary = document.getElementById("confirmation-summary");
  const confirmationMessage = document.getElementById("confirmation-message");
  const confirmationPaymentTitle = document.getElementById("confirmation-payment-title");
  const confirmationPaymentNote = document.getElementById("confirmation-payment-note");
  const editApplicationButton = document.getElementById("edit-application");
  const confirmApplicationButton = document.getElementById("confirm-application");
  const confirmationActions = document.getElementById("confirmation-actions");
  const paymentChoice = document.getElementById("payment-choice");
  const paymentChoiceInputs = Array.from(document.querySelectorAll("input[name='confirmation_payment_method']"));
  const bankTransferPreview = document.getElementById("bank-transfer-preview");
  const confirmBankTransferButton = document.getElementById("confirm-bank-transfer");
  const changeToOnlinePaymentButton = document.getElementById("change-to-online-payment");
  const completionPanel = document.getElementById("completion-panel");
  const stripePaymentMethod = document.getElementById("stripe-payment-method");
  const stripePaymentHelp = document.getElementById("stripe-payment-help");
  const stripePaymentStatus = document.getElementById("stripe-payment-status");
  const environmentBanner = document.getElementById("environment-banner");
  const graduationSection = document.getElementById("graduation-section");
  const attendancePlanSection = document.getElementById("attendance-plan-section");
  const feePeriodSection = document.getElementById("fee-period-section");
  const attendanceTicketNotice = document.getElementById("attendance-ticket-notice");
  const attendanceOptionsSection = document.getElementById("attendance-options-section");
  const absentDonationSection = document.getElementById("absent-donation-section");
  const supportPlanDetail = document.getElementById("support-plan-detail");
  const absentPlanDetail = document.getElementById("absent-plan-detail");
  const photoConsentSection = document.getElementById("photo-consent-section");
  const photoConsent = form?.querySelector("input[name='photo_consent']");
  const supporterRecognitionSection = document.getElementById("supporter-recognition-section");
  const supporterPublicationConsent = document.getElementById("supporter_publication_consent");
  const supporterPublicationName = document.getElementById("supporter_publication_name");
  const supporterJointName = document.getElementById("supporter_joint_name");
  const supporterIncludeMaidenName = document.getElementById("supporter_include_maiden_name");
  const supporterAnonymous = document.getElementById("supporter_anonymous");
  const supporterBadgePreference = document.getElementById("supporter_badge_preference");
  const supporterMessageSection = document.getElementById("supporter-message-section");
  const supporterMessage = document.getElementById("supporter_message");
  const returnAddressSection = document.getElementById("return-address-section");
  const postalCode = document.getElementById("postal_code");
  const postalLookupButton = document.getElementById("postal-lookup-button");
  const postalLookupStatus = document.getElementById("postal-lookup-status");
  const prefecture = document.getElementById("prefecture");
  const city = document.getElementById("city");
  const streetAddress = document.getElementById("street_address");
  const building = document.getElementById("building");
  const applicationModeSection = document.getElementById("application-mode-section");
  const staffModeBanner = document.getElementById("staff-mode-banner");
  const staffAccessSection = document.getElementById("staff-access-section");
  const staffAccessCode = document.getElementById("staff_access_code");
  const reviewApplicationButton = document.getElementById("review-application");
  const schoolLineageGuide = document.getElementById("school-lineage-guide");
  const openSchoolLineageGuide = document.getElementById("open-school-lineage-guide");
  const closeSchoolLineageGuide = document.getElementById("close-school-lineage-guide");
  const graduationYearGuide = document.getElementById("graduation-year-guide");
  const openGraduationYearGuide = document.getElementById("open-graduation-year-guide");
  const closeGraduationYearGuide = document.getElementById("close-graduation-year-guide");
  const checkoutState = new URLSearchParams(window.location.search);
  const staffMode = checkoutState.get("staff") === "1";
  let turnstileToken = "";
  let pendingPayload = null;
  let bankPreviewToken = "";
  let bankPreviewDetails = null;
  let postalLookupTimer = null;
  let applicationOpen = REGISTRATION_STATUS === "open";
  let applicationStatus = REGISTRATION_STATUS;
  let lastLookedUpPostalCode = "";
  let stripeAvailable = false;
  let activePricingVersion = CURRENT_PRICING_VERSION;
  const obogSixTenFrom = 2016;
  const obogSixTenTo = 2020;
  const obogFiveUnderFrom = 2021;
  const obogFiveUnderTo = 2025;
  const obogElevenOverTo = 2015;
  const baseFees = BASE_FEES;
  const attendingPlanTotals = ATTENDING_PLAN_TOTALS;
  const attendingPlanTicketUnits = { platinum: 600, gold: 500, silver: 400, bronze: 300 };
  const staffTicketTypes = STAFF_TICKET_TYPES;
  const absentDonationTotals = ABSENT_DONATION_TOTALS;
  const supportPlanDetails = SUPPORT_PLAN_DETAILS;
  const absentPlanDetails = ABSENT_PLAN_DETAILS;
  let companionFees = pricingConfig(activePricingVersion).companion_fees;
  const feePeriodLabels = FEE_PERIOD_LABELS;

  if (!form) return;

  if (checkoutState.get("checkout") === "success") {
    showCheckoutSuccess();
  } else if (checkoutState.get("checkout") === "cancelled") {
    setMessage("お支払いが完了しなかったため、申込は完了していません。内容をご確認のうえ、もう一度お申し込みください。", "error");
  }

  fetch("/api/festa60/config")
    .then((response) => response.json())
    .then((config) => {
      activePricingVersion = config.pricing_version || CURRENT_PRICING_VERSION;
      companionFees = pricingConfig(activePricingVersion).companion_fees;
      applyFeePeriod(config.fee_period || feePeriodForNow(), config.fee_periods || feePeriodLabels);
      updateApplicationDeadline(config);
      updateStripeAvailability(config);
      if (!config.turnstile_site_key) return;
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = function () {
        window.turnstile.render("#turnstile-slot", {
          sitekey: config.turnstile_site_key,
          callback(token) {
            turnstileToken = token;
          },
        });
      };
      document.head.appendChild(script);
    })
    .catch(() => {
      applyFeePeriod(feePeriodForNow(), feePeriodLabels);
      updateApplicationDeadline({ application_open: applicationOpenForNow() });
      updateStripeAvailability({ stripe_mode: "not_configured" });
    });

  companionCount.addEventListener("input", renderCompanions);
  applicationMode.addEventListener("change", updateApplicationMode);
  schoolLineage.addEventListener("change", updateIdentityAndTicketType);
  graduationYear.addEventListener("input", updateIdentityAndTicketType);
  supportTier.addEventListener("change", function () {
    updateReturnAddressRequirement();
    updatePlanDetails();
    updateFeePreview();
  });
  absentDonationTier.addEventListener("change", function () {
    updateReturnAddressRequirement();
    updatePlanDetails();
    updateFeePreview();
  });
  supporterPublicationConsent?.addEventListener("change", function () {
    if (supporterPublicationConsent.checked) supporterAnonymous.checked = false;
    updateSupporterPublicationFields();
  });
  supporterAnonymous?.addEventListener("change", function () {
    if (supporterAnonymous.checked) supporterPublicationConsent.checked = false;
    updateSupporterPublicationFields();
  });
  receptionAttendance.addEventListener("change", function () {
    syncCompanionReceptionOptions();
    updatePlanDetails();
    updateFeePreview();
  });
  postalLookupButton.addEventListener("click", lookupAddressByPostalCode);
  openSchoolLineageGuide?.addEventListener("click", function () {
    schoolLineageGuide?.showModal();
  });
  closeSchoolLineageGuide?.addEventListener("click", function () {
    schoolLineageGuide?.close();
  });
  schoolLineageGuide?.addEventListener("click", function (event) {
    if (event.target === schoolLineageGuide) schoolLineageGuide.close();
  });
  schoolLineageGuide?.addEventListener("close", function () {
    openSchoolLineageGuide?.focus();
  });
  openGraduationYearGuide?.addEventListener("click", function () {
    graduationYearGuide?.showModal();
  });
  closeGraduationYearGuide?.addEventListener("click", function () {
    graduationYearGuide?.close();
  });
  graduationYearGuide?.addEventListener("click", function (event) {
    if (event.target === graduationYearGuide) graduationYearGuide.close();
  });
  graduationYearGuide?.addEventListener("close", function () {
    openGraduationYearGuide?.focus();
  });
  postalCode.addEventListener("input", function () {
    window.clearTimeout(postalLookupTimer);
    const normalized = normalizePostalCode(postalCode.value);
    if (normalized.length !== 7 || normalized === lastLookedUpPostalCode) return;
    postalLookupTimer = window.setTimeout(lookupAddressByPostalCode, 400);
  });
  activateStaffMode();
  renderCompanions();
  applyFeePeriod(feePeriodForNow(), feePeriodLabels);
  updateApplicationDeadline({ application_open: applicationOpenForNow() });
  updateIdentityAndTicketType();
  updateSupportTierAvailability();
  updateApplicationMode();
  updatePlanDetails();
  updateFeePreview();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (reviewApplicationButton.disabled) return;
    reviewApplicationButton.disabled = true;
    try {
      if (!applicationOpen) throw new Error(applicationStatus === "coming_soon" ? REGISTRATION_STATUS_MESSAGE : "参加申込は2027年1月31日をもって締め切りました。変更や確認はFESTA事務局へお問い合わせください。");
      const payload = formPayload(new FormData(form));
      payload.client_submission_id = crypto.randomUUID();
      const clientErrors = validatePayload(payload);
      if (clientErrors.length) {
        throw new Error(clientErrors.join("\n"));
      }
      if (String(payload.coupon_code || "").trim()) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch("/api/festa60/coupon", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ coupon_code: payload.coupon_code, ticket_type: normalizeTicketType(payload.ticket_type, payload.support_tier) }),
            signal: controller.signal,
          });
          const result = await response.json();
          if (!response.ok || !result.ok || !result.applied || result.fee_period !== "early") {
            throw new Error(result.message || "クーポンコードを確認してください。");
          }
          payload.coupon_code = result.code;
          payload.coupon_applied = true;
          payload.fee_period = "early";
        } catch (error) {
          if (error.name === "AbortError" || error instanceof TypeError || error instanceof SyntaxError) {
            throw new Error("クーポンを確認できませんでした。通信状況をご確認のうえ、もう一度お試しください。");
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      } else {
        delete payload.coupon_code;
      }
      pendingPayload = payload;
      showConfirmation(payload);
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      reviewApplicationButton.disabled = !applicationOpen;
    }
  });

  editApplicationButton.addEventListener("click", async function () {
    await cancelBankPreview();
    pendingPayload = null;
    clearBankTransferPreview();
    resetTurnstile();
    confirmationPanel.hidden = true;
    entryPanel.hidden = false;
    setStep("entry");
    entryPanel.scrollIntoView({ block: "start" });
    form.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  });

  confirmApplicationButton.addEventListener("click", submitConfirmedApplication);
  confirmBankTransferButton.addEventListener("click", function () {
    submitApplication("confirm_bank_transfer");
  });
  changeToOnlinePaymentButton.addEventListener("click", function () {
    const onlineChoice = paymentChoiceInputs.find((input) => input.value === "online");
    if (onlineChoice) onlineChoice.checked = true;
    bankTransferPreview.hidden = true;
    paymentChoice.hidden = false;
    confirmationActions.hidden = false;
    updateConfirmationPaymentChoice();
    confirmationPaymentTitle.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  paymentChoiceInputs.forEach((input) => input.addEventListener("change", updateConfirmationPaymentChoice));

  function renderCompanions() {
    const count = Math.max(0, Math.min(5, Number(companionCount.value || 0)));
    companions.innerHTML = "";
    for (let index = 0; index < count; index += 1) {
      const card = document.createElement("fieldset");
      card.className = "crm-companion";
      card.innerHTML = `
        <legend>同伴者${index + 1}</legend>
        <div class="crm-two">
          <div class="crm-field">
            <label for="companion_${index}_name">氏名 <span class="crm-required">必須</span></label>
            <input id="companion_${index}_name" name="companion_${index}_name" required />
          </div>
          <div class="crm-field">
            <label for="companion_${index}_relationship">続柄・関係 <span class="crm-required">必須</span></label>
            <input id="companion_${index}_relationship" name="companion_${index}_relationship" placeholder="例: 配偶者、子、友人" required />
          </div>
        </div>
        <div class="crm-two">
          <div class="crm-field">
            <label for="companion_${index}_attendee_type">同伴者属性 <span class="crm-required">必須</span></label>
            <select id="companion_${index}_attendee_type" name="companion_${index}_attendee_type" required>
              <option value="">選択してください</option>
              <option value="adult">大人（中学生以上）</option>
              <option value="child">子供（小学生）</option>
              <option value="preschool">未就学児（無料）</option>
            </select>
            <p class="crm-help">中学生以上は「大人」、小学生は「小学生」、小学校入学前は「未就学児（無料）」を選択してください。大人には申込者本人の参加プランと同じ金額のダンスタイムチケットを1枚配布し、小学生・未就学児への自動配布はありません。</p>
          </div>
          <div class="crm-field">
            <label for="companion_${index}_reception_attendance">懇親会 <span class="crm-required">必須</span></label>
            <select id="companion_${index}_reception_attendance" name="companion_${index}_reception_attendance" required>
              <option value="attending">参加する</option>
              <option value="without_reception">参加しない</option>
            </select>
            <p class="crm-help" data-companion-reception-help>申込者本人が参加する場合、同伴者は参加・不参加を個別に選べます。</p>
          </div>
        </div>
        <div class="crm-field">
            <label for="companion_${index}_email">メールアドレス <span class="crm-optional">任意</span></label>
            <input id="companion_${index}_email" name="companion_${index}_email" type="email" autocomplete="email" />
        </div>
        <div class="crm-field">
          <label for="companion_${index}_note">補足 <span class="crm-optional">任意</span></label>
          <input id="companion_${index}_note" name="companion_${index}_note" placeholder="年齢区分、配慮事項など" />
        </div>
        <label class="crm-check">
          <input type="checkbox" name="companion_${index}_non_obog_confirmed" required />
          <span>この同伴者はOBOGではありません。OBOGの場合は別途申し込みます。</span>
        </label>
      `;
      companions.appendChild(card);
    }
    syncCompanionReceptionOptions();
    companions.querySelectorAll("input, select").forEach((control) => {
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", updateFeePreview);
    });
    updateFeePreview();
  }

  function syncCompanionReceptionOptions() {
    const applicantAttends = receptionAttendance.value === "attending";
    companions.querySelectorAll("select[name$='_reception_attendance']").forEach((select) => {
      const attendingOption = select.querySelector("option[value='attending']");
      if (attendingOption) attendingOption.disabled = !applicantAttends;
      if (!applicantAttends) select.value = "without_reception";
      const help = select.parentElement?.querySelector("[data-companion-reception-help]");
      if (help) {
        help.textContent = applicantAttends
          ? "申込者本人が参加する場合、同伴者は参加・不参加を個別に選べます。"
          : "申込者本人が参加しないため、同伴者も懇親会不参加となります。";
      }
    });
  }

  function formPayload(data) {
    const payload = Object.fromEntries(data.entries());
    if (staffMode) {
      payload.application_mode = "attending";
    }
    payload.full_name = [payload.family_name, payload.given_name].filter(Boolean).join(" ");
    payload.full_name_kana = [payload.family_name_kana, payload.given_name_kana].filter(Boolean).join(" ");
    payload.address = [payload.prefecture, payload.city, payload.street_address, payload.building]
      .filter((value) => String(value || "").trim())
      .join(" ");
    payload.privacy_consent = data.has("privacy_consent");
    payload.contact_consent = data.has("contact_consent");
    payload.photo_consent = data.has("photo_consent");
    payload.cancellation_policy_consent = data.has("cancellation_policy_consent");
    payload.supporter_publication_consent = data.has("supporter_publication_consent");
    payload.supporter_include_maiden_name = data.has("supporter_include_maiden_name");
    payload.supporter_anonymous = !payload.supporter_publication_consent || data.has("supporter_anonymous");
    payload.pricing_version = activePricingVersion;
    delete payload.expected_transfer_name;
    const isAbsentDonation = payload.application_mode === "absent_donation";
    if (isAbsentDonation) {
      payload.ticket_type = payload.absent_donation_tier;
      payload.support_tier = "none";
      payload.reception_attendance = "without_reception";
      payload.companion_count = "0";
    }
    delete payload.absent_donation_tier;
    const count = isAbsentDonation ? 0 : Number(payload.companion_count || 0);
    const companionTicketUnitAmount = danceTicketUnitAmount(payload.support_tier);
    payload.companions = [];
    for (let index = 0; index < count; index += 1) {
      const fullName = payload[`companion_${index}_name`];
      if (!fullName) continue;
      const attendeeType = payload[`companion_${index}_attendee_type`] || "";
      const danceTicketCount = attendeeType === "adult" ? 1 : 0;
      payload.companions.push({
        full_name: fullName,
        relationship: payload[`companion_${index}_relationship`] || "",
        attendee_type: attendeeType,
        reception_attendance: payload[`companion_${index}_reception_attendance`] || payload.reception_attendance,
        non_obog_confirmed: data.has(`companion_${index}_non_obog_confirmed`),
        email: payload[`companion_${index}_email`] || "",
        note: payload[`companion_${index}_note`] || "",
        dance_ticket_count: danceTicketCount,
        dance_ticket_unit_amount_jpy: danceTicketCount ? companionTicketUnitAmount : 0,
        dance_ticket_total_amount_jpy: danceTicketCount * companionTicketUnitAmount,
      });
      delete payload[`companion_${index}_name`];
      delete payload[`companion_${index}_relationship`];
      delete payload[`companion_${index}_attendee_type`];
      delete payload[`companion_${index}_reception_attendance`];
      delete payload[`companion_${index}_non_obog_confirmed`];
      delete payload[`companion_${index}_email`];
      delete payload[`companion_${index}_note`];
    }
    payload.adult_companion_count = payload.companions.filter((companion) => companion.attendee_type === "adult").length;
    payload.companion_dance_ticket_count = payload.adult_companion_count;
    payload.companion_dance_ticket_unit_amount_jpy = payload.adult_companion_count ? companionTicketUnitAmount : 0;
    payload.companion_dance_ticket_total_amount_jpy = payload.adult_companion_count * companionTicketUnitAmount;
    delete payload.generation;
    return payload;
  }

  function updateIdentityAndTicketType() {
    const isGakushuin = schoolLineage.value === "gakushuin_ouyukai";
    graduationYear.required = !isGakushuin;
    graduationRequiredLabel.textContent = isGakushuin ? "任意" : "必須";
    graduationRequiredLabel.className = isGakushuin ? "crm-optional" : "crm-required";
    graduationHelp.textContent = isGakushuin
      ? "学習院桜友会の方は任意です。参加プランの割引とチケット枚数は卒部11年目以上と同じ扱いです。"
      : "東京理科大学舞踏研究部OBOGは必須です。全参加プランの卒部年度割引とダンスタイムチケット枚数を自動判定します。";

    const year = Number(graduationYear.value);
    if (isGakushuin) {
      ticketType.value = "obog";
      ticketTypeDisplay.value = "一般OBOG（学習院桜友会）";
    } else if (!Number.isInteger(year) || !graduationYear.value) {
      ticketType.value = "obog";
      ticketTypeDisplay.value = "卒部年度を入力すると自動判定されます";
    } else if (year <= obogElevenOverTo) {
      ticketType.value = "obog";
      ticketTypeDisplay.value = "一般OBOG（11年目以上）";
    } else if (year <= obogSixTenTo) {
      ticketType.value = "obog_6_10";
      ticketTypeDisplay.value = "卒部6〜10年目（OBOG6〜10年目）";
    } else if (year <= obogFiveUnderTo) {
      ticketType.value = "obog_5_under";
      ticketTypeDisplay.value = "卒部1〜5年目（OBOG1〜5年目）";
    } else {
      ticketType.value = "obog_5_under";
      ticketTypeDisplay.value = "基準日現在は現役生（事務局へ確認）";
    }

    if (staffMode) {
      ticketType.value = staffTicketType(ticketType.value);
      ticketTypeDisplay.value = `${ticketTypeDisplay.value}／役員・当日お手伝い`;
    }

    updateSupportTierAvailability();
    updatePlanDetails();
    updateFeePreview();
  }

  function updateSupportTierAvailability() {
    const supportsPremium = applicationMode.value === "attending" && (["obog", "obog_6_10", "obog_5_under"].includes(ticketType.value) || staffTicketTypes.includes(ticketType.value));
    supportTier.disabled = !supportsPremium;
    if (!supportsPremium) supportTier.value = "none";
  }

  function updateApplicationMode() {
    if (staffMode) applicationMode.value = "attending";
    const isAbsentDonation = applicationMode.value === "absent_donation";
    graduationSection.hidden = false;
    attendancePlanSection.hidden = isAbsentDonation;
    feePeriodSection.hidden = isAbsentDonation;
    attendanceTicketNotice.hidden = isAbsentDonation;
    attendanceOptionsSection.hidden = isAbsentDonation;
    supportPlanDetail.hidden = isAbsentDonation;
    photoConsentSection.hidden = isAbsentDonation;
    absentDonationSection.hidden = !isAbsentDonation;
    couponSection.hidden = isAbsentDonation;
    couponCode.disabled = isAbsentDonation;
    if (isAbsentDonation) couponCode.value = "";
    absentDonationTier.required = isAbsentDonation;
    ticketType.disabled = isAbsentDonation;
    supportTier.disabled = isAbsentDonation;
    receptionAttendance.disabled = isAbsentDonation;
    companionCount.disabled = isAbsentDonation;
    photoConsent.required = !isAbsentDonation;
    if (isAbsentDonation) photoConsent.checked = false;
    if (isAbsentDonation) {
      companionCount.value = "0";
      companions.innerHTML = "";
    }
    updateIdentityAndTicketType();
    updateSupportTierAvailability();
    updateReturnAddressRequirement();
    updatePlanDetails();
    updateFeePreview();
  }

  function updateReturnAddressRequirement() {
    const isDonor = applicationMode.value === "absent_donation" || supportTier.value !== "none";
    phone.required = isDonor;
    phoneRequiredLabel.textContent = isDonor ? "必須" : "任意";
    phoneRequiredLabel.className = isDonor ? "crm-required" : "crm-optional";
    returnAddressSection.hidden = !isDonor;
    postalCode.required = isDonor;
    prefecture.required = isDonor;
    city.required = isDonor;
    streetAddress.required = isDonor;
    supporterRecognitionSection.hidden = !isDonor;
    const isPlatinum = applicationMode.value === "attending" && supportTier.value === "platinum";
    supporterMessageSection.hidden = !isDonor || !isPlatinum;
    if (!isPlatinum) supporterMessage.value = "";
    updateSupporterPublicationFields();
  }

  function updateSupporterPublicationFields() {
    const canPublish = !supporterRecognitionSection.hidden && supporterPublicationConsent.checked && !supporterAnonymous.checked;
    supporterPublicationName.disabled = !canPublish;
    supporterJointName.disabled = !canPublish;
    supporterIncludeMaidenName.disabled = !canPublish;
    supporterPublicationName.required = canPublish;
  }

  function normalizePostalCode(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 7);
  }

  async function lookupAddressByPostalCode() {
    const normalized = normalizePostalCode(postalCode.value);
    if (normalized.length !== 7) {
      postalLookupStatus.textContent = "郵便番号を7桁で入力してください。";
      return;
    }

    postalLookupButton.disabled = true;
    postalLookupStatus.textContent = "住所を検索しています…";
    try {
      const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(normalized)}&limit=1`);
      if (!response.ok) throw new Error("lookup_failed");
      const result = await response.json();
      const addressResult = result.results?.[0];
      if (!addressResult) {
        postalLookupStatus.textContent = "該当する住所が見つかりません。住所を直接入力してください。";
        return;
      }
      postalCode.value = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
      prefecture.value = addressResult.address1 || "";
      city.value = `${addressResult.address2 || ""}${addressResult.address3 || ""}`;
      lastLookedUpPostalCode = normalized;
      postalLookupStatus.textContent = "都道府県と市区町村・町域を入力しました。番地をご確認ください。";
      streetAddress.focus();
    } catch (error) {
      postalLookupStatus.textContent = "住所を自動検索できませんでした。住所を直接入力してください。";
    } finally {
      postalLookupButton.disabled = false;
    }
  }

  function updatePlanDetails() {
    const support = supportPlanDetails[supportTier.value];
    if (support) {
      const discountedAmount = attendeePlanAmount(supportTier.value, ticketType.value, feePeriod.value, receptionAttendance.value);
      const ticketUnitAmount = danceTicketUnitAmount(supportTier.value);
      const donationEquivalent = ATTENDING_DONATION_EQUIVALENTS[supportTier.value] || 0;
      const staffExplanation = staffMode
        ? "<p>参加費15,000円から申込時期割引と卒部年度割引を引いた後、参加費相当分を50%にします。寄付相当額部分は割引しません。第一部のみの場合は、半額後に4,000円を控除します。</p>"
        : "<p>申込時期割引と卒部年度割引を併用しています。</p>";
      supportPlanDetail.innerHTML = `${planDetailMarkup(support)}<p><strong>寄付相当額：約${donationEquivalent.toLocaleString("ja-JP")}円</strong><br><small>基準参加費15,000円とダンスタイムチケット券面総額を除いた金額です。</small></p><p><strong>現在の割引・控除適用額：${discountedAmount.toLocaleString("ja-JP")}円</strong></p><p>通常参加分の300円券は別途配布しません。有料の大人同伴者には${ticketUnitAmount}円券を1枚配布し、当日の追加購入も原則として${ticketUnitAmount}円券です。</p>${staffExplanation}`;
    } else {
      const standardDanceTicket = publicTicketType(ticketType.value) === "obog" ? "300円券×3枚" : "300円券×2枚";
      const staffAmount = staffMode ? staffParticipationAmount(ticketType.value, feePeriod.value, receptionAttendance.value) : null;
      const standardAmount = attendeePlanAmount("none", ticketType.value, feePeriod.value, receptionAttendance.value);
      supportPlanDetail.innerHTML = staffMode
        ? `<h3>役員・当日お手伝い 通常参加</h3><p>参加費15,000円から申込時期割引と卒部年度割引を引いた後、参加費相当分を50%にします。第一部のみの場合は、半額後に4,000円を控除します。</p><p><strong>現在の割引・控除適用額：${staffAmount.toLocaleString("ja-JP")}円</strong></p><p>ダンスタイム用の${standardDanceTicket}が付きます。有料の大人同伴者には300円券を1枚配布し、当日の追加購入も原則として300円券です。</p>`
        : `<h3>通常参加（基準額15,000円）</h3><p>申込時期割引・卒部年度割引を適用します。第一部のみの場合は、さらに4,000円を控除します。</p><p><strong>現在の割引・控除適用額：${standardAmount.toLocaleString("ja-JP")}円</strong></p><p>ダンスタイム用の${standardDanceTicket}が付きます。有料の大人同伴者には300円券を1枚配布し、当日の追加購入も原則として300円券です。</p>`;
    }
    const absent = absentPlanDetails[absentDonationTier.value];
    absentPlanDetail.innerHTML = absent ? planDetailMarkup(absent) : "";
  }

  function planDetailMarkup(plan) {
    return `<h3>${plan.title}</h3><p>主な返礼内容</p><ul>${plan.benefits.map((benefit) => `<li>${benefit}</li>`).join("")}</ul>`;
  }

  function activateStaffMode() {
    if (!staffMode) return;
    staffModeBanner.hidden = false;
    staffAccessSection.hidden = false;
    staffAccessCode.required = true;
    applicationModeSection.hidden = true;
    applicationMode.value = "attending";
    attendancePlanSection.hidden = false;
    attendanceTicketNotice.hidden = false;
    ticketType.value = "obog_staff";
    ticketTypeDisplay.value = "一般OBOG（11年目以上）／役員・当日お手伝い";
    receptionAttendanceHelp.textContent = "役員・当日お手伝いは、参加費15,000円から申込時期割引と卒部年度割引を引いた後、参加費相当分を50%にします。第一部のみの場合は、半額後に4,000円を控除します。寄付相当額部分と同伴者料金には役員割引を適用しません。";
  }

  function showConfirmation(payload) {
    message.hidden = true;
    confirmationMessage.hidden = true;
    clearBankTransferPreview();
    renderConfirmation(payload);
    entryPanel.hidden = true;
    confirmationPanel.hidden = false;
    setStep("confirm");
    confirmationPanel.scrollIntoView({ block: "start" });
    document.getElementById("confirmation-title")?.focus({ preventScroll: true });
  }

  async function submitConfirmedApplication() {
    if (!pendingPayload) {
      setConfirmationMessage("入力内容を再度確認してください。", "error");
      return;
    }

    if (selectedConfirmationPaymentMethod() === "bank_transfer") {
      await previewBankTransfer();
      return;
    }

    await submitApplication(bankPreviewToken ? "switch_to_online" : "submit_online");
  }

  async function previewBankTransfer() {
    confirmApplicationButton.disabled = true;
    editApplicationButton.disabled = true;
    setConfirmationMessage("振込先を確認しています。まだ申込は確定しません...", "");

    try {
      if (!stripeAvailable) throw new Error("銀行振込は現在利用できません。時間をおいて再度お試しください。");
      const payload = clonePendingPayload();
      payload.action = "preview_bank_transfer";
      payload.payment_method = "bank_transfer";
      payload.turnstile_token = turnstileToken;
      const result = await postApplication(payload);
      bankPreviewToken = result.bank_preview_token;
      bankPreviewDetails = result.bank_transfer_preview;
      renderBankTransferPreview(bankPreviewDetails);
      paymentChoice.hidden = true;
      confirmationActions.hidden = true;
      bankTransferPreview.hidden = false;
      confirmationMessage.hidden = true;
      setStep("payment");
      bankTransferPreview.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("bank-transfer-preview-title")?.focus({ preventScroll: true });
    } catch (error) {
      resetTurnstile();
      setConfirmationMessage(error.message, "error");
    } finally {
      confirmApplicationButton.disabled = false;
      editApplicationButton.disabled = false;
    }
  }

  async function submitApplication(action) {
    if (!pendingPayload) {
      setConfirmationMessage("入力内容を再度確認してください。", "error");
      return;
    }

    let applicationSaved = false;
    confirmApplicationButton.disabled = true;
    editApplicationButton.disabled = true;
    confirmBankTransferButton.disabled = true;
    changeToOnlinePaymentButton.disabled = true;
    setStep("payment");
    setConfirmationMessage("申込内容を送信しています...", "");

    try {
      const payload = clonePendingPayload();
      payload.action = action;
      payload.payment_method = action === "confirm_bank_transfer" ? "bank_transfer" : "stripe";
      if (action === "submit_online") payload.turnstile_token = turnstileToken;
      if (action === "confirm_bank_transfer" || action === "switch_to_online") payload.bank_preview_token = bankPreviewToken;
      if (!stripeAvailable) {
        throw new Error("オンライン決済は現在準備中です。時間をおいて再度お試しいただくか、事務局へお問い合わせください。");
      }
      payload.pay_now = true;
      const result = await postApplication(payload);
      applicationSaved = true;

      if (result.payment?.checkoutUrl) {
        const checkoutUrl = new URL(result.payment.checkoutUrl, window.location.href);
        if (checkoutUrl.protocol !== "https:") {
          throw new Error("安全な決済画面を確認できませんでした。時間をおいて再度お試しください。");
        }
        setConfirmationMessage("決済画面を準備しました。お支払い完了後に申込完了となります...", "success");
        window.location.assign(checkoutUrl.href);
        return;
      }

      renderCompletion(result, payload);
      pendingPayload = null;
      clearBankTransferPreview();
      form.reset();
      updateApplicationMode();
      renderCompanions();
      confirmationPanel.hidden = true;
      completionPanel.hidden = false;
      setStep("complete");
      completionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStep(action === "confirm_bank_transfer" ? "payment" : "confirm");
      setConfirmationMessage(error.message, "error");
    } finally {
      confirmApplicationButton.disabled = applicationSaved;
      editApplicationButton.disabled = applicationSaved;
      confirmBankTransferButton.disabled = applicationSaved;
      changeToOnlinePaymentButton.disabled = applicationSaved;
    }
  }

  function clonePendingPayload() {
    const payload = { ...pendingPayload };
    payload.companions = (pendingPayload?.companions || []).map((companion) => ({ ...companion }));
    return payload;
  }

  async function postApplication(payload) {
    const response = await fetch("/api/festa60/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      if (result.application?.application_code) {
        throw new Error(`${safeApplicationErrorMessage(result)}\n受付番号: ${result.application.application_code}`);
      }
      throw new Error(formatApplicationError(result));
    }
    return result;
  }

  function safeApplicationErrorMessage(result) {
    const message = String(result?.message || result?.error || "").trim();
    if (!message || message === "server_error") {
      return "処理を完了できませんでした。時間をおいて再度お試しいただくか、FESTA事務局へお問い合わせください。";
    }
    return message;
  }

  function formatApplicationError(result) {
    const fieldLabels = {
      family_name: "姓",
      given_name: "名",
      family_name_kana: "姓（ふりがな）",
      given_name_kana: "名（ふりがな）",
      email: "メールアドレス",
      phone: "電話番号",
      coupon_code: "クーポンコード",
      ticket_type: "参加・寄付プラン",
      reception_attendance: "懇親会の参加",
      privacy_consent: "個人情報の取扱いへの同意",
      photo_consent: "写真撮影・掲載の確認",
      cancellation_policy_consent: "キャンセル規定への同意",
      school_lineage: "所属区分",
      staff_access_code: "役員用アクセスコード",
    };
    const invalidFields = Object.keys(result.details || {})
      .map((field) => fieldLabels[field] || (field.startsWith("companions.") ? "同伴者情報" : ""))
      .filter(Boolean);
    const uniqueFields = [...new Set(invalidFields)];
    if (uniqueFields.length) {
      return `${result.message || "入力内容を確認してください。"}\n確認が必要な項目: ${uniqueFields.join("、")}`;
    }
    return safeApplicationErrorMessage(result);
  }

  function renderConfirmation(payload) {
    const isAbsentDonation = Object.hasOwn(absentDonationTotals, payload.ticket_type);
    const isDonor = isAbsentDonation || payload.support_tier !== "none";
    const amount = calculateAmount(payload);
    const groups = [
      {
        title: "申込者情報",
        rows: [
          ["申込区分", staffMode ? "役員・当日お手伝い専用申込" : selectedLabel(applicationMode)],
          ["氏名", payload.full_name],
          ["ふりがな", payload.full_name_kana],
          ["旧姓", payload.maiden_name || "未入力"],
          ["メールアドレス", payload.email],
          ["電話番号", payload.phone || "未入力"],
          ["所属区分", selectedLabel(schoolLineage)],
          ["卒部年度", payload.graduation_year || "未入力"],
        ],
      },
    ];

    if (isAbsentDonation) {
      groups.push({
        title: "寄付内容",
        rows: [
          ["欠席者向け寄付", absentPlanDetails[payload.ticket_type]?.title || payload.ticket_type],
          ["お支払い予定額", formatYen(amount)],
        ],
      });
    } else {
      const companionTicketUnitAmount = danceTicketUnitAmount(payload.support_tier);
      const companionRows = payload.companions.length
        ? payload.companions.map((companion, index) => [
          `同伴者${index + 1}`,
          `${companion.full_name} / ${companion.relationship} / ${companion.attendee_type === "adult" ? `大人・中学生以上（${companionTicketUnitAmount}円券×1枚）` : companion.attendee_type === "child" ? "子供・小学生（チケット自動配布なし）" : "未就学児・無料（チケット自動配布なし）"} / ${companion.reception_attendance === "attending" ? "懇親会参加" : "懇親会不参加"}${companion.email ? ` / ${companion.email}` : ""}${companion.note ? `\n補足: ${companion.note}` : ""}`,
        ])
        : [["同伴者", "なし"]];
      groups.push({
        title: "参加・寄付内容",
        rows: [
          ["卒部区分（割引・チケット判定）", ticketTypeDisplay.value],
          ["参加費区分", payload.coupon_applied ? `超早期クーポン適用${staffMode ? "／役員・当日お手伝い（参加費部分50%）" : ""}` : staffMode ? "役員・当日お手伝い（参加費部分50%）" : feePeriodDisplay.value],
          ...(payload.coupon_applied ? [["クーポンコード", payload.coupon_code]] : []),
          ["参加プラン", selectedLabel(supportTier)],
          ["申込時期割引", applicationPeriodDiscount(payload.fee_period) ? `-${formatYen(applicationPeriodDiscount(payload.fee_period))}` : "割引なし"],
          ["卒部年度割引", graduationDiscount(payload.ticket_type) ? `-${formatYen(graduationDiscount(payload.ticket_type))}` : "割引なし"],
          ["懇親会", selectedLabel(receptionAttendance)],
          ...companionRows,
          ["同伴者向けチケット", payload.companion_dance_ticket_count ? `${companionTicketUnitAmount}円券×${payload.companion_dance_ticket_count}枚` : "なし"],
          ["当日追加購入できるダンスタイムチケット", `${companionTicketUnitAmount}円券（原則）`],
          ["お支払い予定額", formatYen(amount)],
        ],
      });
    }

    if (isDonor) {
      groups.push({
        title: "サポーター掲載・当日表示",
        rows: [
          ["氏名掲載", payload.supporter_publication_consent && !payload.supporter_anonymous ? "同意する" : "掲載しない"],
          ...(payload.supporter_publication_consent && !payload.supporter_anonymous ? [
            ["掲載名", payload.supporter_publication_name || payload.full_name],
            ["旧姓併記", payload.supporter_include_maiden_name ? "希望する" : "希望しない"],
            ["夫妻・連名等", payload.supporter_joint_name || "希望なし"],
          ] : []),
          ["当日のサポーター表示", payload.supporter_badge_preference === "decline" ? "辞退する" : "希望する"],
          ...(payload.supporter_message ? [["応援メッセージ", payload.supporter_message]] : []),
        ],
      });
      groups.push({
        title: "返礼品・お礼状の送付先",
        rows: [
          ["郵便番号", payload.postal_code],
          ["住所", payload.address],
        ],
      });
    }

    groups.push({
      title: "お支払い・同意内容",
      rows: [
        ["お支払い方法", "この画面で選択"],
        ["連絡事項", payload.message || "なし"],
        ["個人情報の利用", payload.privacy_consent ? "同意する" : "同意しない"],
        ["事務局からの連絡", payload.contact_consent ? "受け取る" : "受け取らない"],
        ...(!isAbsentDonation ? [["撮影・限定公開", payload.photo_consent ? "了承する" : "了承しない"]] : []),
        ["キャンセル・返金規定", payload.cancellation_policy_consent ? "同意する" : "同意しない"],
      ],
    });

    confirmationSummary.replaceChildren(...groups.map(createConfirmationGroup));
    const onlineChoice = paymentChoiceInputs.find((input) => input.value === "online");
    if (onlineChoice) onlineChoice.checked = true;
    paymentChoice.hidden = false;
    confirmationActions.hidden = false;
    updateConfirmationPaymentChoice();
  }

  function createConfirmationGroup(group) {
    const section = document.createElement("section");
    section.className = "crm-confirmation-group";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const list = document.createElement("dl");
    list.className = "crm-confirmation-list";
    group.rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = String(value ?? "");
      row.append(term, description);
      list.appendChild(row);
    });
    section.append(heading, list);
    return section;
  }

  function selectedLabel(select) {
    return select.options[select.selectedIndex]?.textContent.trim() || "未選択";
  }

  function paymentMethodLabel(method) {
    if (method === "stripe") return "オンライン決済（画面に表示された支払い方法）";
    if (method === "bank_transfer") return "銀行振込";
    return "オンライン決済";
  }

  function selectedConfirmationPaymentMethod() {
    return paymentChoiceInputs.find((input) => input.checked)?.value || "online";
  }

  function updateConfirmationPaymentChoice() {
    if (selectedConfirmationPaymentMethod() === "bank_transfer") {
      confirmationPaymentTitle.textContent = "振込先を確認してから最終確定できます";
      confirmationPaymentNote.textContent = "次の操作では実際の振込先を表示するだけで、申込はまだ確定しません。表示後に銀行振込で確定するか、カード等へ選び直せます。";
      confirmApplicationButton.textContent = "振込先を確認する（まだ確定しません）";
    } else {
      confirmationPaymentTitle.textContent = "カード・スマホ決済等でお支払い";
      confirmationPaymentNote.textContent = "安全な外部決済画面へ移動します。お支払い完了後に申込完了となります。Visa、Mastercard、American Express、Apple Pay、Google Payを選択できます。JCB、Diners Club、Discoverはご利用いただけません。";
      confirmApplicationButton.textContent = "決済画面へ進む（決済後に申込完了）";
    }
  }

  function renderBankTransferPreview(details) {
    document.getElementById("bank-preview-amount").textContent = formatYen(details.amount);
    document.getElementById("bank-preview-bank").textContent = [details.bank_name, details.bank_code ? `（銀行コード ${details.bank_code}）` : ""].filter(Boolean).join(" ");
    document.getElementById("bank-preview-branch").textContent = [details.branch_name, details.branch_code ? `（支店コード ${details.branch_code}）` : ""].filter(Boolean).join(" ");
    document.getElementById("bank-preview-account-type").textContent = bankAccountTypeLabel(details.account_type);
    document.getElementById("bank-preview-account-number").textContent = details.account_number;
    document.getElementById("bank-preview-account-holder").textContent = details.account_holder_name;
  }

  function bankAccountTypeLabel(value) {
    const labels = { futsu: "普通", toza: "当座", savings: "貯蓄" };
    return labels[value] || value || "普通";
  }

  function clearBankTransferPreview() {
    bankPreviewToken = "";
    bankPreviewDetails = null;
    bankTransferPreview.hidden = true;
    paymentChoice.hidden = false;
    confirmationActions.hidden = false;
  }

  async function cancelBankPreview() {
    if (!bankPreviewToken || !pendingPayload) return;
    try {
      const payload = clonePendingPayload();
      payload.action = "cancel_bank_preview";
      payload.payment_method = "bank_transfer";
      payload.bank_preview_token = bankPreviewToken;
      await postApplication(payload);
    } catch (error) {
      console.warn("Bank transfer preview cancellation failed.", error);
    }
  }

  function resetTurnstile() {
    turnstileToken = "";
    if (window.turnstile?.reset) window.turnstile.reset();
  }

  function formatYen(amount) {
    return `${Number(amount || 0).toLocaleString("ja-JP")}円`;
  }

  function setStep(current) {
    const order = ["entry", "confirm", "payment", "complete"];
    const currentIndex = order.indexOf(current);
    order.forEach((step, index) => {
      const item = document.getElementById(`step-${step}`);
      if (!item) return;
      item.classList.toggle("is-current", index === currentIndex);
      item.classList.toggle("is-complete", index < currentIndex);
      if (index === currentIndex) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }

  function setConfirmationMessage(text, kind) {
    confirmationMessage.hidden = false;
    confirmationMessage.textContent = text;
    confirmationMessage.dataset.kind = kind;
  }

  function updateFeePreview() {
    const data = new FormData(form);
    const payload = formPayload(data);
    const amount = calculateAmount(payload);
    feePreview.textContent = `お支払い予定額: ${amount.toLocaleString("ja-JP")}円`;
  }

  function updateStripeAvailability(config) {
    const stripeMode = config.stripe_mode || "not_configured";
    const isAvailable = stripeMode === "live" || stripeMode === "sandbox";
    const isSandbox = stripeMode === "sandbox";
    stripeAvailable = isAvailable;
    if (stripePaymentStatus) stripePaymentStatus.textContent = isSandbox ? "テスト環境" : isAvailable ? "支払い方法を見る" : "準備中";
    if (stripePaymentHelp) {
      stripePaymentHelp.textContent = isAvailable
        ? "確認後、安全な外部決済画面へ移動します。表示された支払い方法から選択してください。"
        : "現在オンライン決済を準備中です。ご利用開始までお待ちください。";
    }
    if (environmentBanner) {
      environmentBanner.hidden = !(isSandbox || window.location.hostname.includes("-staging"));
    }
  }

  function applyFeePeriod(period, labels) {
    const normalized = ["early", "year_end", "regular"].includes(period) ? period : "regular";
    feePeriod.value = normalized;
    feePeriodDisplay.value = labels[normalized] || feePeriodLabels[normalized];
    updatePlanDetails();
    updateFeePreview();
  }

  function feePeriodForNow() {
    return sharedFeePeriodForDate(new Date());
  }

  function applicationOpenForNow() {
    return REGISTRATION_STATUS === "open" && Date.now() <= new Date(APPLICATION_DEADLINE_ISO).getTime();
  }

  function updateApplicationDeadline(config) {
    applicationStatus = config.application_status || REGISTRATION_STATUS;
    applicationOpen = config.application_open ?? applicationOpenForNow();
    reviewApplicationButton.disabled = !applicationOpen;
    const checkoutCompleted = checkoutState.get("checkout") === "success";
    registrationComingSoon.hidden = applicationOpen || checkoutCompleted;
    registrationSteps.hidden = !applicationOpen && !checkoutCompleted;
    if (!checkoutCompleted) entryPanel.hidden = !applicationOpen;
    if (!applicationOpen && applicationStatus !== "coming_soon" && !checkoutCompleted) {
      setMessage("参加申込は2027年1月31日をもって締め切りました。変更や確認はFESTA事務局へお問い合わせください。", "error");
    }
  }

  function validatePayload(payload) {
    const errors = [];
    if (![payload.family_name, payload.given_name, payload.family_name_kana, payload.given_name_kana].every((value) => String(value || "").trim())) {
      errors.push("姓・名と、それぞれのふりがなを入力してください。");
    }
    if (!payload.cancellation_policy_consent) {
      errors.push("キャンセル・返金規定への同意が必要です。");
    }
    const graduationYear = Number(payload.graduation_year || 0);
    const isAbsentDonation = Object.hasOwn(absentDonationTotals, payload.ticket_type);
    const isGakushuin = payload.school_lineage === "gakushuin_ouyukai";
    const isStaffApplication = staffMode && staffTicketTypes.includes(payload.ticket_type);
    if (isStaffApplication && !String(payload.staff_access_code || "").trim()) {
      errors.push("役員・お手伝い用アクセスコードを入力してください。");
    }
    if (!["tus_obog", "gakushuin_ouyukai"].includes(payload.school_lineage)) {
      errors.push("所属区分を選択してください。");
    }
    if (!isGakushuin && !graduationYear) {
      errors.push("東京理科大学舞踏研究部OBOGは卒部年度を入力してください。");
    }
    if (graduationYear && (!Number.isInteger(graduationYear) || graduationYear < 1900 || graduationYear > 2026)) {
      errors.push("卒部年度は1900〜2026の西暦4桁で入力してください。");
    }
    if (!isGakushuin && graduationYear > obogFiveUnderTo) {
      errors.push("卒部年次区分は2026年4月1日時点を基準としています。2026年度卒部予定の方は現役生区分となるため、FESTA事務局へお問い合わせください。");
    }
    if (!isStaffApplication && !isGakushuin && !isAbsentDonation && payload.ticket_type === "obog" && graduationYear > obogElevenOverTo) {
      errors.push(`一般OBOG（11年目以上）は${obogElevenOverTo}年度以前の卒部を対象とします。参加費区分または卒部年度を確認してください。`);
    }
    if (!isStaffApplication && !isGakushuin && !isAbsentDonation && payload.ticket_type === "obog_6_10" && (graduationYear < obogSixTenFrom || graduationYear > obogSixTenTo)) {
      errors.push(`OBOG 6〜10年目は${obogSixTenFrom}〜${obogSixTenTo}年度に卒部した方を想定しています。参加費区分または卒部年度を確認してください。`);
    }
    if (!isStaffApplication && !isGakushuin && !isAbsentDonation && payload.ticket_type === "obog_5_under" && (graduationYear < obogFiveUnderFrom || graduationYear > obogFiveUnderTo)) {
      errors.push(`OBOG 1〜5年目は${obogFiveUnderFrom}〜${obogFiveUnderTo}年度に卒部した方を対象とします。参加費区分または卒部年度を確認してください。`);
    }
    if (payload.support_tier && payload.support_tier !== "none" && !["obog", "obog_6_10", "obog_5_under", ...staffTicketTypes].includes(payload.ticket_type)) {
      errors.push("参加者向け支援プランはOBOG区分で選択してください。");
    }
    const isDonor = isAbsentDonation || payload.support_tier !== "none";
    if (isDonor && !String(payload.phone || "").trim()) {
      errors.push("寄付・サポータープランのお申し込みには電話番号が必要です。");
    }
    if (isDonor && payload.supporter_publication_consent && !payload.supporter_anonymous && !String(payload.supporter_publication_name || "").trim()) {
      errors.push("氏名掲載に同意する場合は掲載名を入力してください。");
    }
    if (String(payload.supporter_message || "").length > 50) {
      errors.push("プラチナサポーター応援メッセージは50字以内で入力してください。");
    }
    if (payload.support_tier !== "platinum" && payload.supporter_message) {
      errors.push("応援メッセージはプラチナプランでのみ入力できます。");
    }
    if (isDonor && normalizePostalCode(payload.postal_code).length !== 7) {
      errors.push("寄付のお申し込みには7桁の郵便番号が必要です。");
    }
    if (isDonor && ![payload.prefecture, payload.city, payload.street_address].every((value) => String(value || "").trim())) {
      errors.push("寄付のお申し込みには都道府県、市区町村・町域、番地が必要です。");
    }
    payload.companions.forEach((companion, index) => {
      if (!companion.full_name || !companion.relationship || !companion.attendee_type) {
        errors.push(`同伴者${index + 1}の氏名、続柄・関係、同伴者属性を入力してください。`);
      }
      if (!["attending", "without_reception"].includes(companion.reception_attendance)) {
        errors.push(`同伴者${index + 1}の懇親会参加有無を選択してください。`);
      }
      if (payload.reception_attendance === "without_reception" && companion.reception_attendance === "attending") {
        errors.push(`申込者本人が懇親会に参加しない場合、同伴者${index + 1}のみの懇親会参加は選べません。`);
      }
      if (!companion.non_obog_confirmed) {
        errors.push(`同伴者${index + 1}がOBOGではないことを確認してください。`);
      }
      if (companion.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companion.email)) {
        errors.push(`同伴者${index + 1}のメールアドレスを確認してください。`);
      }
    });
    return errors;
  }

  function calculateAmount(payload) {
    const pricedPayload = { ...payload, ticket_type: normalizeTicketType(payload.ticket_type, payload.support_tier) };
    return lineItemsTotal(buildPaymentLineItems(pricedPayload, payload.companions || [], activePricingVersion));
  }

  function attendeePlanAmount(plan, attendeeType, period, reception = "attending") {
    return sharedAttendingPlanAmount(plan, attendeeType, period, reception, activePricingVersion);
  }

  function applicationPeriodDiscount(period) {
    if (period === "early") return 2000;
    if (period === "year_end") return 1000;
    return 0;
  }

  function graduationDiscount(attendeeType) {
    const publicType = publicTicketType(attendeeType);
    if (publicType === "obog_6_10") return 2000;
    if (publicType === "obog_5_under") return 4000;
    return 0;
  }

  function staffParticipationAmount(attendeeType, period, reception) {
    return sharedStaffParticipationAmount(attendeeType, period, reception, activePricingVersion);
  }

  function publicTicketType(attendeeType) {
    return publicBaseTicketType(attendeeType);
  }

  function staffTicketType(attendeeType) {
    if (attendeeType === "obog_6_10") return "obog_staff_6_10";
    if (attendeeType === "obog_5_under") return "obog_staff_5_under";
    return "obog_staff";
  }

  function noReceptionDiscount(reception) {
    return sharedNoReceptionDiscount(reception, activePricingVersion);
  }

  function danceTicketUnitAmount(plan) {
    return attendingPlanTicketUnits[plan] || 300;
  }

  function setMessage(text, kind) {
    message.hidden = false;
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function showCheckoutSuccess() {
    const applicationId = checkoutState.get("application") || "確認中";
    registrationComingSoon.hidden = true;
    entryPanel.hidden = true;
    confirmationPanel.hidden = true;
    completionPanel.hidden = false;
    document.getElementById("completion-title").textContent = "お支払いが完了し、申込が完了しました。";
    document.getElementById("completion-guide").textContent = `受付番号：${applicationId}`;
    document.getElementById("completion-status").textContent = "参加確定メールをお送りします。メールが届かない場合は、受付番号を添えてFESTA事務局へお問い合わせください。";
    document.getElementById("complete-application-id").textContent = applicationId;
    document.getElementById("complete-amount").closest("div").hidden = true;
    document.getElementById("complete-payment-method").textContent = "カード・スマホ決済等";
    document.getElementById("completion-payment-link").hidden = true;
    setStep("complete");
    completionPanel.scrollIntoView({ block: "start" });
  }

  function renderCompletion(result, payload) {
    const application = result.application || {};
    const payment = result.payment || {};
    const applicationId = application.applicationId || application.application_code || payment.applicationId || "";
    const amount = Number(application.amount || application.total_amount_jpy || payment.amount || 0);
    const isAbsentDonation = Object.hasOwn(absentDonationTotals, payload.ticket_type);
    document.getElementById("completion-title").textContent = isAbsentDonation
      ? "寄付のお申し込みありがとうございます。"
      : "お申し込みありがとうございます。";
    document.getElementById("completion-status").textContent = isAbsentDonation
      ? "入金確認後に、寄付受付完了メールをお送りします。"
      : "入金確認後に、参加確定メールをお送りします。";
    document.getElementById("complete-application-id").textContent = applicationId;
    document.getElementById("complete-amount").textContent = `${amount.toLocaleString("ja-JP")}円`;
    document.getElementById("complete-payment-method").textContent = paymentMethodLabel(payload.payment_method);
    const paymentLink = document.getElementById("completion-payment-link");
    const bankInstructions = document.getElementById("complete-bank-instructions");
    if (payload.payment_method === "bank_transfer" && payment.hostedInstructionsUrl) {
      bankInstructions.href = payment.hostedInstructionsUrl;
      paymentLink.hidden = false;
      document.getElementById("completion-guide").textContent = "受付番号を発行しました。表示した振込先へお支払いください。振込案内はメールでもお送りします。";
    } else {
      paymentLink.hidden = true;
    }
  }
})();
