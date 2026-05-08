import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import Stripe from 'stripe';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DROPEA_API_URL = process.env.DROPEA_API_URL || 'https://api.dropea.com/graphql/dropshippers';
const DROPEA_API_KEY = process.env.DROPEA_API_KEY;
const DROPEA_USER_ID = process.env.DROPEA_USER_ID;
const DROPEA_SHOP_ID = process.env.DROPEA_SHOP_ID;

// Caching for Dropea catalog
let dropeaCatalogCache: { data: any, timestamp: number } | null = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

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
      // Ensure dropea_id exists in products
      try {
        await supabase.rpc('exec_sql', { sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS dropea_id TEXT UNIQUE;' });
      } catch(e) { /* Ignore */ }

      // Define columns to ensure with their types
      const columnsToEnsure = [
        { name: 'email_paid_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_shipped_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_review_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_canceled_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'email_refunded_sent', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'stripe_payment_intent', type: 'TEXT' },
        { name: 'payment_status', type: 'TEXT DEFAULT \'pending\'' },
        { name: 'quantity', type: 'INTEGER DEFAULT 1' },
        { name: 'shipping_status_metadata', type: 'JSONB DEFAULT \'{}\'::jsonb' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE DEFAULT timezone(\'utc\'::text, now())' }
      ];

      // Ensure categories table exists and seed defaults
      try {
        await supabase.rpc('exec_sql', { sql: `
          CREATE TABLE IF NOT EXISTS categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );
          
          CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value JSONB,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
          );

          -- Seed default site settings if empty
          INSERT INTO site_settings (key, value)
          SELECT 'hero', '{"image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070", "video_url": "", "title": "Luxo & Exclusividade", "subtitle": "A Essência da Exclusividade", "buttonText": "Explorar Coleção"}'::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'hero');
          
          -- Ensure defaults exist
          INSERT INTO categories (name) VALUES ('Geral') ON CONFLICT (name) DO NOTHING;
          INSERT INTO categories (name) VALUES ('Moda') ON CONFLICT (name) DO NOTHING;
          INSERT INTO categories (name) VALUES ('Saúde') ON CONFLICT (name) DO NOTHING;
          INSERT INTO categories (name) VALUES ('Tecnologia') ON CONFLICT (name) DO NOTHING;
        ` });
      } catch(e) { console.error('[INIT] Error ensuring tables:', e); }
      
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
          END $$;
        ` });

        // FORCE PostgREST schema reload via multiple mechanisms
        try { await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload schema';" }); } catch(e) {}
        try { await supabase.rpc('exec_sql', { sql: "COMMENT ON TABLE products IS 'Refreshed at " + new Date().toISOString() + "';" }); } catch(e) {}
        
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

// --- Stripe Integration ---
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

function mapDropeaStatusToInternal(ds: string) {
  const s = ds.toUpperCase();
  
  // Critical statuses (Payment/Global Order Status)
  if (['CANCELLED', 'CANCELED', 'VOID', 'CANCELADO'].includes(s)) return { status: 'canceled', shipping: 'canceled' };
  if (['REFUNDED', 'RETURNED', 'DEVUELTO', 'REEMBOLSADO'].includes(s)) return { status: 'refunded', shipping: 'refunded' };
  if (['DELIVERED', 'COMPLETED', 'RECEIVED', 'ENTREGADO', 'ENTREGUE'].includes(s)) return { status: 'completed', shipping: 'delivered' };
  
  // Shipping specific statuses
  if (['OUT_FOR_DELIVERY', 'SAIU_PARA_ENTREGA', 'PRESTES_A_CHEGAR', 'IN_DELIVERY'].includes(s)) return { status: 'paid', shipping: 'out_for_delivery' };
  if (['SHIPPED', 'ON_THE_WAY', 'SENT', 'EN_CAMINO', 'FULFILLED', 'IN_TRANSIT', 'EM_TRANSITO'].includes(s)) return { status: 'paid', shipping: 'sent' };
  if (['CONFIRMED', 'CONFIRMADO'].includes(s)) return { status: 'paid', shipping: 'confirmed' };
  if (['PREPARING', 'IN_PREPARATION', 'PREPARACAO', 'EM_PREPARACAO'].includes(s)) return { status: 'paid', shipping: 'preparing' };
  if (['READY', 'READY_TO_SHIP', 'PREPARADO', 'PREPARADOS'].includes(s)) return { status: 'paid', shipping: 'ready' };
  if (['INCIDENT', 'PROBLEM', 'CON_INCIDENTE', 'INCIDENTE'].includes(s)) return { status: 'paid', shipping: 'incident' };
  if (['REJECTED', 'REJEITADO'].includes(s)) return { status: 'paid', shipping: 'rejected' };
  if (['REVIEW', 'ERROR_REVIEW', 'CON_ERROR_Y_REVISION', 'REVISAO'].includes(s)) return { status: 'paid', shipping: 'review' };
  if (['LOST', 'EXTRAVIADO'].includes(s)) return { status: 'paid', shipping: 'lost' };
  if (['PENDING_CONFIRMATION', 'WAITING_CONFIRMATION', 'PEND_DE_CONFIRMACAO', 'PENDIENTE_CONFIRMACION'].includes(s)) return { status: 'paid', shipping: 'pending_confirmation' };
  
  // Defaults for processing
  if (['PAID', 'PROCESSING', 'EN_PROCESO'].includes(s)) return { status: 'paid', shipping: 'pending' };

  return null;
}

// Global Error Handler
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

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
        .select('*, products(*)')
        .eq('stripe_session_id', session.id)
        .maybeSingle();

      if (existingOrder) {
        console.log(`[STRIPE WEBHOOK] Pedido já existe: ${existingOrder.id}. Forçando disparo direto de e-mail agora.`);
        
        // Disparo DIRETO sem passar por triggers de banco
        triggerOrderNotification(existingOrder.id, 'paid', existingOrder.shipping_status || 'pending', existingOrder, true).catch(err => 
          console.error('[STRIPE WEBHOOK ERROR] Falha no disparo direto:', err)
        );
        
        if (!existingOrder.dropea_order_id) {
           processOrderFulfillment(existingOrder).catch(e => console.error('[RETRY FULFILLMENT ERROR]', e));
        }
        return res.json({ received: true, already_processed: true });
      }

      const metadata = session.metadata;
      if (!metadata) throw new Error("Metadata ausente na sessão do Stripe");

      const customerDataRaw = metadata.customer_data;
      const customerData = JSON.parse(customerDataRaw);
      const internalProductId = metadata.product_id;
      const userId = customerData.userId;

      // 2. CRIAR PEDIDOS (UM REGISTO POR ITEM)
      const quantity = session.line_items?.data?.[0]?.quantity || 1;
      const ordersToInsert = [];

      for (let i = 0; i < quantity; i++) {
        ordersToInsert.push({
          user_id: userId,
          product_id: internalProductId,
          status: 'paid',
          payment_status: 'paid',
          shipping_status: 'pending',
          total_amount: (session.amount_total ? session.amount_total / 100 : 0) / quantity,
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent as string,
          shipping_details: customerDataRaw,
          selected_options: metadata.selected_options ? JSON.parse(metadata.selected_options) : {},
          customer_email: session.customer_details?.email || customerData?.email || metadata?.email
        });
      }

      const { data: createdOrders, error: orderError } = await supabase
        .from('orders')
        .insert(ordersToInsert)
        .select();

      if (orderError) throw orderError;
      
      console.log(`[STRIPE WEBHOOK SUCCESS] Criadas ${createdOrders?.length} ordens individuais. Iniciando Sincronização e Email...`);

      // 3. DISPARAR TUDO AUTOMATICAMENTE PARA CADA ORDEM
      if (createdOrders) {
        for (const order of createdOrders) {
          // Enviar e-mail de confirmação de pagamento IMEDIATAMENTE
          triggerOrderNotification(order.id, 'paid', 'pending', order).catch(e => console.error(`[AUTO-EMAIL ERROR]`, e));
          
          // Sincronizar com a Dropea IMEDIATAMENTE
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

// Initial cleanup completed

// PROXY FOR DROPEA (Client-Side friendly)
app.all(['/dropea-api*', '/api/dropea-api*'], async (req: any, res: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-user-id, Accept, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  let targetPath = req.url;
  targetPath = targetPath.replace(/^\/api\/dropea-api/, '');
  targetPath = targetPath.replace(/^\/dropea-api/, '');
  
  const url = `https://api.dropea.com${targetPath || '/'}`;
  
  try {
    const axiosConfig: any = {
      method: req.method,
      url: url,
      data: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
      headers: {
        'x-api-key': DROPEA_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SArt-Boutique-Boutique/1.0'
      },
      timeout: 30000,
      validateStatus: () => true
    };

    const response = await axios(axiosConfig);
    return res.status(response.status).json(response.data);
  } catch (error: any) {
    if (!res.headersSent) {
      return res.status(502).json({ 
        error: 'Proxy failed to reach Dropea API', 
        details: error.message,
        target: url
      });
    }
  }
});

// Moving dropea-products to direct app route for debugging/reliability
app.get('/api/dropea-products', async (req, res) => {
  console.log('[DROPEA] Acessando /api/dropea-products (Direct App Route)');
  
  // Use cache if available and valid
  if (dropeaCatalogCache && (Date.now() - dropeaCatalogCache.timestamp < CACHE_DURATION)) {
    console.log('[DROPEA] Returning cached products');
    return res.json(dropeaCatalogCache.data);
  }

  try {
    const supabase = getSupabase();
    
    // 1. Fetch Dropea catalog (Page 1)
    const targetUrl = DROPEA_API_URL;
    const graphqlQuery = { 
      query: `query { 
        products(page: 1) { 
          data { 
            id 
            name 
            images 
            pvpr 
            category 
            description 
          } 
        } 
      }` 
    };
    
    if (!DROPEA_API_KEY || DROPEA_API_KEY.includes('AIza')) {
       console.warn('[DROPEA] WARNING: API Key appears to be invalid or placeholder.');
    }
    
    const response = await axios.post(targetUrl, graphqlQuery, { 
      headers: { 
        'x-api-key': DROPEA_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'SArt-Boutique-Boutique/1.0'
      }, 
      timeout: 10000 
    }).catch(err => {
      console.warn('[DROPEA] API unreachable or timed out:', err.message);
      return { data: { data: { products: { data: [] } } } };
    });
    
    // Safety check on response structure
    const rawProducts = response?.data?.data?.products?.data || [];
    if (!Array.isArray(rawProducts)) {
      console.error('[DROPEA] Unexpected API response format');
      return res.json([]);
    }
    
    console.log(`[DROPEA] Raw products count: ${rawProducts.length}`);
    
    // 2. Fetch Supabase overrides
    let supabaseProducts: any[] = [];
    try {
      const { data, error: sbError } = await supabase
        .from('products')
        .select('id, title, price, dropea_id')
        .not('dropea_id', 'is', null);
      if (!sbError && data) supabaseProducts = data;
    } catch (e) {
      console.error('[DROPEA] Supabase merge fetch failed:', e);
    }
    
    // 3. Merge optimized with a Map
    const overrideMap = new Map();
    supabaseProducts.forEach(s => {
      if (s.dropea_id) overrideMap.set(String(s.dropea_id), s);
    });

    const products = rawProducts.map((p: any) => {
      if (!p || typeof p !== 'object') return null;
      const override = overrideMap.get(String(p.id));
      return {
        ...p,
        id: String(p.id),
        name: override ? override.title : p.name,
        pvp: override ? Number(override.price) : Number(p.pvpr),
        pvpr: Number(p.pvpr)
      };
    }).filter(Boolean);

    console.log(`[DROPEA] Success: ${products.length} products merged.`);
    
    // Update Cache
    dropeaCatalogCache = { data: products, timestamp: Date.now() };

    return res.json(products);
  } catch (error: any) {
    console.error('[DROPEA FATAL ERROR]', error.stack || error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha interna ao processar produtos', details: error.message });
    }
  }
});

// Routers defined early
const apiRouter = express.Router();
const adminRouter = express.Router();

// MOUNT ROUTERS
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

// Helper function to create Dropea Order
async function createDropeaOrderInternal(shopId: number, customer: any, product: any) {
  console.log(`[DROPEA] Iniciando criação de pedido interno para shop ${shopId}`);
  
  const graphqlMutation = `
    mutation Mutation($shopId: Int!, $paymentMethod: PaymentMethodEnum, $customer: CustomerInputType, $products: [OrderProductInputType]) {
      orderCreate(shop_id: $shopId, payment_method: $paymentMethod, customer: $customer, products: $products) {
        id
      }
    }
  `;

  // Mapeamento de país para Dropea
  const countryMap: Record<string, string> = {
    'Portugal': 'PT',
    'Espanha': 'ES',
    'Spain': 'ES',
    'PT': 'PT',
    'ES': 'ES'
  };
  const countryCode = countryMap[customer?.country] || customer?.country || 'PT';

  const variables = {
    shopId: shopId || Number(DROPEA_SHOP_ID),
    paymentMethod: "MANUAL",
    customer: {
      first_name: (customer.firstName || customer.first_name || (customer.fullName ? customer.fullName.split(' ')[0] : "Cliente")).trim(),
      last_name: (customer.lastName || customer.last_name || (customer.fullName ? customer.fullName.split(' ').slice(1).join(' ') || 'S.Art' : "S.Art")).trim(),
      email: (customer.email || "").trim(),
      phone: (customer.phone || "").trim(),
      address: String(customer.address || ""), // USER REQUIREMENT: EXACT DATA PRESERVATION (NO TRIM OR NORMALIZATION)
      city: (customer.city || "").trim(),
      zip: (customer.zip || customer.postalCode || "").trim(),
      country: countryCode
    },
    products: [] as any[]
  };

  if (!variables.customer.first_name || !variables.customer.email || !variables.customer.address) {
    console.error('[DROPEA] Erro: Dados do cliente incompletos:', JSON.stringify(variables.customer));
    throw new Error("Dados de cliente incompletos para Dropea");
  }

  // Find correct variant ID from Dropea if options are selected
  let variantId: number | null = null;
  const dropeaProductId = parseInt(String(product.product_id || product.dropea_id || 0), 10);
  
  if (product.selected_options && (product.selected_options.size || product.selected_options.color)) {
    try {
      console.log(`[DROPEA INTERNAL] Procurando variante para opções:`, JSON.stringify(product.selected_options));
      const detailQuery = `query GetProduct($id: [Int]) { 
        products(id: $id) { 
          data { 
            id
            variants { id name } 
          } 
        } 
      }`;
      const detailRes = await axios.post(DROPEA_API_URL, { 
        query: detailQuery, 
        variables: { id: [dropeaProductId] } 
      }, { 
        headers: { 'x-api-key': DROPEA_API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000 
      });

      const variants = detailRes.data?.data?.products?.data?.[0]?.variants || [];
      if (Array.isArray(variants) && variants.length > 0) {
        const selSize = String(product.selected_options.size || "").toLowerCase();
        const selColor = String(product.selected_options.color || "").toLowerCase();

        const matchedVariant = variants.find((v: any) => {
          const vName = String(v.name || "").toLowerCase();
          if (selSize && selColor) return vName.includes(selSize) && vName.includes(selColor);
          if (selSize) return vName.includes(selSize);
          if (selColor) return vName.includes(selColor);
          return false;
        });

        if (matchedVariant) {
          variantId = parseInt(String(matchedVariant.id), 10);
          console.log(`[DROPEA INTERNAL] Variante encontrada: ${matchedVariant.name} (ID: ${variantId})`);
        } else {
          console.log(`[DROPEA INTERNAL] Nenhuma variante exata encontrada.`);
        }
      }
    } catch (vErr) {
      console.error(`[DROPEA INTERNAL] Erro ao buscar variantes (seguindo com produto base):`, vErr);
    }
  }

  // Build product list
  const productEntry: any = {
    product_id: variantId || dropeaProductId, // If variant exists, we might need to use it as product_id if variant_id is not allowed
    quantity: parseInt(String(product.quantity || 1), 10),
    total_value: parseFloat(String(product.total_value || product.pvp || 0)),
    unit_price: parseFloat(String(product.unit_price || product.total_value || product.pvp || 0))
  };

  variables.products = [productEntry];

  console.log(`[DROPEA INTERNAL] Executando orderCreate para e-mail: ${variables.customer.email}`);
  
  const response = await axios.post(DROPEA_API_URL, {
    query: graphqlMutation,
    variables
  }, {
    headers: {
      'x-api-key': DROPEA_API_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'SArt-Boutique-Boutique/1.0'
    },
    timeout: 30000
  });

  if (response?.data?.errors) {
    console.error('[DROPEA INTERNAL ERRORS]', JSON.stringify(response.data.errors, null, 2));
    const msg = response.data.errors[0]?.message || 'Erro desconhecido na API Dropea';
    throw new Error(`Dropea rejection: ${msg}`);
  }

  const newId = response.data?.data?.orderCreate?.id;
  if (!newId) {
    console.error('[DROPEA INTERNAL] API não retornou ID. Payload:', JSON.stringify(response.data));
    throw new Error("Dropea não retornou ID de pedido");
  }

  console.log(`[DROPEA INTERNAL SUCCESS] Pedido criado com ID: ${newId}`);
  return newId;
}

async function executeDropeaQuery(query: string, variables: any, rootField: string) {
  try {
    console.log(`[DROPEA DEBUG] Executing ${rootField} query with variables:`, JSON.stringify(variables));
    const response = await axios.post(DROPEA_API_URL, { query, variables }, {
      headers: {
        'x-api-key': DROPEA_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'SArt-Boutique-Boutique/1.0'
      },
      timeout: 15000
    });

    if (response.data?.errors) {
      const errorMsg = JSON.stringify(response.data.errors);
      console.error(`[DROPEA GRAPHQL ERROR] for ${rootField}:`, errorMsg);
      // Return the errors so the caller can decide
      return { errors: response.data.errors };
    }

    const result = response.data?.data?.[rootField]?.data;
    // For single ID queries, return the first item
    if (variables.id && Array.isArray(result)) return result[0];
    return result;
  } catch (e: any) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.error(`[DROPEA REQUEST ERROR] for ${rootField}:`, detail);
    return { error: detail };
  }
}

async function findDropeaOrderByEmail(email: string, expectedAmount?: number) {
  const graphqlQuery = `
    query FindOrdersByEmail {
      orders(limit: 50) {
        data {
          id
          customer { email }
          status
          created_at
        }
      }
    }
  `;
  try {
    const result = await executeDropeaQuery(graphqlQuery, {}, 'orders');
    
    if (result && typeof result === 'object' && 'errors' in result) {
      console.error('[DROPEA MATCH] Erro GraphQL na busca:', result.errors);
      return null;
    }

    if (result && Array.isArray(result)) {
      const lowerEmail = email.toLowerCase().trim();
      const matches = [...result].filter(o => 
        o.customer?.email?.toLowerCase()?.trim() === lowerEmail
      );

      if (matches.length === 0) {
        console.warn(`[DROPEA MATCH] Nenhum pedido encontrado para o e-mail: ${lowerEmail}`);
        return null;
      }

      // Se não temos o valor para comparar (devido ao erro no campo 'total'), 
      // aceitamos o mais recente que NÃO esteja cancelado
      const validMatch = matches.sort((a,b) => b.id - a.id).find(o => 
        !['CANCELLED', 'CANCELED', 'VOID', 'CANCELADO'].includes(String(o.status).toUpperCase())
      );
      
      if (validMatch) {
        console.log(`[DROPEA MATCH] Encontrado pedido por email: ${validMatch.id}`);
        return validMatch.id;
      }
    }
  } catch (err) {
    console.error('[DROPEA MATCH ERROR]', err);
  }
  return null;
}

async function getDropeaOrderStatus(dropeaOrderId: string) {
  const numericId = parseInt(dropeaOrderId, 10);
  if (isNaN(numericId)) return null;

  const graphqlQuery = `
    query GetOrderStatus($id: [Int]) {
      orders(id: $id) {
        data {
          id
          status
          tracking_code
          tracking_url
          customer { email }
          items { 
            product { name id }
            quantity
          }
        }
      }
    }
  `;

  const orderData = await executeDropeaQuery(graphqlQuery, { id: [numericId] }, 'orders');
  
  if (!orderData || (orderData as any).errors || (orderData as any).error) {
    return null;
  }

  return {
    id: orderData.id,
    status: orderData.status,
    tracking_number: orderData.tracking_code,
    tracking_url: orderData.tracking_url,
    customer: orderData.customer,
    items: orderData.items
  };
}

// --- WEBHOOK DROPEA ---
app.post('/api/orders/sync-statuses', express.json(), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    console.log(`[USER SYNC] Initing sync for user: ${userId}`);
    const supabase = getSupabase();

    // Buscar ordens não permanentes
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'in', '("refunded","delivered","canceled")');

    if (error || !orders || orders.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    let changeCount = 0;
    for (const order of orders) {
      try {
        let dropeaId = order.dropea_order_id;
        
        // 1. Tentar encontrar ID se não tiver
        if (!dropeaId && order.status !== 'pending') {
           const email = order.customer_email;
           if (email) {
             const found = await findDropeaOrderByEmail(email, order.total_amount);
             if (found) {
               dropeaId = String(found);
               await supabase.from('orders').update({ dropea_order_id: dropeaId }).eq('id', order.id);
             }
           }
        }

        if (dropeaId) {
          const dropeaData = await getDropeaOrderStatus(dropeaId);
          if (dropeaData) {
            const updateData: any = { updated_at: new Date().toISOString() };
            const ds = String(dropeaData.status).toUpperCase();
            const mapped = mapDropeaStatusToInternal(ds);
            
            let statusChanged = false;

            if (mapped) {
              if (mapped.status && order.status !== mapped.status) {
                // Se for transição para cancelado e for pago, tratar logicamente se necessário
                // Mas aqui apenas sincronizamos os estados base
                updateData.status = mapped.status;
                statusChanged = true;
              }
              if (mapped.shipping && order.shipping_status !== mapped.shipping) {
                updateData.shipping_status = mapped.shipping;
                statusChanged = true;
              }
            } else {
              // Lógica Legada Fallback
              if (['SHIPPED', 'ON_THE_WAY', 'SENT', 'EN_CAMINO', 'FULFILLED'].includes(ds)) {
                if (order.shipping_status !== 'sent' && order.status !== 'pending') {
                  updateData.shipping_status = 'sent';
                  statusChanged = true;
                }
              }
            }
            
            if ((updateData.status === 'paid' || order.status === 'paid' || order.status === 'completed') && !order.payment_status) {
              updateData.payment_status = 'paid';
              statusChanged = true;
            }

            if (dropeaData.tracking_number && (!order.shipping_status_metadata || order.shipping_status_metadata.trackingNumber !== dropeaData.tracking_number)) {
              updateData.shipping_status_metadata = {
                ...(order.shipping_status_metadata || {}),
                trackingNumber: dropeaData.tracking_number,
                trackingUrl: dropeaData.tracking_url
              };
              statusChanged = true;
            }

            if (statusChanged) {
              await supabase.from('orders').update(updateData).eq('id', order.id);
              changeCount++;
              // Notificar utilizador se houve mudança relevante
              if (updateData.status || updateData.shipping_status) {
                triggerOrderNotification(order.id, updateData.status || order.status, updateData.shipping_status || order.shipping_status, { ...order, ...updateData }).catch(e => console.error(e));
              }
            }
          }
        }
      } catch (e) {
        console.error(`[SYNC LOOP ERROR] Order ${order.id}:`, e);
      }
    }

    res.json({ success: true, count: changeCount });
  } catch (error: any) {
    console.error('[SYNC STATUSES ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dropea/webhook', express.json(), async (req, res) => {
  const payload = req.body;
  const { event, data } = payload;
  const supabase = getSupabase();

  console.log(`[DROPEA WEBHOOK] Event received: ${event}`);

  try {
    const dropeaOrderId = data.id || data.order_id || data.token || (data.order && data.order.id);
    
    if (!dropeaOrderId) {
      console.warn('[DROPEA WEBHOOK] Webhook ignorado: dropeaOrderId não encontrado no payload.');
      return res.status(200).json({ received: true });
    }

    // Identificar a ordem local vinculada pelo Dropea ID
    const { data: linkedOrder } = await supabase
      .from('orders')
      .select('id, status, stripe_session_id, payment_status, shipping_status, total_amount, customer_email')
      .eq('dropea_order_id', String(dropeaOrderId))
      .maybeSingle();

    // 1. Handle Payment/Creation Events
    if (event === 'checkout.completed' || event === 'payment.succeeded' || event === 'order.paid') {
      console.log(`[DROPEA WEBHOOK] Payment Confirmed for Dropea ID: ${dropeaOrderId}`);
      // Fallback para metadata se o link direto falhar
      const orderIdFromMetadata = data.metadata?.orderId || data.order_id;
      const finalOrderId = linkedOrder?.id || orderIdFromMetadata;
      
      if (finalOrderId) {
        console.log(`[DROPEA WEBHOOK] Sincronizando pagamento para ordem: ${finalOrderId}`);
        const { data: updated } = await supabase
          .from('orders')
          .update({ 
            status: 'paid',
            dropea_order_id: String(dropeaOrderId)
          })
          .eq('id', finalOrderId)
          .select()
          .single();
          
        if (updated) {
          triggerOrderNotification(finalOrderId, 'paid', updated.shipping_status || 'pending', updated).catch(e => console.error('[WEBHOOK EMAIL ERROR]', e));
        }
      } else {
        console.warn(`[DROPEA WEBHOOK] Ordem não encontrada para pagamento: ${dropeaOrderId}`);
      }
    } 
    
    // 2. Handle Shipping/Fulfillment Events (The "Real-time tracking")
    else if (event === 'order.shipped' || event === 'order.fulfilled' || event === 'fulfillment.created') {
      console.log(`[DROPEA WEBHOOK] Order Shipped event for Dropea ID: ${dropeaOrderId}`);
      
      const trackingNumber = data.tracking_number || (data.fulfillment?.tracking_number) || (data.tracking?.number) || (data.order?.tracking_number);
      const trackingUrl = data.tracking_url || (data.fulfillment?.tracking_url) || (data.tracking?.url) || (data.order?.tracking_url);

      if (linkedOrder && linkedOrder.status !== 'pending') {
        const updateData: any = { 
          shipping_status: 'sent',
          updated_at: new Date().toISOString()
        };
        
        if (trackingNumber) {
          updateData.shipping_status_metadata = { 
            trackingNumber, 
            trackingUrl, 
            lastUpdate: new Date().toISOString() 
          };
        }

        const { data: order } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', linkedOrder.id)
          .select()
          .single();

        if (order) {
          console.log(`[DROPEA WEBHOOK] Disparando e-mail de rastreio para ordem ${order.id}. Tracking: ${trackingNumber}`);
          // Force: true para garantir que o e-mail de rastreio vá mesmo se algum outro e-mail de envio já tenha ido erroneamente
          triggerOrderNotification(order.id, order.status, 'sent', order, true).catch(e => console.error('[WEBHOOK SHIP EMAIL ERROR]', e));
        }
      }
    } 
    
    else if (event === 'order.delivered') {
      console.log(`[DROPEA WEBHOOK] Order Delivered for Dropea ID: ${dropeaOrderId}`);
      if (linkedOrder) {
        const { data: order } = await supabase
          .from('orders')
          .update({ shipping_status: 'delivered' })
          .eq('id', linkedOrder.id)
          .select()
          .single();

        if (order) {
          triggerOrderNotification(order.id, order.status, 'delivered', order).catch(e => console.error('[WEBHOOK DELIVERED EMAIL ERROR]', e));
        }
      }
    }

    else if (event === 'order.canceled' || event === 'order.cancelled' || event === 'payment.failed') {
      console.log(`[DROPEA WEBHOOK] Order Canceled/Failed for Dropea ID: ${dropeaOrderId}`);
      
      if (linkedOrder) {
        // User wants manual control of refunds, so we only mark as canceled locally
        const { data: order } = await supabase
          .from('orders')
          .update({ status: 'canceled' })
          .eq('id', linkedOrder.id)
          .select()
          .single();

        if (order) {
          triggerOrderNotification(order.id, 'canceled', order.shipping_status || 'pending', order).catch(e => console.error('[WEBHOOK CANCELED EMAIL ERROR]', e));
        }
      }
    }
  } catch (err: any) {
    console.error('[DROPEA WEBHOOK ERROR]', err.message);
  }

  res.json({ received: true });
});

// Helper function to handle Stripe Refund
async function processRefundInternal(orderId: string) {
  const supabase = getSupabase();
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order || !order.stripe_session_id || !stripe) {
      console.error(`[REFUND INTERNAL] Cannot refund order ${orderId}: Missing Stripe session or client`);
      return false;
    }

    // 1. Get PaymentIntent from Checkout Session
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    } catch (sErr: any) {
      if (sErr.message?.includes('No such checkout.session')) {
         console.warn(`[REFUND INTERNAL] Stripe session ${order.stripe_session_id} not found (likely test data or expired)`);
         return false;
      }
      throw sErr;
    }
    const paymentIntentId = session.payment_intent as string;

    if (!paymentIntentId) {
      console.error(`[REFUND INTERNAL] No payment intent found for session ${order.stripe_session_id}`);
      return false;
    }

    // 2. Create Refund on Stripe
    console.log(`[REFUND INTERNAL] Initiating Stripe refund for PaymentIntent: ${paymentIntentId}`);
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer'
    });

    if (refund.status === 'succeeded' || refund.status === 'pending') {
      console.log(`[REFUND INTERNAL] Stripe refund ${refund.status} for Order: ${orderId}`);
      
      if (refund.status === 'succeeded') {
        const { data: updated } = await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', orderId).select().single();
        if (updated) triggerOrderNotification(orderId, 'refunded', updated.shipping_status, updated).catch(e => console.error('[REFUND NOTIF ERROR]', e));
      } else {
        // Se estiver pendente, marcamos como refund_pending
        const { data: updated } = await supabase.from('orders').update({ status: 'refund_pending', payment_status: 'refund_pending' }).eq('id', orderId).select().single();
        // Avisar que foi cancelado com reembolso em curso
        if (updated) triggerOrderNotification(orderId, 'canceled', updated.shipping_status, updated).catch(e => console.error('[CANCEL NOTIF ERROR]', e));
      }
      return true;
    }
    
    return false;
  } catch (err: any) {
    console.error(`[REFUND INTERNAL FATAL] for order ${orderId}:`, err.message);
    return false;
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

// Sync Order Status manually (Client Triggered)
apiRouter.post('/orders/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      console.error(`[SYNC ERROR] Order ${id} not found in DB:`, fetchError);
      return res.status(404).json({ error: 'Ordem não encontrada no sistema local' });
    }

    let dropeaId = order.dropea_order_id;

    if (!dropeaId) {
      // Remover tentativa de fulfillment automático no sync para evitar confusão.
      // O sync deve apenas procurar pedidos existentes.
      
      // Tentar encontrar por email (customer_email ou via profiles se existir)
      let email = order.customer_email;
      
      if (!email && order.user_id) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', order.user_id).single();
        if (profile) email = profile.email;
      }

      if (email) {
        console.log(`[SYNC] Tentando encontrar vínculo por email: ${email}`);
        const foundId = await findDropeaOrderByEmail(email, order.total_amount);
        if (foundId) {
          dropeaId = String(foundId);
          console.log(`[SYNC] Vínculo encontrado! Dropea ID: ${dropeaId}`);
          
          // Verificar se outro pedido já tem este ID Dropea para evitar erro de UNIQUE constraint
          const { data: duplicate } = await supabase.from('orders').select('id').eq('dropea_order_id', dropeaId).maybeSingle();
          if (!duplicate) {
            await supabase.from('orders').update({ dropea_order_id: dropeaId }).eq('id', id);
          } else {
            console.warn(`[SYNC] Aviso: O pedido Dropea ${dropeaId} já está vinculado ao registro local ${duplicate.id}.`);
            // Se for duplicado, não vinculamos a este para não causar confusão de status
            dropeaId = null;
          }
        }
      }
    }

    if (!dropeaId) {
      return res.status(404).json({ 
        error: 'PEDIDO_NAO_ENCONTRADO',
        message: 'Pedido não vinculado e não encontrado na Dropea via e-mail.' 
      });
    }

    const dropeaData = await getDropeaOrderStatus(dropeaId);

    if (dropeaData) {
      console.log(`[SYNC SUCCESS] Dados obtidos da Dropea para ID ${dropeaId}`, JSON.stringify(dropeaData));
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      // VERIFICAÇÃO STRIPE
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
          } else if (pi && pi.status === 'succeeded' && pi.amount_received > 0) {
             updateData.payment_status = 'paid';
          }
        } catch (stripeErr: any) {
          if (stripeErr.message?.includes('No such checkout.session')) {
            console.warn(`[USER SYNC STRIPE WARN] Session ${order.stripe_session_id} not found for order ${id}. Skipping Stripe sync.`);
          } else {
            console.error(`[USER SYNC STRIPE ERROR] Order ${id}:`, stripeErr);
          }
        }
      }

      const dropeaStatus = String(dropeaData.status).toUpperCase();
      const mapped = mapDropeaStatusToInternal(dropeaStatus);
      
      if (mapped) {
        if (mapped.status) updateData.status = mapped.status;
        if (mapped.shipping) updateData.shipping_status = mapped.shipping;
        
        // Auto-refund logic if canceled
        if (mapped.status === 'canceled' && (order.status === 'paid' || order.status === 'completed') && order.stripe_session_id) {
           console.log(`[SYNC AUTO-REFUND] Ordem ${order.id} cancelada na Dropea. Iniciando Stripe Refund...`);
           processRefundInternal(order.id).catch(e => console.error('[SYNC REFUND ERROR]', e));
        }
      } else {
        // Mapeamento Robusto de Status Legado (Fallback)
        if (['SHIPPED', 'ON_THE_WAY', 'SENT', 'EN_CAMINO', 'FULFILLED', 'IN_TRANSIT', 'EM_TRANSITO'].includes(dropeaStatus) && order.status !== 'pending') {
          updateData.shipping_status = 'sent';
        } else if (['DELIVERED', 'COMPLETED', 'RECEIVED', 'ENTREGADO', 'ENTREGUE'].includes(dropeaStatus)) {
          updateData.shipping_status = 'delivered';
        } else if (['OUT_FOR_DELIVERY', 'SAIU_PARA_ENTREGA', 'PRESTES_A_CHEGAR', 'IN_DELIVERY'].includes(dropeaStatus)) {
          updateData.shipping_status = 'out_for_delivery';
        }
        
        // Manter apenas o cancelamento, que é crítico.
        if (['CANCELLED', 'CANCELED', 'VOID', 'CANCELADO'].includes(dropeaStatus)) {
          updateData.status = 'canceled';
          
          // AUTOMAÇÃO SOLICITADA: Se cancelado na Dropea, iniciar reembolso no Stripe automaticamente
          if ((order.status === 'paid' || order.status === 'completed') && order.stripe_session_id) {
            console.log(`[SYNC AUTO-REFUND] Ordem ${order.id} cancelada na Dropea. Iniciando Stripe Refund...`);
            processRefundInternal(order.id).catch(e => console.error('[SYNC REFUND ERROR]', e));
          }
        } else if (['REFUNDED', 'RETURNED', 'DEVUELTO'].includes(dropeaStatus)) {
          updateData.status = 'refunded';
        } else if (['PAID', 'PROCESSING', 'READY_TO_SHIP', 'PAGADO', 'EN_PROCESO', 'PROCESSING'].includes(dropeaStatus)) {
          if (order.status !== 'completed' && order.status !== 'canceled') {
            updateData.status = 'paid';
            updateData.shipping_status = 'pending';
          }
        } else if (dropeaStatus === 'FULFILLED') {
          updateData.status = 'completed';
          updateData.shipping_status = 'sent';
        }
      }

      // Sincronização de Rastreio
      if (dropeaData.tracking_number && dropeaData.tracking_number !== order.shipping_status_metadata?.trackingNumber) {
        updateData.shipping_status_metadata = {
          ...(order.shipping_status_metadata || {}),
          trackingNumber: dropeaData.tracking_number,
          trackingUrl: dropeaData.tracking_url || order.shipping_status_metadata?.trackingUrl,
          syncedAt: new Date().toISOString(),
          source: 'Dropea Verification'
        };
        // Se tem tracking number, garantimos que o status de envio é 'sent' pelo menos.
        // Não retrocedemos de status 'delivered' ou 'out_for_delivery'.
        if (!['delivered', 'out_for_delivery'].includes(updateData.shipping_status || order.shipping_status)) {
          updateData.shipping_status = 'sent';
        }
      }

      // Detetar mudanças para gravar e notificar
      const hasStatusChange = updateData.status && updateData.status !== order.status;
      const hasShippingChange = updateData.shipping_status && updateData.shipping_status !== order.shipping_status;
      const hasPaymentStatusChange = updateData.payment_status && updateData.payment_status !== order.payment_status;
      const hasMetadataChange = !!updateData.shipping_status_metadata;

      const hasChanges = hasStatusChange || hasShippingChange || hasPaymentStatusChange || hasMetadataChange;

      if (hasChanges) {
        const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', id);
        if (updateError) {
          console.error('[SYNC DB UPDATE ERROR]', {
            error: updateError,
            orderId: id,
            updateData: updateData,
            order: order
          });
          return res.status(500).json({ error: 'Falha ao atualizar dados locais', details: updateError });
        }
        
        // Disparar e-mail se mudou algo visível para o cliente
        if (hasStatusChange || hasPaymentStatusChange) {
          const notifyStatus = updateData.status || order.status;
          triggerOrderNotification(order.id, notifyStatus, updateData.shipping_status || order.shipping_status, { ...order, ...updateData }).catch(e => console.error('[SYNC NOTIF ERR]', e));
        } else if (hasShippingChange) {
          triggerOrderNotification(order.id, order.status, updateData.shipping_status, { ...order, ...updateData }).catch(e => console.error('[SYNC SHIP NOTIF ERR]', e));
        }
      }

      return res.json({ 
        success: true, 
        message: 'Verificação profunda concluída com sucesso.',
        dropea_id: dropeaId,
        dropea_status: dropeaStatus,
        local_status: updateData.status || order.status,
        shipping: updateData.shipping_status || order.shipping_status,
        synced: hasChanges,
        details: {
          items: dropeaData.items,
          customer: dropeaData.customer,
          tracking: {
            number: dropeaData.tracking_number,
            url: dropeaData.tracking_url
          }
        },
        _debug: {
          updateData
        }
      });
    }

    console.warn(`[SYNC WARNING] Dropea ID ${dropeaId} não retornou dados.`);
    res.status(502).json({ error: 'A Dropea não retornou informações para este pedido. Verifique se o ID está correto no painel da Dropea.' });
  } catch (err: any) {
    console.error('[ORDER SYNC ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Erro de Sincronização', 
        message: err.message,
        path: req.path
      });
    }
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
        .select('*, profiles(*)')
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

    const customerName = profile?.full_name || (typeof order.shipping_details === 'string' ? JSON.parse(order.shipping_details).name : order.shipping_details?.name) || 'Cliente S.Art';
    const productName = product?.name || product?.title || 'Obra de Arte';
    const formattedId = `SART-${order.id.split('-')[0].toUpperCase()}`;

    // Priority: Refunded > Canceled > Delivered > Out for Delivery > Shipped > Paid
    if (['refunded', 'reembolsado'].includes(lowerS) || order.payment_status === 'refunded') {
      subject = `Reembolso Executado com Sucesso - Pedido ${formattedId}`;
      flagField = 'email_refunded_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #6366f1;">Reembolso Concluído</h2>
          <p>Olá, ${customerName}. É com prazer que informamos que o reembolso relativo ao pedido <strong>${formattedId}</strong> foi executado com sucesso.</p>
          <p>O valor total de <strong>€${order.total_amount}</strong> já saiu do nosso sistema e está a ser processado pelo seu banco/operadora.</p>
          <p>O crédito deverá aparecer no seu extrato nos próximos dias úteis.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
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
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
        </div>
      `;
    } else if (['delivered', 'entregue'].includes(lowerShip)) {
      subject = `O seu pedido ${formattedId} foi entregue!`;
      flagField = 'email_review_sent';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #10b981;">Pedido Entregue!</h2>
          <p>Olá, ${customerName}. O seu pedido <strong>${formattedId}</strong> foi entregue com sucesso.</p>
          <p>Esperamos que tenha gostado da sua nova obra de arte: <strong>${productName}</strong>.</p>
          <p>Se puder, adoraríamos ouvir a sua opinião. Sinta-se à vontade para responder a este e-mail ou deixar um comentário no nosso site.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
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
          <p>Obrigado por escolher a S.Art Boutique.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
        </div>
      `;
    } else if (['sent', 'enviado', 'shipped', 'em trânsito'].includes(lowerShip)) {
      subject = `O seu pedido ${formattedId} está a caminho!`;
      flagField = 'email_shipped_sent';
      const trackingInfo = order.shipping_status_metadata?.trackingNumber 
        ? `<p>Código de Rastreio: <strong>${order.shipping_status_metadata.trackingNumber}</strong></p>` 
        : '';
      emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #3b82f6;">Boas notícias!</h2>
          <p>Olá, ${customerName}. O seu pedido <strong>${formattedId}</strong> já foi enviado e está em trânsito.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Item:</strong> ${productName}</p>
            ${trackingInfo}
          </div>
          <p>Em breve receberá a sua obra de arte. Obrigado pela confiança!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
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
            <p style="margin: 5px 0 0 0;"><strong>Valor:</strong> €${order.total_amount}</p>
          </div>
          <p>O seu produto já está a ser preparado para envio. Assim que for despachado, enviaremos um novo e-mail com os detalhes do rastreio.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Equipa S.Art Boutique</p>
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

    // 5. Preparar Payload EXATAMENTE como no teste administrativo que funciona
    const payload = {
      to: targetEmail,
      subject: subject,
      body: emailBody,
      name: customerName
    };

    console.log(`[AUTOMAÇÃO MONITOR] Chamando send-custom-email via Supabase Invoke...`);
    
    // USANDO O MÉTODO "OFICIAL" QUE O USUÁRIO DISSE QUE FUNCIONA NO TESTE
    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke('send-custom-email', {
      body: payload
    });

    if (invokeErr) {
      console.error(`[AUTOMAÇÃO MONITOR] ❌ ERRO AO INVOCAR SEND-CUSTOM-EMAIL:`, JSON.stringify(invokeErr));
      // Se der erro, tentaremos logar o erro detalhado se disponível
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

// Sync Protocol (Actually imports/updates products in DB)
apiRouter.post('/dropea/sync', async (req, res) => {
  try {
    const supabase = getSupabase();
    const targetUrl = 'https://api.dropea.com/graphql/dropshippers';
    const graphqlQuery = { query: `query { products { data { id name images pvpr } } }` };
    
    console.log('[DROPEA SYNC] Iniciando sincronização de catálogo...');
    const response = await axios.post(targetUrl, graphqlQuery, { headers: { 'x-api-key': DROPEA_API_KEY }, timeout: 30000 });
    
    const rawProducts = response.data?.data?.products?.data || [];
    console.log(`[DROPEA SYNC] ${rawProducts.length} produtos encontrados no catálogo.`);

    // 1. LIMPEZA DE DUPLICADOS: Identificar e remover IDs internos diferentes que referenciam o mesmo dropea_id
    const { data: allDropeaProds } = await supabase.from('products').select('id, dropea_id').not('dropea_id', 'is', null);
    if (allDropeaProds) {
      const seen = new Map();
      const duplicateIds = [];
      for (const prod of allDropeaProds) {
        const dId = String(prod.dropea_id);
        if (seen.has(dId)) {
          // Mantemos o primeiro que encontramos e marcamos o resto para deleção
          duplicateIds.push(prod.id);
        } else {
          seen.set(dId, prod.id);
        }
      }
      if (duplicateIds.length > 0) {
        console.log(`[DROPEA SYNC] Removendo ${duplicateIds.length} registros duplicados de dropea_id...`);
        await supabase.from('products').delete().in('id', duplicateIds);
      }
    }

    // 2. Fetch current state after cleanup
    const { data: existingProducts } = await supabase.from('products').select('dropea_id, price');
    const existingMap = new Map(existingProducts?.map(p => [String(p.dropea_id), p.price]) || []);

    let syncedCount = 0;
    for (const p of rawProducts) {
      const pId = String(p.id);
      const isNew = !existingMap.has(pId);
      
      const productToUpsert: any = {
        dropea_id: pId,
        price: isNew ? p.pvpr : existingMap.get(pId),
        image_url: Array.isArray(p.images) ? p.images[0] : (typeof p.images === 'string' ? p.images : ''),
        product_type: 'physical',
        category: p.category || 'Coleção Boutique',
        is_active: true
      };

      // ONLY set title and description if it's a NEW product to avoid overwriting local edits
      if (isNew) {
        productToUpsert.title = p.name;
        productToUpsert.description = p.description || "";
      }

      const { error } = await supabase
        .from('products')
        .upsert(productToUpsert, { onConflict: 'dropea_id' });
      
      if (!error) syncedCount++;
      else console.error(`[DROPEA SYNC] Erro ao sincronizar produto ${p.id}:`, error);
    }

    res.json({ 
      success: true, 
      message: `Sincronização concluída: ${syncedCount} produtos processados.`,
      count: syncedCount
    });
  } catch (error: any) {
    console.error('[DROPEA SYNC FAIL]', error.message);
    res.status(500).json({ error: 'Falha na sincronização', details: error.message });
  }
});

// Create Dropea Checkout (GraphQL)
apiRouter.post('/dropea/checkout', async (req, res) => {
  try {
    const { shop_id, customer, products } = req.body;
    
    // Simplificar chamando o helper interno para o primeiro produto (comportamento atual da UI)
    const orderId = await createDropeaOrderInternal(
      Number(shop_id || DROPEA_SHOP_ID),
      customer,
      products[0]
    );

    res.json({ success: true, order_id: orderId, message: 'Pedido gerado com sucesso' });
  } catch (error: any) {
    console.error('[DROPEA CHECKOUT FATAL]', error.message);
    res.status(500).json({ 
      error: 'Erro interno ao processar checkout Dropea', 
      details: error.message 
    });
  }
});


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
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !profile || !profile.is_admin) {
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

adminRouter.get('/users', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    // Fetch all users from Auth (requires Service Role)
      const authData = await supabase.auth.admin.listUsers();
      if (authData.error) throw authData.error;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*');

    if (profileError) throw profileError;

    // Merge Auth users with Profiles
    const mergedUsers = authData.data.users.map(authUser => {
      const profile = profileData?.find(p => p.id === authUser.id);
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
        avatar_url: profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '',
        is_admin: profile?.is_admin || false,
        created_at: authUser.created_at,
        custom_id: profile?.custom_id || `SART-${authUser.id.substring(0, 4).toUpperCase()}`
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
    const { is_admin } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_admin })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id, is_featured
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price. Ensure it's a valid number.
    const rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    let finalPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
    
    if (isNaN(finalPrice) || finalPrice === undefined || finalPrice === null) {
      console.warn(`[ADMIN] Price is invalid (${rawPrice}). Defaulting to 0.`);
      finalPrice = 0;
    }

    // console.log(`[ADMIN] Creating product. Price: ${finalPrice} (from pvp: ${pvp}, price: ${price})`);

    const supabase = getSupabase();
    
    // Ensure dropea_id column exists or handle error
    let query;
    const upsertData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured
    };
    
    if (dropea_id) {
      upsertData.dropea_id = String(dropea_id);
      query = supabase.from('products').upsert(upsertData, { onConflict: 'dropea_id' });
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
        if (dropea_id) {
          retryQuery = supabase.from('products').upsert(upsertData, { onConflict: 'dropea_id' });
        } else {
          retryQuery = supabase.from('products').insert(upsertData);
        }
        
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
          if (dropea_id) {
            const updates = keys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
            sql = `INSERT INTO products (${columns}) VALUES (${values}) ON CONFLICT (dropea_id) DO UPDATE SET ${updates} RETURNING *;`;
          } else {
            sql = `INSERT INTO products (${columns}) VALUES (${values}) RETURNING *;`;
          }
          
          const sqlResult = await supabase.rpc('exec_sql', { sql });
          if (!sqlResult.error) {
            data = Array.isArray(sqlResult.data) ? sqlResult.data[0] : sqlResult.data;
            error = null;
          } else {
            console.warn('[ADMIN] Raw SQL Fallback failed or function missing (POST). Stripping is_featured for final attempt...');
            const finalData = { ...upsertData };
            delete finalData.is_featured;
            let finalQuery;
            if (dropea_id) {
              finalQuery = supabase.from('products').upsert(finalData, { onConflict: 'dropea_id' });
            } else {
              finalQuery = supabase.from('products').insert(finalData);
            }
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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id, is_featured
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price. Ensure it's a valid number.
    const rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    let finalPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;

    if (isNaN(finalPrice) || finalPrice === undefined || finalPrice === null) {
      console.warn(`[ADMIN] Price is invalid (${rawPrice}) for ${id}. Defaulting to 0.`);
      finalPrice = 0;
    }

    // console.log(`[ADMIN] Updating product ${id}. New Price: ${finalPrice} (from pvp: ${pvp}, price: ${price})`);

    const supabase = getSupabase();
    const updateData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured
    };
    
    if (dropea_id) updateData.dropea_id = String(dropea_id);

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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id, is_featured
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price
    const rawPrice = (pvp !== undefined && pvp !== null) ? pvp : price;
    const finalPrice = (typeof rawPrice === 'string' ? parseFloat(rawPrice) : (rawPrice || 0));

    const supabase = getSupabase();
    const updateData: any = { 
      title, description, price: finalPrice, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, is_featured
    };
    
    if (dropea_id) updateData.dropea_id = String(dropea_id);

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

adminRouter.post('/products/import-dropea', async (req, res) => {
  try {
    const { dropeaId } = req.body;
    if (!dropeaId) return res.status(400).json({ error: 'ID da Dropea é obrigatório.' });

    console.log(`[ADMIN] Importando produto Dropea ID: ${dropeaId}`);
    
    const targetUrl = 'https://api.dropea.com/graphql/dropshippers';
    let productData = null;

    // Helper to try queries
    const tryQuery = async (query: string, variables?: any) => {
      try {
        const res = await axios.post(targetUrl, { query, variables }, { 
          headers: { 
            'x-api-key': DROPEA_API_KEY,
            'Content-Type': 'application/json',
            'User-Agent': 'SArt-Boutique-Boutique/1.0'
          }, 
          timeout: 15000 
        });
        if (res.data?.errors) {
          console.log(`[DROPEA] Erros na query:`, JSON.stringify(res.data.errors));
        }
        return res.data?.data;
      } catch (e: any) {
        console.log(`[DROPEA] Erro na execução da query:`, e.message);
        return null;
      }
    };

    console.log(`[ADMIN] Buscando produto ${dropeaId} na Dropea...`);

    // TAREFA: CORRIGIR TIPAGEM DO ID PARA [Int] E REMOVER price/stock DAS VARIANTS
    const q1 = `query GetProduct($id: [Int]) { 
      products(id: $id) { 
        data { 
          id name images description pvpr category 
          variants { id name } 
        } 
      } 
    }`;
    
    // TAREFA: Enviar ID como array numérico
    const variables = { id: [Number(dropeaId)] };
    const r1 = await tryQuery(q1, variables);
    const list1 = r1?.products?.data || [];
    productData = list1.find((p: any) => String(p.id) === String(dropeaId));

    // Tentativa 2: Escanear catálogo paginado se a busca direta falhar
    if (!productData) {
      console.log(`[ADMIN] Busca direta falhou, escaneando catálogo...`);
      for (let page = 1; page <= 5; page++) {
        const q2 = `query { products(page: ${page}) { data { id name images description pvpr category variants { id name } } } }`;
        const r2 = await tryQuery(q2);
        const list = r2?.products?.data || [];
        if (list.length === 0) break;
        
        productData = list.find((p: any) => String(p.id) === String(dropeaId));
        if (productData) break;
      }
    }

    if (!productData) {
      console.error(`[ADMIN] FALHA CRÍTICA: Produto ${dropeaId} não encontrado após scan exaustivo.`);
      return res.status(404).json({ 
        error: `Produto ${dropeaId} não encontrado no catálogo da Dropea.`,
        details: 'Verifique se o ID está correto ou se o produto é visível para a sua chave de API.'
      });
    }

    const supabase = getSupabase();
    
    // Check if it already exists to preserve local edits
    const { data: existing } = await supabase
      .from('products')
      .select('title, description, price')
      .eq('dropea_id', String(productData.id))
      .maybeSingle();

    // Extrair tamanhos e cores dos variants se disponíveis
    let sizes = "";
    let colors = "";
    let sizes_enabled = false;
    let colors_enabled = false;

    if (Array.isArray(productData.variants)) {
      const variantNames = productData.variants.map((v: any) => v.name).filter(Boolean);
      const sizeList = new Set<string>();
      const colorList = new Set<string>();
      
      variantNames.forEach((name: string) => {
        const parts = name.split('/').map(p => p.trim());
        parts.forEach(part => {
          const u = part.toUpperCase();
          if (['S', 'M', 'L', 'XL', 'XXL', '3XL', 'P', 'G', 'GG'].includes(u) || /^\d+$/.test(part)) {
            sizeList.add(part);
          } else {
             if (part && part.length < 20) colorList.add(part);
          }
        });
      });

      if (sizeList.size > 0) {
        sizes = Array.from(sizeList).join(',');
        sizes_enabled = true;
      }
      if (colorList.size > 0) {
        colors = Array.from(colorList).join(',');
        colors_enabled = true;
      }
    }

    // Melhora a deteção via descrição como fallback ou complemento
    const desc = (productData.description || "").toLowerCase();
    const commonSizes = ['S', 'M', 'L', 'XL', 'XXL', '3XL', 'P', 'G', 'GG'];
    const commonColors = [
      'Preto', 'Branco', 'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Cinzento', 'Dourado', 'Prateado',
      'Black', 'White', 'Blue', 'Red', 'Green', 'Yellow', 'Pink', 'Grey', 'Gold', 'Silver',
      'Bege', 'Beige', 'Marrom', 'Brown', 'Laranja', 'Orange', 'Roxo', 'Purple'
    ];

    const detectedSizes = commonSizes.filter(s => {
      const regex = new RegExp(`\\b${s}\\b`, 'i');
      return regex.test(desc);
    });

    const detectedColors = commonColors.filter(c => {
       const lowerC = c.toLowerCase();
       // Evitar detetar cores dentro de outras palavras (ex: 'Red' em 'Reduced')
       const regex = new RegExp(`\\b${lowerC}\\b`, 'i');
       return regex.test(desc);
    });

    if (detectedSizes.length > 0) {
      const currentSizes = sizes ? sizes.split(',').map(s => s.trim()) : [];
      detectedSizes.forEach(ds => {
        if (!currentSizes.includes(ds)) currentSizes.push(ds);
      });
      sizes = currentSizes.join(',');
      sizes_enabled = true;
    }

    if (detectedColors.length > 0) {
      const currentColors = colors ? colors.split(',').map(c => c.trim()) : [];
      detectedColors.forEach(dc => {
         const capitalized = dc.charAt(0).toUpperCase() + dc.slice(1);
         if (!currentColors.includes(capitalized)) currentColors.push(capitalized);
      });
      colors = currentColors.join(',');
      colors_enabled = true;
    }

    // Normalizar imagens
    let image_url = "";
    if (Array.isArray(productData.images) && productData.images.length > 0) {
      const first = productData.images[0];
      image_url = typeof first === "string" ? first : (first.url || first.src || "");
    } else if (typeof productData.images === "string") {
      image_url = productData.images;
    }

    let extra_images = "";
    if (Array.isArray(productData.images)) {
      extra_images = productData.images
        .map((img: any) => typeof img === "string" ? img : (img.url || img.src || ""))
        .filter(Boolean)
        .join(",");
    }

    const { data: upserted, error: upsertError } = await supabase
      .from('products')
      .upsert({
        dropea_id: String(productData.id),
        title: existing?.title || productData.name,
        description: existing?.description || productData.description || "",
        price: existing?.price || productData.pvpr || 0,
        image_url: image_url,
        extra_images: extra_images,
        product_type: 'physical',
        category: 'Coleção Boutique', // Standardize on user's preferred category
        is_active: true,
        sizes_enabled,
        colors_enabled,
        sizes,
        colors
      }, { onConflict: 'dropea_id' })
      .select()
      .single();

    if (upsertError) {
      console.error(`[ADMIN IMPORT DB ERROR]`, JSON.stringify(upsertError, null, 2));
      throw upsertError;
    }

    // Ensure "Coleção Boutique" is in the categories table
    try {
      const { data: catExists } = await supabase.from('categories').select('id').eq('name', 'Coleção Boutique').maybeSingle();
      if (!catExists) {
        await supabase.from('categories').insert([{ name: 'Coleção Boutique' }]);
      }
    } catch(cErr) { /* non-blocking */ }

    console.log(`[ADMIN] Produto ${dropeaId} importado com sucesso: ${upserted.title}`);
    res.json(upserted);

  } catch (error: any) {
    console.error(`[ADMIN IMPORT FATAL ERROR]`, error.response?.data || error.message || error);
    res.status(500).json({ 
      error: error.message || 'Erro interno na importação',
      details: error.response?.data || error
    });
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
    const supabase = getSupabase();
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
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

    if (order.status !== 'paid' && order.status !== 'completed') {
      return res.status(400).json({ error: 'Apenas pedidos pagos podem ser enviados para a Dropea' });
    }

    // Mesmo que já tenha ID, permitimos re-enviar se o admin insistir
    await processOrderFulfillment(order, true);
    
    // Buscar ordem atualizada para retornar pro front
    const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', id).single();
    
    res.json({ 
      success: true, 
      message: 'Pedido enviado para processamento na Dropea',
      order: updatedOrder
    });
  } catch (error: any) {
    console.error(`[ADMIN FULFILL ERROR]`, error);
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/orders/:id/sync_payment', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !order) {
      console.error(`[ADMIN SYNC ERROR] Order ${id} not found:`, fetchError);
      return res.status(404).json({ error: 'Ordem não encontrada no sistema local' });
    }

    let dropeaId = order.dropea_order_id;
    if (!dropeaId) {
      let email = order.customer_email;
      if (!email && order.user_id) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', order.user_id).single();
        if (profile) email = profile.email;
      }
      if (email) {
        const foundId = await findDropeaOrderByEmail(email, order.total_amount);
        if (foundId) {
          dropeaId = String(foundId);
          // Evitar erro de UNIQUE constraint no dropea_order_id
          const { data: duplicate } = await supabase.from('orders').select('id').eq('dropea_order_id', dropeaId).maybeSingle();
          if (!duplicate) {
            await supabase.from('orders').update({ dropea_order_id: dropeaId }).eq('id', id);
            order.dropea_order_id = dropeaId;
          } else {
            console.warn(`[ADMIN SYNC] O ID Dropea ${dropeaId} já está vinculado ao pedido ${duplicate.id}`);
          }
        }
      }
    }

    if (!dropeaId) {
      return res.status(404).json({ error: 'PEDIDO_NAO_ENCONTRADO', message: 'Pedido não vinculado e não encontrado na Dropea.' });
    }

    const dropeaData = await getDropeaOrderStatus(dropeaId);
    if (!dropeaData) return res.status(502).json({ error: 'Dropea não retornou dados.' });

    const updateData: any = { updated_at: new Date().toISOString() };
    
    // VERIFICAÇÃO STRIPE (Sincronização com a fonte da verdade financeira)
    if (stripe && order.stripe_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
          expand: ['payment_intent', 'payment_intent.latest_charge']
        });
        
        // Atualizar stripe_payment_intent se estiver faltando (ajuda reconciliação futura)
        if (session.payment_intent && !order.stripe_payment_intent) {
          updateData.stripe_payment_intent = typeof session.payment_intent === 'string' 
            ? session.payment_intent 
            : (session.payment_intent as any).id;
        }

        // Se a Stripe diz que foi pago, garantimos isso no nosso lado
        if (session.payment_status === 'paid') {
           updateData.payment_status = 'paid';
        }

        // VERIFICAR REEMBOLSOS (Crucial para o que o usuário está pedindo)
        const pi = session.payment_intent as Stripe.PaymentIntent;
        if (pi && pi.latest_charge) {
           const charge = pi.latest_charge as Stripe.Charge;
           if (charge.refunded) {
             console.log(`[SYNC STRIPE] Detetado reembolso na Stripe para ordem ${id}`);
             updateData.payment_status = 'refunded';
             updateData.status = 'refunded';
           }
        } else if (pi && pi.status === 'succeeded' && pi.amount_received > 0) {
           // Se não tem charge expandida mas o PI foi um sucesso, pelo menos sabemos que foi pago
           updateData.payment_status = 'paid';
        }
      } catch (stripeErr: any) {
        if (stripeErr.message?.includes('No such checkout.session')) {
          console.warn(`[SYNC STRIPE WARN] Session ${order.stripe_session_id} not found for order ${id}. Skipping Stripe sync.`);
        } else {
          console.error(`[SYNC STRIPE ERROR] Order ${id}:`, stripeErr);
        }
      }
    }

    const dropeaStatus = String(dropeaData.status).toUpperCase();
    const orderAgeMinutes = (new Date().getTime() - new Date(order.created_at).getTime()) / (1000 * 60);
    const mapped = mapDropeaStatusToInternal(dropeaStatus);
    
    if (mapped) {
      if (mapped.status) {
        if (mapped.status === 'canceled') {
          if (!['refunded', 'refund_pending', 'refund_requested'].includes(order.status) && orderAgeMinutes > 10) {
            updateData.status = 'canceled';
          }
        } else if (order.status !== 'refunded' && order.status !== 'completed') {
           updateData.status = mapped.status;
        }
      }
      if (mapped.shipping) {
        updateData.shipping_status = mapped.shipping;
      }
    } else if (['SHIPPED', 'ON_THE_WAY', 'SENT', 'EN_CAMINO', 'FULFILLED'].includes(dropeaStatus) && order.status !== 'pending') {
      updateData.shipping_status = 'sent';
      if (order.status !== 'refunded') {
        updateData.status = (dropeaStatus === 'FULFILLED') ? 'completed' : 'paid';
      }
    } else if (['DELIVERED', 'COMPLETED', 'RECEIVED', 'ENTREGADO'].includes(dropeaStatus)) {
      updateData.shipping_status = 'delivered';
      updateData.status = 'completed';
    } else if (['CANCELLED', 'CANCELED', 'VOID', 'CANCELADO'].includes(dropeaStatus)) {
      // Somente mudamos para cancelado se NÃO estiver já em processo de reembolso
      // E SE o pedido não for extremamente recente (menos de 10 minutos), para evitar race conditions na Dropea
      if (!['refunded', 'refund_pending', 'refund_requested'].includes(order.status)) {
        if (orderAgeMinutes > 10) {
          updateData.status = 'canceled';
        } else {
          console.log(`[SYNC SKIP CANCELED] Pedido ${id} marcado como cancelado na Dropea, mas é muito recente (${Math.round(orderAgeMinutes)}min). Ignorando...`);
        }
      }
    } else if (['REFUNDED', 'RETURNED', 'DEVUELTO'].includes(dropeaStatus)) {
      updateData.status = 'refunded';
      updateData.payment_status = 'refunded';
    } else if (['PAID', 'PROCESSING', 'READY_TO_SHIP'].includes(dropeaStatus)) {
       // Permitir recuperação de 'canceled' se a Dropea disser que está PAID/PROCESSING
       if (order.status !== 'refunded' && order.status !== 'completed') {
         updateData.status = 'paid';
         updateData.payment_status = 'paid';
       }
    }
    
    // Fallback de payment_status se a ordem estiver paga mas sem o campo preenchido
    if ((updateData.status === 'paid' || order.status === 'paid' || order.status === 'completed') && !order.payment_status) {
      updateData.payment_status = 'paid';
    }

    if (dropeaData.tracking_number) {
        updateData.shipping_status_metadata = {
          ...(order.shipping_status_metadata || {}),
          trackingNumber: dropeaData.tracking_number,
          trackingUrl: dropeaData.tracking_url,
          syncedAt: new Date().toISOString()
        };
        if (updateData.shipping_status !== 'delivered') updateData.shipping_status = 'sent';
    }

    const hasStatusChange = updateData.status && updateData.status !== order.status;
    const hasShippingChange = updateData.shipping_status && updateData.shipping_status !== order.shipping_status;
    const hasPaymentStatusChange = updateData.payment_status && updateData.payment_status !== order.payment_status;
    const hasTrackingChange = !!updateData.shipping_status_metadata;
    const hasChanges = hasStatusChange || hasShippingChange || hasPaymentStatusChange || hasTrackingChange;

    if (hasChanges) {
      const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', id);
      if (updateError) {
        console.error('[ADMIN SYNC DB UPDATE ERROR]', {
          error: updateError,
          orderId: id,
          updateData,
          suggestion: 'Certifique-se de que todas as colunas existem no banco de dados (payment_status, updated_at, shipping_status_metadata, etc.)'
        });
        return res.status(500).json({ error: 'Falha ao atualizar dados locais', details: updateError });
      }
      
      // Prioridade para notificação de status de pagamento/ordem geral
      if (hasStatusChange || hasPaymentStatusChange) {
        const notifyStatus = updateData.status || order.status;
        triggerOrderNotification(order.id, notifyStatus, updateData.shipping_status || order.shipping_status, { ...order, ...updateData }).catch(e => console.error(e));
      } else if (hasShippingChange) {
        triggerOrderNotification(order.id, order.status, updateData.shipping_status, { ...order, ...updateData }).catch(e => console.error(e));
      }
    }

    res.json({ success: true, dropea_status: dropeaStatus, synced: hasChanges });
  } catch (error: any) {
    console.error('[ADMIN SYNC FATAL]', error);
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
      .select('*, products(*) ')
      .eq('id', orderId)
      .in('status', ['paid', 'completed'])
      .single();

    if (orderError) {
      console.error(`[DOWNLOAD ERROR] DB fail:`, orderError);
      return res.status(404).json({ error: `Ordem não encontrada: ${orderError.message}` });
    }

    const productData = Array.isArray(order.products) ? order.products[0] : order.products;
    if (!order || !productData) {
      return res.status(404).json({ error: 'Produto não associado a esta ordem.' });
    }

    const originalPath = order.product.file_url || '';
    
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

    // 2. Só permitir alteração se ainda não foi enviado ou está pendente na Dropea
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

// Admin Refund Processing (Initiates Dropea refund if available, otherwise just updates local state)
adminRouter.post('/orders/:id/refund', async (req, res) => {
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

    // Trigger real Stripe refund
    const refundSuccess = await processRefundInternal(id);
    
    if (refundSuccess) {
      return res.json({ 
        success: true, 
        message: 'Reembolso processado com sucesso na Stripe e Dropea.'
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
    const { product, customer, baseUrl, selectedOptions } = req.body;
    
    if (!stripe) {
      console.warn("[CHECKOUT] STRIPE_SECRET_KEY não configurada. Por favor, configure a chave live nas definições.");
      return res.status(400).json({ error: "O sistema de pagamentos não está configurado." });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title,
            description: (product.description && product.description.trim() !== "") ? product.description.substring(0, 120) : undefined,
            images: product.image_url ? [product.image_url] : [],
          },
          unit_amount: Math.round((product.pvp || product.price) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}?payment_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}?payment_status=cancel`,
      customer_email: customer.email,
      metadata: {
        dropea_id: String(product.dropea_id),
        customer_data: JSON.stringify(customer),
        product_id: String(product.id),
        selected_options: JSON.stringify(selectedOptions || {})
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("[STRIPE ERROR]", error);
    res.status(500).json({ error: error.message });
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
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

async function processOrderFulfillment(order: any, forceManual: boolean = false) {
  try {
    const supabase = getSupabase();
    
    // Fetch fresh local order data without the join (which is failing)
    const { data: latestOrder, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order.id)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[FULFILLMENT ERROR] Erro na query DB para ordem ${order.id}:`, JSON.stringify(fetchErr));
      // Se houver erro de query, tentamos seguir com o objeto original
    }

    const currentOrder = latestOrder || order;
    
    if (!currentOrder || !currentOrder.id) {
       console.error(`[FULFILLMENT FATAL] Dados de ordem inválidos.`);
       return;
    }

    if (currentOrder.dropea_order_id && !forceManual) {
      console.log(`[FULFILLMENT SKIP] Ordem ${currentOrder.id} já possui dropea_order_id: ${currentOrder.dropea_order_id}`);
      return;
    }

    console.log(`[FULFILLMENT START] Ordem ${currentOrder.id} - Manual: ${forceManual}`);

    // Normalizar shipping_details
    const customerData = typeof currentOrder.shipping_details === 'string' 
      ? JSON.parse(currentOrder.shipping_details) 
      : (currentOrder.shipping_details || {});

    // Garantir que temos o e-mail (usar customer_email do DB como fallback)
    if (!customerData.email && currentOrder.customer_email) {
      customerData.email = currentOrder.customer_email;
    }

    if (!customerData.email) {
      console.warn(`[FULFILLMENT] Aviso: E-mail ausente para a ordem ${order.id}. Tentando buscar do perfil...`);
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', currentOrder.user_id).maybeSingle();
      if (profile?.email) {
        customerData.email = profile.email;
      }
    }

    if (!customerData.email) {
      throw new Error("Não foi possível encontrar o e-mail do cliente para o envio.");
    }

    // Se no DB não tem o produto join, buscar manualmente
    let productInDb = currentOrder.products;
    if (!productInDb) {
      const productId = currentOrder.product_id;
      if (productId) {
        const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
        productInDb = p;
      }
    }

    if (!productInDb?.dropea_id) {
      throw new Error(`O produto vinculado (ID ${currentOrder.product_id}) não tem um ID Dropea configurado.`);
    }

    // Resolver preço de venda: Usar o valor da ordem, mas garantir que não é 0.
    // Algumas APIs Dropea rejeitam se o preço for inferior ao custo de dropshipping.
    // Usamos o maior valor entre o pago e o PVP se disponível para evitar rejeições técnicas.
    const priceToSubmit = Math.max(
      parseFloat(String(currentOrder.total_amount || 0)),
      parseFloat(String(productInDb.pvp || 0))
    );

    console.log(`[FULFILLMENT] Enviando ordem ${currentOrder.id} para Dropea... (Email: ${customerData.email}, Preço: ${priceToSubmit})`);
    const dropeaOrderId = await createDropeaOrderInternal(Number(DROPEA_SHOP_ID), customerData, {
      product_id: productInDb.dropea_id,
      quantity: 1,
      total_value: priceToSubmit,
      unit_price: priceToSubmit,
      selected_options: (typeof currentOrder.selected_options === 'string') ? JSON.parse(currentOrder.selected_options) : currentOrder.selected_options
    });

    if (dropeaOrderId) {
      console.log(`[FULFILLMENT SUCCESS] Dropea Order ID: ${dropeaOrderId}`);
      await supabase.from('orders').update({ 
        dropea_order_id: String(dropeaOrderId),
        shipping_status: 'sent' 
      }).eq('id', currentOrder.id);
      
      // Disparar email de pagamento confirmado após sucesso na Dropea
      // force: false para respeitar o bloqueio de duplicidade (não mandar se já foi mandado no Stripe Webhook)
      triggerOrderNotification(currentOrder.id, 'paid', 'pending', { ...currentOrder, dropea_order_id: String(dropeaOrderId) }, false)
        .catch(e => console.error('[FULFILLMENT EMAIL ERROR]', e));
    } else {
      throw new Error("Dropea API não retornou um ID de pedido válido.");
    }
  } catch (err: any) {
    console.error(`[FULFILLMENT SYSTEM ERROR] Falha Crítica na Ordem ${order.id}:`, err.message);
    throw err; // RE-THROW ERROR
  }
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S.Art Server running on http://localhost:${PORT}`);
  });
}

export default app;
