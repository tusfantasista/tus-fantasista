CREATE TABLE IF NOT EXISTS application_plan_upgrade_deposits (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  from_ticket_type TEXT NOT NULL,
  to_ticket_type TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  amount_jpy INTEGER NOT NULL CHECK (amount_jpy = 10000),
  status TEXT NOT NULL CHECK (status IN ('prepared', 'applied', 'review', 'refunded')),
  refunded_amount_jpy INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_jpy BETWEEN 0 AND amount_jpy),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT
);

ALTER TABLE application_plan_upgrades
  ADD COLUMN deposit_id TEXT REFERENCES application_plan_upgrade_deposits(id);

CREATE UNIQUE INDEX IF NOT EXISTS application_plan_upgrades_deposit_id_unique
  ON application_plan_upgrades(deposit_id);
