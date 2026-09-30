import { readFile } from "node:fs/promises";

const files = {
  worker: await readFile(new URL("../public/_worker.js", import.meta.url), "utf8"),
  festaHome: await readFile(new URL("../public/festa-60th/index.html", import.meta.url), "utf8"),
  festaSupport: await readFile(new URL("../public/festa-60th/support/index.html", import.meta.url), "utf8"),
  festaFaq: await readFile(new URL("../public/festa-60th/faq/index.html", import.meta.url), "utf8"),
  register: await readFile(new URL("../public/festa60-register/index.html", import.meta.url), "utf8"),
  registerScript: await readFile(new URL("../public/assets/js/festa60-register.js", import.meta.url), "utf8"),
  publicSummaryScript: await readFile(new URL("../public/assets/js/festa60-public-summary.js", import.meta.url), "utf8"),
  pricing: await readFile(new URL("../public/assets/js/festa60-pricing.js", import.meta.url), "utf8"),
  pricingMigration: await readFile(new URL("../migrations/20260810_add_pricing_supporter_publication.sql", import.meta.url), "utf8"),
  migration: await readFile(new URL("../migrations/20260808_harden_bank_transfer_flow.sql", import.meta.url), "utf8"),
  design: await readFile(new URL("../docs/FESTA60_REGISTRATION_PAYMENT_DESIGN.md", import.meta.url), "utf8"),
  pricingDesign: await readFile(new URL("../docs/FESTA60_PRICING_DONATION_DESIGN.md", import.meta.url), "utf8")
};

function applicationInsertPlaceholderCount(worker) {
  const match = worker.match(/INSERT INTO applications \([\s\S]*?\) VALUES \(([?\s,]+)\)`/);
  return match ? (match[1].match(/\?/g) || []).length : 0;
}

function applicationInsertColumnCount(worker) {
  const match = worker.match(/INSERT INTO applications \(([\s\S]*?)\) VALUES/);
  return match ? match[1].split(",").map((column) => column.trim()).filter(Boolean).length : 0;
}

const checks = [
  ["application insert columns and bindings match", applicationInsertColumnCount(files.worker) === applicationInsertPlaceholderCount(files.worker)],
  ["raw server errors are hidden from applicants", files.registerScript.includes('message === "server_error"') && files.registerScript.includes("処理を完了できませんでした。時間をおいて再度お試しいただくか、FESTA事務局へお問い合わせください。")],
  ["preview mapping table", files.migration.includes("CREATE TABLE IF NOT EXISTS bank_transfer_previews")],
  ["PaymentIntent uniqueness", files.migration.includes("idx_payments_stripe_payment_intent_unique")],
  ["submission idempotency", files.migration.includes("idx_applications_client_submission_unique") && files.registerScript.includes("crypto.randomUUID()")],
  ["preview persisted before response", files.worker.includes("persistBankTransferPreview(db, payload, preview")],
  ["bank preview confirms with customer balance method", files.worker.includes('params.set("payment_method_data[type]", "customer_balance")')],
  ["failed bank preview cleans up customer", files.worker.includes("deleteBankTransferPreviewCustomer(stripeSecret, customer.id)")],
  ["expired previews are claimed before cleanup", files.worker.includes("claimExpiredBankTransferPreview") && files.worker.includes("status = 'cleanup_in_progress'")],
  ["expired preview cleanup protects funds", files.worker.includes("bank_preview.cleanup_protected_funds") && files.worker.includes("observedBankPreviewFunding")],
  ["expired preview cleanup cancels intent and customer", files.worker.includes("bank_preview.expired_cancelled") && files.worker.includes("expired_cancelled")],
  ["expired preview cleanup runs in background", files.worker.includes("scheduleExpiredBankTransferPreviewCleanup(waitUntil, env, db)") && files.worker.includes("waitUntil(cleanupExpiredBankTransferPreviews")],
  ["explicit bank cancellation cleans up customer", files.worker.includes("cancelled_cleanup_pending") && files.worker.includes("switched_cleanup_pending")],
  ["cleanup failures are visible to admins", files.worker.includes("'cleanup_failed', 'cancelled_cleanup_pending', 'switched_cleanup_pending'")],
  ["bank preview cleanup settings are configurable", files.worker.includes('"BANK_PREVIEW_TTL_MINUTES"') && files.worker.includes('"BANK_PREVIEW_CLEANUP_GRACE_MINUTES"') && files.worker.includes('"BANK_PREVIEW_CLEANUP_BATCH_SIZE"')],
  ["bank preview failure is user friendly", files.worker.includes('error: "bank_transfer_unavailable"')],
  ["funded preview cannot switch", files.worker.includes("bank_transfer_already_funded")],
  ["pre-confirmation funding tracked", files.worker.includes("paid_before_confirmation") && files.worker.includes("funds_received_before_confirmation")],
  ["partial funding handled", files.worker.includes('event.type === "payment_intent.partially_funded"')],
  ["unreconciled cash handled", files.worker.includes('event.type === "cash_balance.funds_available"')],
  ["confirmation email retryable", files.worker.includes("sendPaymentEmailOnce(env, db, application, \"confirmed\"")],
  ["confirmation email explains separate receipt", files.worker.match(/\\u9818\\u53CE\\u66F8\\u30E1\\u30FC\\u30EB\\u306F/g)?.length === 2 && files.worker.includes("\\u6C7A\\u6E08\\u4EE3\\u884C\\u30B5\\u30FC\\u30D3\\u30B9\\u304B\\u3089\\u5225\\u9014")],
  ["public pages do not call bank transfer unavailable", !files.festaHome.includes("銀行振込は現在準備中") && !files.register.includes("銀行振込は現在準備中")],
  ["bank instructions tracked", files.worker.includes("renderBankTransferInstructionsEmail") && files.worker.includes('kind === "instructions"')],
  ["online application completes after payment", files.registerScript.includes("お支払いが完了し、申込が完了しました") && files.registerScript.includes("申込は完了していません")],
  ["registration is open in shared server and browser configuration", files.pricing.includes('REGISTRATION_STATUS = "open"') && files.worker.includes("application_open: isApplicationOpen()")],
  ["extended early period is shared", files.pricing.includes('early: "超早期申込（2026年10月31日まで）"') && files.pricing.includes('year_end: "早期申込（2026年11月1日〜12月31日）"') && files.registerScript.includes("sharedFeePeriodForDate")],
  ["public payment methods name supported and unavailable brands", files.register.includes("Visa、Mastercard、American Express") && files.register.includes("JCB、Diners Club、Discoverはご利用いただけません") && files.festaSupport.includes("JCB、Diners Club、Discoverはご利用いただけません") && files.festaFaq.includes("JCB、Diners Club、Discoverはご利用いただけません")],
  ["no pre-payment online email", files.worker.includes('reason: "Sent only after payment confirmation."') && !files.worker.includes("renderApplicationReceivedEmail")],
  ["preview transfer warning", files.register.includes("この画面の口座へは、まだ振り込まないでください")],
  ["public bank instructions explain virtual account", files.festaSupport.includes("振込専用の仮想口座（VBAN：Virtual Bank Account）") && files.festaFaq.includes("振込専用の仮想口座（VBAN：Virtual Bank Account）") && files.register.includes("振込専用の仮想口座（VBAN）")],
  ["public bank instructions explain different account holder", files.festaSupport.includes("銀行名、支店名、口座名義がOBOG会と異なります") && files.festaFaq.includes("銀行名、支店名、口座名義はOBOG会と異なります") && files.register.includes("口座名義がOBOG会と異なっていても")],
  ["bank emails explain virtual account", files.worker.includes("function bankVirtualAccountNotice()") && files.worker.match(/\$\{bankVirtualAccountNotice\(\)\}/g)?.length === 4],
  ["bank actions pass payment validation", files.worker.includes('const bankTransferActions = ["preview_bank_transfer", "confirm_bank_transfer", "cancel_bank_preview"]') && files.worker.includes('validateApplication(payload, env, action)')],
  ["validation errors identify fields", files.registerScript.includes("formatApplicationError(result)") && files.registerScript.includes("確認が必要な項目")],
  ["cohort baseline is fixed", files.pricing.includes("graduation_year_from: 2021, graduation_year_to: 2025") && files.register.includes("2026年4月1日時点で固定")],
  ["staff discounts applied before half", files.pricing.includes("BASE_FEES.obog.regular - staffApplicationPeriodDiscount(feePeriod) - staffGraduationDiscount(baseTicketType)") && files.registerScript.includes("staffParticipationAmount(")],
  ["staff no-reception deduction applied after half", files.pricing.includes("Math.round(discountedParticipationFee * 0.5) - noReceptionDiscount") && files.registerScript.includes("staffParticipationAmount(")],
  ["worker and browser share pricing module", files.worker.includes('from "./assets/js/festa60-pricing.js"') && files.registerScript.includes('from "./festa60-pricing.js')],
  ["new pricing is versioned", files.pricing.includes('CURRENT_PRICING_VERSION = "festa60-2026-v2"') && files.pricing.includes("no_reception_discount_jpy: 4000")],
  ["legacy pricing remains available", files.pricing.includes('LEGACY_PRICING_VERSION = "festa60-2026-v1"') && files.pricing.includes("no_reception_discount_jpy: 2000")],
  ["pricing version is stored", files.pricingMigration.includes("pricing_version TEXT") && files.worker.includes("pricing_version")],
  ["donation equivalent is stored", files.pricingMigration.includes("donation_equivalent_jpy INTEGER") && files.worker.includes("donationEquivalentForTicket")],
  ["public summary excludes unpaid and cancelled records", files.worker.includes("payment_status = 'paid'") && files.worker.includes("cancelled_at IS NULL") && files.worker.includes("refunded_at IS NULL")],
  ["public summary exposes no direct identifiers", files.worker.includes("participant_count_visible") && !files.worker.includes("publicSummary.email") && !files.worker.includes("publicSummary.address")],
  ["public count threshold is configurable", files.worker.includes("PUBLIC_PARTICIPANT_COUNT_THRESHOLD") && files.pricing.includes("participant_count_public_threshold: 20")],
  ["public attendance target is centralized", files.pricing.includes("participant_target_count: 120") && files.worker.includes("participant_target_count: participantTarget")],
  ["companions are not treated as supporters", files.worker.includes("companionCount += Number(row.companion_count || 0)") && files.worker.includes("if (hasPlanSupport || additionalDonationJpy > 0) supporterCount += 1")],
  ["additional donations move public progress", files.worker.includes("additional_donation_jpy") && files.worker.includes("donationEquivalentJpy += Number(row.donation_equivalent_jpy || 0) + additionalDonationJpy") && files.publicSummaryScript.includes('additional_donation: "追加寄付"')],
  ["public summary has two movements", files.festaHome.includes("再会のムーブメント") && files.festaHome.includes("次の挑戦へのムーブメント") && files.festaSupport.includes("再会のムーブメント")],
  ["fundraising goal is amount based", !files.pricing.includes("platinum_supporter_target_count") && !files.festaHome.includes("プラチナサポーター目標")],
  ["supporter publication defaults to private", files.pricingMigration.includes("supporter_publication_consent INTEGER NOT NULL DEFAULT 0") && files.pricingMigration.includes("supporter_anonymous INTEGER NOT NULL DEFAULT 1")],
  ["older applications can receive a consent row", files.worker.includes("INSERT INTO consents") && files.worker.includes("consent_type = 'supporter_publication'")],
  ["pricing release order is documented", files.pricingDesign.includes("Do not deploy code that reads the new columns before the migration is applied") && files.pricingDesign.includes("Existing confirmed applications are never recalculated in bulk")],
  ["bank amount correction requires staff application", files.worker.includes("Only staff applications can use this amount correction.")],
  ["bank amount correction rejects received funds", files.worker.includes("Only an unpaid bank transfer with no received funds can be adjusted.") && files.worker.includes("Stripe has already received funds for this PaymentIntent.")],
  ["bank amount correction confirms application code", files.worker.includes("Application code confirmation does not match.")],
  ["bank amount correction recalculates stored application", files.worker.includes("requestedAmount !== calculatedAmount") && files.worker.includes("payment.bank_transfer_amount_adjusted")],
  ["bank amount correction rolls back Stripe on D1 failure", files.worker.includes("festa60-bank-adjust-rollback-")],
  ["bank amount correction reconfirms PaymentIntent", files.worker.includes("festa60-bank-adjust-confirm-") && files.worker.includes("confirmStripePaymentIntent")],
  ["bank instructions URL refreshed in D1", files.worker.includes("hosted_instructions_url = ?, updated_at = ?")],
  ["admin can refresh bank instructions", files.worker.includes('payload.action === "refresh_bank_transfer_instructions"') && files.worker.includes("payment.bank_transfer_instructions_refreshed")],
  ["refreshed bank instructions can be resent", files.worker.includes("renderBankTransferInstructionsRefreshedEmail") && files.worker.includes("銀行振込先・お支払い手順（再発行）")],
  ["refunded card repayment verifies Stripe refund", files.worker.includes("isStripeChargeFullyRefunded(charge)") && files.worker.includes("Stripe has not confirmed a full refund for the original payment.")],
  ["refunded card repayment requires application code", files.worker.includes('payload.action === "reissue_refunded_card_payment"') && files.worker.includes("confirmedApplicationCode !== application.application_code")],
  ["refunded card repayment stays linked", files.worker.includes("repayment_for_payment_id") && files.worker.includes("payment.card_repayment_issued")],
  ["refunded card repayment email uses office delivery", files.worker.includes("renderRefundRepaymentEmail") && files.worker.includes("await maybeSendEmail(env")],
  ["preview omits actionable hosted link", !files.register.includes('id="bank-preview-instructions"')],
  ["design covers six issues", [1, 2, 3, 4, 5, 6].every((number) => files.design.includes(`| ${number} |`))]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failed.length) process.exitCode = 1;
