import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Early validation to avoid immediate crash on load if keys are missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase credentials missing. App features will be limited.");
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as any, {
      get: () => {
        throw new Error('Supabase client accessed but credentials (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are not set. Please configure them in the Settings/Secrets menu.');
      }
    });
