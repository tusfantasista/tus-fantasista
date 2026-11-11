-- Run after add_coupon_redemptions, before accepting single-use applications.
-- An application consumes its code even when later cancelled or refunded.
WITH historical AS (
  SELECT a.id AS application_id, a.application_code, a.client_submission_id,
    COALESCE(NULLIF(a.created_at, ''), '1970-01-01T00:00:00.000Z') AS applied_at,
    upper(trim(CASE WHEN json_valid(p.metadata_json) THEN
      CASE WHEN json_type(p.metadata_json, '$.coupon_code') = 'text'
        AND json_extract(p.metadata_json, '$.coupon_type') = 'early_fee'
      THEN json_extract(p.metadata_json, '$.coupon_code') END
    END)) AS code
  FROM applications a JOIN payment_line_items p ON p.application_id = a.id
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY code ORDER BY applied_at, application_id) AS code_order
  FROM historical WHERE code IS NOT NULL AND length(code) BETWEEN 1 AND 64
    AND code NOT GLOB '*[^A-Z0-9_-]*'
), first_use AS (
  SELECT *, COALESCE(NULLIF(lower(trim(client_submission_id)), ''), 'legacy-' || application_id) AS candidate_owner
  FROM ranked WHERE code_order = 1
), owners AS (
  SELECT *, count(*) OVER (PARTITION BY candidate_owner) AS owner_codes FROM first_use
)
INSERT OR IGNORE INTO coupon_redemptions
  (code, owner, payload_hash, preview_id, application_id, application_code, reserved_at, used_at)
SELECT code,
  CASE WHEN owner_codes = 1 THEN candidate_owner
    ELSE 'legacy-' || application_id || '-' || code END,
  'legacy', NULL, application_id, COALESCE(application_code, 'legacy-' || application_id), applied_at, applied_at
FROM owners;
