CREATE TABLE IF NOT EXISTS coupon_redemptions (
  code TEXT PRIMARY KEY NOT NULL
    CHECK (length(code) BETWEEN 1 AND 64 AND code = upper(code) AND code NOT GLOB '*[^A-Z0-9_-]*'),
  owner TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL CHECK (payload_hash = 'legacy'
    OR (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*')),
  preview_id TEXT UNIQUE,
  application_id TEXT,
  application_code TEXT,
  reserved_at TEXT NOT NULL,
  used_at TEXT,
  CHECK ((used_at IS NULL AND application_id IS NULL AND application_code IS NULL)
    OR (used_at IS NOT NULL AND application_id IS NOT NULL AND application_code IS NOT NULL))
);
