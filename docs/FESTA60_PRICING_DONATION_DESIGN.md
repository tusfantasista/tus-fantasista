# FESTA60 Pricing and Donation Design

## Purpose

This document defines the pricing, donation, supporter-publication, and public-summary behavior for the 60th FESTA application system. It is the operational reference for the browser form, Cloudflare Worker, Stripe Checkout, Stripe bank transfer, confirmation email, administrator dashboard, and CSV export.

## Source of truth

- Shared pricing and fundraising settings: `public/assets/js/festa60-pricing.js`
- Server-side validation and payment creation: `public/_worker.js`
- D1 schema extension: `migrations/20260810_add_pricing_supporter_publication.sql`
- Browser preview: `public/assets/js/festa60-register.js`

The browser preview is informational. The Worker always replaces the submitted fee period and pricing version with server settings, rebuilds every line item, and sends only the server-calculated amount to Stripe.

## Price-rule versions

| Version | New applications | No-reception deduction | Adult companion, first part only |
|---|---|---:|---:|
| `festa60-2026-v1` | Before the configured changeover | 2,000 yen | 6,000 yen |
| `festa60-2026-v2` | At or after the configured changeover | 4,000 yen | 4,000 yen |

The default v2 changeover is `2026-08-10T00:00:00+09:00`. Cloudflare may override it with `PRICING_RULE_EFFECTIVE_AT`. Every new application and bank-transfer preview stores `pricing_version` and `pricing_effective_at`.

Existing confirmed applications are never recalculated in bulk. A record without `pricing_version` is treated as v1 only when an explicit administrative operation must reconstruct its amount. Its stored confirmed amount remains authoritative.

## Current participant pricing

The five plan bases are 15,000, 20,000, 30,000, 50,000, and 100,000 yen. Application-period and graduation-cohort discounts are shared by all five plans. Selecting first part only applies an additional 4,000-yen deduction after those discounts.

Companions are separate line items. Adults cost 8,000 yen with the reception or 4,000 yen for the first part only. Elementary-school children remain 3,000 or 1,000 yen. Preschool children remain free and are stored for attendance counts even though no payment line item is created.

## Donation equivalents

Donation progress uses only the configured donation equivalent, never the full plan payment:

| Plan | Donation equivalent | Dance-ticket face value |
|---|---:|---:|
| Bronze | 3,500 yen | 300 yen x 5 |
| Silver | 10,200 yen | 400 yen x 12 |
| Gold | 25,000 yen | 500 yen x 20 |
| Platinum | 70,000 yen | 600 yen x 25 |
| Absent Standard | 5,000 yen | - |
| Absent Advance | 10,000 yen | - |
| Absent Premium | 30,000 yen | - |

An `additional_donation` payment line item contributes its entire amount. Participant fees, companion fees, and dance-ticket face values are excluded. Dance-ticket face value is separately returned 100% to the active student who danced.

## Fundraising targets

Targets and allocations are read from `FUNDRAISING_CONFIG`. The first target is 600,000 yen; markers continue at 1,000,000, 1,350,000, 1,500,000, and 1,800,000 yen. The FM-dress marker can be changed in one settings object after a formal estimate is obtained.

The operating principle is approximately two-thirds for active-student support and one-third for FESTA enhancement. FM dresses are the first support priority. Remaining support funds are accumulated before equipment such as mirrors is considered.

## Supporter publication

New supporter fields default to non-public for existing and unanswered records. A public name is returned only when both publication consent is true and anonymous preference is false. Email, phone, address, application code, and internal identifiers are never returned by the public summary endpoint.

Administrators may update consent, publication name, maiden-name display, joint-name preference, anonymity, badge preference, and the platinum message from the protected dashboard. A corresponding consent row is inserted when an older application does not yet have one.

## Public summary

`GET /api/festa60/public-summary` includes only applications that satisfy all of these conditions:

- payment status is neither cancelled nor refunded (unpaid and pending are included)
- no cancellation timestamp
- no refund timestamp
- status is neither cancelled nor refunded

Active stored applications contribute before payment, including unpaid bank transfers. Participant counts, support-plan counts, and donation-equivalent totals use the same scope. Anonymous supporters still contribute to counts and donation totals. OBOG participant counts, companion counts, participating graduation decades, and donation progress are visible from zero. The former 20-person gate was removed on 2026-10-12; `PUBLIC_PARTICIPANT_COUNT_THRESHOLD` no longer overrides the shared zero threshold. A zero-participant state explicitly states that no participation applications have been received.

The participation target of 120 includes OBOG applicants and companions. Both the progress bar and the remaining target count use their combined total; the two counts are still displayed separately. Absent donors do not contribute to the attendance target.

The public summary also returns `participating_decade_counts` as chronologically sorted `{ decade, count }` aggregates for OBOG applicants with a known graduation year. Companions and absent donors do not contribute to these counts. The homepage places the summary immediately after the main visual and links to it from the main CTA and the Guide menu. Decade labels grow in font size with their relative participant count, with an explicit numeric count beside every label.

The endpoint is aggregate-only, with an explicit-consent supporter list as the sole exception. CDN caching is allowed for five minutes with stale-while-revalidate behavior.

## Migration and release order

1. Back up the target D1 database.
2. Apply `migrations/20260810_add_pricing_supporter_publication.sql` to staging.
3. Deploy the reviewed commit to staging once.
4. Test all pricing combinations, both payment methods, webhook confirmation, email, dashboard, CSV, and public summary.
5. Confirm old paid records retain their stored amount and remain non-public by default.
6. After explicit production approval, back up production D1 and apply the same migration.
7. Set or verify `PRICING_RULE_EFFECTIVE_AT`. Confirm public participation progress is visible below 20 participants.
8. Deploy the exact reviewed commit and complete a low-value end-to-end payment check.

Do not deploy code that reads the new columns before the migration is applied.

## Incident rules

- Do not edit a paid historical amount to match current prices.
- Do not accept an amount supplied by the browser.
- Do not include unpaid, cancelled, or refunded records in public progress.
- Do not make an old supporter public without explicit consent.
- If an application must change plan after payment, record the additional payment as a separate line item and preserve the original application/payment audit trail.
