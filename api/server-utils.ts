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

/**
 * Normaliza caminhos de ficheiros para o Supabase Storage
 */
export const resolveStoragePath = (input: string) => {
  if (!input) return '';
  let path = input.replace(/^\/+/, '');
  
  // Se for URL completo
  if (path.startsWith('http')) {
    try {
      const urlObj = new URL(path);
      if (urlObj.pathname.includes('/storage/v1/object/')) {
        const parts = urlObj.pathname.split('/');
        const bucketIndex = parts.findIndex(p => p === 'assets' || p === 'ebooks' || p === 'covers');
        if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
          return parts.slice(bucketIndex + 1).join('/');
        }
      }
      const parts = urlObj.pathname.split('/');
      return parts[parts.length - 1];
    } catch (e) {
      return path;
    }
  }

  // Remover prefixos redundantes
  const prefixes = ['assets/', 'ebooks/', 'ebook/'];
  for (const p of prefixes) {
    if (path.toLowerCase().startsWith(p)) {
      return path.substring(p.length);
    }
  }
  
  return path;
};
