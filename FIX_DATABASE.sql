-- RUN THIS IN SUPABASE SQL EDITOR TO FIX THE 'orders' TABLE COLUMNS
-- This will add the missing columns that are causing the 'schema cache' error.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropea_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS aliexpress_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_error TEXT;

-- Refresh the PostgREST schema cache (Supabase does this automatically usually, but running this helps)
NOTIFY pgrst, 'reload schema';
