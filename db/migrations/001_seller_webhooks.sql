ALTER TABLE zenpay_sellers
  ADD COLUMN IF NOT EXISTS webhook_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted text;

CREATE UNIQUE INDEX IF NOT EXISTS zenpay_sellers_webhook_id_idx ON zenpay_sellers(webhook_id);
