import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import Stripe from 'stripe';
import CryptoJS from 'crypto-js';
import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';

dotenv.config();

axios.defaults.timeout = 60000; // Global timeout for all axios requests

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials (URL/KEY) are missing.');
  }
  return createClient(url, key);
};

// --- DB INITIALIZATION ---
const initDB = async () => {
  try {
    const supabase = getSupabase();
    
    // Check if exec_sql exists by calling it with a trivial query
    let hasExecSql = false;
    try {
      const { error: testError } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
      hasExecSql = !testError;
      if (!hasExecSql) {
        console.warn('[INIT] Function public.exec_sql(sql) not found. Dynamic schema changes will be skipped.');
      }
    } catch(e) {
      console.warn('[INIT] Could not verify exec_sql function.');
    }

    if (hasExecSql) {
      console.log('[INIT] public.exec_sql found. Starting schema management...');
      
      // Ensure basic tables and schema
      try {
        await supabase.rpc('exec_sql', { sql: `
          -- Reset RLS and Policies for PROFILES to fix recursion
          ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;
          
          -- Nuclear Cleanup: Drop ALL policies on core tables to avoid legacy recursive policies
          DO $$ 
          DECLARE 
            pol RECORD;
          BEGIN 
            FOR pol IN (
              SELECT policyname, tablename 
              FROM pg_policies 
              WHERE schemaname = 'public' 
              AND tablename IN ('profiles', 'products', 'orders', 'categories', 'site_settings')
            ) LOOP
              EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
            END LOOP;
          END $$;

          CREATE TABLE IF NOT EXISTS profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            email TEXT,
            full_name TEXT,
            avatar_url TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            is_employee BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );

          -- Ensure columns exist if table already existed
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_employee BOOLEAN DEFAULT FALSE;
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS saved_address JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email TEXT;
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS description TEXT;
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_id TEXT;

          -- Remove OLD recursive policies
          DO $$ 
          BEGIN 
            DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
            DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
            DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
            DROP POLICY IF EXISTS "Allow users to view own profile" ON profiles;
            DROP POLICY IF EXISTS "Allow admins to view all profiles" ON profiles;
            DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;
            DROP POLICY IF EXISTS "Allow admins to manage all profiles" ON profiles;
          END $$;

          -- Define SECURITY DEFINER functions for role checks
          CREATE OR REPLACE FUNCTION public.is_admin()
          RETURNS BOOLEAN AS $inner$
          BEGIN
            RETURN EXISTS (
              SELECT 1 FROM public.profiles 
              WHERE id = auth.uid() AND is_admin = true
            );
          END;
          $inner$ LANGUAGE plpgsql SECURITY DEFINER;

          CREATE OR REPLACE FUNCTION public.is_employee()
          RETURNS BOOLEAN AS $inner$
          BEGIN
            RETURN EXISTS (
              SELECT 1 FROM public.profiles 
              WHERE id = auth.uid() AND is_employee = true
            );
          END;
          $inner$ LANGUAGE plpgsql SECURITY DEFINER;

          -- Enable RLS and set NEW safe policies
          ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
          
          CREATE POLICY "Allow users to view own profile" ON profiles 
            FOR SELECT USING (auth.uid() = id);

          CREATE POLICY "Allow admins/employees to view all profiles" ON profiles 
            FOR SELECT USING (public.is_admin() OR public.is_employee());

          CREATE POLICY "Allow users to update own profile" ON profiles 
            FOR UPDATE USING (auth.uid() = id);

          CREATE POLICY "Allow admins to manage all profiles" ON profiles 
            FOR ALL USING (public.is_admin());

          CREATE TABLE IF NOT EXISTS categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );

          ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Allow public read on categories" ON categories;
          CREATE POLICY "Allow public read on categories" ON categories FOR SELECT USING (true);
          
          CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value JSONB,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );

          ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Allow public read on site_settings" ON site_settings;
          CREATE POLICY "Allow public read on site_settings" ON site_settings FOR SELECT USING (true);
          
          DROP POLICY IF EXISTS "Allow admins to manage site_settings" ON site_settings;
          CREATE POLICY "Allow admins to manage site_settings" ON site_settings FOR ALL USING (public.is_admin());

          -- Seed default site settings if empty
          INSERT INTO site_settings (key, value)
          SELECT 'hero', '{"image": "https://i.imgur.com/bkuoZcP.png", "video_url": "", "title": "Luxo & Exclusividade", "subtitle": "A Essência da Exclusividade", "buttonText": "Explorar Coleção"}'::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'hero');

          -- Ensure store_events table exists
          CREATE TABLE IF NOT EXISTS store_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            product_id UUID,
            payload JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );

          ALTER TABLE IF EXISTS store_events ENABLE ROW LEVEL SECURITY;
          
          DO $$ 
          BEGIN 
            DROP POLICY IF EXISTS "Anyone can view store events" ON store_events;
          END $$;

          CREATE POLICY "Anyone can view store events" ON store_events FOR SELECT USING (true);
        ` });
      } catch(e) { console.error('[INIT] Error ensuring tables/RLS:', e); }

      // Ensure api_keys table for API integrations
      try {
        await supabase.rpc('exec_sql', { sql: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_by UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );
          ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Allow admins to manage api_keys" ON api_keys;
          CREATE POLICY "Allow admins to manage api_keys" ON api_keys FOR ALL USING (public.is_admin() OR public.is_employee());
          
          -- Also enable public read but we check token in application logic
          DROP POLICY IF EXISTS "Allow public select on api_keys" ON api_keys;
          CREATE POLICY "Allow public select on api_keys" ON api_keys FOR SELECT USING (true);
        ` });
      } catch(e) { console.error('[INIT] Error ensuring api_keys table:', e); }

      // Update Products RLS
      try {
        await supabase.rpc('exec_sql', { sql: `
          ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
          ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0;
          DROP POLICY IF EXISTS "Anyone can view products" ON products;
          CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
          
          DROP POLICY IF EXISTS "Admins/Employees can manage products" ON products;
          CREATE POLICY "Admins/Employees can manage products" ON products FOR ALL USING (public.is_admin() OR public.is_employee());
        ` });
      } catch(e) { console.error('[INIT] Error updating products RLS:', e); }

      // Update Orders RLS
      try {
        await supabase.rpc('exec_sql', { sql: `
          ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Users can view own orders" ON orders;
          CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
          
          DROP POLICY IF EXISTS "Admins/Employees can view all orders" ON orders;
          CREATE POLICY "Admins/Employees can view all orders" ON orders FOR SELECT USING (public.is_admin() OR public.is_employee());
        ` });
      } catch(e) { console.error('[INIT] Error updating orders RLS:', e); }
      
      // Ensure free_shipping exists in products
      try {
        await supabase.rpc('exec_sql', { sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN DEFAULT FALSE;' });
      } catch(e) { /* Ignore */ }

      // Define columns to ensure with their types
      const columnsToEnsure = [
        { name: 'email_paid_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_shipped_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_review_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_canceled_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_refunded_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_delivered_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'stripe_payment_intent', type: 'TEXT' },
        { name: 'payment_status', type: 'TEXT DEFAULT \'pending\'' },
        { name: 'quantity', type: 'INTEGER DEFAULT 1' },
        { name: 'shipping_status_metadata', type: 'JSONB DEFAULT \'{}\'::jsonb' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE DEFAULT timezone(\'utc\'::text, now())' },
        { name: 'provider', type: 'TEXT' },
        { name: 'provider_order_id', type: 'TEXT' },
        { name: 'aliexpress_id', type: 'TEXT' },
        { name: 'fulfillment_error', type: 'TEXT' },
        { name: 'shipping_tracking_code', type: 'TEXT' },
        { name: 'shipping_tracking_url', type: 'TEXT' },
        { name: 'subtotal', type: 'DECIMAL(10,2) DEFAULT 0' },
        { name: 'shipping_cost', type: 'DECIMAL(10,2) DEFAULT 0' },
        { name: 'discount_amount', type: 'DECIMAL(10,2) DEFAULT 0' }
      ];

      for (const col of columnsToEnsure) {
        try {
          if (col.name === 'stripe_payment_intent') {
            // Special handling logic for stripe_payment_intent to fix possible legacy boolean type error
             await supabase.rpc('exec_sql', { sql: `
               DO $$ 
               BEGIN 
                 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stripe_payment_intent' AND data_type = 'boolean') THEN
                   ALTER TABLE orders ALTER COLUMN stripe_payment_intent TYPE TEXT USING (CASE WHEN stripe_payment_intent THEN 'true' ELSE 'false' END);
                 END IF;
                 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stripe_payment_intent') THEN
                   ALTER TABLE orders ADD COLUMN stripe_payment_intent TEXT;
                 END IF;
               END $$;
             ` });
          } else {
             await supabase.rpc('exec_sql', { sql: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};` });
          }
        } catch(e) { 
          console.error(`[INIT] Error ensuring column ${col.name}:`, e);
        }
      }

      try {
        // Force columns to exist and touch the table to trigger schema reload
        await supabase.rpc('exec_sql', { sql: `
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
              ALTER TABLE products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_at') THEN
              ALTER TABLE products ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'admin_link') THEN
              ALTER TABLE products ADD COLUMN admin_link TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'extra_images') THEN
              ALTER TABLE products ADD COLUMN extra_images TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sizes_enabled') THEN
              ALTER TABLE products ADD COLUMN sizes_enabled BOOLEAN DEFAULT FALSE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'colors_enabled') THEN
              ALTER TABLE products ADD COLUMN colors_enabled BOOLEAN DEFAULT FALSE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'provider') THEN
              ALTER TABLE products ADD COLUMN provider TEXT DEFAULT 'aliexpress';
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'metadata') THEN
              ALTER TABLE products ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_markup') THEN
              ALTER TABLE products ADD COLUMN price_markup NUMERIC DEFAULT 0;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'last_aliexpress_sync') THEN
              ALTER TABLE products ADD COLUMN last_aliexpress_sync TIMESTAMP WITH TIME ZONE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active') THEN
              ALTER TABLE products ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'aliexpress_id') THEN
              ALTER TABLE products ADD COLUMN aliexpress_id TEXT;
              CREATE UNIQUE INDEX IF NOT EXISTS products_aliexpress_id_idx ON products (aliexpress_id) WHERE aliexpress_id IS NOT NULL;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'created_by') THEN
              ALTER TABLE products ADD COLUMN created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
              ALTER TABLE products ADD COLUMN sku TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'fulfillment_error') THEN
              ALTER TABLE orders ADD COLUMN fulfillment_error TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'provider_order_id') THEN
              ALTER TABLE orders ADD COLUMN provider_order_id TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'currency') THEN
              ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'EUR';
            END IF;

            -- --- PRODUCT OWNERSHIP RECONCILIATION ---
            -- Ensures all products are linked to an authorized creator (Admin/Employee).
            -- This fixes the issue where 106 products might have been attributed to a client.
            UPDATE products 
            SET created_by = (SELECT id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1)
            WHERE (created_by IS NULL OR created_by NOT IN (SELECT id FROM profiles WHERE is_admin = true OR is_employee = true))
              AND EXISTS (SELECT 1 FROM profiles WHERE is_admin = true);

            -- Update status constraint if exists to include manual_fulfillment_required
            -- (Assuming status is check constrained or just a text field)

            -- Ensure policies exist are already set up in the earlier unified block
            -- but we can re-verify here if needed, or just remove this duplicate logic.
          END $$;
        ` });

        // FORCE PostgREST schema reload via multiple mechanisms
        try { await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" }); } catch(e) {}
        try { await supabase.rpc('exec_sql', { sql: "COMMENT ON TABLE products IS 'Refreshed at " + new Date().toISOString() + "';" }); } catch(e) {}
        
        // Log product count for debugging
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
        console.log(`[INIT] DATABASE STATUS: Found ${count || 0} products in 'products' table.`);

        console.log('[INIT] Database schema verification and refresh targeted using exec_sql.');
      } catch(e) { 
        console.error('[INIT] Error ensuring product columns using exec_sql:', e);
      }

      // Payment status is already handled in the unified columnsToEnsure loop above
    } else {
      // Fallback: If no exec_sql, try to touch tables using standard SDK to maybe trigger a cache refresh
      // This won't ADD columns, but it might help if they already exist but cache is stale
      try {
        await supabase.from('products').select('id').limit(1);
        await supabase.from('orders').select('id').limit(1);
      } catch(e) { /* Ignore */ }
    }
  } catch (err) {
    console.warn('[INIT] Erro na inicialização do DB (não crítico):', err);
  }
};
initDB();

// Global Error Handler
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Stripe Integration ---
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

const app = express();
app.use(cors());

// --- STRIPE WEBHOOK (MUST BE BEFORE GLOBAL JSON PARSER) ---
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  console.log(`\n[STRIPE MONITOR] Evento recebido as ${new Date().toISOString()}`);
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = req.body;
    if (endpointSecret && sig && stripe) {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      console.log(`[STRIPE WEBHOOK] Evento verificado com sucesso: ${event.type}`);
    } else {
      console.warn(`[STRIPE WEBHOOK WARNING] Processando evento SEM VERIFICAÇÃO de assinatura. Configure STRIPE_WEBHOOK_SECRET para produção.`);
      const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString() : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
      event = JSON.parse(bodyString);
    }
  } catch (err: any) {
    console.error(`[STRIPE WEBHOOK ERROR] Verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`[STRIPE WEBHOOK] Pagamento confirmado para sessão: ${session.id}`);

    try {
      const supabase = getSupabase();
      
      // 1. VERIFICAR SE JÁ EXISTE PARA EVITAR DUPLICAÇÃO
      const { data: existingOrder, error: checkError } = await supabase
        .from('orders')
        .select('*')
        .eq('stripe_session_id', session.id)
        .maybeSingle();

      if (existingOrder) {
        console.log(`[STRIPE WEBHOOK] Pedido já existe: ${existingOrder.id}. Forçando disparo direto de e-mail agora.`);
        
        // Fetch product separately since join failed
        if (!existingOrder.products && existingOrder.product_id) {
          const { data: prod } = await supabase.from('products').select('*').eq('id', existingOrder.product_id).maybeSingle();
          if (prod) existingOrder.products = prod;
        }
        
        // Disparo DIRETO sem passar por triggers de banco
        triggerOrderNotification(existingOrder.id, 'paid', existingOrder.shipping_status || 'pending', existingOrder, true).catch(err => 
          console.error('[STRIPE WEBHOOK ERROR] Falha no disparo direto:', err)
        );
        
        // Sincronizar com fornecedores se necessário
        processOrderFulfillment(existingOrder).catch(e => console.error('[RETRY FULFILLMENT ERROR]', e));
        return res.json({ received: true, already_processed: true });
      }

      const metadata = session.metadata;
      if (!metadata) throw new Error("Metadata ausente na sessão do Stripe");

      const customerDataRaw = metadata.customer_data;
      const customerData = JSON.parse(customerDataRaw);
      const internalProductId = metadata.product_id;
      const userId = customerData.userId;

      // 2. CRIAR PEDIDO
      const quantity = parseInt(metadata.quantity || "0") || (session as any).line_items?.data?.[0]?.quantity || 1;
      
      const orderData = {
        user_id: userId,
        product_id: internalProductId,
        status: 'paid',
        payment_status: 'paid',
        shipping_status: 'pending',
        total_amount: session.amount_total ? session.amount_total / 100 : 0,
        subtotal: metadata.subtotal ? parseFloat(metadata.subtotal) : 0,
        shipping_cost: metadata.shipping_cost ? parseFloat(metadata.shipping_cost) : 0,
        discount_amount: metadata.discount_amount ? parseFloat(metadata.discount_amount) : 0,
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent as string,
        shipping_details: customerDataRaw,
        selected_options: metadata.selected_options ? JSON.parse(metadata.selected_options) : {},
        customer_email: session.customer_details?.email || customerData?.email || metadata?.email,
        quantity: quantity,
        currency: metadata.currency || session.currency?.toUpperCase() || 'EUR'
      };

      const { data: createdOrders, error: orderError } = await supabase
        .from('orders')
        .insert([orderData])
        .select();

      if (orderError) throw orderError;
      
      console.log(`[STRIPE WEBHOOK SUCCESS] Criadas ${createdOrders?.length} ordens individuais. Iniciando Sincronização e Email...`);

      // 3. DISPARAR TUDO AUTOMATICAMENTE PARA CADA ORDEM
      if (createdOrders) {
        for (const order of createdOrders) {
          // Enviar e-mail de confirmação de pagamento IMEDIATAMENTE
          triggerOrderNotification(order.id, 'paid', 'pending', order).catch(e => console.error(`[AUTO-EMAIL ERROR]`, e));
          
          // Sincronizar com fornecedores IMEDIATAMENTE (principalmente AliExpress agora)
          processOrderFulfillment(order).catch(e => console.error(`[AUTO-FULFILL ERROR]`, e));
        }
      }

    } catch (err: any) {
      console.error("[STRIPE WEBHOOK FATAL PROCESSING ERROR]", err);
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = charge.payment_intent as string;
    console.log(`[STRIPE WEBHOOK] Reembolso detectado para PI: ${paymentIntentId}`);
    
    try {
      const supabase = getSupabase();
      if (paymentIntentId) {
        // Busca direta pela Ordem que possui este Payment Intent
        const { data: order, error: findError } = await supabase
          .from('orders')
          .select('id, status, shipping_status, stripe_payment_intent')
          .eq('stripe_payment_intent', paymentIntentId)
          .maybeSingle();

        if (findError) {
          console.error(`[STRIPE WEBHOOK] Erro ao buscar ordem por PI ${paymentIntentId}:`, findError);
        } else if (order) {
          console.log(`[STRIPE WEBHOOK] Ordem ${order.id} identificada. Atualizando para reembolsada.`);
          
          const { data: updated, error: updateErr } = await supabase
            .from('orders')
            .update({ 
              status: 'refunded', 
              payment_status: 'refunded' 
            })
            .eq('id', order.id)
            .select()
            .single();

          if (updateErr) {
            console.error(`[STRIPE WEBHOOK] Erro ao atualizar ordem ${order.id}:`, updateErr);
          } else if (updated) {
            console.log(`[STRIPE WEBHOOK] Ordem ${order.id} marcada como reembolsada. Disparando e-mail...`);
            triggerOrderNotification(order.id, 'refunded', updated.shipping_status || order.shipping_status, updated).catch(e => 
              console.error(`[STRIPE WEBHOOK] Erro ao disparar notificação:`, e)
            );
          }
        } else {
          console.log(`[STRIPE WEBHOOK] Nenhuma ordem encontrada para o PI: ${paymentIntentId}. Talvez um pedido antigo ou manual.`);
        }
      }
    } catch (err: any) {
      console.error("[STRIPE WEBHOOK REFUND PROCESSING ERROR]", err);
    }
  }

  res.json({received: true});
});

// Body parsing AFTER webhook
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routers defined early
const apiRouter = express.Router();
const adminRouter = express.Router();

// MOUNT ROUTERS
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

// --- ALIEXPRESS SHARED HELPERS ---
// Robust price extractor for AliExpress responses
function extractAliExpressPrice(field: any): number {
  if (field === null || field === undefined) return 0;
  if (typeof field === 'number') return field;
  if (typeof field === 'string') {
    // 1. Remove range (e.g. "10.00 - 20.00" -> "10.00")
    const firstPart = field.split('-')[0].trim();
    
    // 2. Remove currency symbols but keep digits, dots and commas
    let cleaned = firstPart.replace(/[^\d.,]/g, "").trim();
    if (!cleaned) return 0;

    // Detect if thousands separator is . or ,
    const dots = (cleaned.match(/\./g) || []).length;
    const commas = (cleaned.match(/,/g) || []).length;

    if (dots > 0 && commas > 0) {
      const lastDot = cleaned.lastIndexOf(".");
      const lastComma = cleaned.lastIndexOf(",");
      if (lastComma > lastDot) {
        // EU format: 1.234,56 -> 1234.56
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        // US format: 1,234.56 -> 1234.56
        cleaned = cleaned.replace(/,/g, "");
      }
    } else if (commas > 1) {
      // Thousands separator: 1,234,567 -> 1234567
      cleaned = cleaned.replace(/,/g, "");
    } else if (dots > 1) {
      // Thousands separator: 1.234.567 -> 1234567
      cleaned = cleaned.replace(/\./g, "");
    } else if (commas === 1) {
      // Single comma. If it's near the end, likely decimal: 1234,56
      const lastIdx = cleaned.lastIndexOf(",");
      if (cleaned.length - lastIdx <= 3) {
        cleaned = cleaned.replace(",", ".");
      } else {
        cleaned = cleaned.replace(",", "");
      }
    }
    
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }
  if (typeof field === 'object') {
     return extractAliExpressPrice(field.amount || field.target_sale_price?.amount || field.value || field.sale_price || field.price || field.target_sale_price || field.target_sku_price);
  }
  return 0;
}
async function getAliExpressCredentials() {
  let appKey = (process.env.VITE_ALIEXPRESS_APP_KEY || process.env.ALIEXPRESS_APP_KEY || "").trim();
  let appSecret = (process.env.VITE_ALIEXPRESS_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || "").trim();
  let accessToken = (process.env.VITE_ALIEXPRESS_ACCESS_TOKEN || process.env.ALIEXPRESS_ACCESS_TOKEN || "").trim();
  let autoFulfill = false;
  let account = "";

  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'aliexpress_config')
      .maybeSingle();

    if (data && data.value) {
      const config = data.value as any;
      if (config.app_key) appKey = config.app_key.trim();
      if (config.app_secret) appSecret = config.app_secret.trim();
      if (config.access_token) accessToken = config.access_token.trim();
      if (config.auto_fulfill !== undefined) autoFulfill = !!config.auto_fulfill;
      if (config.account || config.user_nick || config.user_id) {
        account = config.account || config.user_nick || config.user_id;
      }
    }
  } catch (err) {
    console.error("[ALIEXPRESS CREDENTIALS DB FETCH ERROR] falling back to env:", err);
  }

  return { appKey, appSecret, accessToken, autoFulfill, account };
}

async function fetchAliExpressProduct(productId: string) {
  const { appKey, appSecret, accessToken } = await getAliExpressCredentials();

  if (!appKey || !appSecret) {
    throw new Error('Credenciais de integração (App Key / App Secret) ausentes no servidor. Configure-as nas Definições do Painel Administrativo.');
  }

  const currentTimestamp = getAliExpressTimestamp();

  const makeRequestInternal = async (useSession: boolean): Promise<any> => {
    const systemParams: Record<string, any> = {
      app_key: appKey,
      timestamp: currentTimestamp,
      sign_method: 'md5',
      method: 'aliexpress.ds.product.get',
      format: 'json',
      v: '2.0',
    };

    if (useSession && accessToken) {
      systemParams.session = accessToken;
    }

    const businessParams: Record<string, any> = {
      product_id: cleanAliExpressId(productId),
      target_currency: 'EUR',
      target_language: 'PT',
      ship_to_country: 'PT',
    };

    const allParams: Record<string, any> = { ...systemParams };
    for (const [k, v] of Object.entries(businessParams)) {
      if (v !== null && v !== undefined && v !== '') {
        allParams[k] = v;
      }
    }

    const sign = generateAliExpressSignature(allParams, appSecret);
    const formData = new URLSearchParams();
    const sortedKeys = Object.keys(allParams).sort();
    for (const key of sortedKeys) {
      const val = allParams[key];
      const stringVal = (typeof val === 'object') ? JSON.stringify(val) : String(val);
      formData.append(key, stringVal);
    }
    formData.append('sign', sign);

    const aliRes = await axios.post('https://api-sg.aliexpress.com/sync', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      timeout: 30000
    });

    const responseKey = 'aliexpress_ds_product_get_response';
    const data = aliRes.data[responseKey]?.result || aliRes.data[responseKey];
    
    if (aliRes.data.error_response) {
      const msg = aliRes.data.error_response.msg || '';
      const subMsg = aliRes.data.error_response.sub_msg || '';
      const isSessionError = msg.toLowerCase().includes('session') || 
                            msg.toLowerCase().includes('token') || 
                            msg.toLowerCase().includes('expired') ||
                            subMsg.toLowerCase().includes('session') ||
                            subMsg.toLowerCase().includes('token') ||
                            subMsg.toLowerCase().includes('expired');

      if (isSessionError) {
        throw new Error('Erro de Autenticação AliExpress: O Token de Acesso (Session Key) está ausente, expirou ou é inválido. Por favor, atualize o token nas configurações do site no Painel Administrativo.');
      }
      throw new Error(`Erro no Provedor: ${aliRes.data.error_response.msg} (${aliRes.data.error_response.sub_msg || ''})`);
    }

    if (!data) {
      throw new Error('Produto não encontrado no fornecedor.');
    }

    return data;
  };

  return makeRequestInternal(true);
}

/**
 * Limpa qualquer prefixo (como ALI-) de IDs do AliExpress
 */
function cleanAliExpressId(id: string | number | undefined | null): string {
  if (!id) return "";
  return String(id).replace(/[^0-9]/g, '');
}

// Função definitiva para assinar pedidos do AliExpress
function generateAliExpressSignature(params: Record<string, any>, appSecret: string): string {
  // 1. Remover a chave 'sign' se ela estiver no objeto
  const { sign: _sign, ...paramsToSign } = params;

  // 2. Ordenar todas as chaves alfabeticamente (A-Z)
  const sortedKeys = Object.keys(paramsToSign).sort();

  // 3. Juntar chave e valor
  let signString = appSecret; // Início com Secret para MD5 padrão TOP

  for (const key of sortedKeys) {
    const value = paramsToSign[key];
    // IMPORTANTE: AliExpress ignora parâmetros vazios no cálculo do sign
    if (value !== null && value !== undefined && value !== '') {
      const strVal = (typeof value === 'object') ? JSON.stringify(value) : String(value);
      signString += key + strVal;
    }
  }

  signString += appSecret; // Fim com Secret para MD5 padrão TOP

  return crypto
    .createHash('md5')
    .update(signString, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function getAliExpressTimestamp(): string {
  // Formato Obrigatório: "YYYY-MM-DD HH:mm:ss" em UTC/GMT
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// AliExpress Proxy Route
apiRouter.post('/aliexpress/proxy', async (req, res) => {
  const { method, params } = req.body;
  try {
    const { appKey, appSecret, accessToken } = await getAliExpressCredentials();
    console.log("🔍 Token lido do Banco/ENV:", accessToken ? `${accessToken.substring(0, 10)}... (protegido)` : "NÃO DEFINIDO");

    if (!appKey || !appSecret) {
      return res.status(500).json({ error: 'Integração não configurada no servidor (CREDENTIALS_MISSING).' });
    }

    const executeCall = async (useSession: boolean): Promise<any> => {
      const currentTimestamp = getAliExpressTimestamp();
      const systemParams: Record<string, any> = {
        app_key: appKey,
        timestamp: currentTimestamp,
        sign_method: 'md5',
        method: method,
        format: 'json',
        v: '2.0',
      };

      if (useSession && accessToken) {
        systemParams.session = accessToken;
      }

      const allParams: Record<string, any> = { ...systemParams };
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== null && value !== undefined && value !== '') {
            if (['product_id', 'aliexpress_id', 'order_id', 'parent_order_id'].includes(key.toLowerCase())) {
              allParams[key] = cleanAliExpressId(value as string);
            } else {
              allParams[key] = value;
            }
        }
      }
      
      const sign = generateAliExpressSignature(allParams, appSecret);
      const sortedKeys = Object.keys(allParams).sort();
      
      // Construir o corpo x-www-form-urlencoded purista
      const bodySegments: string[] = [];
      for (const key of sortedKeys) {
          const val = allParams[key];
          const stringVal = (typeof val === 'object') ? JSON.stringify(val) : String(val);
          bodySegments.push(`${key}=${encodeURIComponent(stringVal)}`);
      }
      bodySegments.push(`sign=${sign}`);
      const body = bodySegments.join('&');

      console.log(`[ALIEXPRESS PROXY] Call: ${method} | ParamsKeys: ${Object.keys(params || {}).join(',')} | Sign: ${sign}`);

      const response = await axios.post('https://api-sg.aliexpress.com/sync', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        timeout: 60000
      });

      if (response.data.error_response) {
        const msg = response.data.error_response.msg || '';
        const subMsg = response.data.error_response.sub_msg || '';
        const isSessionError = msg.toLowerCase().includes('session') || 
                              msg.toLowerCase().includes('token') || 
                              msg.toLowerCase().includes('expired') ||
                              subMsg.toLowerCase().includes('session') ||
                              subMsg.toLowerCase().includes('token') ||
                              subMsg.toLowerCase().includes('expired');

        if (useSession && isSessionError) {
          console.warn(`[ALIEXPRESS PROXY] Access token is invalid or expired. Retrying WITHOUT session parameter...`);
          return executeCall(false);
        }
        console.error('⚠️ [ALIEXPRESS API RETURNED ERROR]', response.data.error_response);
      } else {
        console.log('✅ [ALIEXPRESS API SUCCESS]');
      }

      return response.data;
    };

    const result = await executeCall(true);
    res.json(result);
  } catch (error: any) {
    console.error('[ALIEXPRESS PROXY ERROR]', error.response?.data || error.message);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Endpoint para gerar a URL oficial de autorização OAuth 2.0
apiRouter.get('/aliexpress/auth-url', async (req, res) => {
  try {
    const { appKey } = await getAliExpressCredentials();
    const effectiveAppKey = appKey || "533964";
    const redirectUri = (req.query.redirect_uri as string) || "https://sart-full.pt/";
    const authUrl = `https://oauth.aliexpress.com/authorize?response_type=code&force_auth=true&client_id=${effectiveAppKey}&redirect_uri=${encodeURIComponent(redirectUri)}&sp=ae`;
    res.json({ auth_url: authUrl, app_key: effectiveAppKey, redirect_uri: redirectUri });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para troca direta de Code temporário por Access Token & Refresh Token Oficiais
apiRouter.post('/aliexpress/exchange-token', async (req, res) => {
  try {
    const { code, appKey: customKey, appSecret: customSecret, redirectUri: customRedirect } = req.body;
    if (!code) {
      return res.status(400).json({ error: "O código temporário de autorização ('code') é obrigatório." });
    }

    const { appKey: envKey, appSecret: envSecret } = await getAliExpressCredentials();
    const appKey = (customKey || envKey || "533964").trim();
    const appSecret = (customSecret || envSecret || "Fmek9qAohE8K2tgkyGcAeC2tQ8dMZiq7").trim();
    const redirectUri = (customRedirect || "https://sart-full.pt/").trim();

    console.log(`[ALIEXPRESS OAUTH EXCHANGE] Trocando code com AppKey ${appKey} em modo Produção...`);

    let data: any = null;

    // 1. Método Oficial AliExpress Dropshipping: IOP /rest/auth/token/create com HMAC-SHA256
    try {
      const timestamp = Date.now().toString();
      const iopParams: Record<string, string> = {
        app_key: appKey,
        timestamp: timestamp,
        sign_method: 'sha256',
        code: code.trim()
      };
      
      const keys = Object.keys(iopParams).sort();
      let queryStr = "/auth/token/create";
      for (const k of keys) {
        queryStr += k + iopParams[k];
      }
      iopParams.sign = crypto.createHmac('sha256', appSecret).update(queryStr, 'utf8').digest('hex').toUpperCase();

      const iopRes = await axios.post('https://api-sg.aliexpress.com/rest/auth/token/create', new URLSearchParams(iopParams).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        timeout: 20000
      });
      if (iopRes.data && (iopRes.data.access_token || iopRes.data.code === '0')) {
        data = iopRes.data;
        console.log('[ALIEXPRESS OAUTH EXCHANGE] Sucesso via IOP /rest/auth/token/create!');
      }
    } catch (iopErr: any) {
      console.warn('[ALIEXPRESS IOP TOKEN EXCHANGE WARN]', iopErr.response?.data || iopErr.message);
    }

    // 2. Fallback para oauth.aliexpress.com
    if (!data || !data.access_token) {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code.trim());
      params.append('client_id', appKey);
      params.append('client_secret', appSecret);
      params.append('redirect_uri', redirectUri);
      params.append('sp', 'ae');

      try {
        const tokenRes = await axios.post('https://oauth.aliexpress.com/token', params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          timeout: 20000
        });
        if (tokenRes.data && tokenRes.data.access_token) {
          data = tokenRes.data;
        }
      } catch (e: any) {
        if (!data) data = e.response?.data || null;
      }
    }

    if (!data || data.error_response || data.error || data.error_code || !data.access_token) {
      console.error('[ALIEXPRESS OAUTH EXCHANGE ERROR]', data);
      
      let friendlyError = data?.error_msg || data?.error_description || data?.msg || data?.error || 'Falha ao trocar código pelo token oficial';
      if (data?.error_code === 'param-appkey.not.exists' || data?.error_msg?.includes('appkey not exists')) {
        friendlyError = `A API AliExpress retornou: "appkey not exists" (AppKey: ${appKey}).\n\nIsto significa que a AppKey foi aprovada recentemente e os servidores globais da Alibaba ainda estão em processo de replicação (demora entre 5 a 20 minutos), ou o token deve ser copiado diretamente do Console da AliExpress ("Test Tool" / "Session Key").`;
      }

      return res.status(400).json({
        success: false,
        error: friendlyError,
        raw_error: data?.error_msg || data?.error_code || data,
        details: data
      });
    }

    console.log(`[ALIEXPRESS OAUTH SUCCESS] Access Token gerado com sucesso! User: ${data.user_nick || data.user_id}`);

    // Gravar diretamente na tabela site_settings (chave 'aliexpress_config')
    const supabase = getSupabase();
    const configValue = {
      app_key: appKey,
      app_secret: appSecret,
      access_token: data.access_token,
      refresh_token: data.refresh_token || "",
      expires_in: data.expires_in,
      user_id: data.user_id,
      user_nick: data.user_nick || "",
      status: "active",
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('site_settings')
      .upsert({
        key: 'aliexpress_config',
        value: configValue,
        updated_at: new Date()
      });

    res.json({
      success: true,
      message: 'Token de Produção obtido e gravado no sistema com sucesso!',
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      user_id: data.user_id,
      user_nick: data.user_nick
    });
  } catch (err: any) {
    console.error('[ALIEXPRESS OAUTH EXCEPTION]', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error_description || err.message,
      details: err.response?.data
    });
  }
});

// Endpoint de Teste da API de Produção AliExpress
apiRouter.post('/aliexpress/test-connection', async (req, res) => {
  try {
    const { appKey, appSecret, accessToken } = await getAliExpressCredentials();

    if (!appKey || !appSecret || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Credenciais incompletas. Verifique se AppKey, AppSecret e Access Token estão configurados.'
      });
    }

    const currentTimestamp = getAliExpressTimestamp();
    const systemParams: Record<string, any> = {
      app_key: appKey,
      timestamp: currentTimestamp,
      sign_method: 'md5',
      method: 'aliexpress.ds.recommend.feed.get',
      v: '2.0',
      format: 'json',
      session: accessToken
    };

    const businessParams: Record<string, any> = {
      feed_name: 'ds_hot_feed',
      page_no: '1',
      page_size: '2',
      target_currency: 'EUR',
      target_language: 'PT',
      ship_to_country: 'PT'
    };

    const allParams = { ...systemParams, ...businessParams };
    const sign = generateAliExpressSignature(allParams, appSecret);

    const formData = new URLSearchParams();
    Object.keys(allParams).sort().forEach(k => formData.append(k, String(allParams[k])));
    formData.append('sign', sign);

    const apiRes = await axios.post('https://api-sg.aliexpress.com/sync', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      timeout: 15000
    });

    if (apiRes.data.error_response) {
      return res.status(400).json({
        success: false,
        error: `AliExpress API Error: ${apiRes.data.error_response.msg} (${apiRes.data.error_response.sub_msg || ''})`,
        details: apiRes.data.error_response
      });
    }

    res.json({
      success: true,
      message: 'Conexão de Produção com a API AliExpress estabelecida com sucesso 100%!',
      data: apiRes.data
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.response?.data?.error_response?.msg || err.message,
      details: err.response?.data
    });
  }
});

// Utility to sanitize address input according to user's strict requirements (anti-ordinals, anti-word-numbers)
function sanitizeAddressInput(addr: string): string {
  if (!addr) return "";
  let s = addr;
  
  // 1. Remove ordinal symbols and superscript indicators (º, ª, °, ⁰, etc.)
  // These cause encoding issues and are often misinterpreted as "0".
  s = s.replace(/[ºª°⁰¹²³⁴⁵⁶⁷⁸⁹\u00B0\u00BA\u00AA\u2070-\u2079]/g, '');
  
  // 2. Map word numbers to digits (prohibiting word-based patterns as requested)
  const wordMap: Record<string, string> = {
    'primeiro': '1', 'primeira': '1', 'first': '1',
    'segundo': '2', 'segunda': '2', 'second': '2',
    'terceiro': '3', 'terceira': '3', 'third': '3',
    'quarto': '4', 'quarta': '4', 'fourth': '4',
    'quinto': '5', 'quinta': '5', 'fifth': '5',
    'sexto': '6', 'sexta': '6', 'setimo': '7', 'oitavo': '8', 'nono': '9', 'decimo': '10',
    'um': '1', 'uma': '1', 'one': '1',
    'dois': '2', 'duas': '2', 'two': '2',
    'tres': '3', 'three': '3',
    'quatro': '4', 'four': '4',
    'cinco': '5', 'five': '5'
  };

  Object.keys(wordMap).forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    s = s.replace(regex, wordMap[word]);
  });
  
  // 3. Reorder if pattern is "[Street Name] [Number]" to "[Number] [Street Name]"
  const trailingNumberRegex = /^(.+?)\s+(\d+)$/;
  const match = s.match(trailingNumberRegex);
  if (match) {
    s = `${match[2]} ${match[1]}`;
  }

  // 4. FINAL STRICTURE: Only allow Alphanumeric, Spaces, Underscores, Hyphens, and Slashes.
  // This removes any other "small symbols", "superscript zeros", or strange symbols.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents/diacritics for safety
  s = s.replace(/[^a-zA-Z0-9\s_\-\/]/g, '');

  return s.trim();
}

function cleanCustomerPhone(rawPhone: string | undefined | null, countryCode: string = 'PT'): { phoneCountry: string; mobileNo: string } {
  const dialCodes: Record<string, string> = {
    PT: '351', ES: '34', FR: '33', DE: '49', IT: '39', GB: '44', UK: '44',
    US: '1', CA: '1', BR: '55', AO: '244', MZ: '258', CV: '238', NL: '31',
    BE: '32', CH: '41', AT: '43', SE: '46', NO: '47', DK: '45', PL: '48',
    IE: '353', LU: '352'
  };

  const cleanCountry = (countryCode || 'PT').toUpperCase().substring(0, 2);
  const targetDial = dialCodes[cleanCountry] || '351';
  const phoneCountry = `+${targetDial}`;

  let digits = String(rawPhone || '').replace(/\D/g, '');

  // If starts with 00 + country dial code
  if (digits.startsWith(`00${targetDial}`) && digits.length > targetDial.length + 6) {
    digits = digits.slice(2 + targetDial.length);
  } else if (digits.startsWith(targetDial) && digits.length > targetDial.length + 6) {
    digits = digits.slice(targetDial.length);
  } else {
    // Check if starts with any known dial code
    for (const code of Object.values(dialCodes)) {
      if (digits.startsWith(code) && digits.length > code.length + 6) {
        digits = digits.slice(code.length);
        break;
      }
    }
  }

  // Remove leading zeros
  digits = digits.replace(/^0+/, '');

  // Validate digit length (9 or 10 digits for most countries; if invalid or empty, fallback)
  if (!digits || digits.length < 6 || digits.length > 15) {
    digits = '912345678';
  }

  return { phoneCountry, mobileNo: digits };
}

// Helper function to handle Stripe Refund
async function processRefundInternal(orderId: string) {
  const supabase = getSupabase();
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !order) {
      console.error(`[REFUND INTERNAL] Order ${orderId} not found`);
      return false;
    }

    let stripeAttempted = false;
    let stripeSucceeded = false;

    if (order.stripe_session_id && stripe) {
      try {
        stripeAttempted = true;
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        const paymentIntentId = session.payment_intent as string;
        if (paymentIntentId) {
          const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer'
          });
          if (refund.status === 'succeeded' || refund.status === 'pending') {
            stripeSucceeded = true;
            console.log(`[REFUND INTERNAL] Stripe refund ${refund.status} for Order: ${orderId}`);
          }
        }
      } catch (sErr: any) {
        console.warn(`[REFUND INTERNAL STRIPE WARN]`, sErr.message);
      }
    }

    // Always update local database to refunded status so client and admin see it immediately
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ 
        status: 'refunded', 
        payment_status: 'refunded',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error(`[REFUND INTERNAL] Failed to update order status to refunded:`, updateErr);
      return false;
    }

    if (updated) {
      console.log(`[REFUND INTERNAL] Order ${orderId} status successfully updated to refunded. Triggering notification...`);
      await triggerOrderNotification(orderId, 'refunded', updated.shipping_status || 'preparing', updated, true);
    }

    return true;
  } catch (err: any) {
    console.error(`[REFUND INTERNAL FATAL] for order ${orderId}:`, err.message);
    // Fallback force update
    try {
      const { data: updated } = await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .maybeSingle();
      if (updated) {
        await triggerOrderNotification(orderId, 'refunded', updated.shipping_status || 'preparing', updated, true);
      }
      return true;
    } catch (fallbackErr) {
      return false;
    }
  }
}


// Recovery Proxy Routes

apiRouter.use((req, res, next) => {
  console.log(`[API ROUTER DEBUG] ${req.method} ${req.url}`);
  next();
});

apiRouter.post('/recovery/send', async (req, res) => {
  try {
    const { email } = req.body;
    const supabase = getSupabase();
    
    // Invocação interna usando o slug correto: reset-password
    const { data, error } = await supabase.functions.invoke('reset-password', {
      body: { email }
    });

    if (error) {
      console.error(`[RECOVERY PROXY ERROR] Chamada falhou:`, error);
      
      // Sempre retornamos um JSON válido para o frontend não quebrar
      return res.status(500).json({ 
        error: "O serviço de recuperação de senha está temporariamente indisponível. Por favor, tente novamente mais tarde." 
      });
    }
    
    console.log(`[RECOVERY PROXY SUCCESS] Resposta:`, data);
    res.json(data);
  } catch (error: any) {
    console.error(`[RECOVERY PROXY FATAL]`, error);
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/recovery/check-exists', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error) throw error;

    res.json({ exists: !!data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/recovery/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('password_recovery_codes')
      .select('*')
      .ilike('email', email)
      .eq('code', code.trim())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    res.json({ success: true, message: 'Código verificado.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/recovery/reset', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    const supabase = getSupabase();

    // 1. Verificar o código novamente por segurança
    const { data: codeData, error: codeError } = await supabase
      .from('password_recovery_codes')
      .select('*')
      .ilike('email', email)
      .eq('code', code.trim())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (codeError || !codeData) {
      return res.status(400).json({ error: 'Código inválido ou transação expirada.' });
    }

    // 2. Atualizar a password no Auth do Supabase (Admin)
    const { data: userData, error: fetchError } = await supabase.auth.admin.listUsers();
    const targetUser = userData?.users?.find((u: any) => u.email === email);

    if (fetchError || !targetUser) {
      return res.status(400).json({ error: 'Utilizador não encontrado para atualização.' });
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(targetUser.id, { 
      password: password 
    });

    if (authError) {
      return res.status(400).json({ error: `Erro ao atualizar senha: ${authError.message}` });
    }

    // 3. Marcar código como usado
    await supabase
      .from('password_recovery_codes')
      .update({ used: true })
      .eq('id', codeData.id);

    res.json({ success: true, message: 'Password atualizada com sucesso.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- API ROUTES ---

// --- SERVER-SENT EVENTS (SSE) FOR REAL-TIME NOTIFICATIONS ---
const storeEventsClients: express.Response[] = [];

async function broadcastProductCreated(product: any) {
  try {
    const supabase = getSupabase();
    const event_type = 'product_created';
    const title = `Novo Produto Adicionado`;
    const message = `O produto "${product.title}" foi adicionado à loja.`;
    const payload = {
      id: product.id,
      title: product.title,
      price: product.price,
      image_url: product.image_url,
      category: product.category || 'Geral',
      created_at: product.created_at || new Date().toISOString()
    };

    const { data: dbEvent, error: dbError } = await supabase
      .from('store_events')
      .insert([{
        event_type,
        title,
        message,
        product_id: product.id,
        payload
      }])
      .select()
      .single();

    if (dbError) {
      console.error('[SSE BROADCAST] Error saving event to database:', dbError);
    }

    const eventToSend = dbEvent || {
      id: crypto.randomUUID(),
      event_type,
      title,
      message,
      product_id: product.id,
      payload,
      created_at: new Date().toISOString()
    };

    console.log(`[SSE BROADCAST] Sending 'product_created' for "${product.title}" to ${storeEventsClients.length} clients...`);
    const sseFormattedData = `data: ${JSON.stringify(eventToSend)}\n\n`;
    
    storeEventsClients.forEach((client, index) => {
      try {
        client.write(sseFormattedData);
      } catch (err) {
        // Ignored, closed connections are handled by 'close' listener
      }
    });
  } catch (err) {
    console.error('[SSE BROADCAST FATAL ERROR]', err);
  }
}

async function broadcastProductDeleted(productId: string) {
  try {
    const supabase = getSupabase();
    // Delete store_events for this product from database so it doesn't persist
    await supabase.from('store_events').delete().eq('product_id', productId);

    const eventToSend = {
      id: crypto.randomUUID(),
      event_type: 'product_deleted',
      product_id: productId,
      payload: { id: productId },
      created_at: new Date().toISOString()
    };

    const sseFormattedData = `data: ${JSON.stringify(eventToSend)}\n\n`;
    storeEventsClients.forEach((client) => {
      try {
        client.write(sseFormattedData);
      } catch (err) {}
    });
  } catch (err) {
    console.error('[SSE BROADCAST DELETED ERROR]', err);
  }
}

apiRouter.get('/og-image', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  let targetImageUrl = '';
  try {
    const productId = (req.query.product || req.query.id) as string;
    const rawUrl = req.query.url as string;

    targetImageUrl = rawUrl;

    if (!targetImageUrl && productId) {
      const product = (await getProductForMeta(productId)) as any;
      if (product) {
        targetImageUrl = product.image_url || product.image || product.thumbnail;
        if (!targetImageUrl && product.extra_images) {
          const extra = String(product.extra_images).split(',').map((s: string) => s.trim()).filter(Boolean);
          if (extra.length > 0) targetImageUrl = extra[0];
        }
      }
    }

    if (!targetImageUrl) {
      targetImageUrl = "https://i.imgur.com/bkuoZcP.png";
    }

    targetImageUrl = getProductImageUrl(targetImageUrl);

    const response = await axios.get(targetImageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.aliexpress.com/'
      },
      timeout: 12000
    });

    let jpegBuffer: Buffer;
    try {
      jpegBuffer = await sharp(response.data)
        .resize(800, 800, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({ quality: 78, progressive: true })
        .toBuffer();
    } catch (sharpErr) {
      console.warn('[OG IMAGE SHARP CONVERT WARN]', sharpErr);
      jpegBuffer = Buffer.from(response.data);
    }

    res.status(200)
      .header('Content-Type', 'image/jpeg')
      .header('Content-Length', String(jpegBuffer.length))
      .header('Cache-Control', 'public, max-age=604800, s-maxage=604800')
      .send(jpegBuffer);

  } catch (err: any) {
    console.error('[OG IMAGE PROXY ERROR]', err.message);
    if (targetImageUrl && targetImageUrl.startsWith('http')) {
      return res.redirect(targetImageUrl);
    }
    return res.redirect("https://i.imgur.com/bkuoZcP.png");
  }
});

apiRouter.get('/products/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  res.write(': sse connection established\n\n');
  storeEventsClients.push(res);
  console.log(`[SSE] Client connected. Total clients: ${storeEventsClients.length}`);

  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch(e) {}
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    const index = storeEventsClients.indexOf(res);
    if (index !== -1) {
      storeEventsClients.splice(index, 1);
    }
    console.log(`[SSE] Client disconnected. Total clients: ${storeEventsClients.length}`);
  });
});

apiRouter.get('/products/recent-events', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: allEvents, error } = await supabase
      .from('store_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (error.message?.includes('does not exist')) {
        return res.json([]);
      }
      throw error;
    }

    if (!allEvents || allEvents.length === 0) {
      return res.json([]);
    }

    // Obter lista de IDs de produtos existentes para não retornar eventos de produtos eliminados
    const { data: activeProds } = await supabase
      .from('products')
      .select('id, is_active');
    
    const validProductIds = new Set((activeProds || []).filter(p => p.is_active !== false).map(p => String(p.id)));

    const validEvents = allEvents.filter(e => {
      const pId = String(e.product_id || e.payload?.id || "");
      if (!pId) return true; // evento genérico do sistema
      return validProductIds.has(pId);
    });

    res.json(validEvents);
  } catch (error: any) {
    console.error('[API RECENT EVENTS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.get('/ping', (req, res) => {
  res.json({ pong: true });
});

apiRouter.get('/test-api', (req, res) => {
  console.log('[API TEST] Test route hit');
  res.json({ success: true, message: 'API is working' });
});

// Endpoint seguro e integrado para Ingestão de Produtos via Extensão CyberExtract (AliExpress e Temu)
apiRouter.post('/products/extract-ingest', async (req, res) => {
  try {
    const { product, source } = req.body;
    if (!product || !source) {
      return res.status(400).json({ error: 'Os dados do produto e a fonte (source) são obrigatórios.' });
    }

    const { 
      title, 
      price, 
      mainImage, 
      variations, 
      url,
      extractedCores,
      extractedTamanhos,
      descriptionText,
      metaDescription,
      extraImages
    } = product;

    if (!title || !url) {
      return res.status(400).json({ error: 'O título e o URL do produto são obrigatórios para a ingestão.' });
    }

    console.log(`[CYBEREXTRACT] Recebida carga de extração de ${source} para: "${title}"`);

    const supabase = getSupabase();
    const provider = String(source).toLowerCase() === 'temu' ? 'temu' : 'aliexpress';

    // Determinar ID externo para evitar colisões no banco de dados entre plataformas
    let externalId = '';
    if (provider === 'aliexpress') {
      const idMatch = url.match(/item\/(\d+)\.html/) || url.match(/\/(\d+)\.html/) || url.match(/id=(\d+)/);
      externalId = idMatch ? idMatch[1] : '';
      if (!externalId) {
        // Fallback inteligente
        const digits = url.replace(/[^0-9]/g, '');
        externalId = digits.length >= 10 ? digits.substring(0, 16) : 'ali_' + Date.now();
      }
    } else {
      // Temu ID extraction
      const match = url.match(/[gG]-([a-zA-Z0-9]+)/) || url.match(/_g_([a-zA-Z0-9]+)/);
      if (match) {
        externalId = 'temu_' + match[1];
      } else {
        // Fallback robusto de links Temu
        try {
          const urlObj = new URL(url);
          const path = urlObj.pathname;
          const parts = path.split('/');
          const lastPart = parts[parts.length - 1];
          const nameMatch = lastPart.replace('.html', '').match(/([a-zA-Z0-9-]+)$/);
          externalId = nameMatch ? 'temu_' + nameMatch[1] : 'temu_' + Date.now();
        } catch (e) {
          externalId = 'temu_' + Date.now();
        }
      }
    }

    // Processamento e conversão de preços de forma polimórfica (suporta pontuação internacional e europeia)
    let parsedPrice = 0;
    if (typeof price === 'number') {
      parsedPrice = price;
    } else if (typeof price === 'string') {
      let cleaned = price.replace(/[€$R£\s]/g, '');
      cleaned = cleaned.replace(',', '.');
      const pMatch = cleaned.match(/(\d+(\.\d+)?)/);
      if (pMatch) {
        parsedPrice = parseFloat(pMatch[1]);
      }
    }
    if (isNaN(parsedPrice)) parsedPrice = 0;
    parsedPrice = Math.round(parsedPrice * 100) / 100;

    // Verificar existência prévia pelo aliexpress_id (externalId unificado)
    const { data: existing } = await supabase
      .from('products')
      .select('id, title, description, price, price_markup, metadata, image_url, colors, sizes, colors_enabled, sizes_enabled, extra_images')
      .eq('aliexpress_id', externalId)
      .maybeSingle();

    // Processamento e conversão de dados reais obtidos pela extensão de forma 100% automática e de altíssima fidelidade
    let finalTitle = title || existing?.title || "Produto Importado Elegante";
    
    // Tratamento adaptativo da descrição (não deixar vazio e respeitar descrições reais com mais de 3 caracteres)
    let finalDescription = (descriptionText && descriptionText.trim().length > 3) 
      ? descriptionText 
      : (existing?.description || metaDescription || `Excelente produto importado diretamente da plataforma ${source} através do plug-in de importação automática CyberExtract.`);

    let finalColors = (Array.isArray(extractedCores) && extractedCores.length > 0)
      ? extractedCores.join(", ") 
      : (existing?.colors || "");

    let finalSizes = (Array.isArray(extractedTamanhos) && extractedTamanhos.length > 0)
      ? extractedTamanhos.join(", ") 
      : (existing?.sizes || "");

    // Organização de Atributos com IA (modelo mais leve possível: gemini-3.5-flash) - se disponível
    if (process.env.GEMINI_API_KEY) {
      console.log('[CYBEREXTRACT-AI] Chave de API ativa. Organizando automaticamente os campos do produto...');
      const cleanAiResult = await organizeProductWithAI(finalTitle, finalDescription, finalColors, finalSizes);
      if (cleanAiResult) {
        finalTitle = cleanAiResult.title || finalTitle;
        finalDescription = cleanAiResult.description || finalDescription;
        finalColors = cleanAiResult.colors || finalColors;
        finalSizes = cleanAiResult.sizes || finalSizes;
      }
    }

    // Unificar fotos adicionais provenientes do carrossel oficial da página e das miniaturas de variações
    let extraImagesList: string[] = [];
    if (Array.isArray(extraImages)) {
      extraImagesList.push(...extraImages);
    }
    if (Array.isArray(variations)) {
      variations.forEach((v: any) => {
        const u = v.imgUrl || v.image_url;
        if (u && typeof u === 'string' && u.startsWith('http')) {
          extraImagesList.push(u);
        }
      });
    }

    // Filtrar duplicados, URLs inválidas, imagem principal e limitar a até 15 fotos extras de alto padrão
    const cleanImageUrl = mainImage || existing?.image_url || null;
    const finalExtraImages = [...new Set(
      extraImagesList
        .map(urlStr => {
          if (!urlStr) return "";
          return urlStr.trim();
        })
        .filter(urlStr => urlStr && urlStr.startsWith("http") && urlStr !== cleanImageUrl)
    )].slice(0, 15).join(", ");

    const activeMarkup = existing?.price_markup !== undefined ? Number(existing.price_markup) : 0;
    const basePrice = parsedPrice > 0 ? parsedPrice : (existing?.metadata?.base_price || (existing?.price ? Math.max(0.01, existing.price - activeMarkup) : 0.01));
    const finalPrice = Math.round((basePrice + activeMarkup) * 100) / 100;

    const commonData: any = {
      aliexpress_id: externalId,
      title: finalTitle,
      description: finalDescription,
      price: finalPrice,
      price_markup: activeMarkup,
      image_url: cleanImageUrl,
      extra_images: finalExtraImages || existing?.extra_images || null,
      colors: finalColors || null,
      sizes: finalSizes || null,
      colors_enabled: (!!finalColors && finalColors.trim().toLowerCase() !== "única" && finalColors.trim().toLowerCase() !== "único" && finalColors.trim().length > 0),
      sizes_enabled: (!!finalSizes && finalSizes.trim().toLowerCase() !== "único" && finalSizes.trim().toLowerCase() !== "única" && finalSizes.trim().length > 0),
      provider: provider,
      admin_link: url,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(existing?.metadata || {}),
        variations: variations || [],
        extracted_at: new Date().toISOString(),
        url: url,
        base_price: basePrice
      }
    };

    let result;
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('products')
        .update(commonData)
        .eq('id', existing.id)
        .select()
        .single();
      if (updateError) throw updateError;
      result = updated;
      console.log(`[CYBEREXTRACT] Produto atualizado na BD nacional. ID Local: ${result.id}`);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .insert([{
          ...commonData,
          category: 'Importados',
          product_type: 'physical',
          is_active: true
        }])
        .select()
        .single();
      if (insertError) throw insertError;
      result = inserted;
      console.log(`[CYBEREXTRACT] Novo produto Temu/AliExpress instanciado com sucesso. ID Local: ${result.id}`);
      broadcastProductCreated(result).catch(err => console.error('[EVENT BROADCAST ERROR]', err));
    }

    // Forçar recarga do cache de schemas do PostgREST para refletir o novo produto instantaneamente
    try {
      await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
    } catch(e) {}

    res.json({ success: true, product: result });
  } catch (error: any) {
    console.error('[CYBEREXTRACT INGEST FATAL ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync Order Status manually (Client Triggered)
apiRouter.post('/orders/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncOrderWithExternalSources(id);
    if (!result.success) {
      console.warn(`[SYNC WARNING] Sync failed for Order ${id}:`, result);
      if (result.error && result.error.startsWith('Aviso:')) {
        return res.status(400).json(result);
      }
      return res.status(result.error === 'Ordem não encontrada no sistema local' ? 404 : 500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    console.error(`[SYNC FATAL ERROR] Order ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sends order status update emails to customers
 */
async function triggerOrderNotification(orderId: string, status: string, shippingStatus: string, orderData?: any, force: boolean = false) {
  console.log(`\n[AUTOMAÇÃO MONITOR] ========================================================`);
  console.log(`[AUTOMAÇÃO MONITOR] INICIANDO DISPARO: Pedido=${orderId} | Status=${status}`);
  
  try {
    const supabase = getSupabase();
    let order = orderData;

    // 1. Garantir que temos os dados completos
    if (!order || !order.customer_email || !order.product_id) {
      const { data: fetchData, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (fetchErr) {
        console.error(`[AUTOMAÇÃO MONITOR] Erro ao buscar dados:`, fetchErr);
        return;
      }
      if (!fetchData) {
        console.error(`[AUTOMAÇÃO MONITOR] Pedido ${orderId} não encontrado!`);
        return;
      }
      order = fetchData;

      // Fetch profile separately
      if (order && !order.profiles && order.user_id) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', order.user_id).maybeSingle();
        if (prof) order.profiles = [prof];
      }
    }

    // Buscar produto se não estiver presente na carga
    if (!order.products && order.product_id) {
      const { data: prod } = await supabase.from('products').select('*').eq('id', order.product_id).maybeSingle();
      if (prod) order.products = prod;
    }

    const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
    const product = Array.isArray(order.products) ? order.products[0] : order.products;

    // 2. Resolver Email
    const targetEmail = (order.customer_email || profile?.notification_email || profile?.email || '').trim();
    console.log(`[AUTOMAÇÃO MONITOR] Email Destinatário: "${targetEmail}"`);

    if (!targetEmail || !targetEmail.includes('@')) {
      console.error(`[AUTOMAÇÃO MONITOR] Abortando: Email inválido.`);
      return;
    }

    // 3. Mapear Assunto e Template
    const lowerS = (status || '').toLowerCase().trim();
    const lowerShip = (shippingStatus || '').toLowerCase().trim();
    
    let subject = '';
    let emailBody = '';
    let flagField = '';

    const customerName = profile?.full_name || (typeof order.shipping_details === 'string' ? JSON.parse(order.shipping_details).name : order.shipping_details?.name) || 'Cliente S.art';
    const productName = product?.name || product?.title || 'Obra de Arte';
    const formattedId = `Sart-${order.id.split('-')[0].toUpperCase()}`;
    const currencySym = order.currency === 'BRL' ? 'R$' : (order.currency === 'USD' ? '$' : (order.currency === 'GBP' ? '£' : '€'));

    // Priority: Refunded > Canceled > Delivered > Out for Delivery > Shipped > Paid
    if (['refunded', 'reembolsado'].includes(lowerS) || order.payment_status === 'refunded') {
      subject = `Reembolso Executado com Sucesso - Pedido ${formattedId}`;
      flagField = 'email_refunded_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #6366f1;">Reembolso Concluído</h2>
          <p>Olá, ${customerName}. É com prazer que informamos que o reembolso relativo ao pedido <strong>${formattedId}</strong> foi executado com sucesso.</p>
          <p>O valor total de <strong>${currencySym}${order.total_amount}</strong> já saiu do nosso sistema e está a ser processado pelo seu banco/operadora.</p>
          <p>O crédito deverá aparecer no seu extrato nos próximos dias úteis.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    } else if (['canceled', 'cancelado', 'void', 'failed'].includes(lowerS)) {
      subject = `Atualização sobre o seu Pedido ${formattedId}`;
      flagField = 'email_canceled_sent';
      const isRefund = ['refunded', 'reembolsado', 'refund_pending', 'waiting_refund'].includes(lowerS) || (order.payment_status === 'refunded' || order.payment_status === 'refund_pending');
      
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #ef4444;">Atualização do Pedido</h2>
          <p>Olá, ${customerName}. Informamos uma atualização no seu pedido <strong>${formattedId}</strong>.</p>
          <p>O status atual é: <strong>Cancelado</strong>.</p>
          ${isRefund ? `
          <p><strong>Reembolso:</strong> O processo de reembolso já foi iniciado automaticamente no sistema da Stripe. O valor será creditado no seu método de pagamento original nos próximos dias úteis.</p>
          ` : `
          <p>Se o pagamento ainda não tinha sido processado, nenhuma cobrança será efetuada.</p>
          `}
          <p>Se tiver alguma dúvida, por favor contacte o nosso suporte respondendo a este e-mail.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    } else if (['delivered', 'entregue', 'completed', 'concluído', 'concluido'].includes(lowerShip) || lowerS === 'completed' || lowerS === 'concluído') {
      subject = `O seu pedido ${formattedId} foi entregue!`;
      flagField = 'email_delivered_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #10b981;">Pedido Entregue!</h2>
          <p>Olá, ${customerName}. O seu pedido <strong>${formattedId}</strong> foi entregue com sucesso.</p>
          <p>Esperamos que tenha gostado da sua nova obra de arte: <strong>${productName}</strong>.</p>
          <p>Se puder, adoraríamos ouvir a sua opinião. Sinta-se à vontade para responder a este e-mail ou deixar um comentário no nosso site.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    } else if (['out_for_delivery', 'saiu_para_entrega', 'prestes_a_chegar'].includes(lowerShip)) {
      subject = `A sua encomenda está quase a chegar! 📦`;
      flagField = 'email_out_for_delivery_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #f59e0b;">Está quase!</h2>
          <p>Olá, ${customerName}. O seu pedido <strong>${formattedId}</strong> saiu para entrega e deverá chegar à sua morada muito em breve.</p>
          <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fef3c7;">
            <p style="margin: 0;"><strong>Item:</strong> ${productName}</p>
            <p style="margin: 5px 0 0 0;">Prepare-se para receber a sua peça exclusiva!</p>
          </div>
          <p>Obrigado por escolher a S.art Boutique.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    } else if (['sent', 'enviado', 'shipped', 'em trânsito'].includes(lowerShip)) {
      subject = `O seu pedido ${formattedId} está a caminho!`;
      flagField = 'email_shipped_sent';
      
      const trackingNumber = order.shipping_tracking_code || order.shipping_status_metadata?.trackingNumber || '';
      const trackingUrl = order.shipping_tracking_url || order.shipping_status_metadata?.trackingUrl || '';

      const trackingInfo = trackingNumber 
        ? `<p>Código de Rastreio: <strong>${trackingNumber}</strong></p>` 
        : '';
      
      const trackingLink = trackingUrl
        ? `<p><a href="${trackingUrl}" style="display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">Acompanhar Entrega</a></p>`
        : '';

      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #3b82f6;">Boas notícias!</h2>
          <p>Olá, ${customerName}. O seu pedido <strong>${formattedId}</strong> já foi enviado e está em trânsito.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Item:</strong> ${productName}</p>
            ${trackingInfo}
            ${trackingLink}
          </div>
          <p>Em breve receberá a sua obra de arte. Obrigado pela confiança!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    } else if (['paid', 'pago', 'completed', 'succeeded', 'pago com sucesso'].includes(lowerS)) {
      subject = `Pagamento Confirmado! Pedido ${formattedId}`;
      flagField = 'email_paid_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #10b981;">Olá, ${customerName}!</h2>
          <p>Temos ótimas notícias: o seu pagamento para o pedido <strong>${formattedId}</strong> foi processado com sucesso.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Item:</strong> ${productName}</p>
            <p style="margin: 5px 0 0 0;"><strong>Valor:</strong> ${currencySym}${order.total_amount}</p>
          </div>
          <p>O seu produto já está a ser preparado para envio. Assim que for despachado, enviaremos um novo e-mail com os detalhes do rastreio.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.art Boutique</p>
        </div>
      `;
    }

    if (!subject) {
      console.log(`[AUTOMAÇÃO MONITOR] Status ${status}/${shippingStatus} não exige e-mail automático.`);
      return;
    }

    // 4. Lock de Duplicidade
    if (flagField && !force) {
      const { data: alreadySent } = await supabase
        .from('orders')
        .select(flagField)
        .eq('id', orderId)
        .eq(flagField, true)
        .maybeSingle();

      if (alreadySent) {
        console.log(`[AUTOMAÇÃO MONITOR] E-mail já enviado anteriormente. Ignorando.`);
        return;
      }
    }

    // 5. Preparar Payload e Invocação de Edge Function
    let invokeData, invokeErr;

    if (flagField === 'email_paid_sent') {
      // Para pagamentos confirmados, usamos a função específica que gera faturas PDF
      console.log(`[AUTOMAÇÃO MONITOR] Chamando send-payment-confirmed (Gerador de PDF de Fatura)...`);
      const res = await supabase.functions.invoke('send-payment-confirmed', {
        body: {
          orderId: orderId,
          email: targetEmail,
          customerName: customerName
        }
      });
      invokeData = res.data;
      invokeErr = res.error;
    } else {
      // Para as outras notificações, usamos o e-mail customizado genérico
      const payload = {
        to: targetEmail,
        subject: subject,
        body: emailBody,
        name: customerName
      };

      console.log(`[AUTOMAÇÃO MONITOR] Chamando send-custom-email via Supabase Invoke...`);
      const res = await supabase.functions.invoke('send-custom-email', {
        body: payload
      });
      invokeData = res.data;
      invokeErr = res.error;
    }

    if (invokeErr) {
      console.error(`[AUTOMAÇÃO MONITOR] ❌ ERRO AO INVOCAR FUNÇÃO:`, JSON.stringify(invokeErr));
    } else {
      console.log(`[AUTOMAÇÃO MONITOR] ✅ SUCESSO! Resposta da Edge Function:`, JSON.stringify(invokeData));
      
      // Marcar como enviado no banco
      if (flagField) {
        console.log(`[AUTOMAÇÃO MONITOR] Marcando ${flagField} como enviado para o pedido ${orderId}`);
        await supabase.from('orders').update({ [flagField]: true }).eq('id', orderId);
      }
    }

    console.log(`[AUTOMAÇÃO MONITOR] ========================================================\n`);

  } catch (err) {
    console.error(`[AUTOMAÇÃO MONITOR] ERRO FATAL NA CADEIA:`, err);
  }
}

// Save Reading Progress
apiRouter.post('/save-reading-state', async (req, res) => {
  try {
    const { userId, bookId, lastPage, totalPages, annotations } = req.body;
    if (!userId || !bookId) return res.status(400).json({ error: 'Missing userId or bookId' });

    const supabase = getSupabase();
    
    const upsertData: any = {
      user_id: userId,
      book_id: bookId,
      last_page_read: lastPage,
      updated_at: new Date().toISOString()
    };

    if (typeof totalPages === 'number') upsertData.total_pages = totalPages;
    if (annotations) upsertData.annotations = annotations;

    const { data, error } = await supabase
      .from('user_reading_progress')
      .upsert(upsertData, { onConflict: 'user_id,book_id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('[SAVE STATE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify Session (DEPRECATED)
apiRouter.get('/verify-session', async (req, res) => {
  res.status(410).json({ error: 'Endpoint descontinuado.' });
});

// Get Book Signed URL (assets bucket)
apiRouter.get('/get-book', async (req, res) => {
  try {
    const filePath = (req.query.fileName || req.query.filePath) as string;

    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    // Instanciar supabase com Service Role Key para permissão total
    const supabase = getSupabase();
    
    // Caminho forçado: assegurar prefixo 'ebook/'
    const finalPath = filePath.startsWith('ebook/') ? filePath : `ebook/${filePath}`;
    
    console.log("[S.ART FINAL CHECK] Path solicitado: ", finalPath);

    const { data, error } = await supabase.storage
        .from('vault')
        .createSignedUrl(finalPath, 3600);

    if (error) {
      console.error(`[S.ART GET-BOOK ERROR] Storage fail:`, error);
      return res.status(404).json({ 
        error: `Obra não encontrada: ${error?.message || 'Object not found'}`,
        triedPath: finalPath
      });
    }
    
    res.json({ url: data.signedUrl });
  } catch (error: any) {
    console.error('[S.ART GET-BOOK SERVER ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN API ---
// adminRouter definition removed from here, now at top

adminRouter.use(async (req, res, next) => {
  // 1. Try to find a valid API Key first (enabling automated integrations like Zapier/Make)
  let token = req.query.key || req.query.api_key || req.query.token;

  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    const customHeader = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['X-API-KEY'] || req.headers['api-key'] || req.headers['api_key'];
    if (customHeader && typeof customHeader === 'string') {
      token = customHeader;
    }
  }

  if (token) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, created_by')
        .eq('token', token)
        .maybeSingle();

      if (!error && data) {
        console.log(`[ADMIN AUTH SUCCESS via API KEY] Key Name: "${data.name}"`);
        (req as any).apiKeyInfo = data;
        if (data.created_by) {
          req.headers['x-user-id'] = data.created_by;
          req.headers['user-id'] = data.created_by;
        }
        return next();
      } else {
        console.warn(`[ADMIN AUTH API KEY FAIL] Token was presented but is invalid or expired.`);
        return res.status(401).json({ error: 'Chave de API inválida ou expirada.' });
      }
    } catch (err) {
      console.error('[ADMIN AUTH API KEY FATAL ERROR]', err);
      return res.status(500).json({ error: 'Erro interno ao validar chave de API.' });
    }
  }

  // 2. Fallback to standard User ID validation
  const userId = req.headers['x-user-id'] || req.headers['user-id'] || req.body.userId || req.query.userId;
  
  console.log(`[ADMIN AUTH] Attempt. UserID: ${userId} | Method: ${req.method} | URL: ${req.url}`);
  // Log body keys to debug missing userId in body
  if (req.method === 'POST') console.log(`[ADMIN AUTH DEBUG] Body keys: ${Object.keys(req.body || {}).join(', ')}`);

  if (!userId) {
    console.error(`[ADMIN AUTH FAIL] User ID missing for ${req.method} ${req.url}`);
    return res.status(401).json({ error: 'User ID missing in request or headers' });
  }

  try {
    const supabase = getSupabase();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin, is_employee')
      .eq('id', userId)
      .single();

    if (error || !profile || (!profile.is_admin && !profile.is_employee)) {
      // Emergency fallback for initial setup if no admin exists yet
      const HARDCODED_ADMINS = ['3d596215-583e-498f-9fd5-36b83d8bccf5', '00d44feb-0b51-405e-86f7-31b67edfb7b6'];
      if (HARDCODED_ADMINS.includes(userId as string)) {
        return next();
      }
      return res.status(403).json({ error: 'Unauthorized admin access' });
    }
    
    next();
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
    res.status(500).json({ error: 'Internal server error during admin validation' });
  }
});

adminRouter.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });
    
    console.log(`[ADMIN TEST EMAIL] Enviando teste para: ${email}`);
    const supabase = getSupabase();
    
    const { data, error } = await supabase.functions.invoke('send-custom-email', {
      body: {
        to: email,
        subject: 'Teste de Configuração SMTP - SArt Boutique',
        body: 'Este é um e-mail de teste disparado pelo painel administrativo para validar a configuração do seu servidor SMTP (Porta 465). Se recebeu isto, está tudo correto!',
        name: 'Administrador'
      }
    });

    if (error) throw error;
    res.json({ success: true, response: data });
  } catch (error: any) {
    console.error('[ADMIN TEST EMAIL ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/send-batch-email', async (req, res) => {
  try {
    const { recipients, subject, message, html, products } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário válido selecionado.' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Assunto do e-mail é obrigatório.' });
    }

    console.log(`[ADMIN BATCH EMAIL] Disparando e-mail para ${recipients.length} destinatários.`);
    const supabase = getSupabase();

    let successCount = 0;
    const errors: { email: string; error: string }[] = [];

    for (const recipient of recipients) {
      const email = typeof recipient === 'string' ? recipient.trim() : recipient.email?.trim();
      const name = typeof recipient === 'object' ? (recipient.name || recipient.full_name) : '';

      if (!email || !email.includes('@')) continue;

      try {
        const { data, error } = await supabase.functions.invoke('send-custom-email', {
          body: {
            to: email,
            subject: subject,
            body: message || '',
            html: html || undefined,
            name: name || undefined
          }
        });

        if (error) {
          console.error(`[ADMIN BATCH EMAIL ERROR] Falha para ${email}:`, error);
          errors.push({ email, error: error.message || 'Erro no envio de e-mail via Supabase' });
        } else {
          successCount++;
        }
      } catch (err: any) {
        console.error(`[ADMIN BATCH EMAIL EXCEPTION] Exceção para ${email}:`, err);
        errors.push({ email, error: err.message || 'Erro interno ao disparar e-mail' });
      }
    }

    res.json({
      success: true,
      count: successCount,
      total: recipients.length,
      errors
    });
  } catch (error: any) {
    console.error('[ADMIN BATCH EMAIL CONTROLLER ERROR]', error);
    res.status(500).json({ error: error.message || 'Erro ao processar envio de e-mails.' });
  }
});

// Resend Notification Manually
adminRouter.post('/orders/:id/resend-notification', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'payment' | 'shipping' | 'delivered' | 'canceled' | 'refunded'
    
    console.log(`[AUTOMAÇÃO ADMIN] ========================================================`);
    console.log(`[AUTOMAÇÃO ADMIN] REQUISIÇÃO RECEBIDA: Tipo=${type} | ID=${id}`);
    
    const supabase = getSupabase();
    
    // 1. Tentar buscar por ID (UUID) de forma simples (sem joins que podem falhar)
    console.log(`[AUTOMAÇÃO ADMIN] Buscando ordem por ID UUID: ${id}`);
    let { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (orderError) {
      console.error(`[AUTOMAÇÃO ADMIN] Erro na query por ID UUID:`, orderError);
    }

    // 2. Fallback para stripe_session_id se não encontrou por ID
    if (!order) {
      console.log(`[AUTOMAÇÃO ADMIN] Não encontrado por UUID. Tentando por stripe_session_id: ${id}`);
      const { data: altOrder, error: altError } = await supabase
        .from('orders')
        .select('*')
        .eq('stripe_session_id', id)
        .maybeSingle();
      
      if (altError) {
        console.error(`[AUTOMAÇÃO ADMIN] Erro na query por stripe_session_id:`, altError);
      }
      order = altOrder;
    }

    if (!order) {
      console.error(`[AUTOMAÇÃO ADMIN] FALHA CRÍTICA: Ordem ${id} não localizada em nenhuma busca.`);
      
      // DEBUG: Listar as últimas 5 ordens para ver se o banco está respondendo
      const { data: recentOrders } = await supabase.from('orders').select('id, created_at').limit(5).order('created_at', { ascending: false });
      console.log(`[AUTOMAÇÃO ADMIN] Últimas ordens no banco:`, JSON.stringify(recentOrders));
      
      return res.status(404).json({ 
        error: `Ordem ${id} não localizada no banco de dados. Verifique se o ID existe na lista de pedidos.` 
      });
    }

    console.log(`[AUTOMAÇÃO ADMIN] ✅ Ordem localizada com sucesso!`);

    // 3. Buscar Perfil (Opcional)
    if (order.user_id) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', order.user_id).maybeSingle();
      if (profile) order.profiles = profile;
    }

    // 4. Buscar Produto (Necessário)
    if (order.product_id) {
      const { data: prod } = await supabase.from('products').select('*').eq('id', order.product_id).maybeSingle();
      if (prod) order.products = prod;
    }

    let status = order.status;
    let shippingStatus = order.shipping_status;

    // Se o user especificou um tipo exato, forçamos o status para o trigger bater no mapeamento certo
    if (type === 'payment') status = 'paid';
    else if (type === 'shipping') shippingStatus = 'sent';
    else if (type === 'delivered') shippingStatus = 'delivered';
    else if (type === 'canceled') status = 'canceled';
    else if (type === 'refunded') status = 'refunded';

    // Disparar com bypass do lock (não passamos flagField ou modificamos a função para ignorar se manual?)
    // Melhor: chamamos a função e ela já viu que o admin pediu
    await triggerOrderNotification(id, status, shippingStatus, order, true);

    res.json({ success: true, message: 'Notificação enviada com sucesso (bypass ativo).' });
  } catch (error: any) {
    console.error('[ADMIN RESEND ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/orders/:id/manual-update', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, shipping_status, verify_stripe } = req.body;
    const supabase = getSupabase();

    // 1. Fetch Order
    const { data: order, error: fetchErr } = await supabase.from('orders').select('*').eq('id', id).single();
    if (fetchErr || !order) return res.status(404).json({ error: 'Ordem não encontrada' });

    // 2. Stripe Verification (if requested)
    if (verify_stripe && (status === 'paid' || status === 'pago')) {
      if (!order.stripe_session_id) {
        return res.status(400).json({ error: 'Ordem não possui Stripe Session ID para verificação' });
      }

      console.log(`[ADMIN MANUAL SYNC] Verifying Stripe for Session ${order.stripe_session_id}`);
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          return res.status(400).json({ 
            error: `Stripe indica que o pagamento ainda não foi concluído. Status atual: ${session.payment_status}. Por favor, aguarde o processamento real ou desative o bloqueio Stripe se tiver certeza.` 
          });
        }
        console.log(`[ADMIN MANUAL SYNC] Stripe verified! Session is paid.`);
      } catch (stripeErr: any) {
        console.error('[STRIPE VERIFY ERROR]', stripeErr);
        return res.status(500).json({ error: `Falha ao conectar com Stripe: ${stripeErr.message}` });
      }
    }

  // 3. Update Order
    const { data: currentOrder } = await supabase.from('orders').select('shipping_status_metadata').eq('id', id).single();
    const currentMetadata = currentOrder?.shipping_status_metadata || {};

    const updateData: any = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (shipping_status) updateData.shipping_status = shipping_status;
    
    const trackingCode = req.body.tracking_code;
    const trackingUrl = req.body.tracking_url;
    const providerOrderId = req.body.provider_order_id;

    if (trackingCode !== undefined) updateData.shipping_tracking_code = trackingCode;
    if (trackingUrl !== undefined) updateData.shipping_tracking_url = trackingUrl;
    if (providerOrderId !== undefined) updateData.provider_order_id = providerOrderId;

    // Sync metadata for customer dashboard visibility
    const newMetadata = { ...currentMetadata };
    if (trackingCode) newMetadata.trackingNumber = trackingCode;
    if (trackingUrl) newMetadata.trackingUrl = trackingUrl;
    newMetadata.lastSync = new Date().toISOString();
    newMetadata.manual_update = true;
    
    updateData.shipping_status_metadata = newMetadata;

    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 4. Trigger Notifications if status changed
    if (status !== order.status || shipping_status !== order.shipping_status) {
      triggerOrderNotification(id, status || order.status, shipping_status || order.shipping_status, updated, true)
        .catch(e => console.error('[MANUAL UPDATE NOTIF ERROR]', e));
    }

    res.json({ success: true, message: 'Ordem atualizada com sucesso!', order: updated });
  } catch (error: any) {
    console.error('[ADMIN MANUAL UPDATE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/users', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    const supabase = getSupabase();
    
    // Check if requester is admin
    const { data: requester } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
    if (!requester?.is_admin) {
      return res.status(403).json({ error: "Acesso negado: apenas administradores podem ver a lista de utilizadores." });
    }
    
    // Fetch all users from Auth (requires Service Role)
      const authData = await supabase.auth.admin.listUsers();
      if (authData.error) throw authData.error;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*');

    if (profileError) throw profileError;

    // Merge Auth users with Profiles and count products
    const { data: productCounts, error: countError } = await supabase
      .from('products')
      .select('created_by');

    if (countError) console.error("[ADMIN USERS] Error fetching product counts:", countError);

    const countsMap: Record<string, number> = {};
    productCounts?.forEach(p => {
      if (p.created_by) {
        countsMap[p.created_by] = (countsMap[p.created_by] || 0) + 1;
      }
    });

    const mergedUsers = authData.data.users.map(authUser => {
      const profile = profileData?.find(p => p.id === authUser.id);
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
        avatar_url: profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '',
        is_admin: profile?.is_admin || false,
        is_employee: profile?.is_employee || false,
        created_at: authUser.created_at,
        custom_id: profile?.custom_id || `Sart-${authUser.id.substring(0, 4).toUpperCase()}`,
        products_count: countsMap[authUser.id] || 0
      };
    });

    // Sort by created_at desc
    mergedUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(mergedUsers);
  } catch (error: any) {
    console.error("[ADMIN USERS ERROR]", error);
    res.status(500).json({ error: error.message });
  }
});

// Public Categories
apiRouter.get('/categories', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error('[CATEGORIES FETCH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const supabase = getSupabase();
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', key).single();
    if (error) throw error;
    res.json(data ? data.value : {});
  } catch (err: any) {
    console.error('[SETTINGS FETCH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Category Management
adminRouter.get('/categories', async (req, res) => {
  try {
    // We can keep it here too or just use the public one, 
    // but the dashboard already points here.
    const supabase = getSupabase();
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error('[ADMIN CATEGORIES FETCH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const supabase = getSupabase();
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    res.json(data ? data.value : {});
  } catch (err: any) {
    console.error('[ADMIN SETTINGS FETCH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase.from('site_settings').upsert({ key, value, updated_at: new Date() }).select().single();
    if (error) throw error;
    res.json(data.value);
  } catch (err: any) {
    console.error('[ADMIN SETTINGS UPDATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const supabase = getSupabase();
    const { data, error } = await supabase.from('categories').insert([{ name }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('[ADMIN CATEGORY CREATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const supabase = getSupabase();
    
    // Get old name first to update products
    const { data: oldCat } = await supabase.from('categories').select('name').eq('id', id).single();
    
    const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single();
    if (error) throw error;
    
    // Update products using the old name
    if (oldCat && oldCat.name !== name) {
      await supabase.from('products').update({ category: name }).eq('category', oldCat.name);
    }
    
    res.json(data);
  } catch (err: any) {
    console.error('[ADMIN CATEGORY UPDATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    // Get category name first
    const { data: catData } = await supabase.from('categories').select('name').eq('id', id).single();
    
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    
    // Set products of this category to 'Geral' or keep them as is? 
    // User wants synchronization, so let's set to 'Geral' to keep things clean.
    if (catData) {
      await supabase.from('products').update({ category: 'Geral' }).eq('category', catData.name);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[ADMIN CATEGORY DELETE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin, is_employee, userId } = req.body;
    const supabase = getSupabase();
    
    // Check if requester is admin
    if (userId) {
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
      
      if (!requesterProfile?.is_admin) {
        return res.status(403).json({ error: "Apenas administradores podem alterar cargos." });
      }
    }

    const updateData: any = {};
    if (is_admin !== undefined) updateData.is_admin = is_admin;
    if (is_employee !== undefined) updateData.is_employee = is_employee;

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- HELPER DE INTELIGÊNCIA ARTIFICIAL ULTRA LEVE E ECONÔMICA (GEMINI-3.1-FLASH-LITE) ---
let aiInstance: any = null;
const getGeminiClient = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GEMINI] WARNING: GEMINI_API_KEY is not defined.');
      return null;
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
};

async function organizeProductWithAI(rawTitle: string, rawDescription: string, rawColors: string, rawSizes: string) {
  const ai = getGeminiClient();
  if (!ai) {
    console.log('[GEMINI] Gemini client not initialized. Skipping AI cleanup.');
    return null;
  }

  try {
    const prompt = `Clean and organize the following raw e-commerce product scraped fields.
Instructions:
1. Standardize and deduplicate items.
2. Clean title: Make it brief, appealing, clear, without bracketed tags, provider internal codes, or useless noise. Keep it to max 70 characters.
3. Clean description: Completely strip out any website/checkout UI noise (like "Subtotal", cart numbers, delivery/returns texts, "Finalizar compra", cookies, terms). Convert it into neat, well-structured, easy-to-read paragraphs or lists of key specifications and features.
4. Colors & Sizes separation: Cleanly separate mixed-up colors and sizes.
   - For colors: Extract ONLY actual color names (e.g., 'Bege claro', 'Preto', 'Branco'). Remove sizes or other words.
   - For sizes: Extract ONLY actual sizes (e.g., 'S', 'M', 'L', 'XL', '140cm'). Remove colors or other words.
5. All results must be in Portuguese (pt-PT).

Input:
- Raw Title: "${rawTitle}"
- Raw Description: "${rawDescription}"
- Raw Colors options: "${rawColors}"
- Raw Sizes options: "${rawSizes}"`;

    console.log('[GEMINI] Requesting product cleanup via gemini-flash-lite-latest with JSON schema...');

    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: prompt,
      config: {
        systemInstruction: "You are an elite, highly cost-effective e-commerce operations manager. You clean and separate scraped fields cleanly into structured Portuguese (pt-PT). Keep responses minimal and exact.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { 
              type: Type.STRING, 
              description: "Elegant and compact title (pt-PT)." 
            },
            description: { 
              type: Type.STRING, 
              description: "Polished markdown or plain-text description (pt-PT)." 
            },
            colors: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Actual clean colors." 
            },
            sizes: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Actual clean sizes." 
            }
          },
          required: ["title", "description", "colors", "sizes"]
        }
      }
    });

    if (response && response.text) {
      const parsed = JSON.parse(response.text.trim());
      console.log('[GEMINI] AI product organization successful:', parsed);
      return {
        title: parsed.title,
        description: parsed.description,
        colors: Array.isArray(parsed.colors) ? parsed.colors.join(", ") : "",
        sizes: Array.isArray(parsed.sizes) ? parsed.sizes.join(", ") : ""
      };
    }
  } catch (err) {
    console.error('[GEMINI] Error running AI product cleanup:', err);
  }
  return null;
}

// Endpoint de organização voluntária com AI (mínimo de quota possível)
adminRouter.post('/products/organize', async (req, res) => {
  try {
    const { title, description, colors, sizes } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Título é obrigatório.' });
    }

    const cleaned = await organizeProductWithAI(
      title,
      description || "",
      colors || "",
      sizes || ""
    );

    if (cleaned) {
      res.json({ success: true, ...cleaned });
    } else {
      res.status(500).json({ error: 'Erro no processamento do Gemini. Verifique a chave de API.' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/products', async (req, res) => {
  try {
    const supabase = getSupabase();
    // console.log('[ADMIN] Buscando todos os produtos via Service Role...');
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('[ADMIN PRODUCTS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/products', async (req, res) => {
  try {
    const { 
      title, description, price, pvp, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, aliexpress_id, is_featured, sku, provider, price_markup, free_shipping, discount_percent
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price. Ensure it's a valid number.
    let rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    let finalPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
    
    if (isNaN(finalPrice) || finalPrice === undefined || finalPrice === null) {
      console.warn(`[ADMIN] Price is invalid (${rawPrice}). Defaulting to 0.`);
      finalPrice = 0;
    }
    
    finalPrice = Math.round(finalPrice * 100) / 100;

    const priceMarkup = Math.round(parseFloat(String(price_markup || 0)) * 100) / 100;
    const discountVal = Math.min(100, Math.max(0, parseFloat(String(discount_percent || 0))));

    const supabase = getSupabase();
    
    let query;
    const upsertData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured, sku, provider,
      price_markup: priceMarkup,
      discount_percent: discountVal,
      free_shipping: !!free_shipping,
      created_by: req.body.userId || null
    };
    
    if (aliexpress_id) {
      upsertData.aliexpress_id = String(aliexpress_id);
      query = supabase.from('products').upsert(upsertData, { onConflict: 'aliexpress_id' });
    } else {
      query = supabase.from('products').insert(upsertData);
    }

    let { data, error } = await query.select().single();

    // RETRY LOGIC for schema cache issues
    if (error && error.message.includes('is_featured')) {
      console.warn(`[ADMIN] Detected missing 'is_featured' column in cache during create. Attempting forced refresh and SQL fallback...`);
      try {
        await supabase.rpc('exec_sql', { sql: "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;" });
        await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
        await supabase.rpc('exec_sql', { sql: `COMMENT ON TABLE products IS 'API Create Retry ${Date.now()}';` });
        
        await new Promise(r => setTimeout(r, 600));
        
        let retryQuery;
        retryQuery = supabase.from('products').insert(upsertData);
        
        const retryResult = await retryQuery.select().single();
        if (!retryResult.error) {
          data = retryResult.data;
          error = retryResult.error;
        } else {
          // ULTIMATE FALLBACK: Raw SQL Insert/Upsert
          console.warn(`[ADMIN] Standard retry failed during create. Using Raw SQL Fallback...`);
          
          const keys = Object.keys(upsertData);
          const columns = keys.map(k => `"${k}"`).join(', ');
          const values = keys.map(k => {
            const val = upsertData[k];
            if (val === null || val === undefined) return `NULL`;
            if (typeof val === 'boolean') return `${val}`;
            if (typeof val === 'number') return `${val}`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');
          
          let sql;
          sql = `INSERT INTO products (${columns}) VALUES (${values}) RETURNING *;`;
          
          const sqlResult = await supabase.rpc('exec_sql', { sql });
          if (!sqlResult.error) {
            data = Array.isArray(sqlResult.data) ? sqlResult.data[0] : sqlResult.data;
            error = null;
          } else {
            console.warn('[ADMIN] Raw SQL Fallback failed or function missing (POST). Stripping is_featured for final attempt...');
            const finalData = { ...upsertData };
            delete finalData.is_featured;
            let finalQuery;
            finalQuery = supabase.from('products').insert(finalData);
            const finalResult = await finalQuery.select().single();
            data = finalResult.data;
            error = finalResult.error;
          }
        }
      } catch (retryErr: any) {
        console.error(`[ADMIN] Retry/Fallback failed:`, retryErr);
        error = retryErr;
      }
    }

    if (error) {
      console.error(`[ADMIN] Error creating product:`, error);
      throw error;
    }
    broadcastProductCreated(data).catch(err => console.error('[EVENT BROADCAST ERROR]', err));
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, price, pvp, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, aliexpress_id, is_featured, sku, provider, price_markup, metadata, free_shipping, discount_percent
    } = req.body;
    
    const supabase = getSupabase();

    // Fetch existing for metadata check (base_price)
    const { data: existing } = await supabase.from('products').select('*').eq('id', id).single();

    // Prioritize pvp if it exists, otherwise use price. Ensure it's a valid number.
    const rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    let finalPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;

    if (isNaN(finalPrice) || finalPrice === undefined || finalPrice === null) {
      console.warn(`[ADMIN] Price is invalid (${rawPrice}) for ${id}. Defaulting to 0.`);
      finalPrice = 0;
    }

    finalPrice = Math.round(finalPrice * 100) / 100;
    const priceMarkup = Math.round(parseFloat(String(price_markup || 0)) * 100) / 100;
    const discountVal = discount_percent !== undefined && discount_percent !== null 
      ? Math.min(100, Math.max(0, parseFloat(String(discount_percent)))) 
      : (existing?.discount_percent || 0);

    // Recalculate price for AliExpress and Temu products if markup changed and base_price is available
    if ((provider === 'aliexpress' || provider === 'temu') && existing?.metadata?.base_price !== undefined) {
       // If the incoming price is the same as existing price, but markup changed, let's update the price automatically
       if (priceMarkup !== (existing.price_markup || 0)) {
          finalPrice = (existing.metadata.base_price || 0) + priceMarkup;
       }
    }

    const updateData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured, sku, provider,
      price_markup: priceMarkup,
      discount_percent: discountVal,
      metadata: metadata || existing?.metadata,
      free_shipping: free_shipping !== undefined ? !!free_shipping : existing?.free_shipping
    };
    
    if (aliexpress_id) updateData.aliexpress_id = String(aliexpress_id);

    let { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    // RETRY LOGIC for schema cache issues
    if (error && error.message.includes('is_featured')) {
      console.warn(`[ADMIN] Detected missing 'is_featured' column in cache. Attempting forced refresh and SQL fallback...`);
      try {
        // 1. Try refreshing if exec_sql exists
        try {
          await supabase.rpc('exec_sql', { sql: "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;" });
          await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
          await supabase.rpc('exec_sql', { sql: `COMMENT ON TABLE products IS 'API Retry ${Date.now()}';` });
          await new Promise(r => setTimeout(r, 600));
        } catch(refreshErr) {
          console.warn('[ADMIN] Could not refresh cache via exec_sql');
        }
        
        // 2. Try standard update again
        const retryResult = await supabase
          .from('products')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (!retryResult.error) {
          data = retryResult.data;
          error = retryResult.error;
        } else {
          // 3. Try Raw SQL Update if possible
          console.warn(`[ADMIN] Standard retry failed. Attempting Raw SQL Fallback...`);
          
          let sqlExecuted = false;
          try {
            const fields = Object.keys(updateData).map(key => {
              const val = updateData[key];
              if (val === null || val === undefined) return `"${key}" = NULL`;
              if (typeof val === 'boolean') return `"${key}" = ${val}`;
              if (typeof val === 'number') return `"${key}" = ${val}`;
              return `"${key}" = '${String(val).replace(/'/g, "''")}'`;
            }).join(', ');
            
            const sql = `UPDATE products SET ${fields} WHERE id = '${id}' RETURNING *;`;
            const sqlResult = await supabase.rpc('exec_sql', { sql });
            
            if (!sqlResult.error) {
              data = Array.isArray(sqlResult.data) ? sqlResult.data[0] : sqlResult.data;
              error = null;
              sqlExecuted = true;
            }
          } catch(sqlErr) {
            console.warn('[ADMIN] Raw SQL Fallback failed or function missing');
          }

          // 4. FINAL RESILIENCE: Strip is_featured and try one last time
          if (!sqlExecuted) {
            console.warn('[ADMIN] All advanced retries failed. Stripping is_featured for final attempt...');
            const finalData = { ...updateData };
            delete finalData.is_featured;
            
            const finalResult = await supabase
              .from('products')
              .update(finalData)
              .eq('id', id)
              .select()
              .single();
            
            data = finalResult.data;
            error = finalResult.error;
          }
        }
      } catch (retryErr: any) {
        console.error(`[ADMIN] Retry chain failed:`, retryErr);
        error = retryErr;
      }
    }

    if (error) {
      console.error(`[ADMIN] Error updating product ${id}:`, error);
      throw error;
    }
    res.json(data);
  } catch (error: any) {
    console.error(`[ADMIN FATAL] Update failed:`, error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.patch('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, price, pvp, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, aliexpress_id, is_featured
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price
    const rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    const finalPrice = Math.round((typeof rawPrice === 'string' ? parseFloat(rawPrice) : (rawPrice || 0)) * 100) / 100;

    const supabase = getSupabase();
    const updateData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured
    };
    
    if (aliexpress_id) updateData.aliexpress_id = String(aliexpress_id);

    let { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    // RETRY LOGIC for schema cache issues
    if (error && error.message.includes('is_featured')) {
      console.warn(`[ADMIN] Detected missing 'is_featured' column in cache (PATCH). Attempting forced refresh and SQL fallback...`);
      try {
        await supabase.rpc('exec_sql', { sql: "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;" });
        await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
        await supabase.rpc('exec_sql', { sql: `COMMENT ON TABLE products IS 'API Patch Retry ${Date.now()}';` });
        
        await new Promise(r => setTimeout(r, 600));
        
        const retryResult = await supabase
          .from('products')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (!retryResult.error) {
          data = retryResult.data;
          error = retryResult.error;
        } else {
          // ULTIMATE FALLBACK: Raw SQL Update
          console.warn(`[ADMIN] Standard retry failed (PATCH). Using Raw SQL Fallback...`);
          
          const fields = Object.keys(updateData).map(key => {
            const val = updateData[key];
            if (val === null || val === undefined) return `"${key}" = NULL`;
            if (typeof val === 'boolean') return `"${key}" = ${val}`;
            if (typeof val === 'number') return `"${key}" = ${val}`;
            return `"${key}" = '${String(val).replace(/'/g, "''")}'`;
          }).join(', ');
          
          const sql = `UPDATE products SET ${fields} WHERE id = '${id}' RETURNING *;`;
          const sqlResult = await supabase.rpc('exec_sql', { sql });
          if (!sqlResult.error) {
            data = Array.isArray(sqlResult.data) ? sqlResult.data[0] : sqlResult.data;
            error = null;
          } else {
            console.warn('[ADMIN] Raw SQL Fallback failed or function missing (PATCH). Stripping is_featured for final attempt...');
            const finalData = { ...updateData };
            delete finalData.is_featured;
            const finalResult = await supabase
              .from('products')
              .update(finalData)
              .eq('id', id)
              .select()
              .single();
            data = finalResult.data;
            error = finalResult.error;
          }
        }
      } catch (retryErr: any) {
        console.error(`[ADMIN] Retry/Fallback failed:`, retryErr);
        error = retryErr;
      }
    }

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Robust AliExpress product parser
// Helper: Robust AliExpress product parser
function parseAliExpressProduct(aliexpressData: any) {
  if (!aliexpressData) throw new Error("Dados do produto importado vazios.");

  // Safely navigate through deep structure with fallbacks
  const base = aliexpressData?.ae_item_base_info_dto || {};
  const multimedia = aliexpressData?.ae_multimedia_info_dto || {};
  
  // New path for SKUs
  const skus = Array.isArray(aliexpressData?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o)
    ? aliexpressData.ae_item_sku_info_dtos.ae_item_sku_info_d_t_o
    : [];

  // Robust image extraction & Property/Image Mapping
  let mainImageFromProperty = "";
  const colors = new Set<string>();
  const sizes = new Set<string>();
  
  // Variations (Sizes/Colors/SKUs)
  const processedVariations = skus.map((sku: any) => {
    // New path for properties
    const skuProps = Array.isArray(sku?.ae_sku_property_dtos?.ae_sku_property_d_t_o) 
      ? sku.ae_sku_property_dtos.ae_sku_property_d_t_o 
      : [];
      
    const properties = skuProps.map((p: any) => {
      const name = p.sku_property_name;
      const value = p.sku_property_value;
      const image = p.sku_image || null;

      // Capture image for main fallback
      if (image && !mainImageFromProperty) mainImageFromProperty = image;

      if (name?.toLowerCase().includes("color") || name?.toLowerCase().includes("cor")) colors.add(value);
      if (name?.toLowerCase().includes("size") || name?.toLowerCase().includes("tamanho")) sizes.add(value);

      return {
        name: name === "Color" ? "Cores" : name === "Size" ? "Tamanhos" : name,
        value: value,
        image: image
      };
    });

    const skuPrice = extractAliExpressPrice(sku.offer_sale_price) || extractAliExpressPrice(sku.sku_price) || 0;

    return {
      sku_id: sku.sku_id,
      price: skuPrice,
      stock: sku.sku_available_stock || 0,
      properties
    };
  });

  // Use main property image as fallback if base image missing
  const mainImage = base?.product_main_image_url || 
                    base?.first_image_url || 
                    mainImageFromProperty ||
                    (Array.isArray(multimedia?.image_urls) ? multimedia.image_urls[0] : "");

  // 2. Galeria de Imagens
  // Handle cases where image_urls might be a single string (often ; separated) or an array
  let extraImagesArray: string[] = [];
  if (typeof multimedia?.image_urls === 'string') {
    extraImagesArray = multimedia.image_urls.split(';').filter((url: string) => url.trim() !== '');
  } else if (Array.isArray(multimedia?.image_urls)) {
    extraImagesArray = multimedia.image_urls;
  }
  
  // Filter out the main image
  const extraImages = extraImagesArray
    .filter((url: string) => url !== mainImage)
    .join(',');

  // 3. Preço
  // Use target_sale_price from base info as it's the main price shown on site in the correct currency.
  const targetSalePrice = extractAliExpressPrice(base.target_sale_price);
  
  // Also check min variation price of IN-STOCK items as a fallback or verification.
  const inStockVariations = processedVariations.filter(v => v.stock > 0);
  const targetVariations = inStockVariations.length > 0 ? inStockVariations : processedVariations;
  const skuPrices = targetVariations.map(v => v.price).filter(p => p > 0);
  const minSkuPrice = skuPrices.length > 0 ? Math.min(...skuPrices) : 0;
  const maxSkuPrice = skuPrices.length > 0 ? Math.max(...skuPrices) : 0;
  
  // Logic Improvement:
  // If targetSalePrice exists and is within the SKU range, prefer it.
  // Otherwise, use minSkuPrice as it's the "Starting from" price.
  let finalPrice = targetSalePrice;
  if (finalPrice <= 0 || (maxSkuPrice > 0 && finalPrice > maxSkuPrice * 1.5)) {
    finalPrice = minSkuPrice;
  }
  if (finalPrice <= 0) finalPrice = targetSalePrice; // Final fallback

  return {
    title: base.subject || "Produto Importado",
    description: base.detail ? base.detail.replace(/<[^>]*>?/gm, '') : "",
    price: finalPrice,
    product_main_image_url: mainImage,
    extra_images: extraImages,
    colors: Array.from(colors).join(", "),
    sizes: Array.from(sizes).join(", "),
    colors_enabled: colors.size > 0,
    sizes_enabled: sizes.size > 0,
    metadata: {
      variations: processedVariations,
      import_date: new Date().toISOString(),
      base_price: finalPrice,
      sku_range: { min: minSkuPrice, max: maxSkuPrice }
    }
  };
}

adminRouter.post('/products/import-aliexpress', async (req, res) => {
  try {
    const { productId, markup } = req.body;
    if (!productId) return res.status(400).json({ error: 'ID de importação é obrigatório.' });

    // Salvaguarda inteligente se for colado um link ou ID da Temu
    if (String(productId).toLowerCase().includes('temu') || String(productId).startsWith('temu_')) {
      return res.status(400).json({
        error: 'Mecanismo Temu detetado! Devido aos bloqueios de segurança (Cloudflare) severos da Temu no servidor, a extração direta a partir do Painel Administrativo web não é possível. Para importar este produto de forma automática, garantida e instantânea com um só clique, por favor use a nossa Extensão do Chrome "CyberExtract" diretamente na página do produto na Temu no seu navegador!'
      });
    }

    const priceMarkup = markup !== undefined ? Math.round(parseFloat(String(markup)) * 100) / 100 : undefined;
    console.log(`[ADMIN] Importando produto internacional ID: ${productId} com Margem: ${priceMarkup}`);
    
    const data = await fetchAliExpressProduct(productId);
    const parsed = parseAliExpressProduct(data);
    const basePrice = Math.round((parsed.price || 0) * 100) / 100;
    const baseInfo = data?.ae_item_base_info_dto || {};

    const supabase = getSupabase();
    
    // Check for existing
    const { data: existing } = await supabase
      .from('products')
      .select('id, title, description, price, colors, sizes, admin_link, price_markup, image_url, extra_images, colors_enabled, sizes_enabled, metadata, free_shipping')
      .eq('aliexpress_id', String(baseInfo.product_id))
      .maybeSingle();

    const activeMarkup = priceMarkup !== undefined ? priceMarkup : (existing?.price_markup || 0);
    const finalPriceWithMarkup = Math.round((basePrice + activeMarkup) * 100) / 100;

    // Manual Upsert Logic
    const commonData: any = {
      aliexpress_id: String(baseInfo.product_id),
      title: (existing?.title && existing.title !== parsed.title) ? existing.title : parsed.title,
      description: (existing?.description && existing.description.length > 50) ? existing.description : (parsed.description || ""),
      // NEW: We ALWAYS update the price to match AliExpress + Markup when importing/syncing,
      // as that's the primary purpose of syncing.
      price: finalPriceWithMarkup,
      price_markup: activeMarkup,
      free_shipping: existing?.free_shipping ?? false,
      image_url: existing?.image_url || parsed.product_main_image_url,
      extra_images: existing?.extra_images || parsed.extra_images,
      colors: existing?.colors || parsed.colors,
      sizes: existing?.sizes || parsed.sizes,
      colors_enabled: existing?.colors_enabled !== undefined ? existing.colors_enabled : parsed.colors_enabled,
      sizes_enabled: existing?.sizes_enabled !== undefined ? existing.sizes_enabled : parsed.sizes_enabled,
      provider: 'aliexpress',
      admin_link: existing?.admin_link || `https://www.aliexpress.com/item/${productId}.html`,
      last_aliexpress_sync: new Date().toISOString(),
      metadata: {
        ...(existing?.metadata || {}),
        variations: parsed.metadata.variations,
        original_subject: baseInfo.subject,
        import_date: existing?.metadata?.import_date || new Date().toISOString(),
        raw_colors: parsed.colors,
        raw_sizes: parsed.sizes,
        base_price: basePrice
      }
    };

    const requesterId = req.body.userId || req.headers['x-user-id'];
    
    if (!existing) {
      commonData.created_by = requesterId || null;
    }

    let result_data;
    if (existing?.id) {
      const { data: updated, error: updateError } = await supabase
        .from('products')
        .update({ ...commonData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select().single();
      if (updateError) throw updateError;
      result_data = updated;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .insert([{ ...commonData, product_type: 'physical', category: 'Importados', is_active: true }])
        .select().single();
      if (insertError) throw insertError;
      result_data = inserted;
      broadcastProductCreated(result_data).catch(err => console.error('[EVENT BROADCAST ERROR]', err));
    }

    const isUpdate = !!existing;
    res.json({ ...result_data, _isUpdate: isUpdate });
  } catch (error: any) {
    console.error(`[ADMIN ALIEXPRESS IMPORT ERROR]`, error.message);
    const errMessage = error.message || '';
    if (
      errMessage.toLowerCase().includes('access_token') ||
      errMessage.toLowerCase().includes('token') ||
      errMessage.toLowerCase().includes('session') ||
      errMessage.toLowerCase().includes('not supplied') ||
      errMessage.toLowerCase().includes('expired') ||
      errMessage.toLowerCase().includes('provedor')
    ) {
      return res.status(400).json({
        error: 'Erro de Autenticação na API AliExpress: O Token de Acesso (Session Key) está ausente, expirou ou é inválido.\n\n💡 SOLUÇÃO:\nPor favor, atualize as suas credenciais e o Token de Acesso do AliExpress nas "Configurações do Site" (botão de engrenagem no topo do Painel Administrativo). Assim que guardar o novo token, as importações voltarão a funcionar instantaneamente!'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Importador robusto Temu via colagem de texto ou código fonte HTML
adminRouter.post('/products/import-temu-raw', async (req, res) => {
  try {
    const { rawContent, url, markup } = req.body;
    if (!rawContent) {
      return res.status(400).json({ error: 'O conteúdo de texto copiado ou código fonte HTML do produto é obrigatório.' });
    }

    console.log(`[TEMU BYPASS ENGINE] Analisando dados colados de Temu. Comprimento do texto: ${rawContent.length} caracteres...`);

    let title = "";
    let basePrice = 0.01;
    let description = "";
    let imageUrl = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=800";
    let colors: string[] = [];
    let sizes: string[] = [];

    // 1. TENTAR EXTRAIR SE FOR CÓDIGO FONTE HTML (MÉTODOS JSON-LD e META-TAGS)
    const jsonLdRegex = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let matchJson;
    while ((matchJson = jsonLdRegex.exec(rawContent)) !== null) {
      try {
        const parsed = JSON.parse(matchJson[1].trim());
        const findProductNode = (obj: any): any => {
          if (!obj) return null;
          if (obj["@type"] === "Product" || obj["@type"] === "http://schema.org/Product") return obj;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const result = findProductNode(item);
              if (result) return result;
            }
          } else if (typeof obj === "object") {
            if (obj["@graph"]) {
              const result = findProductNode(obj["@graph"]);
              if (result) return result;
            }
            for (const k in obj) {
              if (typeof obj[k] === "object") {
                const result = findProductNode(obj[k]);
                if (result) return result;
              }
            }
          }
          return null;
        };

        const prod = findProductNode(parsed);
        if (prod) {
          if (prod.name || prod.title) title = prod.name || prod.title || "";
          if (prod.description) description = prod.description || "";
          if (typeof prod.image === "string") {
            imageUrl = prod.image;
          } else if (Array.isArray(prod.image) && prod.image.length > 0) {
            imageUrl = prod.image[0];
          }
          
          if (prod.offers) {
            const offers = prod.offers;
            if (Array.isArray(offers) && offers.length > 0) {
              basePrice = parseFloat(String(offers[0].price || offers[0].lowPrice || "0"));
            } else if (typeof offers === "object") {
              basePrice = parseFloat(String(offers.price || offers.lowPrice || "0"));
            }
          }
        }
      } catch (e) {}
    }

    // Heurística secundária com Meta tags do HTML se disponíveis
    if (!title) {
      const titleMatch = rawContent.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                         rawContent.match(/<meta\s+name="title"\s+content="([^"]+)"/i) ||
                         rawContent.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1];
    }
    if (!imageUrl || imageUrl.includes("unsplash")) {
      const imgMatch = rawContent.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                       rawContent.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }
    if (basePrice <= 0.05) {
      const priceMatch = rawContent.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) ||
                         rawContent.match(/<meta\s+property="product:price:amount"\s+content="([^"]+)"/i) ||
                         rawContent.match(/<meta\s+property="goods:price"\s+content="([^"]+)"/i);
      if (priceMatch) basePrice = parseFloat(priceMatch[1]);
    }

    // 2. EXTRAIR SE FOR TEXTO COPIADO COM CTRL+A (PROCESSAMENTO DE LINHAS DO DOCUMENTO)
    const lines = rawContent.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    
    // Obter Preço a partir do Padrão Textual do E-Commerce
    if (basePrice <= 0.05) {
      for (const line of lines) {
        const priceMatch = line.match(/(?:€|\$|R\$|£)\s*(\d+(?:[.,]\d{2})?)/i) || 
                           line.match(/(\d+(?:[.,]\d{2})?)\s*(?:€|\$|R\$|£)/i);
        if (priceMatch) {
          basePrice = parseFloat(priceMatch[1].replace(",", "."));
          if (basePrice > 0) break;
        }
      }
    }

    // Obter Título a partir da primeira linha longa limpa que atue como cabeçalho de catálogo
    if (!title) {
      for (const line of lines) {
        if (line.length >= 25 && line.length <= 160 && !line.includes("http") && !line.includes("www") && !line.includes("<") && !line.includes("{")) {
          const lower = line.toLowerCase();
          const noise = ["política", "privacidade", "termos", "cookies", "entrar", "carrinho", "temu", "portugal", "grátis", "envio", "devolu"];
          const hasNoise = noise.some(n => lower.includes(n));
          if (!hasNoise) {
            title = line;
            break;
          }
        }
      }
    }

    // Escanear tamanhos e dimensões textuais clássicas (S, M, L, XL, Calçado, cm)
    const possibleSizes = ["S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL", "XS"];
    for (const line of lines) {
      const upperLine = line.toUpperCase().trim();
      if (possibleSizes.includes(upperLine)) {
        if (!sizes.includes(upperLine)) sizes.push(upperLine);
      }
      
      const numMatch = upperLine.match(/^(\d{2})$/);
      if (numMatch) {
        const numVal = parseInt(numMatch[1], 10);
        if (numVal >= 25 && numVal <= 50) {
          if (!sizes.includes(numMatch[1])) sizes.push(numMatch[1]);
        }
      }
    }

    // Escanear cores aproximadas em português
    const commonColors = [
      "preto", "branco", "azul", "vermelho", "verde", "amarelo", "rosa", "cinza", "marrom", "castanho", "laranja", 
      "roxo", "violeta", "bege", "lilás", "dourado", "prateado", "navy", "caqui", "creme", "grafite"
    ];
    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();
      if (commonColors.includes(lowerLine)) {
        const capitalized = line.charAt(0).toUpperCase() + line.slice(1);
        if (!colors.includes(capitalized)) colors.push(capitalized);
      }
    }

    // Fallbacks gerais se nada for extraído
    if (!title) title = "Produto Importado Temu";
    if (basePrice <= 0) basePrice = 9.99;
    if (!description) description = `Aproveite este fantástico item Temu. Produto importado de alta qualidade para o seu dia a dia.`;

    // Limpar título
    title = title.replace(/\s*-\s*Temu\s*Portugal/gi, "").replace(/\s*-\s*Temu/gi, "").trim();

    // Determinar ID externo único
    let externalId = '';
    const cleanUrl = String(url || '').trim();
    const match = cleanUrl.match(/[gG]-([a-zA-Z0-9]+)/) || cleanUrl.match(/_g_([a-zA-Z0-9]+)/);
    if (match) {
      externalId = 'temu_' + match[1];
    } else {
      const hashStr = title.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
      externalId = 'temu_' + hashStr + '_' + Date.now().toString().substring(10);
    }

    const priceMarkup = markup !== undefined ? Math.round(parseFloat(String(markup)) * 100) / 100 : 0;
    const finalPrice = Math.round((basePrice + priceMarkup) * 100) / 100;

    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from('products')
      .select('id, title, description, price, metadata, image_url, colors, sizes')
      .eq('aliexpress_id', externalId)
      .maybeSingle();

    const commonData: any = {
      aliexpress_id: externalId,
      title: (existing?.title && existing.title !== "Título não encontrado") ? existing.title : title,
      description: existing?.description || description,
      price: existing?.price || finalPrice,
      price_markup: priceMarkup,
      image_url: existing?.image_url || imageUrl,
      colors: existing?.colors || colors,
      sizes: existing?.sizes || sizes,
      colors_enabled: colors.length > 0,
      sizes_enabled: sizes.length > 0,
      provider: 'temu',
      admin_link: cleanUrl || 'https://www.temu.com',
      updated_at: new Date().toISOString(),
      metadata: {
        ...(existing?.metadata || {}),
        extracted_at: new Date().toISOString(),
        is_pasted_data: true,
        temu_original_price: basePrice,
        base_price: basePrice,
        pasted_chars_count: rawContent.length,
        url: cleanUrl
      }
    };

    let result_data;
    if (existing?.id) {
      const { data: updated, error: updateError } = await supabase
        .from('products')
        .update(commonData)
        .eq('id', existing.id)
        .select().single();
      if (updateError) throw updateError;
      result_data = updated;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .insert([{
          ...commonData,
          category: 'Importados',
          product_type: 'physical',
          is_active: true
        }])
        .select().single();
      if (insertError) throw insertError;
      result_data = inserted;
      broadcastProductCreated(result_data).catch(err => console.error('[EVENT BROADCAST ERROR]', err));
    }

    // Forçar recarga do schema do PostgREST
    try {
      await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" });
    } catch(e) {}

    res.json({ ...result_data, _isUpdate: !!existing });
  } catch (error: any) {
    console.error('[TEMU DIRECT IMPORT ENGINE FATAL ERROR]', error);
    res.status(500).json({ error: error.message || 'Erro fatal desconhecido ao ler o texto copiado.' });
  }
});

adminRouter.post('/products/sync-aliexpress-all', async (req, res) => {
  try {
    const supabase = getSupabase();
    console.log('[ADMIN] Iniciando sincronização massiva internacional...');
    
    const { data: products, error: fetchErr } = await supabase
      .from('products')
      .select('*')
      .eq('provider', 'aliexpress')
      .not('aliexpress_id', 'is', null);

    if (fetchErr) throw fetchErr;

    let successCount = 0;
    let deactivatedCount = 0;
    let failedCount = 0;

    for (const product of products) {
      try {
        const aliId = product.aliexpress_id;
        if (!aliId) continue;

        try {
          const data = await fetchAliExpressProduct(aliId);
          const parsed = parseAliExpressProduct(data);
          
          const markup = product.price_markup || 0;
          const basePrice = Math.round((parsed.price || 0) * 100) / 100;
          const newPrice = Math.round((basePrice + markup) * 100) / 100;

          await supabase.from('products').update({
            price: newPrice,
            last_aliexpress_sync: new Date().toISOString(),
            is_active: true,
            metadata: {
              ...product.metadata,
              variations: parsed.metadata.variations,
              base_price: basePrice,
              last_sync_success: new Date().toISOString()
            }
          }).eq('id', product.id);

          successCount++;
        } catch (aliErr: any) {
          if (aliErr.message?.includes('not found') || aliErr.message?.includes('não encontrado')) {
            console.log(`[ADMIN] Produto ${product.id} (${aliId}) não encontrado no AliExpress. Desativando...`);
            await supabase.from('products').update({ 
               is_active: false,
               last_aliexpress_sync: new Date().toISOString()
            }).eq('id', product.id);
            deactivatedCount++;
          } else {
            failedCount++;
          }
        }
      } catch (err) {
        console.error(`[ADMIN SYNC ERROR] Produto ${product.id}:`, err);
        failedCount++;
      }
      
      await new Promise(r => setTimeout(r, 600));
    }

    res.json({ success: true, successCount, deactivatedCount, failedCount });
  } catch (error: any) {
    console.error('[ADMIN ALIEXPRESS SYNC ALL ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/categories/resync', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: products, error: pError } = await supabase.from('products').select('category');
    if (pError) throw pError;
    
    const uniqueCategories = Array.from(new Set(products?.map(p => p.category).filter(Boolean) || []));
    const { data: existingCats, error: cError } = await supabase.from('categories').select('name');
    if (cError) throw cError;
    
    const existingNames = new Set(existingCats?.map(c => c.name) || []);
    const toInsert = uniqueCategories.filter(name => !existingNames.has(name)).map(name => ({ name }));
    
    if (toInsert.length > 0) {
      await supabase.from('categories').insert(toInsert);
    }
    
    res.json({ success: true, added: toInsert.length });
  } catch (err: any) {
    console.error('[ADMIN CATEGORY RESYNC ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const supabase = getSupabase();

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
      
      if (!profile?.is_admin) {
        return res.status(403).json({ error: "Apenas administradores podem eliminar produtos permanentemente." });
      }
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Clean up store events and notify clients
    await broadcastProductDeleted(id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'completed', 'refunded', 'pending', 'cancelled'
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    // Disparar notificação automática por e-mail
    triggerOrderNotification(id, status, data.shipping_status || 'pending', data).catch(e => console.error('[ADM STATUS EMAIL ERROR]', e));
    
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.put('/orders/:id/shipping', async (req, res) => {
  try {
    const { id } = req.params;
    const { shipping_status } = req.body;
    const supabase = getSupabase();

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    // Now update shipping_status
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({ shipping_status })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    
    // Disparar notificação automática
    triggerOrderNotification(id, updatedOrder?.status || order.status, shipping_status, updatedOrder || order).catch(e => console.error('[ADM SHIPPING EMAIL ERROR]', e));
    
    // Respond with updated final status and shipping
    res.json({ success: true, status: order.status, shipping_status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/orders/:id/fulfill', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[ADMIN FULFILL] Recebida solicitação manual para ordem ${id}`);
    const supabase = getSupabase();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (order.status !== 'paid' && order.status !== 'completed' && order.status !== 'pago') {
      return res.status(400).json({ error: 'Apenas pedidos com pagamento confirmado podem ser enviados para o fornecedor' });
    }

    // Executar envio para o AliExpress em modo manual forçado
    const fulfillResult = await processOrderFulfillment(order, true);
    
    // Buscar ordem atualizada para retornar pro front
    const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', id).single();
    
    res.json({ 
      success: true, 
      message: fulfillResult?.message || 'Pedido enviado com sucesso para o AliExpress!',
      order_id: fulfillResult?.order_id || updatedOrder?.provider_order_id,
      order: updatedOrder
    });
  } catch (error: any) {
    console.error(`[ADMIN FULFILL ERROR]`, error);
    res.status(500).json({ error: error.message || 'Falha ao processar envio no AliExpress' });
  }
});

adminRouter.post('/orders/batch-fulfill', async (req, res) => {
  try {
    const { order_ids } = req.body;
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'Lista de IDs de pedidos inválida ou vazia.' });
    }

    console.log(`[ADMIN BATCH FULFILL] Processando ${order_ids.length} pedidos em lote...`);
    const supabase = getSupabase();

    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('*')
      .in('id', order_ids);

    if (ordersErr || !orders) {
      return res.status(500).json({ error: 'Erro ao buscar pedidos no banco de dados' });
    }

    const results: Array<{ id: string; success: boolean; order_id?: string; error?: string }> = [];

    for (const ord of orders) {
      try {
        if (ord.status !== 'paid' && ord.status !== 'completed' && ord.status !== 'pago') {
          results.push({ id: ord.id, success: false, error: 'Pedido não está pago' });
          continue;
        }

        const resFulfill = await processOrderFulfillment(ord, true);
        results.push({ 
          id: ord.id, 
          success: true, 
          order_id: resFulfill?.order_id || ord.provider_order_id 
        });
      } catch (err: any) {
        results.push({ id: ord.id, success: false, error: err.message });
      }
    }

    const fulfilledCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      total: order_ids.length,
      fulfilled: fulfilledCount,
      failed: failedCount,
      results
    });
  } catch (err: any) {
    console.error(`[ADMIN BATCH FULFILL ERROR]`, err);
    res.status(500).json({ error: err.message });
  }
});

async function syncOrderWithExternalSources(id: string) {
  const supabase = getSupabase();

  // 1. Buscar Pedido (Sem join para evitar falhas do PostgREST)
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !order) {
    console.error(`[SYNC ERROR] Order ${id} not found in DB:`, fetchError || 'Record missing');
    return { success: false, error: 'Ordem não encontrada no sistema local' };
  }

  // 2. Buscar Produto
  let product = null;
  if (order.product_id) {
    const { data: prodData } = await supabase.from('products').select('*').eq('id', order.product_id).maybeSingle();
    product = prodData;
  }
  
  // Identificação robusta do provedor
  let provider = order.provider;
  if (!provider) {
    if (product?.provider) provider = product.provider;
    else if (product?.aliexpress_id) provider = 'aliexpress';
    else provider = 'aliexpress'; // Default
  }
  
  // Buscar o ID externo em todas as colunas possíveis
  let providerOrderId = order.provider_order_id;

  if (provider === 'aliexpress' && (!providerOrderId || String(providerOrderId).trim() === '')) {
    return { success: false, error: 'Aviso: Esta encomenda ainda não foi enviada para o fornecedor ou o envio falhou. Faça o Envio Manual primeiro.' };
  }
  
  const providerLabel = provider === 'aliexpress' ? 'AliExpress' : 'Local';
  
  if (provider === 'aliexpress') {
    providerOrderId = cleanAliExpressId(providerOrderId);
  }

  console.log(`[SYNC LOG] Sincronizando: ${providerLabel} | Ordem: ${id} | ExtID: ${providerOrderId}`);

  // 1. Tentar encontrar ID se não existir
  if (!providerOrderId) {
    // No AliExpress, se não temos ID, podemos estar em um estado onde falhou o salvamento mas o pedido foi feito?
    // Verificamos se há algum erro de fulfillment anterior
    if (!providerOrderId && order.fulfillment_error && order.fulfillment_error.includes('duplicate')) {
       // Talvez tentar buscar? Mas sem ID é difícil.
    }
  }

  if (!providerOrderId) {
    return { 
        success: false, 
        error: 'PEDIDO_NAO_ENCONTRADO', 
        provider: providerLabel,
        message: `Este pedido ainda não está vinculado ao fornecedor ${providerLabel}. Verifique se ele já foi processado/enviado manualmente.` 
    };
  }

  let externalData: any = null;
  let externalStatus = "";
  let trackingNumber = "";
  let trackingUrl = "";

  if (provider === 'aliexpress') {
    try {
      console.log(`[SYNC ALIEXPRESS] Consultando status real do pedido #${providerOrderId} no AliExpress...`);
      externalData = await getAliExpressOrderDetail(String(providerOrderId));
      if (externalData) {
        externalStatus = externalData.order_status || externalData.status || "";
        console.log(`[SYNC ALIEXPRESS] Retorno do AliExpress para #${providerOrderId}: status="${externalStatus}"`);
        
        // Extrair código de rastreamento se disponível
        if (externalData.logistics_info_list && externalData.logistics_info_list.aeop_logistics_info) {
          const list = Array.isArray(externalData.logistics_info_list.aeop_logistics_info) 
            ? externalData.logistics_info_list.aeop_logistics_info 
            : [externalData.logistics_info_list.aeop_logistics_info];
          const logInfo = list.find((item: any) => item.logistics_no);
          if (logInfo?.logistics_no) {
            trackingNumber = logInfo.logistics_no;
            trackingUrl = `https://global.cainiao.com/detail.htm?mailNoList=${trackingNumber}`;
          }
        }
      } else {
        console.warn(`[SYNC ALIEXPRESS WARN] Pedido #${providerOrderId} não retornou dados da API do AliExpress`);
      }
    } catch (aliSyncErr: any) {
      console.error(`[SYNC ALIEXPRESS ERROR] Erro ao consultar #${providerOrderId}:`, aliSyncErr.message);
    }
  } else {
    try {
      // Outros provedores
    } catch (err: any) {
      console.error(`[SYNC API ERROR] Provider: ${provider}, ID: ${providerOrderId}:`, err.message);
      return { success: false, error: 'ERRO_API_EXTERNA', message: err.message };
    }
  }

  const updateData: any = { updated_at: new Date().toISOString() };
  
  // VERIFICAÇÃO STRIPE (Blindagem contra CS_TEST expirados ou sessões não encontradas)
  if (stripe && order.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
        expand: ['payment_intent', 'payment_intent.latest_charge']
      });
      
      if (session.payment_intent && !order.stripe_payment_intent) {
        updateData.stripe_payment_intent = typeof session.payment_intent === 'string' 
          ? session.payment_intent 
          : (session.payment_intent as any).id;
      }

      if (session.payment_status === 'paid') {
         updateData.payment_status = 'paid';
      }

      const pi = session.payment_intent as Stripe.PaymentIntent;
      if (pi && pi.latest_charge) {
         const charge = pi.latest_charge as Stripe.Charge;
         if (charge.refunded) {
           updateData.payment_status = 'refunded';
           updateData.status = 'refunded';
         }
      }
    } catch (stripeErr: any) {
      // Blindagem silenciosa para sessões de teste expiradas
      if (stripeErr.message?.includes('No such checkout.session') && order.stripe_session_id?.startsWith('cs_test_')) {
        console.log(`[SYNC STRIPE INFO] Ignorando sessão de teste legada: ${order.stripe_session_id}`);
      } else {
        console.warn(`[SYNC STRIPE WARN] Order ${id} session not found:`, stripeErr.message);
      }
    }
  }

  // DETECÇÃO ROBUSTA DE STATUS DO ALIEXPRESS (INCLUINDO CANCELAMENTO)
  const statusUpper = String(externalStatus || "").toUpperCase();
  let isAliCanceled = false;
  let aliEndReason = "";

  if (externalData) {
    const childItems = externalData.child_order_list?.aeop_child_order_info 
      ? (Array.isArray(externalData.child_order_list.aeop_child_order_info) 
          ? externalData.child_order_list.aeop_child_order_info 
          : [externalData.child_order_list.aeop_child_order_info])
      : [];
    
    const childEndReasons = childItems.map((c: any) => String(c.end_reason || '').toUpperCase());
    const childEndDescs = childItems.map((c: any) => String(c.end_reason_desc || '').toLowerCase());
    const rootEndReason = String(externalData.end_reason || '').toUpperCase();
    const rootEndDesc = String(externalData.end_reason_desc || '').toLowerCase();

    const allReasons = [rootEndReason, ...childEndReasons].filter(Boolean);
    const allDescs = [rootEndDesc, ...childEndDescs].filter(Boolean);

    const hasCancelReason = allReasons.some(r => 
      ['CANCELED', 'CANCELLED', 'BUYER_CANCEL_ORDER', 'BUYER_PAY_TIMEOUT', 'SELLER_CANCEL', 'PAY_TIMEOUT', 'ORDER_CANCELED', 'CLOSED'].includes(r)
    );
    const hasCancelDesc = allDescs.some(d => 
      d.includes('cancel') || d.includes('closed') || d.includes('timeout') || d.includes('fechado')
    );

    if (['CANCELLED', 'CANCELED', 'VOID', 'CLOSED', 'IN_CANCEL'].includes(statusUpper)) {
      isAliCanceled = true;
      aliEndReason = allReasons[0] || statusUpper;
    } else if (statusUpper === 'FINISH' && (hasCancelReason || hasCancelDesc)) {
      isAliCanceled = true;
      aliEndReason = allReasons[0] || (hasCancelDesc ? 'Cancelado no AliExpress' : 'FINISH_CANCELED');
    }
  }

  if (isAliCanceled) {
    console.log(`[SYNC CANCEL DETECTED] O pedido #${order.id} foi identificado como CANCELADO no AliExpress (Motivo: ${aliEndReason})`);
    if (!['refunded', 'refund_pending'].includes(order.status)) {
      updateData.status = 'canceled';
      updateData.shipping_status = 'canceled';
    }
  } else if (['FINISH', 'COMPLETED', 'SHIPPED_TO_SENDER'].includes(statusUpper)) {
    updateData.status = 'completed';
    updateData.shipping_status = 'delivered';
  } else if (['SELLER_SEND_GOODS', 'SHIPPED', 'WAIT_BUYER_ACCEPT_GOODS'].includes(statusUpper)) {
    updateData.status = 'paid';
    updateData.shipping_status = 'sent';
  } else if (['WAIT_SELLER_SEND_GOODS', 'WAIT_SELLER_SEND', 'PLACE_ORDER_SUCCESS', 'RISK_CONTROL'].includes(statusUpper)) {
    updateData.status = 'paid';
    if (!['sent', 'delivered'].includes(order.shipping_status)) {
      updateData.shipping_status = 'preparing';
    }
  } else if (['WAIT_BUYER_PAY', 'PENDING'].includes(statusUpper)) {
    // Pedido criado aguardando pagamento
    if (order.status !== 'canceled' && order.status !== 'refunded') {
      if (!order.shipping_status || order.shipping_status === 'pending') {
        updateData.shipping_status = 'preparing';
      }
    }
  } else if (['IN_ISSUE', 'IN_DISPUTE'].includes(statusUpper)) {
    updateData.shipping_status = 'disputed';
  }

  // Garantir metadados atualizados
  const prevMeta = (order.shipping_status_metadata && typeof order.shipping_status_metadata === 'object')
    ? order.shipping_status_metadata
    : {};

  updateData.shipping_status_metadata = {
    ...prevMeta,
    syncedAt: new Date().toISOString(),
    lastExternalStatus: isAliCanceled ? `CANCELADO NO ALIEXPRESS (${aliEndReason || 'CANCELED'})` : (externalStatus || prevMeta.lastExternalStatus || 'DESCONHECIDO'),
    ...(isAliCanceled ? { ali_canceled_at: new Date().toISOString(), ali_end_reason: aliEndReason } : {})
  };

  if (trackingNumber) {
    updateData.shipping_tracking_code = trackingNumber;
    updateData.shipping_tracking_url = trackingUrl || `https://www.17track.net/en/track?nums=${trackingNumber}`;
    updateData.shipping_status_metadata.trackingNumber = trackingNumber;
    updateData.shipping_status_metadata.trackingUrl = updateData.shipping_tracking_url;
    
    if (!updateData.shipping_status && !['delivered', 'sent', 'out_for_delivery', 'canceled'].includes(order.shipping_status)) {
      updateData.shipping_status = 'sent';
    }
  }

  const hasChanges = Object.keys(updateData).some(key => {
    if (key === 'updated_at') return false;
    if (key === 'shipping_status_metadata') {
      return JSON.stringify(updateData[key]) !== JSON.stringify(order[key]);
    }
    return updateData[key] !== order[key];
  });

  if (hasChanges) {
    const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', id);
    if (updateError) {
      console.error(`[SYNC DB UPDATE ERROR]`, updateError);
      return { success: false, error: 'Falha ao atualizar no banco: ' + updateError.message };
    }
    
    // Auto Email em alterações de status importantes
    if (updateData.status || updateData.shipping_status) {
      triggerOrderNotification(order.id, updateData.status || order.status, updateData.shipping_status || order.shipping_status, { ...order, ...updateData }).catch(e => console.error(e));
    }
  }

  // Fetch fresh order
  const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', id).single();

  return { 
    success: true, 
    synced: hasChanges, 
    external_status: isAliCanceled ? 'CANCELADO NO ALIEXPRESS' : (externalStatus || 'OK'),
    provider: providerLabel,
    externalId: providerOrderId,
    updatedOrder
  };
}

adminRouter.post('/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { refund_stripe, reason } = req.body;
    const supabase = getSupabase();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    console.log(`[ADMIN CANCEL ORDER] Cancelando pedido ${id}... Reembolso Stripe: ${!!refund_stripe}`);

    let stripeRefundDone = false;
    let stripeRefundMessage = "";

    // Se solicitado estorno Stripe (ou se o pedido estiver pago e for solicitado)
    if (refund_stripe && (order.stripe_payment_intent || order.stripe_session_id) && order.payment_status !== 'refunded') {
      try {
        const refunded = await processRefundInternal(id);
        if (refunded) {
          stripeRefundDone = true;
          stripeRefundMessage = "Reembolso executado com sucesso no Stripe.";
        }
      } catch (refundErr: any) {
        console.error(`[ADMIN CANCEL STRIPE ERROR]`, refundErr);
        stripeRefundMessage = `Aviso: Falha ao estornar automaticamente no Stripe (${refundErr.message}).`;
      }
    }

    // Verificar e sincronizar com AliExpress se houver vínculo
    let aliStatus = null;
    let aliUrl = null;
    if (order.provider_order_id) {
      aliUrl = `https://trade.aliexpress.com/order_detail.htm?orderId=${order.provider_order_id}`;
      try {
        aliStatus = await getAliExpressOrderDetail(String(order.provider_order_id));
      } catch (aliErr: any) {
        console.warn(`[ADMIN CANCEL ALI WARN]`, aliErr.message);
      }
    }

    const prevMeta = (order.shipping_status_metadata && typeof order.shipping_status_metadata === 'object')
      ? order.shipping_status_metadata
      : {};

    const updatedMeta = {
      ...prevMeta,
      admin_canceled_at: new Date().toISOString(),
      cancel_reason: reason || 'Cancelado pelo administrador',
      ali_manage_url: aliUrl,
      lastExternalStatus: 'CANCELADO NA LOJA'
    };

    const updatePayload: any = {
      status: stripeRefundDone ? 'refunded' : 'canceled',
      shipping_status: 'canceled',
      refund_reason: reason || 'Cancelado pelo administrador',
      shipping_status_metadata: updatedMeta,
      updated_at: new Date().toISOString()
    };

    if (stripeRefundDone) {
      updatePayload.payment_status = 'refunded';
    }

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Disparar e-mail de notificação de cancelamento para o cliente
    triggerOrderNotification(id, updatedOrder.status, 'canceled', updatedOrder).catch(e => console.error('[CANCEL EMAIL ERROR]', e));

    const aliMessage = order.provider_order_id 
      ? ` O pedido #${order.provider_order_id} no AliExpress foi sincronizado.`
      : '';

    res.json({
      success: true,
      message: `Pedido cancelado com sucesso!${aliMessage} ${stripeRefundMessage}`.trim(),
      order: updatedOrder,
      ali_url: aliUrl
    });
  } catch (error: any) {
    console.error(`[ADMIN CANCEL FATAL ERROR]`, error);
    res.status(500).json({ error: error.message || 'Erro ao cancelar o pedido' });
  }
});

adminRouter.post('/orders/sync-all-ali', async (req, res) => {
  try {
    const supabase = getSupabase();
    console.log(`[SYNC ALL ALI] Iniciando sincronização em lote com o AliExpress...`);

    // Buscar todos os pedidos vinculados ao AliExpress ou que tenham provider_order_id
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, provider_order_id, status, shipping_status')
      .not('provider_order_id', 'is', null)
      .neq('provider_order_id', '');

    if (error) throw error;

    if (!orders || orders.length === 0) {
      return res.json({ success: true, message: 'Nenhum pedido vinculado ao AliExpress encontrado.', total: 0, updated: 0 });
    }

    let updatedCount = 0;
    let canceledCount = 0;
    const results = [];

    for (const ord of orders) {
      try {
        const syncRes = await syncOrderWithExternalSources(ord.id);
        if (syncRes.success && syncRes.synced) {
          updatedCount++;
          if (syncRes.updatedOrder?.status === 'canceled' || syncRes.external_status?.includes('CANCELADO')) {
            canceledCount++;
          }
        }
        results.push({ id: ord.id, aliId: ord.provider_order_id, success: syncRes.success, status: syncRes.external_status });
      } catch (err: any) {
        console.error(`[SYNC ALL ALI ERR] Order ${ord.id}:`, err.message);
        results.push({ id: ord.id, aliId: ord.provider_order_id, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Sincronização concluída! ${orders.length} pedidos verificados (${updatedCount} atualizados, ${canceledCount} cancelamentos detectados).`,
      total: orders.length,
      updated: updatedCount,
      canceled: canceledCount,
      details: results
    });
  } catch (error: any) {
    console.error(`[SYNC ALL ALI FATAL ERROR]`, error);
    res.status(500).json({ error: error.message || 'Erro ao sincronizar pedidos' });
  }
});

adminRouter.post('/orders/:id/sync_payment', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncOrderWithExternalSources(id);
    if (!result.success) {
      if (result.error && result.error.startsWith('Aviso:')) {
        return res.status(400).json(result);
      }
      return res.status(result.error === 'Ordem não encontrada no sistema local' ? 404 : 500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/products/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error || !product) return res.status(404).json({ error: 'Produto não encontrado' });
    
    const provider = product.provider || (product.aliexpress_id ? 'aliexpress' : 'manual');
    const providerLabel = provider === 'aliexpress' ? 'Internacional' : 'Local';
    let exists = false;
    let stock = 0;
    let message = "";
    
    console.log(`[VERIFY] Verificando integridade de ${product.title} no provedor ${providerLabel}...`);

    if (provider === 'aliexpress') {
      const aliProduct = await getAliExpressProductDetail(product.aliexpress_id);
      if (aliProduct) {
        exists = true;
        // aliexpress_ds_product_get_response gives status in result
        message = "Link de fornecedor ativo.";
      } else {
        message = "Link de fornecedor inativo ou erro na API.";
      }
    } else {
      exists = true;
      message = "Produto manual (Local).";
    }
    
    res.json({ success: true, exists, stock, message, provider });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Download Route
apiRouter.get('/orders/:orderId/download', async (req, res) => {
  const { orderId } = req.params;
  console.log(`[DOWNLOAD] Request for Order: ${orderId}`);

  try {
    const supabase = getSupabase();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .in('status', ['paid', 'completed'])
      .single();

    if (orderError) {
      console.error(`[DOWNLOAD ERROR] DB fail:`, orderError);
      return res.status(404).json({ error: `Ordem não encontrada: ${orderError.message}` });
    }

    // Fetch product separately
    if (!order.products && order.product_id) {
      const { data: prod } = await supabase.from('products').select('*').eq('id', order.product_id).maybeSingle();
      if (prod) order.products = prod;
    }

    const productData = Array.isArray(order.products) ? order.products[0] : order.products;
    if (!order || !productData) {
      return res.status(404).json({ error: 'Produto não associado a esta ordem.' });
    }

    const originalPath = productData.file_url || '';
    
    // Se for URL externo
    if (originalPath.startsWith('http')) {
      return res.json({ url: originalPath });
    }

    let sanitizedPath = originalPath.replace(/^\/+/, '');
    if (sanitizedPath.startsWith('vault/')) {
      sanitizedPath = sanitizedPath.replace('vault/', '');
    }
    
    console.log(`[DOWNLOAD] Sanitized Path: "${sanitizedPath}" (raw: "${originalPath}") in bucket "vault"`);

    // Try primary path in 'vault' bucket
    let { data, error: storageError } = await supabase.storage
      .from('vault')
      .createSignedUrl(sanitizedPath, 3600);

    // Fallback: Try 'ebooks' bucket
    if (storageError && storageError.message === 'Object not found') {
       console.log(`[DOWNLOAD] Not found in "vault". Trying "ebooks" bucket...`);
       const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('ebooks')
        .createSignedUrl(sanitizedPath, 3600);
       
       if (!fallbackError && fallbackData) {
         data = fallbackData;
         storageError = null;
       }
    }

    // Fallback: If still fails, try 'ebooks/' subfolder in 'vault'
    if (storageError && storageError.message === 'Object not found') {
      console.log(`[DOWNLOAD] Not found in "ebooks" bucket. Trying "ebooks/" subfolder in "vault"...`);
      const fallbackPath = `ebooks/${sanitizedPath}`;
      const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('vault')
        .createSignedUrl(fallbackPath, 3600);
      
      if (!fallbackError && fallbackData) {
        data = fallbackData;
        storageError = null;
      }
    }

    if (storageError) {
      console.error(`[DOWNLOAD ERROR] Storage fail for "${sanitizedPath}":`, storageError);
      return res.status(404).json({ error: `Fisheiro não encontrado: ${storageError.message}` });
    }

    console.log(`[DOWNLOAD SUCCESS] Link generated for ${sanitizedPath}`);
    res.json({ url: data.signedUrl });
  } catch (error: any) {
    console.error(`[DOWNLOAD FATAL]:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Request Refund Route (User initiated)
apiRouter.post('/request-refund', async (req, res) => {
  const { orderId, userId, reason } = req.body;
  if (!orderId || !userId) return res.status(400).json({ error: 'Missing parameters' });

  const supabase = getSupabase();

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (order.status !== 'paid' && order.status !== 'completed') {
      return res.status(400).json({ error: 'Apenas ordens pagas ou concluídas podem ser reembolsadas.' });
    }

    // Update status to 'refund_requested' for admin review
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'refund_requested',
        refund_reason: reason || 'Não especificado',
        selected_options: { 
          ...order.selected_options, 
          refund_requested_at: new Date().toISOString()
        } 
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    return res.json({ success: true, message: 'Pedido de reembolso enviado para análise administrativa.' });
  } catch (err: any) {
    console.error('[REQUEST REFUND ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Update Order Address Route (User initiated while pending)
apiRouter.put('/orders/:id/address', async (req, res) => {
  const { id } = req.params;
  const { userId, address, city, zip, phone, email } = req.body;
  
  if (!id || !userId) return res.status(400).json({ error: 'Faltam parâmetros obrigatórios.' });

  const supabase = getSupabase();

  try {
    // 1. Verificar propriedade e status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    // 2. Só permitir alteração se ainda não foi enviado ou está pendente
    // Se shipping_status for 'sent' ou 'delivered', já foi processado demais para mudar a morada
    if (order.shipping_status === 'sent' || order.shipping_status === 'delivered') {
      return res.status(400).json({ error: 'O pedido já foi enviado e a morada não pode mais ser alterada.' });
    }

    // 3. Atualizar shipping_details preservando outros dados se existirem
    const currentDetails = typeof order.shipping_details === 'string' 
      ? JSON.parse(order.shipping_details) 
      : (order.shipping_details || {});

    const updatedDetails = {
      ...currentDetails,
      address: address || currentDetails.address,
      city: city || currentDetails.city,
      zip: zip || currentDetails.zip,
      phone: phone || currentDetails.phone,
      email: email || currentDetails.email || order.customer_email
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        shipping_details: updatedDetails,
        customer_email: updatedDetails.email,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    console.log(`[ADDRESS UPDATE] Pedido ${id} atualizado pelo usuário ${userId}`);
    return res.json({ success: true, message: 'Morada de envio atualizada com sucesso.' });

  } catch (err: any) {
    console.error('[ADDRESS UPDATE ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Update Profile Saved Address Route
apiRouter.post('/profile/address', async (req, res) => {
  const { userId, savedAddress } = req.body;
  if (!userId || !savedAddress) {
    return res.status(400).json({ error: 'Parâmetros userId e savedAddress são obrigatórios.' });
  }

  const supabase = getSupabase();
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        saved_address: savedAddress,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    return res.json({ success: true, message: 'Endereço predefinido guardado com sucesso.' });
  } catch (err: any) {
    console.error('[SAVE ADDRESS ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin Refund Processing (Initiates Stripe refund, otherwise updates local state)
adminRouter.post('/orders/:id/refund', async (req, res) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'];
  const supabase = getSupabase();

  try {
    // Check if requester is admin
    const { data: requester } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
    if (!requester?.is_admin) {
      return res.status(403).json({ error: "Acesso negado: apenas administradores podem processar reembolsos." });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    // Trigger real Stripe refund
    const refundSuccess = await processRefundInternal(id);
    
    if (refundSuccess) {
      return res.json({ 
        success: true, 
        message: 'Reembolso processado com sucesso na Stripe.'
      });
    } else {
      // Fallback: If Stripe call failed but we want to mark it locally anyway?
      // Better to return error if financial side failed.
      return res.status(500).json({ 
        error: 'Falha ao processar reembolso na Stripe. Verifique os logs.'
      });
    }
  } catch (err: any) {
    console.error('[ADMIN REFUND ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin Cancel Refund Request
adminRouter.post('/orders/:id/cancel-refund', async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (order.status !== 'refund_requested') {
      return res.status(400).json({ error: 'Apenas pedidos com status "Reembolso Solicitado" podem ser cancelados.' });
    }

    // Set back to 'paid' so everything returns to normal (access restored)
    await supabase.from('orders').update({ 
      status: 'paid',
      selected_options: {
        ...(order.selected_options || {}),
        refund_refusal_at: new Date().toISOString()
      }
    }).eq('id', id);

    return res.json({ success: true, message: 'Pedido de reembolso recusado. O acesso à obra foi restabelecido.' });
  } catch (err: any) {
    console.error('[ADMIN CANCEL REFUND ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Routers mounted at top

// Global API error handler
apiRouter.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API ERROR HANDLER]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    path: req.path
  });
});

apiRouter.post('/create-payment-session', express.json(), async (req, res) => {
  try {
    const { product, customer, baseUrl, selectedOptions, couponCode, currency } = req.body;
    const qty = Math.max(1, customer?.quantity || 1);
    
    if (!stripe) {
      console.warn("[CHECKOUT] STRIPE_SECRET_KEY não configurada. Por favor, configure a chave live nas definições.");
      return res.status(400).json({ error: "O sistema de pagamentos não está configurado." });
    }

    const productId = product?.id;
    if (!productId) {
      return res.status(400).json({ error: "O ID do produto é obrigatório." });
    }

    const supabase = getSupabase();
    const { data: dbProduct, error: productFetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (productFetchError || !dbProduct) {
      console.error("[CHECKOUT ERROR] Produto não encontrado no banco:", productFetchError);
      return res.status(404).json({ error: "Produto inválido ou indisponível." });
    }

    // Secure base price from verified database item
    let basePrice = (dbProduct.pvp !== undefined && dbProduct.pvp !== null && dbProduct.pvp !== 0) 
      ? dbProduct.pvp 
      : dbProduct.price;

    if (dbProduct.discount_percent && Number(dbProduct.discount_percent) > 0) {
      basePrice = basePrice * (1 - Number(dbProduct.discount_percent) / 100);
    }

    let unitAmount = Math.round(basePrice * 100);
    let shippingFee = 115; // 1.15 EUR in cents

    if (currency && currency.toUpperCase() !== 'EUR') {
      const rateResponse = await fetch(`https://api.exchangerate-api.com/v4/latest/EUR`);
      const ratesData = await rateResponse.json();
      const rate = ratesData.rates[currency.toUpperCase()] || 1;
      unitAmount = Math.round(unitAmount * rate);
      shippingFee = Math.round(shippingFee * rate);
    }
    
    // Apply Coupon
    if (couponCode) {
        // 1. Fetch Coupon
        const { data: coupon, error: couponError } = await supabase
            .from('coupons')
            .select('id, percentage_discount')
            .eq('code', couponCode.toUpperCase())
            .eq('is_active', true)
            .maybeSingle();
            
        if (couponError || !coupon) {
            return res.status(400).json({ error: "Cupom inválido ou inativo." });
        }

        // 2. Check Usage
        const { data: usage, error: usageError } = await supabase
            .from('coupon_usage')
            .select('id')
            .eq('coupon_id', coupon.id)
            .eq('user_id', customer.userId)
            .maybeSingle();
        
        if (usage) {
            return res.status(400).json({ error: "Este cupom já foi utilizado." });
        }

        // 3. Record Usage
        const { error: insertError } = await supabase.from('coupon_usage').insert({
            coupon_id: coupon.id,
            user_id: customer.userId
        });
        
        if (insertError) {
          console.error("Failed to insert coupon usage:", insertError);
          return res.status(500).json({ error: "Erro ao registrar cupom. Tente novamente mais tarde." });
        }

        unitAmount = Math.round(unitAmount * (1 - coupon.percentage_discount / 100));
    }

    const lineItems: any[] = [{
      price_data: {
        currency: (currency || 'eur').toLowerCase(),
        product_data: {
          name: dbProduct.title || "Produto",
          description: (dbProduct.description && dbProduct.description.trim() !== "") ? dbProduct.description.substring(0, 120) : undefined,
          images: dbProduct.image_url ? [dbProduct.image_url] : [],
        },
        unit_amount: unitAmount,
      },
      quantity: qty,
    }];

    const freeShipping = !!dbProduct.free_shipping;

    // Add shipping fee if not free shipping
    if (!freeShipping) {
      lineItems.push({
        price_data: {
          currency: (currency || 'eur').toLowerCase(),
          product_data: {
            name: 'Taxa de Envio',
            description: 'Envio Internacional Seguro',
          },
          unit_amount: shippingFee,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}?payment_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}?payment_status=cancel`,
      customer_email: customer.email,
      metadata: {
        customer_data: JSON.stringify(customer),
        product_id: String(dbProduct.id),
        quantity: String(qty),
        selected_options: JSON.stringify(selectedOptions || {}),
        currency: currency || 'EUR',
        subtotal: String(qty * basePrice),
        shipping_cost: freeShipping ? "0" : String(shippingFee / 100),
        discount_amount: String((qty * (Math.round(basePrice * 100) - unitAmount)) / 100)
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("[STRIPE ERROR]", error);
    res.status(500).json({ error: error.message });
  }
});

// Public Endpoint to fetch products reliably from server side (bypasses client-side auth/locks)
app.get('/api/products', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PUBLIC API /api/products SUPABASE ERROR]', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (err: any) {
    console.error('[PUBLIC API /api/products FATAL ERROR]', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Global catch-all for any unmatched /api routes to prevent HTML fallback
app.all('/api/*', (req, res) => {
  console.warn(`[API 404] ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: 'API route not found', 
    path: req.url,
    timestamp: new Date().toISOString()
  });
});

// --- VITE MIDDLEWARE ---
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  
  // CUSTOM MIDDLEWARE TO INJECT PRODUCT META TAGS IN DEV
  app.use(async (req, res, next) => {
    const productId = extractProductId(req);
    console.log(`[DEV META MIDDLEWARE] Path: ${req.path} | Extracted Product ID: ${productId}`);

    // Only process for GET requests that are likely for HTML
    const isGet = req.method === 'GET';
    const isAsset = req.path.includes('.') && !req.path.endsWith('.html');

    if (productId && isGet && !isAsset) {
      try {
        const product = await getProductForMeta(productId);
        if (product) {
          const userAgent = req.headers['user-agent'] || '';
          console.log(`[META DEV] Injecting meta for product: ${productId} | UA: ${userAgent}`);
          
          const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
          const transformedHtml = await vite.transformIndexHtml(req.originalUrl, indexHtml);
          
          const origin = getPublicOrigin(req);
          const fullUrl = `${origin}${req.originalUrl}`;
          
          const hydratedHtml = await getHydratedHtml(transformedHtml, product, fullUrl);
          
          return res.status(200).set({ 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Meta-Injected': 'true'
          }).end(hydratedHtml);
        }
      } catch (err) {
        console.error('[DEV META INJECT ERROR]', err);
      }
    }
    next();
  });

  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { index: false })); // Disable default index serving to handle it manually
    
    // Explicitly allow robots.txt, sitemap.xml and llms.txt to prevent any redirection
    app.get('/robots.txt', (req, res) => {
      const robotsPath = fs.existsSync(path.join(distPath, 'robots.txt'))
        ? path.join(distPath, 'robots.txt')
        : path.join(process.cwd(), 'public', 'robots.txt');
      if (fs.existsSync(robotsPath)) {
        res.status(200).sendFile(robotsPath);
      } else {
        res.status(404).send('Not found');
      }
    });

    app.get('/sitemap.xml', (req, res) => {
      const sitemapPath = fs.existsSync(path.join(distPath, 'sitemap.xml'))
        ? path.join(distPath, 'sitemap.xml')
        : path.join(process.cwd(), 'public', 'sitemap.xml');
      if (fs.existsSync(sitemapPath)) {
        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.status(200).sendFile(sitemapPath);
      } else {
        res.status(404).send('Not found');
      }
    });

    app.get('/llms.txt', (req, res) => {
      const llmsPath = fs.existsSync(path.join(distPath, 'llms.txt'))
        ? path.join(distPath, 'llms.txt')
        : path.join(process.cwd(), 'public', 'llms.txt');
      if (fs.existsSync(llmsPath)) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).sendFile(llmsPath);
      } else {
        res.status(404).send('Not found');
      }
    });

    app.get('*', async (req, res) => {
      const productId = extractProductId(req);

      const indexPath = path.join(distPath, 'index.html');
      
      if (!fs.existsSync(indexPath)) {
        console.error('[PROD] Index not found at:', indexPath);
        return res.status(404).send('Index not found');
      }

      let html = fs.readFileSync(indexPath, 'utf-8');

      if (productId) {
        const userAgent = req.headers['user-agent'] || '';
        const isBot = /bot|crawler|spider|facebookexternalhit|whatsapp|slurp|ia_archiver|meta-externalfetcher/i.test(userAgent);
        
        try {
          const product = await getProductForMeta(productId);
          if (product) {
            if (isBot) console.log(`[META PROD] Social Bot detected: ${userAgent}. Injecting for: ${productId}`);
            else console.log(`[META PROD] Injecting meta for user: ${productId}`);

            const origin = getPublicOrigin(req);
            const fullUrl = `${origin}${req.originalUrl}`;
            
            html = await getHydratedHtml(html, product, fullUrl);
          } else {
            console.log(`[META PROD] Product not found in DB for injection: ${productId}`);
          }
        } catch (err) {
          console.error('[PROD META INJECT ERROR]', err);
        }
      }
      
      // Explicitly set headers to avoid 403 or caching issues with bots
      res.status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Vary', 'User-Agent')
        .header('X-Meta-Injected', productId ? 'true' : 'false')
        .send(html);
    });
  }
}

// HELPERS FOR DYNAMIC META TAGS
function cleanText(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractProductId(req: express.Request): string | null {
  // 1. From query params parsed by Express
  const qProd = (req.query?.product || req.query?.product_id || req.query?.id || req.query?.p) as string;
  if (qProd && typeof qProd === 'string' && qProd.trim().length > 0) {
    return qProd.trim();
  }

  // 2. From raw url search parameters (handling &amp; and URL decoding)
  const rawUrl = req.originalUrl || req.url || '';
  if (rawUrl) {
    try {
      const decodedUrl = decodeURIComponent(rawUrl).replace(/&amp;/g, '&');
      const qIndex = decodedUrl.indexOf('?');
      if (qIndex !== -1) {
        const searchParams = new URLSearchParams(decodedUrl.substring(qIndex));
        const p = searchParams.get('product') || searchParams.get('product_id') || searchParams.get('id') || searchParams.get('p');
        if (p && p.trim().length > 0) return p.trim();
      }

      // 3. From path regex (/product/:id or /produto/:id or /p/:id or /item/:id)
      const match = decodedUrl.match(/\/(?:product|produto|p|item)\/([a-zA-Z0-9\-_]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch (e) {}
  }

  return null;
}

async function getProductForMeta(productId: string) {
  if (!productId || productId.trim().length < 2) return null;
  const cleanId = productId.trim();
  
  try {
    const supabase = getSupabase();
    
    // Check if UUID or search by id/aliexpress_id/sku
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    let query = supabase
      .from('products')
      .select('id, title, description, image_url, extra_images, price, category');

    if (isUUID) {
      query = query.eq('id', cleanId);
    } else {
      query = query.or(`id.eq.${cleanId},aliexpress_id.eq.${cleanId},sku.eq.${cleanId}`);
    }

    let { data: product, error } = await query.maybeSingle();
    
    if (error || !product) {
      // Fallback 1: Try exact ID eq
      const { data: fb1 } = await supabase
        .from('products')
        .select('id, title, description, image_url, extra_images, price, category')
        .eq('id', cleanId)
        .maybeSingle();
      if (fb1) return fb1;

      // Fallback 2: Try ILIKE prefix on ID
      const { data: fb2 } = await supabase
        .from('products')
        .select('id, title, description, image_url, extra_images, price, category')
        .ilike('id', `${cleanId}%`)
        .limit(1);
      if (fb2 && fb2.length > 0) return fb2[0];

      return null;
    }
    
    return product;
  } catch (e) {
    console.error(`[META] Fatal error in getProductForMeta for ${productId}:`, e);
    return null;
  }
}

function getProductImageUrl(url: string | undefined | null, origin: string = "https://sart-full.pt") {
  if (!url) return "https://i.imgur.com/bkuoZcP.png";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${origin}${url}`;
  const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (projectUrl) {
    const baseUrl = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl;
    return `${baseUrl}/storage/v1/object/public/assets/${url}`;
  }
  return `${origin}/${url}`;
}

function getPublicOrigin(req: express.Request): string {
  const forwardedHost = req.get('x-forwarded-host');
  const hostHeader = req.get('host');
  const host = forwardedHost || hostHeader || '';
  
  if (!host || host.includes('localhost') || host.includes('127.0.0.1') || host.includes(':3000')) {
    return 'https://sart-full.pt';
  }
  
  const rawProto = req.headers['x-forwarded-proto'] || req.protocol;
  const isHttps = rawProto === 'https' || String(rawProto).includes('https');
  const protocol = isHttps ? 'https' : 'http';
  return `${protocol}://${host}`;
}

async function getHydratedHtml(html: string, product: any, reqUrl?: string) {
  if (!product) return html;
  
  const title = cleanText(product.title || product.name || "S.art Full | Loja Oficial de Vestuário");
  const description = cleanText(
    product.description || "Descubra a coleção exclusiva de vestuário na S.art Full. Peças selecionadas de moda masculina e feminina, roupas premium, calçado e tendências de alta qualidade."
  ).substring(0, 220);

  let origin = "https://sart-full.pt";
  try {
    if (reqUrl && reqUrl.startsWith("http")) {
      const parsed = new URL(reqUrl);
      if (
        !parsed.hostname.includes("localhost") &&
        !parsed.hostname.includes("127.0.0.1") &&
        parsed.port !== "3000"
      ) {
        origin = parsed.origin;
      }
    }
  } catch (e) {}

  let rawImg = product.image_url || product.image || product.thumbnail;
  if (!rawImg && product.extra_images) {
    const extra = String(product.extra_images).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (extra.length > 0) rawImg = extra[0];
  }

  const directImageUrl = rawImg ? getProductImageUrl(rawImg, origin) : "https://i.imgur.com/bkuoZcP.png";
  const primaryProductImage = directImageUrl || "https://i.imgur.com/bkuoZcP.png";
  const storeLogo = "https://i.imgur.com/bkuoZcP.png";

  let fullCanonicalUrl = `${origin}/p/${product.id}`;
  if (reqUrl && reqUrl.startsWith("http")) {
    try {
      const parsedCanonical = new URL(reqUrl);
      if (!parsedCanonical.hostname.includes("localhost") && !parsedCanonical.hostname.includes("127.0.0.1") && parsedCanonical.port !== "3000") {
        fullCanonicalUrl = `${parsedCanonical.origin}${parsedCanonical.pathname}${parsedCanonical.search}`;
      }
    } catch (e) {}
  }

  const priceVal = product.price ? parseFloat(String(product.price)).toFixed(2) : '';
  const metaTitle = title;

  let hydrated = html;

  // 1. Completely strip old meta title, canonical link, open graph, twitter, description, keywords, and default ld+json to avoid duplicate conflict
  hydrated = hydrated.replace(/<title[\s>][\s\S]*?<\/title>/gi, '');
  hydrated = hydrated.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*\/?>/gi, '');
  hydrated = hydrated.replace(/<meta\s+[^>]*(?:property|name)=["'](?:og:|twitter:|description|keywords|author|robots)[^'"]*["'][^>]*\/?>/gi, '');
  hydrated = hydrated.replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');

  const productLdJson = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    'name': title,
    'image': [primaryProductImage, storeLogo],
    'description': description,
    'offers': {
      '@type': 'Offer',
      'priceCurrency': 'EUR',
      'price': priceVal || '0.00',
      'availability': 'https://schema.org/InStock',
      'url': fullCanonicalUrl
    }
  });

  // 2. Build clean, precise meta block for WhatsApp, Facebook, iMessage, Twitter, Telegram, etc.
  // The primary product image is placed FIRST so WhatsApp & social bots render the product picture in previews
  const metaBlock = `
    <title>${metaTitle}</title>
    <meta name="description" content="${description}" />
    <meta name="author" content="S.art Full" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${fullCanonicalUrl}" />

    <!-- Open Graph / WhatsApp / Facebook / Telegram / iMessage -->
    <meta property="og:site_name" content="S.art Full" />
    <meta property="og:type" content="product" />
    <meta property="og:title" content="${metaTitle}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${fullCanonicalUrl}" />
    <meta property="og:image" content="${primaryProductImage}" />
    <meta property="og:image:secure_url" content="${primaryProductImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${metaTitle}" />
    ${primaryProductImage !== storeLogo ? `<meta property="og:image" content="${storeLogo}" />` : ''}
    ${priceVal ? `<meta property="product:price:amount" content="${priceVal}" />` : ''}
    <meta property="product:price:currency" content="EUR" />

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${metaTitle}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${primaryProductImage}" />

    <!-- Product Structured Data -->
    <script type="application/ld+json">${productLdJson}</script>
  `;

  // 3. Inject new tags directly after <head>
  hydrated = hydrated.replace(/<head[^>]*>/i, (match) => `${match}\n${metaBlock}`);

  return hydrated;
}

async function processOrderFulfillment(order: any, forceManual: boolean = false) {
  const supabase = getSupabase();
  try {
    // Fetch fresh local order data
    const { data: latestOrder, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order.id)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[FULFILLMENT ERROR] Erro na query DB para ordem ${order.id}:`, JSON.stringify(fetchErr));
    }

    const currentOrder = latestOrder || order;

    if (!currentOrder || !currentOrder.id) {
       console.error(`[FULFILLMENT FATAL] Dados de ordem inválidos.`);
       return { success: false, error: 'Dados da ordem inválidos' };
    }

    // Fetch product separately
    if (!currentOrder.products && currentOrder.product_id) {
      const { data: prod } = await supabase.from('products').select('*').eq('id', currentOrder.product_id).maybeSingle();
      if (prod) currentOrder.products = prod;
    }

    // Check if already fulfilled
    const existingExtId = currentOrder.provider_order_id;
    if (existingExtId && !forceManual) {
        console.log(`[FULFILLMENT SKIP] Ordem ${currentOrder.id} já possui provider_order_id: ${existingExtId}`);
        return { success: true, already_fulfilled: true, order_id: existingExtId };
    }

    console.log(`[FULFILLMENT START] Ordem ${currentOrder.id} - Forçar Manual: ${forceManual}`);

    // RESOLVE PRODUCT
    let productInDb = null;
    if (currentOrder.products) {
      productInDb = Array.isArray(currentOrder.products) ? currentOrder.products[0] : currentOrder.products;
    }
    
    if (!productInDb && currentOrder.product_id) {
      const { data: fallbackProd } = await supabase.from('products').select('*').eq('id', currentOrder.product_id).maybeSingle();
      if (fallbackProd) productInDb = fallbackProd;
    }

    if (!productInDb) {
        throw new Error(`Produto não encontrado (ID: ${currentOrder.product_id}). Verifique se o produto ainda existe no catálogo.`);
    }
    
    // Identificação do provedor
    let provider = currentOrder.provider;
    if (!provider) {
      if (productInDb?.provider) provider = productInDb.provider;
      else if (productInDb?.aliexpress_id) provider = 'aliexpress';
      else provider = 'aliexpress';
    }
    const providerLabel = provider === 'aliexpress' ? 'AliExpress (Internacional)' : 'Local';
    console.log(`[FULFILLMENT LOG] Provedor: ${providerLabel} (Produto: ${productInDb?.name || productInDb?.id})`);

    // Normalizar shipping_details
    const customerData = typeof currentOrder.shipping_details === 'string' 
      ? JSON.parse(currentOrder.shipping_details) 
      : (currentOrder.shipping_details || {});

    if (!customerData.email && currentOrder.customer_email) {
      customerData.email = currentOrder.customer_email;
    }

    // Verificar definições de Auto-Fulfillment
    const { appKey, appSecret, accessToken, autoFulfill } = await getAliExpressCredentials();

    if (!forceManual && !autoFulfill) {
      console.log(`[FULFILLMENT INFO] Auto-fulfillment está desativado nas definições. Pedido ${currentOrder.id} aguarda envio manual no painel.`);
      await supabase.from('orders').update({
        status: 'paid',
        shipping_status: currentOrder.shipping_status || 'pending',
        updated_at: new Date().toISOString()
      }).eq('id', currentOrder.id);
      
      return { 
        success: true, 
        mode: 'manual_pending', 
        message: 'Pedido pronto para envio manual no painel de administração.' 
      };
    }

    if (!appKey || !appSecret || !accessToken) {
      throw new Error("Credenciais do AliExpress ausentes ou não autenticadas. Por favor, autentique a conta AliExpress no Painel de Administração.");
    }

    console.log(`[FULFILLMENT EXECUTE] Enviando pedido ${currentOrder.id} para a API do AliExpress...`);
    const aliOrderId = await fulfillAliExpressOrder(currentOrder, productInDb, customerData);

    console.log(`[FULFILLMENT SUCCESS] Pedido ${currentOrder.id} criado com sucesso no AliExpress! ID do Parceiro: ${aliOrderId}`);

    // Atualizar no banco de dados com ID retornado do AliExpress
    const prevMetadata = currentOrder.shipping_status_metadata && typeof currentOrder.shipping_status_metadata === 'object' 
      ? currentOrder.shipping_status_metadata 
      : {};

    const updatedMetadata = {
      ...prevMetadata,
      ali_fulfillment_date: new Date().toISOString(),
      ali_order_id: String(aliOrderId)
    };
    
    await supabase.from('orders').update({
      provider_order_id: String(aliOrderId),
      provider: 'aliexpress',
      shipping_status: 'preparing',
      fulfillment_error: null,
      shipping_status_metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    }).eq('id', currentOrder.id);

    // Disparar notificação de atualização
    triggerOrderNotification(currentOrder.id, 'paid', 'preparing', null, true).catch(e => console.error('[NOTIF ERR]', e));

    return {
      success: true,
      order_id: String(aliOrderId),
      message: `Pedido #${aliOrderId} enviado com sucesso para o AliExpress!`
    };

  } catch (err: any) {
    console.error(`[FULFILLMENT SYSTEM ERROR] Falha Crítica na Ordem ${order.id}:`, err.message);
    await supabase.from('orders').update({ 
      fulfillment_error: err.message,
      updated_at: new Date().toISOString()
    }).eq('id', order.id);
    throw err; 
  }
}

async function fulfillAliExpressOrder(order: any, product: any, customerData: any) {
    const countryMap: Record<string, string> = {
        'Portugal': 'PT', 'Espanha': 'ES', 'Spain': 'ES', 'Brasil': 'BR', 'Brazil': 'BR',
        'França': 'FR', 'France': 'FR', 'Alemanha': 'DE', 'Germany': 'DE', 'Itália': 'IT',
        'Italy': 'IT', 'Reino Unido': 'GB', 'United Kingdom': 'GB', 'Estados Unidos': 'US',
        'United States': 'US', 'PT': 'PT', 'ES': 'ES', 'BR': 'BR', 'FR': 'FR', 'DE': 'DE',
        'IT': 'IT', 'GB': 'GB', 'US': 'US'
    };
    
    const rawCountry = customerData.countryCode || customerData.country || customerData.pais || 'PT';
    const resolvedCountry = countryMap[rawCountry] || String(rawCountry).toUpperCase().substring(0, 2);

    // Extrair prefixo telefónico e número móvel formatado corretamente para o AliExpress (9 ou 10 dígitos)
    const rawPhone = customerData.phone || customerData.mobile_no || customerData.telefone || customerData.telemovel;
    const { phoneCountry, mobileNo } = cleanCustomerPhone(rawPhone, resolvedCountry);

    const customerName = (
      customerData.fullName || 
      customerData.name || 
      `${customerData.firstName || ""} ${customerData.lastName || ""}`
    ).trim() || "Cliente S.art";

    const address: any = {
        address: sanitizeAddressInput(customerData.address || customerData.street || customerData.morada || customerData.address_line_1 || "Rua Principal"),
        city: sanitizeAddressInput(customerData.city || customerData.cidade || customerData.distrito || "Lisboa"),
        contact_person: customerName,
        full_name: customerName,
        country: resolvedCountry,
        phone_country: phoneCountry,
        mobile_no: mobileNo,
        phone: mobileNo,
        province: sanitizeAddressInput(customerData.province || customerData.state || customerData.distrito || customerData.city || "Lisboa"),
        zip: (customerData.zip || customerData.postalCode || customerData.postal_code || customerData.codigo_postal || "1000-001").trim()
    };

    if (customerData.identification || customerData.cpf || customerData.nif || customerData.tax_id) {
        const idVal = String(customerData.identification || customerData.cpf || customerData.nif || customerData.tax_id).trim();
        address.passport_no = idVal;
        address.tax_number = idVal;
        address.cpf = idVal;
    }

    const aliId = cleanAliExpressId(product.aliexpress_id);
    if (!aliId) {
        throw new Error("Este produto não possui um AliExpress ID válido vinculado. Impossível enviar para o fornecedor.");
    }

    // Resolver SKU / Variação
    const selectedOptions = typeof order.selected_options === 'string' 
      ? JSON.parse(order.selected_options) 
      : (order.selected_options || {});

    let skuAttr = selectedOptions.sku || selectedOptions.sku_attr || "";
    let skuId = selectedOptions.sku_id ? String(selectedOptions.sku_id) : "";

    // 1. Tentar resolver a partir de product.metadata.variations se existir
    if (!skuId && product.metadata?.variations && Array.isArray(product.metadata.variations)) {
      const targetColor = (selectedOptions.color || selectedOptions.cor || "").toLowerCase().trim();
      const targetSize = (selectedOptions.size || selectedOptions.tamanho || "").toLowerCase().trim();

      const matchedVariation = product.metadata.variations.find((v: any) => {
        const props = (v.properties || []).map((p: any) => String(p.value || '').toLowerCase().trim());
        const matchesColor = !targetColor || props.some((val: string) => val.includes(targetColor) || targetColor.includes(val));
        const matchesSize = !targetSize || props.some((val: string) => val.includes(targetSize) || targetSize.includes(val));
        return matchesColor && matchesSize;
      });

      if (matchedVariation?.sku_id) {
        skuId = String(matchedVariation.sku_id);
        if (matchedVariation.sku_attr) {
          skuAttr = String(matchedVariation.sku_attr);
        }
        console.log(`[ALIEXPRESS FULFILL] SKU encontrado no catálogo local: ID ${skuId}`);
      }
    }

    // 2. Se não tiver skuAttr, buscar os SKUs do produto no AliExpress para obter o sku_attr correto
    if (!skuAttr) {
      try {
        console.log(`[ALIEXPRESS FULFILL] Buscando SKUs do produto ${aliId} na API do AliExpress...`);
        const productDetail = await getAliExpressProductDetail(String(aliId));
        if (productDetail && productDetail.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o) {
          const skuList = productDetail.ae_item_sku_info_dtos.ae_item_sku_info_d_t_o;
          const targetColor = (selectedOptions.color || selectedOptions.cor || "").toLowerCase().trim();
          const targetSize = (selectedOptions.size || selectedOptions.tamanho || "").toLowerCase().trim();

          // 2a. Match por sku_id se já tínhamos
          let matchedSku = skuId ? skuList.find((s: any) => String(s.sku_id) === String(skuId)) : null;

          // 2b. Match por cor e tamanho
          if (!matchedSku) {
            matchedSku = skuList.find((s: any) => {
              const attrStr = (s.sku_attr || "").toLowerCase();
              return (targetColor && attrStr.includes(targetColor)) || (targetSize && attrStr.includes(targetSize));
            });
          }

          // 2c. Fallback: Primeiro SKU disponível em stock
          if (!matchedSku) {
            matchedSku = skuList.find((s: any) => (s.sku_available_stock || 0) > 0) || skuList[0];
          }

          if (matchedSku) {
            skuAttr = matchedSku.sku_attr || matchedSku.id || "";
            if (!skuId && matchedSku.sku_id) skuId = String(matchedSku.sku_id);
            console.log(`[ALIEXPRESS FULFILL] SKU mapeado com sucesso: ID ${skuId}, Attr: ${skuAttr}`);
          }
        }
      } catch (skuErr) {
        console.warn(`[ALIEXPRESS FULFILL] Não foi possível obter lista detalhada de SKUs:`, skuErr);
      }
    }

    const productItem: any = {
      product_count: Math.max(1, parseInt(String(order.quantity || 1))),
      product_id: String(aliId)
    };

    if (skuAttr) {
      productItem.sku_attr = String(skuAttr);
    } else if (skuId) {
      productItem.sku_id = String(skuId);
    }

    const businessParams = {
      param_place_order_request4_open_api_d_t_o: JSON.stringify({
        out_order_id: String(order.id),
        logistics_address: address,
        product_items: [productItem]
      })
    };

    console.log("[ALIEXPRESS FULFILL PAYLOAD]", JSON.stringify(businessParams));
    const result = await callAliExpressAPIInternal('aliexpress.trade.buy.placeorder', businessParams);
    
    const responseKey = 'aliexpress_trade_buy_placeorder_response';
    if (result && result[responseKey]) {
        const resObj = result[responseKey];
        if (resObj.result && resObj.result.is_success === false) {
          const errMsg = resObj.result.error_msg || resObj.result.error_code || "Erro na criação da encomenda no AliExpress";
          throw new Error(`Erro do AliExpress: ${errMsg}`);
        }
        
        const platformResult = resObj.result;
        
        // Handle order_list array (Padrão oficial da resposta de placeorder)
        if (platformResult && platformResult.order_list && Array.isArray(platformResult.order_list.number) && platformResult.order_list.number.length > 0) {
            return String(platformResult.order_list.number[0]);
        }
        
        // Handle single order_id
        if (platformResult && platformResult.order_id) {
            return String(platformResult.order_id);
        }
        
        // Handle list of IDs
        if (platformResult && platformResult.order_id_list && Array.isArray(platformResult.order_id_list) && platformResult.order_id_list.length > 0) {
            return String(platformResult.order_id_list[0]);
        }

        if (platformResult && typeof platformResult === 'object' && platformResult.order_list) {
            const list = platformResult.order_list;
            if (Array.isArray(list) && list.length > 0) return String(list[0]);
        }
    }
    
    if (result && result.error_response) {
        const errorMsg = result.error_response.sub_msg || result.error_response.msg || "Erro na chamada da API";
        throw new Error(`Erro na API AliExpress: ${errorMsg} (Code: ${result.error_response.code || result.error_response.sub_code})`);
    }

    console.error(`[ALIEXPRESS FULFILL FAIL] Resposta sem ID detectado:`, JSON.stringify(result));
    throw new Error("O AliExpress não retornou o ID do pedido criado. Verifique os fundos da conta, stock do produto ou restrições de endereço.");
}

async function getAliExpressOrderDetail(aliOrderId: string) {
    if (!aliOrderId) return null;
    try {
        const cleanOrderId = cleanAliExpressId(aliOrderId);
        if (!cleanOrderId) return null;

        console.log(`[ALIEXPRESS API] Consultando order_id: ${cleanOrderId} (Original: ${aliOrderId})`);
        
        const tryExtract = (res: any) => {
            if (!res) return null;
            const keys = [
                'aliexpress_trade_ds_order_get_response',
                'aliexpress_ds_trade_order_get_response', 
                'aliexpress_solution_order_get_response', 
                'aliexpress_trade_buy_order_get_response'
            ];
            
            for (const key of keys) {
                if (res[key]) {
                    const resultObj = res[key].result || res[key].data || res[key];
                    const finalData = (resultObj && resultObj.data) ? resultObj.data : resultObj;
                    if (finalData && (finalData.order_status || finalData.status || finalData.order_id || finalData.child_order_list)) {
                        return finalData;
                    }
                }
            }
            if (res.order_status || res.status || res.order_id) return res;
            return null;
        };

        // Ordem de tentativa baseada no endpoint oficial comprovado da API AliExpress
        const numId = Number(cleanOrderId);
        const methods = [
            { name: 'aliexpress.trade.ds.order.get', params: { single_order_query: JSON.stringify({ order_id: isNaN(numId) ? cleanOrderId : numId }) } },
            { name: 'aliexpress.trade.ds.order.get', params: { order_id: cleanOrderId } },
            { name: 'aliexpress.ds.trade.order.get', params: { single_order_query: JSON.stringify({ order_id: cleanOrderId }) } },
            { name: 'aliexpress.solution.order.get', params: { param0: JSON.stringify({ order_id: cleanOrderId, current_page: 1, page_size: 1 }) } }
        ];

        let lastResult: any = null;
        for (const m of methods) {
            try {
                console.log(`[ALIEXPRESS SYNC] Tentando método: ${m.name}`);
                const result = await callAliExpressAPIInternal(m.name, m.params);
                lastResult = result;
                const data = tryExtract(result);
                if (data) {
                    console.log(`[ALIEXPRESS SYNC] Sucesso com ${m.name} para ${cleanOrderId}: status=${data.order_status}`);
                    return data;
                }
            } catch (err: any) {
                console.warn(`[ALIEXPRESS SYNC] Falha no método ${m.name}:`, err.message);
                lastResult = lastResult || { error_response: { msg: err.message } };
            }
        }

        if (lastResult && lastResult.error_response) {
            console.error("[ALIEXPRESS API ERROR LAST ATTEMPT]", JSON.stringify(lastResult.error_response));
        }

        return null;
    } catch (error: any) {
        console.error(`[ALIEXPRESS SYNC FATAL] Order: ${aliOrderId}:`, error.message);
        return null;
    }
}

async function getAliExpressProductDetail(aliexpressId: string) {
    const result = await callAliExpressAPIInternal('aliexpress.ds.product.get', {
        product_id: cleanAliExpressId(aliexpressId),
        ship_to_country: 'PT',
        target_currency: 'EUR',
        target_language: 'PT'
    });
    const responseKey = 'aliexpress_ds_product_get_response';
    if (result && result[responseKey] && result[responseKey].result) {
        return result[responseKey].result;
    }
    return null;
}

async function callAliExpressAPIInternal(method: string, params: any) {
    const { appKey, appSecret, accessToken } = await getAliExpressCredentials();

    if (!appKey || !appSecret) {
        console.error("[ALIEXPRESS API] ERRO: Credenciais ausentes no banco/environment (APP_KEY ou SECRET)");
        throw new Error("Credenciais de Fornecedor Ausentes");
    }

    const executeCall = async (useSession: boolean): Promise<any> => {
        const currentTimestamp = getAliExpressTimestamp();

        const fullParams: Record<string, any> = {
          app_key: appKey,
          timestamp: currentTimestamp,
          sign_method: 'md5',
          method: method,
          format: 'json',
          v: '2.0',
        };
        
        if (useSession && accessToken) {
            fullParams.session = accessToken;
        }

        // Mesclar com parâmetros de negócio remediando vazios e limpando IDs
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined && value !== '') {
                if (['product_id', 'aliexpress_id', 'order_id'].includes(key.toLowerCase())) {
                    fullParams[key] = cleanAliExpressId(value as string);
                } else {
                    fullParams[key] = value;
                }
            }
        }

        // Gerar assinatura usando a lógica definitiva
        const sign = generateAliExpressSignature(fullParams, appSecret);
        
        // Construir o corpo da requisição de forma idêntica à assinatura
        const sortedKeys = Object.keys(fullParams).sort();
        const bodySegments: string[] = [];
        for (const key of sortedKeys) {
            const val = fullParams[key];
            const stringVal = (typeof val === 'object') ? JSON.stringify(val) : String(val);
            bodySegments.push(`${key}=${encodeURIComponent(stringVal)}`);
        }
        bodySegments.push(`sign=${sign}`);
        const body = bodySegments.join('&');

        console.log(`[ALIEXPRESS API] Call: ${method} | Sign: ${sign.substring(0, 8)}...`);

        const response = await axios.post('https://api-sg.aliexpress.com/sync', body, {
          headers: { 
              'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' 
          },
          timeout: 60000
        });

        const result = response.data;
        if (result && result.error_response) {
            const err = result.error_response;
            const msg = err.msg || '';
            const subMsg = err.sub_msg || '';
            const isSessionError = msg.toLowerCase().includes('session') || 
                                  msg.toLowerCase().includes('token') || 
                                  msg.toLowerCase().includes('expired') ||
                                  subMsg.toLowerCase().includes('session') ||
                                  subMsg.toLowerCase().includes('token') ||
                                  subMsg.toLowerCase().includes('expired');
                                  
            if (useSession && isSessionError) {
                console.warn(`[ALIEXPRESS INTERNAL] Access token is invalid or expired. Retrying WITHOUT session parameter...`);
                return executeCall(false);
            }
            console.error("[ALIEXPRESS API ERROR]", JSON.stringify(err));
            throw new Error(`AliExpress API Error: ${err.msg} (${err.code})`);
        }
        return result;
    };

    try {
        return await executeCall(true);
    } catch (error: any) {
        const errorData = error.response?.data || error.message;
        console.error(`[ALIEXPRESS API FATAL ERROR] ${method}:`, JSON.stringify(errorData));
        throw error;
    }
}

// ==========================================
// --- API KEYS & V1 API ENDPOINTS ---
// ==========================================

// Get all API keys (Admin only, handles validation via adminRouter middleware)
adminRouter.get('/api-keys', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error('[ADMIN GET API KEYS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new API key (Admin only)
adminRouter.post('/api-keys', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'O nome da chave de API é obrigatório.' });
    }

    const token = `s_art_${crypto.randomBytes(24).toString('hex')}`;
    const userId = req.headers['x-user-id'] || req.headers['user-id'] || req.body.userId || req.query.userId;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('api_keys')
      .insert([{ name, token, created_by: userId }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('[ADMIN CREATE API KEY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete an API key (Admin only)
adminRouter.delete('/api-keys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Chave de API eliminada com sucesso.' });
  } catch (err: any) {
    console.error('[ADMIN DELETE API KEY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Middleware to validate API key for public endpoints
const validateApiKey = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  let token = req.query.key || req.query.api_key || req.query.token;

  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    const customHeader = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['X-API-KEY'] || req.headers['api-key'] || req.headers['api_key'];
    if (customHeader && typeof customHeader === 'string') {
      token = customHeader;
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Chave de API em falta. Forneça o token via cabeçalho "Authorization: Bearer <token>", "x-api-key: <token>" ou query parameter "?key=<token>"'
    });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name')
      .eq('token', token)
      .maybeSingle();

    if (error || !data) {
      return res.status(401).json({ error: 'Chave de API inválida ou expirada.' });
    }

    (req as any).apiKeyInfo = data;
    next();
  } catch (err: any) {
    console.error('[API KEY VALIDATION ERROR]', err);
    res.status(500).json({ error: 'Erro interno ao validar chave de API.' });
  }
};

const getProductStock = (product: any): number => {
  let stock = 0;
  if (product.metadata && Array.isArray(product.metadata.variations)) {
    stock = product.metadata.variations.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
  } else if (product.metadata && typeof product.metadata.stock === 'number') {
    stock = product.metadata.stock;
  }
  return stock > 0 ? stock : 99; // Fallback to 99 if no stock specified
};

const v1Router = express.Router();
v1Router.use(validateApiKey);

// Get all products data, including IDs, names, prices, stocks, and images
v1Router.get('/products', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map(p => ({
      id: p.id ? p.id.split('-')[0].toUpperCase() : '',
      name: p.title,
      title: p.title,
      price: typeof p.price === 'string' ? parseFloat(p.price) : p.price,
      stock: getProductStock(p),
      image_url: p.image_url,
      extra_images: p.extra_images ? p.extra_images.split(',').map((img: string) => img.trim()).filter(Boolean) : [],
      category: p.category,
      product_type: p.product_type,
      is_active: p.is_active,
      description: p.description
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error('[v1 API PRODUCTS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a specific product data
v1Router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const queryId = id.trim().toLowerCase();

    let p = null;
    let { data: exactProduct } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (exactProduct) {
      p = exactProduct;
    } else {
      const { data: matchedProducts } = await supabase
        .from('products')
        .select('*')
        .ilike('id', `${queryId}-%`);

      if (matchedProducts && matchedProducts.length > 0) {
        p = matchedProducts[0];
      } else {
        const { data: matchedFallback } = await supabase
          .from('products')
          .select('*')
          .ilike('id', `${queryId}%`);
        if (matchedFallback && matchedFallback.length > 0) {
          p = matchedFallback[0];
        }
      }
    }

    if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });

    const mapped = {
      id: p.id ? p.id.split('-')[0].toUpperCase() : '',
      name: p.title,
      title: p.title,
      price: typeof p.price === 'string' ? parseFloat(p.price) : p.price,
      stock: getProductStock(p),
      image_url: p.image_url,
      extra_images: p.extra_images ? p.extra_images.split(',').map((img: string) => img.trim()).filter(Boolean) : [],
      category: p.category,
      product_type: p.product_type,
      is_active: p.is_active,
      description: p.description
    };

    res.json(mapped);
  } catch (err: any) {
    console.error('[v1 API SINGLE PRODUCT ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve product image directly or return image info
v1Router.get('/products/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const queryId = id.trim().toLowerCase();

    let p = null;
    let { data: exactProduct } = await supabase
      .from('products')
      .select('image_url, extra_images, id')
      .eq('id', id)
      .maybeSingle();

    if (exactProduct) {
      p = exactProduct;
    } else {
      const { data: matchedProducts } = await supabase
        .from('products')
        .select('image_url, extra_images, id')
        .ilike('id', `${queryId}-%`);

      if (matchedProducts && matchedProducts.length > 0) {
        p = matchedProducts[0];
      } else {
        const { data: matchedFallback } = await supabase
          .from('products')
          .select('image_url, extra_images, id')
          .ilike('id', `${queryId}%`);
        if (matchedFallback && matchedFallback.length > 0) {
          p = matchedFallback[0];
        }
      }
    }

    if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });

    const images = {
      image_url: p.image_url,
      extra_images: p.extra_images ? p.extra_images.split(',').map((img: string) => img.trim()).filter(Boolean) : []
    };

    const isJson = req.query.json === 'true' || (req.headers['accept'] && req.headers['accept'].includes('application/json'));
    if (isJson) {
      return res.json(images);
    }

    if (!p.image_url) {
      return res.status(404).json({ error: 'O produto não possui imagem principal cadastrada.' });
    }

    // Redirect to the actual image URL
    res.redirect(p.image_url);
  } catch (err: any) {
    console.error('[v1 API PRODUCT IMAGE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/v1', v1Router);

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S.art Server running on http://localhost:${PORT}`);
    
    // --- BACKGROUND SYNC CYCLE ---
    console.log(`[SYSTEM] Iniciando Ciclo Constante de Sincronização (2 min)...`);
    setInterval(async () => {
      try {
        console.log(`[BACKGROUND SYNC] Iniciando verificação automática de ordens ativas...`);
        const supabase = getSupabase();
        
        // Buscar ordens que não foram finalizadas
        const { data: activeOrders } = await supabase
          .from('orders')
          .select('id')
          .not('status', 'in', '("refunded","delivered","canceled")');

        if (activeOrders && activeOrders.length > 0) {
           console.log(`[BACKGROUND SYNC] Sincronizando ${activeOrders.length} ordens...`);
           for (const ord of activeOrders) {
             await syncOrderWithExternalSources(ord.id).catch(e => console.error(`[BG SYNC ERR] Order ${ord.id}:`, e));
           }
        }
      } catch (err) {
        console.error(`[BACKGROUND SYNC FATAL]:`, err);
      }
    }, 2 * 60 * 1000); // 2 minutos
  });
}

export default app;
