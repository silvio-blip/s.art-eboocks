-- S.ART - FIX DUPLICATE ORDERS
-- Run this in your Supabase SQL Editor to prevent duplicate orders

-- 1. First, cleanup absolute duplicates (keep only one per stripe_session_id)
-- This query keeps the oldest one (first created) for each session
DELETE FROM public.orders a USING (
    SELECT MIN(id) as id, stripe_session_id
    FROM public.orders
    WHERE stripe_session_id IS NOT NULL
    GROUP BY stripe_session_id
    HAVING COUNT(*) > 1
) b
WHERE a.stripe_session_id = b.stripe_session_id
AND a.id <> b.id;

-- 2. Add the UNIQUE constraint to ensure 'upsert' works correctly
-- and prevents any future simultaneous duplicates
ALTER TABLE public.orders ADD CONSTRAINT unique_stripe_session_id UNIQUE (stripe_session_id);

-- Optional: Add index for performance in order lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_session_id);
