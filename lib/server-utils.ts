import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const ADMIN_IDS = ["2d4d3f56-62ce-4b2e-a342-fd10ccbb4987", "f5ee26ec-82d2-43d9-95a7-ab9ebfd6ec63"]; // Add the right ones or placeholder

export function getSupabase() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export function getStripe() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Missing Stripe Secret Key");
  }

  return new Stripe(stripeKey, {
    apiVersion: "2023-10-16" as any,
  });
}

export function resolveStoragePath(url: string | null): string | null {
  if (!url) return null;
  const urlParts = url.split("/");
  return urlParts[urlParts.length - 1];
}
