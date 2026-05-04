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
const DROPEA_API_KEY = process.env.DROPEA_API_KEY || 'AIzaioJLOztZH3TKWlXAZSZaI1-4DWrAZfSnz3Hsvc4nCt8=';
const DROPEA_USER_ID = process.env.DROPEA_USER_ID || '38827';
const DROPEA_SHOP_ID = process.env.DROPEA_SHOP_ID || '16172';

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
    
    // Ensure dropea_id exists in products
    try {
      await supabase.rpc('exec_sql', { sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS dropea_id TEXT UNIQUE;' });
    } catch(e) {
      // Ignore
    }

    // Ensure orders table has notification tracking columns
    const columnsToEnsure = [
      'email_paid_sent', 
      'email_shipped_sent', 
      'email_review_sent', 
      'email_canceled_sent',
      'email_refunded_sent'
    ];
    
    for (const col of columnsToEnsure) {
      try {
        await supabase.rpc('exec_sql', { sql: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col} BOOLEAN DEFAULT FALSE;` });
      } catch(e) {
        // Ignore
      }
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
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = req.body;
    if (endpointSecret && sig && stripe) {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } else {
      // Fallback if no secret or no stripe client (dev mode)
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

      // 2. CRIAR PEDIDO
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId,
          product_id: internalProductId,
          status: 'paid',
          shipping_status: 'pending',
          total_amount: session.amount_total ? session.amount_total / 100 : 0,
          stripe_session_id: session.id,
          shipping_details: customerDataRaw,
          customer_email: session.customer_details?.email || customerData?.email || metadata?.email // Tripla redundância de e-mail
        })
        .select()
        .single();

      if (orderError) throw orderError;
      
      console.log(`[STRIPE WEBHOOK SUCCESS] Ordem ${orderData.id} criada. Iniciando Sincronização e Email...`);

      // 3. DISPARAR TUDO AUTOMATICAMENTE (SEM TRIGGERS DO BANCO)
      // Enviar e-mail de confirmação de pagamento IMEDIATAMENTE
      triggerOrderNotification(orderData.id, 'paid', 'pending', orderData).catch(e => console.error(`[AUTO-EMAIL ERROR]`, e));
      
      // Sincronizar com a Dropea IMEDIATAMENTE
      processOrderFulfillment(orderData).catch(e => console.error(`[AUTO-FULFILL ERROR]`, e));

    } catch (err: any) {
      console.error("[STRIPE WEBHOOK FATAL PROCESSING ERROR]", err);
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    console.log(`[STRIPE WEBHOOK] Reembolso detetado para charge: ${charge.id}`);
    
    try {
      const supabase = getSupabase();
      
      // Encontrar a ordem pelo checkout_session_id ou payment_intent
      // Stripe webhooks for charge.refunded might not have the checkout session ID directly in the payload root
      // but it's usually linked via the payment_intent.
      const paymentIntentId = charge.payment_intent as string;
      
      // We can also check by stripe_session_id if we have it in metadata or something.
      // Easiest is to identify using the customer email and product if needed, but let's try to query by session.
      // Stripe sessions don't always appear in charge.refunded easily.
      // Let's use a workaround: identifying by payment_intent or metadata if charge has it.
      
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, status, shipping_status, stripe_session_id')
        .eq('status', 'canceled') // It should already be canceled from the Dropea trigger
        .filter('stripe_session_id', 'not.is', null)
        .limit(10); // Check recent canceled ones

      if (order && order.length > 0) {
        // Find the right one based on amount or search by session
        // For now, let's just use the paymentIntent to be sure if possible.
        // Actually, Stripe passes the payment_intent.
        
        // We'll update ALL orders that might be related to this PI if needed, but usually it's 1:1
        for (const o of order) {
             // Retrieve session to check PI
             if (stripe) {
               const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id!);
               if (session.payment_intent === paymentIntentId) {
                  console.log(`[STRIPE WEBHOOK] Atualizando ordem ${o.id} para "refunded"`);
                  await supabase.from('orders').update({ status: 'refunded' }).eq('id', o.id);
                  triggerOrderNotification(o.id, 'refunded', o.shipping_status).catch(e => console.error('[REFUND NOTIF ERROR]', e));
                  break;
               }
             }
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

// Routers defined early
const apiRouter = express.Router();
const adminRouter = express.Router();

// MOUNT ROUTERS
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

// Helper function to create Dropea Order
async function createDropeaOrderInternal(shopId: number, customer: any, product: any) {
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
    'Spain': 'ES'
  };
  const countryCode = countryMap[customer?.country] || customer?.country || 'PT';

  const variables = {
    shopId: shopId || Number(DROPEA_SHOP_ID),
    paymentMethod: "MANUAL",
    customer: {
      first_name: customer.firstName || customer.first_name || (customer.fullName ? customer.fullName.split(' ')[0] : "Nome"),
      last_name: customer.lastName || customer.last_name || (customer.fullName ? customer.fullName.split(' ').slice(1).join(' ') || '.' : "Teste"),
      email: customer.email || "cliente@teste.com",
      phone: customer.phone || "912345678",
      address: customer.address || "Rua Exemplo",
      city: customer.city || "Lisboa",
      zip: customer.zip || customer.postalCode || "1000-001",
      country: countryCode
    },
    products: [{
      product_id: parseInt(String(product.product_id || product.dropea_id || 0), 10),
      quantity: parseInt(String(product.quantity || 1), 10),
      total_value: parseFloat(String(product.total_value || product.pvp || 0)),
      unit_price: parseFloat(String(product.unit_price || product.total_value || product.pvp || 0))
    }]
  };

  console.log(`[DROPEA INTERNAL] Criando pedido para ${variables.customer.email}. Dados:`, JSON.stringify(variables.customer));
  
  const response = await axios.post(DROPEA_API_URL, {
    query: graphqlMutation,
    variables
  }, {
    headers: {
      'x-api-key': DROPEA_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 15000
  });

  if (response?.data?.errors) {
    console.error('[DROPEA INTERNAL ERRORS]', JSON.stringify(response.data.errors, null, 2));
    throw new Error(`Dropea API Error: ${response.data.errors[0]?.message || 'Erro desconhecido'}`);
  }

  return response.data?.data?.orderCreate?.id;
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

async function findDropeaOrderByEmail(email: string) {
  const graphqlQuery = `
    query FindOrdersByEmail {
      orders(first: 50) {
        data {
          id
          customer { email }
          status
        }
      }
    }
  `;
  const result = await executeDropeaQuery(graphqlQuery, {}, 'orders');
  if (result && Array.isArray(result)) {
    const match = [...result].reverse().find(o => o.customer?.email?.toLowerCase() === email.toLowerCase());
    return match ? match.id : null;
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
      .select('id, status, stripe_session_id, shipping_status, total_amount, customer_email')
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

      if (linkedOrder) {
        const updateData: any = { shipping_status: 'sent' };
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
          triggerOrderNotification(order.id, order.status, 'sent', order).catch(e => console.error('[WEBHOOK SHIP EMAIL ERROR]', e));
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
        // Se a ordem estava 'paid', iniciamos o reembolso automático no Stripe
        if ((linkedOrder.status === 'paid' || linkedOrder.status === 'completed') && linkedOrder.stripe_session_id && stripe) {
          console.log(`[DROPEA WEBHOOK] Autorrefund process for Order: ${linkedOrder.id}`);
          processRefundInternal(linkedOrder.id).catch(e => console.error('[AUTORREFUND ERROR]', e));
        }

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
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
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
      
      // Update local state to refunded if successful, or leave it as canceled if pending
      // If it's pending, we'll wait for the Stripe webhook to finalize it.
      if (refund.status === 'succeeded') {
        await supabase.from('orders').update({ status: 'refunded' }).eq('id', orderId);
        triggerOrderNotification(orderId, 'refunded', order.shipping_status).catch(e => console.error('[REFUND NOTIF ERROR]', e));
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

let dropeaCatalogCache: { data: any, timestamp: number } | null = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Get Dropea Products (GraphQL)
apiRouter.get('/dropea-products', async (req, res) => {
  console.log('[DROPEA] Acessando /api/dropea-products');
  
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
      timeout: 8000 // Shorter timeout for faster feedback
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
      // Tentar encontrar por email (customer_email ou via profiles se existir)
      let email = order.customer_email;
      
      if (!email && order.user_id) {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', order.user_id).single();
        if (profile) email = profile.email;
      }

      if (email) {
        console.log(`[SYNC] Tentando encontrar vínculo por email: ${email}`);
        const foundId = await findDropeaOrderByEmail(email);
        if (foundId) {
          dropeaId = String(foundId);
          console.log(`[SYNC] Vínculo encontrado! Dropea ID: ${dropeaId}`);
          await supabase.from('orders').update({ dropea_order_id: dropeaId }).eq('id', id);
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
      
      const dropeaStatus = String(dropeaData.status).toUpperCase();
      
      // Mapeamento Robusto de Status (Dropea -> SArt)
      if (['SHIPPED', 'ON_THE_WAY', 'SENT', 'EN_CAMINO'].includes(dropeaStatus)) {
        updateData.shipping_status = 'sent';
      } else if (['DELIVERED', 'COMPLETED', 'RECEIVED', 'ENTREGADO'].includes(dropeaStatus)) {
        updateData.shipping_status = 'delivered';
      } else if (['CANCELLED', 'CANCELED', 'VOID', 'CANCELADO'].includes(dropeaStatus)) {
        updateData.status = 'canceled';
      } else if (['REFUNDED', 'RETURNED', 'DEVUELTO'].includes(dropeaStatus)) {
        updateData.status = 'refunded';
      } else if (['PAID', 'PROCESSING', 'READY_TO_SHIP', 'PAGADO', 'EN_PROCESO'].includes(dropeaStatus)) {
        if (order.status !== 'completed' && order.status !== 'canceled') {
          updateData.status = 'paid';
          updateData.shipping_status = 'pending';
        }
      } else if (dropeaStatus === 'FULFILLED') {
        updateData.status = 'completed';
        updateData.shipping_status = 'sent';
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
        // Se tem tracking number, garantimos que o status de envio é 'sent' pelo menos
        if (updateData.shipping_status !== 'delivered') {
          updateData.shipping_status = 'sent';
        }
      }

      // Detetar mudanças para gravar e notificar
      const hasStatusChange = updateData.status && updateData.status !== order.status;
      const hasShippingChange = updateData.shipping_status && updateData.shipping_status !== order.shipping_status;
      const hasMetadataChange = !!updateData.shipping_status_metadata;

      const hasChanges = hasStatusChange || hasShippingChange || hasMetadataChange;

      if (hasChanges) {
        const { error: updateError } = await supabase.from('orders').update(updateData).eq('id', id);
        if (updateError) {
          console.error('[SYNC DB UPDATE ERROR]', updateError);
          return res.status(500).json({ error: 'Falha ao atualizar dados locais' });
        }
        
        // Disparar e-mail se mudou algo visível para o cliente
        if (hasStatusChange) {
          triggerOrderNotification(order.id, updateData.status, updateData.shipping_status || order.shipping_status, { ...order, ...updateData }).catch(e => console.error('[SYNC NOTIF ERR]', e));
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
  console.log(`[AUTOMAÇÃO] Notificação Pedido=${orderId} | Status=${status} | Envio=${shippingStatus} | Force=${force}`);
  try {
    const supabase = getSupabase();
    let order = orderData;

    // Se vier orderData incompleto ou sem os joins necessários, buscamos do banco
    if (!order || (!order.products && !order.items && !order.profiles)) {
      const { data, error: orderErr } = await supabase
        .from('orders')
        .select('*, profiles(*)')
        .eq('id', orderId)
        .maybeSingle();
      
      if (orderErr) {
        console.error(`[AUTOMAÇÃO ERROR] Erro ao buscar ordem ${orderId}:`, orderErr);
        return;
      }
      
      if (!data) {
        console.warn(`[AUTOMAÇÃO WARN] Ordem ${orderId} não encontrada no banco.`);
        return;
      }

      // Se não tem produtos no select original, buscar separadamente para evitar Erro 400 (Bad Gateway) em joins complexos
      if (!data.products && data.product_id) {
        const { data: prod } = await supabase.from('products').select('*').eq('id', data.product_id).single();
        if (prod) data.products = prod;
      }

      order = data;
    }

    // Normalização para joins que retornam arrays (comum no Supabase dependendo da config)
    if (Array.isArray(order.profiles)) {
      order.profiles = order.profiles[0];
    }
    if (Array.isArray(order.products)) {
      order.products = order.products[0];
    } else if (!order.products && order.product_id) {
       // Tentar extrair do root se vier de selects simples
       order.products = order.products_data; 
    }

    // Prioridade absoluta: E-mail capturado no ato da compra (Guest checkout ou Stripe info)
    const customerEmail = (order.customer_email && order.customer_email.trim().length > 3) 
      ? order.customer_email.trim() 
      : (order.profiles?.notification_email || order.profiles?.email || '');
    
    console.log(`[AUTOMAÇÃO DEBUG] >>> Ordem: ${orderId} | Email Alvo: "${customerEmail}" | Status: ${status}/${shippingStatus}`);

    if (!customerEmail || !customerEmail.includes('@')) {
      console.error(`[AUTOMAÇÃO FATAL] Identificamos um pedido sem e-mail de destino válido! ID: ${orderId}`);
      // Se não houver e-mail no pedido, tentamos buscar o e-mail do admin para alertar? Melhor apenas logar o erro crítico de dados.
      return;
    }

    let functionName = '';
    let flagField = '';

    const lowerStatus = (status || '').toLowerCase().trim();
    const lowerShipping = (shippingStatus || '').toLowerCase().trim();

    // Mapeamento expandido de estados
    if (['paid', 'pago', 'completed', 'concluido', 'concluído', 'aprovado', 'suceso'].includes(lowerStatus)) {
      functionName = 'send-payment-confirmed';
      flagField = 'email_paid_sent';
    } else if (['sent', 'enviado', 'shipped', 'em trânsito', 'despachado'].includes(lowerShipping)) {
      functionName = 'send-order-shipped';
      flagField = 'email_shipped_sent';
    } else if (['delivered', 'entregue', 'finalizado'].includes(lowerShipping)) {
      functionName = 'send-order-delivered';
      flagField = 'email_review_sent';
    } else if (['canceled', 'cancelado', 'cancelled', 'abortado'].includes(lowerStatus)) {
      functionName = 'send-order-canceled';
      flagField = 'email_canceled_sent';
    } else if (['refunded', 'reembolsado', 'estornado'].includes(lowerStatus)) {
      functionName = 'send-order-refunded';
      flagField = 'email_refunded_sent';
    }

    if (!functionName) {
      console.log(`[AUTOMAÇÃO] Nenhuma função de e-mail definida para status=${status} envSub=${shippingStatus}`);
      return;
    }

    // 4. Lógica de Bloqueio (Lock)
    // IMPORTANTE: Cada ordem tem seu próprio ID. Se o cliente comprar 10 vezes, serão 10 IDs diferentes.
    // O lock é apenas para evitar que UM ÚNICO pedido dispare o MESMO e-mail 2 vezes (ex: refresh de webhook).
    if (flagField && !force) {
      try {
        const { data: lock, error: lockErr } = await supabase
          .from('orders')
          .update({ [flagField]: true })
          .eq('id', orderId)
          .or(`${flagField}.eq.false,${flagField}.is.null`)
          .select();

        if (lockErr) {
          console.warn(`[AUTOMAÇÃO] Alerta de Infra: Coluna ${flagField} ausente no banco. Enviando e-mail sem lock para garantir o serviço.`);
          // NÃO retornamos aqui. Deixamos seguir para o disparo.
        } else if (lock && lock.length === 0 && !lockErr) {
          // Apenas se o lock rodou COM SUCESSO e retornou zero (já enviado), é que bloqueamos.
          console.log(`[AUTOMAÇÃO] Bloqueio de Duplicidade: E-mail ${functionName} já enviado para esta ordem ${orderId}.`);
          return;
        }
      } catch (e) {
        console.warn(`[AUTOMAÇÃO] Erro no sistema de lock, prosseguindo com o disparo por segurança.`, e);
      }
    }

    console.log(`[AUTOMAÇÃO] >>> EXECUTANDO CHAMADA DA EDGE FUNCTION: '${functionName}' para: ${customerEmail}`);
    
    // Obter infos básicas do produto (seja via item ou products join)
    const firstProduct = order.products || (order.items && order.items.length > 0 ? order.items[0].product : null);
    
    const payload = {
      orderId: order.id,
      email: customerEmail,
      customerName: order.profiles?.full_name || 'Cliente',
      customerAvatar: order.profiles?.avatar_url,
      total: order.total_amount,
      status: status,
      shippingStatus: shippingStatus,
      product: {
        name: firstProduct?.name || firstProduct?.title || 'Produto S.Art Boutique',
        image: firstProduct?.image_url,
        price: order.total_amount,
        id: firstProduct?.id
      },
      trackingNumber: order.shipping_status_metadata?.trackingNumber,
      trackingUrl: order.shipping_status_metadata?.trackingUrl
    };

    console.log(`[AUTOMAÇÃO] >>> PAYLOAD PREPARADO:`, JSON.stringify(payload, null, 2));

    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(functionName, {
      body: payload
    });

    if (invokeErr) {
      console.error(`[AUTOMAÇÃO FATAL ERROR] Falha ao invocar ${functionName}:`, invokeErr);
      if (invokeErr.message?.includes('404')) {
        console.error(`[AUTOMAÇÃO] >>> FUNÇÃO '${functionName}' NÃO ENCONTRADA NO SUPABASE!`);
      }
    } else {
      console.log(`[AUTOMAÇÃO SUCCESS] Resposta Bruta da Função ${functionName}:`, JSON.stringify(invokeData));
      
      // Checar se o corpo da resposta diz que deu erro (padrão comum em Edge Functions)
      if (invokeData && (invokeData.error || invokeData.status === 'error')) {
        console.error(`[AUTOMAÇÃO REGRESSÃO] A função ${functionName} retornou um erro interno:`, invokeData.message || invokeData.error);
      } else {
        console.log(`[AUTOMAÇÃO SUCCESS] E-mail (${functionName}) enviado ao cliente ${customerEmail}.`);
      }
    }

    if (invokeErr) {
      console.error(`[AUTOMAÇÃO ERROR] Erro ao chamar ${functionName} para ${orderId}:`, invokeErr);
    } else {
      console.log(`[AUTOMAÇÃO SUCCESS] E-mail (${functionName}) enviado ao cliente ${customerEmail} para pedido ${orderId}.`);
    }

  } catch (err) {
    console.error(`[AUTOMAÇÃO FATAL]`, err);
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
        category: p.category || 'Dropshipping',
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
    const { type } = req.body; // 'payment' | 'shipping' | 'canceled' | 'refunded'
    
    console.log(`[ADMIN RESEND] Forçando reenvio de ${type} para ordem ${id}`);
    
    const supabase = getSupabase();
    // BUSCAR DADOS COMPLETOS PARA O EMAIL
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, profiles(*), products(*)')
      .eq('id', id)
      .maybeSingle();

    if (error || !order) return res.status(404).json({ error: 'Ordem não encontrada' });

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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id
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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
    };
    
    if (dropea_id) {
      upsertData.dropea_id = String(dropea_id);
      query = supabase.from('products').upsert(upsertData, { onConflict: 'dropea_id' });
    } else {
      query = supabase.from('products').insert(upsertData);
    }

    const { data, error } = await query.select().single();

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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id
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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
    };
    
    if (dropea_id) updateData.dropea_id = String(dropea_id);

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

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
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id
    } = req.body;
    
    // Prioritize pvp if it exists, otherwise use price
    const finalPrice = (pvp !== undefined && pvp !== null) ? pvp : price;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .update({ 
        title, description, price: finalPrice, image_url, file_url, category,
        product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active, dropea_id
      })
      .eq('id', id)
      .select()
      .single();

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
        category: productData.category || 'Dropea Sync',
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

    // Mesmo que já tenha ID, permitimos re-enviar se o admin insistir (ou podemos bloquear se preferir)
    // Aqui vou deixar aberto para casos de erro onde o admin quer tentar de novo.
    
    await processOrderFulfillment(order);
    
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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (order.dropea_order_id) {
      // GraphQL sync logic will be implemented when mutation/query for order status is clarified
      return res.status(501).json({ error: 'Sincronização GraphQL pendente de esquema de query.' });
    } else {
      return res.status(400).json({ error: 'ID de transação Dropea ausente.' });
    }
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

    // Update status to 'refund_pending'
    await supabase.from('orders').update({ 
      status: 'refunded', // Mark as refunded directly if manual or pending if automatic
      selected_options: {
        ...(order.selected_options || {}),
        refund_approved_at: new Date().toISOString()
      }
    }).eq('id', id);

    console.log(`[ADMIN REFUND] Order ${id} marked as refunded.`);
    
    return res.json({ 
      success: true, 
      message: 'Reembolso processado com sucesso. O acesso foi removido.'
    });
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
    const { product, customer, baseUrl } = req.body;
    
    if (!stripe) {
      console.warn("[CHECKOUT] STRIPE_SECRET_KEY não configurada. Simulando sucesso imediato.");
      // Simulamos um delay para parecer real
      return res.json({ id: 'simulated_session_id', url: `${baseUrl}?payment_status=success` });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card',
        'paypal',
        'klarna',
        'eps',
        'multibanco',
        'bancontact',
        'blik',
        'link',
        'mb_way'
      ],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title,
            description: product.description?.substring(0, 120),
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
        product_id: String(product.id)
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("[STRIPE ERROR]", error);
    res.status(500).json({ error: error.message });
  }
});

// --- ORDER STATUS SYNC ---
apiRouter.post('/orders/sync-statuses', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });

    const supabase = getSupabase();
    
    // First, try a simple select to see if the column exists
    const { data: testData, error: testError } = await supabase
      .from('orders')
      .select('id')
      .limit(1);

    if (testError) throw testError;

    // Check for dropea_order_id explicitly to avoid fatal error on first fetch
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .not('shipping_status', 'eq', 'delivered');

    if (error) {
       if (error.code === '42703') {
         // Column missing, skip sync silently to avoid log spam
         return res.json({ updated: 0, warning: "Database schema update required (missing dropea_order_id)" });
       }
       throw error;
    }

    if (!orders || orders.length === 0) {
      return res.json({ updated: 0 });
    }

    // Filter orders that have a dropea_order_id mapping
    const eligibleOrders = orders.filter(o => o.dropea_order_id);
    if (eligibleOrders.length === 0) {
      return res.json({ updated: 0 });
    }

    if (!DROPEA_API_KEY) {
      return res.status(500).json({ error: "Dropea configuration missing" });
    }

    let updatedCount = 0;
    for (const order of eligibleOrders) {
      try {
        const dropeaId = parseInt(order.dropea_order_id, 10);
        if (isNaN(dropeaId)) continue;

        // Buscar status na Dropea via GraphQL
        const graphqlQuery = {
          query: `
            query Order($id: Int!) {
              order(id: $id) {
                id
                status
              }
            }
          `,
          variables: { id: dropeaId }
        };

        const response = await axios.post(DROPEA_API_URL, graphqlQuery, {
          headers: { 
            'x-api-key': DROPEA_API_KEY,
            'Content-Type': 'application/json',
            'User-Agent': 'SArt-Boutique-Boutique/1.0'
          },
          timeout: 8000
        }).catch(() => null);

        if (!response) continue;

        const dropeaOrder = response.data?.data?.order;
        if (dropeaOrder && dropeaOrder.status) {
          const status = dropeaOrder.status.toLowerCase();
          
          let newShippingStatus = order.shipping_status;

          if (status === 'shipped') newShippingStatus = 'sent';
          else if (status === 'delivered') newShippingStatus = 'delivered';
          else if (status === 'processing' || status === 'pending') newShippingStatus = 'pending';
          else if (status === 'cancelled' || status === 'canceled') newShippingStatus = 'canceled';
          
          if (newShippingStatus !== order.shipping_status) {
            await supabase
              .from('orders')
              .update({ shipping_status: newShippingStatus })
              .eq('id', order.id);
            updatedCount++;
          }
        }
      } catch (err) {
        // Silently skip individual order errors to avoid spam
      }
    }

    res.json({ updated: updatedCount });
  } catch (err: any) {
    if (err.code === '42703') {
       return res.json({ updated: 0, error: "Database needs migration (dropea_order_id missing)" });
    }
    // console.error(`[SYNC FATAL]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for /api/* to return JSON instead of HTML on error
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
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

async function processOrderFulfillment(order: any) {
  try {
    const supabase = getSupabase();
    
    // Verificação de segurança: Buscar o estado mais recente no DB para evitar double-tap
    const { data: latestOrder, error: fetchErr } = await supabase
      .from('orders')
      .select('dropea_order_id, status, shipping_details, product_id, total_amount')
      .eq('id', order.id)
      .single();

    if (fetchErr || !latestOrder) {
      console.error(`[FULFILLMENT ERROR] Erro ao buscar ordem ${order.id} no DB:`, fetchErr);
      return;
    }

    if (latestOrder.dropea_order_id) {
      console.log(`[FULFILLMENT SKIP] Ordem ${order.id} já possui dropea_order_id: ${latestOrder.dropea_order_id}`);
      return;
    }

    // Normalizar shipping_details
    const customerData = typeof latestOrder.shipping_details === 'string' 
      ? JSON.parse(latestOrder.shipping_details) 
      : (latestOrder.shipping_details || {});

    const { data: product } = await supabase.from('products').select('dropea_id').eq('id', latestOrder.product_id).single();
    if (!product?.dropea_id) {
      console.error(`[FULFILLMENT ERROR] Produto ${latestOrder.product_id} não possui dropea_id. Impossível sincronizar.`);
      return;
    }

    const dropeaOrderId = await createDropeaOrderInternal(Number(DROPEA_SHOP_ID), customerData, {
      product_id: product.dropea_id,
      quantity: 1,
      total_value: latestOrder.total_amount,
      unit_price: latestOrder.total_amount
    });

    if (dropeaOrderId) {
      await supabase.from('orders').update({ dropea_order_id: String(dropeaOrderId) }).eq('id', order.id);
      // Disparar email de pagamento confirmado após sucesso na Dropea
      triggerOrderNotification(order.id, 'paid', 'pending').catch(e => console.error('[FULFILLMENT EMAIL ERROR]', e));
    } else {
      throw new Error("Dropea API não retornou um ID de pedido válido.");
    }
  } catch (err: any) {
    console.error(`[FULFILLMENT SYSTEM ERROR] Falha na Ordem ${order.id}:`, err.message);
  }
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S.Art Server running on http://localhost:${PORT}`);
  });
}

export default app;
