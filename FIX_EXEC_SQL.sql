-- SQL to fix the 'exec_sql' missing function error
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    EXECUTE sql INTO result;
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    -- Fallback for queries that don't return JSON directly or complex statements
    BEGIN
        EXECUTE sql;
        RETURN '{"status": "success"}'::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Error in exec_sql: %', SQLERRM;
    END;
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO anon;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Also ensure is_featured exists just in case
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS admin_link TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS extra_images TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors_enabled BOOLEAN DEFAULT FALSE;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
