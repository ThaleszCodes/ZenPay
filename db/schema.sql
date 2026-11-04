CREATE TABLE IF NOT EXISTS zenpay_sellers (
 id text PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', store_name text NOT NULL DEFAULT '', whatsapp text NOT NULL DEFAULT '', api_key_encrypted text, api_key_hint text, environment text NOT NULL DEFAULT 'production' CHECK(environment IN ('production','sandbox')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zenpay_products (
 id uuid PRIMARY KEY, seller_id text NOT NULL REFERENCES zenpay_sellers(id), name text NOT NULL, description text NOT NULL DEFAULT '', price integer NOT NULL CHECK(price>0), cover_url text NOT NULL DEFAULT '', delivery_url text NOT NULL DEFAULT '', delivery_text text NOT NULL DEFAULT '', file_name text, file_data text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zenpay_products_seller ON zenpay_products(seller_id);
CREATE TABLE IF NOT EXISTS zenpay_orders (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES zenpay_products(id), seller_id text NOT NULL REFERENCES zenpay_sellers(id), request_key uuid NOT NULL UNIQUE, access_hash text NOT NULL, customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text NOT NULL DEFAULT '', amount integer NOT NULL CHECK(amount>0), product_name text NOT NULL, delivery_url text NOT NULL, delivery_text text NOT NULL, file_name text, file_data text, status text NOT NULL DEFAULT 'creating', provider_id text UNIQUE, pix_code text, pix_qr text, expires_at text, environment text NOT NULL, credential_encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, delivered_at timestamptz, checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS zenpay_orders_seller ON zenpay_orders(seller_id,created_at DESC);
CREATE TABLE IF NOT EXISTS zenpay_events (id text PRIMARY KEY, order_id uuid NOT NULL REFERENCES zenpay_orders(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS zenpay_withdrawals (id uuid PRIMARY KEY, seller_id text NOT NULL REFERENCES zenpay_sellers(id), amount integer NOT NULL CHECK(amount>0), status text NOT NULL DEFAULT 'requesting', result jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS zenpay_rate_limits (key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL);

ALTER TABLE zenpay_sellers
  ADD COLUMN IF NOT EXISTS webhook_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted text;

CREATE UNIQUE INDEX IF NOT EXISTS zenpay_sellers_webhook_id_idx ON zenpay_sellers(webhook_id);
