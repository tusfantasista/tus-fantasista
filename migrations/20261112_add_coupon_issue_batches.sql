CREATE TABLE IF NOT EXISTS coupon_issue_batches (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE CHECK (request_id = lower(request_id)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
  coupon_count INTEGER NOT NULL CHECK (coupon_count BETWEEN 1 AND 100),
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  starts_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_issue_batch_items (
  batch_id TEXT NOT NULL REFERENCES coupon_issue_batches(id),
  coupon_id TEXT NOT NULL UNIQUE REFERENCES festa60_coupons(id),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 99),
  PRIMARY KEY (batch_id, position)
);
