import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Early validation to avoid immediate crash on load if keys are missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase credentials missing. App features will be limited.");
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : new Proxy({} as any, {
      get: (target, prop) => {
        if (prop === 'auth') {
          return {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            refreshSession: async () => ({ data: { session: null }, error: null }),
            signOut: async () => ({ error: null })
          };
        }
        return (...args: any[]) => {
          console.warn(`Supabase client property "${String(prop)}" accessed but credentials (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are not set.`);
          return { data: null, error: new Error('Supabase credentials missing'), select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
        };
      }
    });
