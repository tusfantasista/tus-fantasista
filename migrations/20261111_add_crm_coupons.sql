CREATE TABLE IF NOT EXISTS festa60_coupons (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE
    CHECK (length(code) BETWEEN 1 AND 64 AND code = upper(code) AND code NOT GLOB '*[^A-Z0-9_-]*'),
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  starts_at TEXT,
  expires_at TEXT NOT NULL,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
