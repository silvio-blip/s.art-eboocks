import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is missing');
  return new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as any,
  });
};

export const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials (URL/KEY) are missing.');
  }
  return createClient(url, key);
};

export const ADMIN_IDS = [
  '3d596215-583e-498f-9fd5-36b83d8bccf5',
  '00d44feb-0b51-405e-86f7-31b67edfb7b6'
];
