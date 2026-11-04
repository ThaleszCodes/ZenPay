ALTER TABLE zenpay_sellers ADD COLUMN IF NOT EXISTS neon_identity text;
CREATE UNIQUE INDEX IF NOT EXISTS zenpay_sellers_neon_identity_idx ON zenpay_sellers(neon_identity);
