import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is missing');
  return new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as any,
  });
};

const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials (URL/KEY) are missing.');
  }
  return createClient(url, key);
};

const getResend = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is missing');
  return new Resend(key);
};

const app = express();

// --- WEBHOOK STRIPE ---
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      req.body,
      sig || '',
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompleted(session);
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    await handleChargeRefunded(charge);
  } else if (event.type === 'refund.updated') {
    const refund = event.data.object as Stripe.Refund;
    await handleRefundUpdated(refund);
  }

  res.json({ received: true });
});

async function handleRefundUpdated(refund: Stripe.Refund) {
  const supabase = getSupabase();
  try {
    const paymentIntent = refund.payment_intent as string;
    if (!paymentIntent) return;

    if (refund.status === 'succeeded' || refund.status === 'failed' || refund.status === 'canceled') {
      const stripe = getStripe();
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent });
      
      let order = null;
      if (sessions.data.length > 0) {
        const { data: foundOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('stripe_session_id', sessions.data[0].id)
          .maybeSingle();
        order = foundOrder;
      }

      if (order) {
        const newStatus = refund.status === 'succeeded' ? 'refunded' : 'paid'; // revert if failed? or just leave
        console.log(`[S.ART WEBHOOK] Refund ${refund.id} updated to ${refund.status} for Order ${order.id}`);
        
        await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
        
        if (newStatus === 'refunded') {
          // Absolute removal of access
          await supabase.from('user_reading_progress').delete().eq('book_id', order.product_id).eq('user_id', order.user_id);
        }
      }
    }
  } catch (error) {
    console.error('[S.ART WEBHOOK ERROR during refund.updated handling]', error);
  }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const supabase = getSupabase();
  try {
    const paymentIntent = charge.payment_intent as string;
    if (!paymentIntent) return;
    
    const stripe = getStripe();
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent });
    
    let order = null;
    if (sessions.data.length > 0) {
      const { data: foundOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('stripe_session_id', sessions.data[0].id)
        .maybeSingle();
      order = foundOrder;
    }

    if (order) {
      console.log(`[S.ART WEBHOOK] Charge Refunded for Order ${order.id}. Setting status to refunded.`);
      await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
      await supabase.from('user_reading_progress').delete().eq('book_id', order.product_id).eq('user_id', order.user_id);
    }
  } catch (error) {
    console.error('[S.ART WEBHOOK ERROR during charge.refunded handling]', error);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = getSupabase();
  const resend = getResend();
  
    const userId = session.metadata?.userId;
    const productId = session.metadata?.productId;
    const orderId = session.metadata?.orderId;
    const email = session.customer_email || session.customer_details?.email;

    console.log(`[S.ART WEBHOOK] Payment confirmed for Session: ${session.id}, Order: ${orderId}, Product: ${productId}, User: ${userId}`);

    try {
      // 1. Update or Create Order in Supabase
      const updateData: any = { 
        status: 'paid', // Standardized to paid
        stripe_session_id: session.id,
        // REMOVED missing column payment_intent_id
        total_amount: session.amount_total ? (session.amount_total / 100) : 0,
        user_id: (userId && userId !== 'undefined' && userId !== '') ? userId : null
      };
      if (email) updateData.customer_email = email;

    let orderProcessed = false;
    let existingOrder = null;

    // A. Priority 1: Check by orderId from metadata (if present)
    if (orderId && orderId !== 'undefined' && orderId !== '') {
      console.log(`[S.ART WEBHOOK] Searching for order by ID: ${orderId}`);
      const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
      existingOrder = data;
    }

    // B. Priority 2: Check by stripe_session_id (Standard source of truth)
    if (!existingOrder) {
      console.log(`[S.ART WEBHOOK] Searching for order by Session ID: ${session.id}`);
      const { data } = await supabase.from('orders').select('*').eq('stripe_session_id', session.id).maybeSingle();
      existingOrder = data;
    }

    if (existingOrder) {
      console.log(`[S.ART WEBHOOK] Found existing order ${existingOrder.id} (${existingOrder.status}). Updating...`);
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          ...updateData,
          status: 'paid'
        })
        .eq('id', existingOrder.id);
      
      if (!updateError) {
        orderProcessed = true;
        console.log(`[S.ART WEBHOOK] Order ${existingOrder.id} updated successfully.`);
      } else {
        console.error(`[S.ART WEBHOOK] Update failed for order ${existingOrder.id}:`, updateError);
      }
    }

    if (!orderProcessed) {
      console.log(`[S.ART WEBHOOK] Order not found. Creating new record for session ${session.id}`);
      // Fallback: Create record from metadata if it doesn't exist
      const { error: insertError } = await supabase
        .from('orders')
        .upsert({
          id: (orderId && orderId !== 'undefined' && orderId !== '') ? orderId : undefined,
          user_id: (userId && userId !== 'undefined' && userId !== '') ? userId : null,
          product_id: productId,
          total_amount: updateData.total_amount,
          status: 'paid', 
          stripe_session_id: session.id,
          customer_email: email,
          selected_options: {
            size: session.metadata?.size,
            color: session.metadata?.color
          },
          shipping_details: {
            fullName: session.metadata?.shipping_name,
            address: session.metadata?.shipping_address,
            city: session.metadata?.shipping_city,
            postalCode: session.metadata?.shipping_postal_code,
            country: session.metadata?.shipping_country,
            phone: session.metadata?.shipping_phone
          },
          created_at: new Date().toISOString()
        }, { onConflict: 'stripe_session_id' });

      if (insertError) {
        console.error(`[S.ART WEBHOOK] CRITICAL: Failed to create/upsert order record!`, insertError);
      } else {
        console.log(`[S.ART WEBHOOK] Order record synchronized successfully via checkout.session.completed.`);
      }
    }

    // 2. Get Product Info (for the download link)
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (product && email) {
      // 4. Generate Signed URL (Secure)
      const sanitizedPath = (product.file_url || '').replace(/^\/+/, '');
      console.log(`[S.ART] Delivery - Generating signed URL for: ${sanitizedPath}`);
      
      const { data: signedData, error: signedError } = await supabase.storage
        .from('assets')
        .createSignedUrl(sanitizedPath, 3600); // 1 hour

      if (signedError) {
        console.error(`[S.ART] Storage error during delivery:`, signedError);
        throw signedError;
      }

      // 4. Trigger Email via Resend with Luxury Branding
      await resend.emails.send({
        from: 'S.Art Atelier <vendas@s.art-full.pt>',
        to: email,
        subject: 'O teu E-book da S.Art chegou! 📖',
        html: `
          <div style="font-family: 'serif', 'Georgia', 'Times New Roman', serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; padding: 40px; border: 1px solid #f0f0f0;">
            <div style="text-align: center; margin-bottom: 40px;">
              <h1 style="letter-spacing: 5px; text-transform: uppercase; font-size: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; color: #000;">S.ART</h1>
              <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; margin-top: 15px;">Digital Boutique Excellence</p>
            </div>
            
            <p style="font-size: 18px; line-height: 1.6;">Obrigado pela tua aquisição.</p>
            <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">Confirmamos o teu investimento no conhecimento. O teu exemplar de <strong>"${product.title}"</strong> está pronto para ser apreciado.</p>
            
            <div style="margin: 40px 0; text-align: center;">
              <a href="${signedData.signedUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 18px 36px; text-decoration: none; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">Descarregar Guia Digital</a>
              <p style="font-size: 9px; color: #9ca3af; margin-top: 15px; font-style: italic;">* Este link de acesso privado expira em 60 minutos por motivos de segurança.</p>
            </div>
            
            <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #f0f0f0; text-align: center;">
              <p style="font-size: 11px; color: #6b7280; line-height: 1.8;">Esperamos que esta obra seja uma peça fundamental no teu percurso.</p>
              <p style="font-size: 9px; color: #9ca3af; margin-top: 20px;">S.Art Studio © 2024 | Curadoria Digital de Luxo</p>
            </div>
          </div>
        `
      });
      console.log(`[S.ART] Luxury download link sent to ${email}`);
    }
  } catch (error) {
    console.error('[S.ART WEBHOOK ERROR]', error);
  }
}

// Recovery Proxy Routes
app.use(express.json());
const apiRouter = express.Router();

apiRouter.post('/recovery/send', async (req, res) => {
  try {
    const { email } = req.body;
    const supabase = getSupabase();
    console.log(`[RECOVERY PROXY] Requesting recovery for: ${email}`);
    
    // Invocação interna usando o slug correto: reset-password
    console.log(`[RECOVERY PROXY] Invocando Edge Function 'reset-password' para ${email}...`);
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

// Create Stripe Checkout Session
apiRouter.post('/create-checkout', async (req, res) => {
  try {
    const { productId, userId, email, options, shippingInfo } = req.body;
    console.log(`[S.ART] Create Checkout Request - Product: ${productId}, User: ${userId}, Email: ${email}`, options, shippingInfo);
    
    const stripe = getStripe();
    const supabase = getSupabase();

    // Get product info
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !product) {
      console.error(`[S.ART] Product not found: ${productId}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    // Gerar URL pública da imagem para o Stripe
    let stripeImage = product.image_url;
    if (stripeImage && !stripeImage.startsWith('http')) {
      const { data } = supabase.storage.from('assets').getPublicUrl(stripeImage);
      stripeImage = data.publicUrl;
    }

    // Create Order Record in Pending State (or reuse recent pending one)
    let orderId = '';
    try {
      // Check for a recent pending order for this user/product to avoid duplicates if the request was sent twice
      if (userId) {
        const { data: existingPending } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', userId)
          .eq('product_id', productId)
          .eq('status', 'pending')
          .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // 5 minutes ago
          .maybeSingle();
        
        if (existingPending) {
          console.log(`[S.ART] Reusing existing pending order: ${existingPending.id}`);
          orderId = existingPending.id;
        }
      }

      if (!orderId) {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            user_id: userId || null,
            product_id: productId,
            total_amount: product.price,
            status: 'pending',
            selected_options: options || {},
            shipping_details: shippingInfo || null,
            customer_email: email
          })
          .select()
          .single();
          
        if (!orderError && order) {
          orderId = order.id;
        } else {
          console.warn("[S.ART] DB Sync Warning: Could not create initial order record.", orderError);
        }
      }
    } catch (dbErr) {
      console.warn("[S.ART] DB Exception: Failed to manage order record.", dbErr);
    }

    // Determine the origin for URLs
    const clientOrigin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    console.log(`[S.ART] Using origin: ${clientOrigin}`);

    const session = await stripe.checkout.sessions.create({
      billing_address_collection: 'required',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title,
            description: product.description || undefined,
            images: stripeImage ? [stripeImage] : [],
          },
          unit_amount: Math.round(parseFloat(product.price.toString()) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${clientOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientOrigin}/cancel`,
      metadata: {
        userId: userId || '',
        productId: productId,
        orderId: orderId,
        size: options?.size || '',
        color: options?.color || '',
        shipping_name: shippingInfo?.fullName || '',
        shipping_address: shippingInfo?.address || '',
        shipping_city: shippingInfo?.city || '',
        shipping_postal_code: shippingInfo?.postalCode || '',
        shipping_country: shippingInfo?.country || '',
        shipping_phone: shippingInfo?.phone || ''
      }
    } as any);

    // Save the Stripe session ID to the order for tracking and webhooks
    if (orderId) {
      console.log(`[S.ART] Syncing session ${session.id} with order ${orderId}`);
      const supabase = getSupabase();
      const { error: updateError } = await supabase
        .from('orders')
        .update({ stripe_session_id: session.id })
        .eq('id', orderId);
        
      if (updateError) {
        console.error('[S.ART] Error updating order with stripe_session_id:', updateError);
      }
    }

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error(`[S.ART CHECKOUT FATAL ERROR]`, error);
    res.status(500).json({ error: error.message || 'Erro interno no checkout do Stripe' });
  }
});

// Get Session Status
apiRouter.get('/session-status', async (req, res) => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const productId = session.metadata?.productId;
      const orderId = session.metadata?.orderId;
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      return res.json({ 
        status: 'paid', 
        product: product,
        orderId: orderId
      });
    }

    res.json({ status: session.payment_status });
  } catch (error: any) {
    console.error('[SESSION STATUS ERROR]', error);
    res.status(500).json({ error: error.message });
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

// Verify Session
apiRouter.get('/verify-session', async (req, res) => {
  try {
    const sessionId = req.query.session_id as string;

    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const productId = session.metadata?.productId;
      const orderId = session.metadata?.orderId;
      const userId = session.metadata?.userId;
      const email = session.customer_email || session.customer_details?.email;
      const amount = session.amount_total ? (session.amount_total / 100) : 0;
      
      console.log(`[VERIFY SESSION] Successful session ${sessionId}. Order ID: ${orderId}, User ID: ${userId}, Amount: ${amount}`);

      const upsertPayload: any = { 
        status: 'paid',
        product_id: productId,
        user_id: userId || null,
        total_amount: amount,
        stripe_session_id: session.id,
        customer_email: email,
        selected_options: {
          size: session.metadata?.size,
          color: session.metadata?.color
        },
        shipping_details: {
          fullName: session.metadata?.shipping_name,
          address: session.metadata?.shipping_address,
          city: session.metadata?.shipping_city,
          postalCode: session.metadata?.shipping_postal_code,
          country: session.metadata?.shipping_country,
          phone: session.metadata?.shipping_phone
        }
      };

      // Search for existing order first to avoid creating duplicates if primary key matching fails for some reason
      let targetOrderId = orderId;
      if (!targetOrderId || targetOrderId === 'undefined' || targetOrderId === '') {
        const { data: found } = await supabase.from('orders').select('id').eq('stripe_session_id', session.id).maybeSingle();
        if (found) targetOrderId = found.id;
      }

      if (targetOrderId && targetOrderId !== 'undefined' && targetOrderId !== '') {
        upsertPayload.id = targetOrderId;
      }

      const { error: upsertError } = await supabase
        .from('orders')
        .upsert(upsertPayload, { onConflict: 'stripe_session_id' }); // Conflict resolving on stripe_session_id is safer

      if (upsertError) {
        console.error('[VERIFY SESSION DB ERROR]', upsertError);
        // Desperate fallback
        await supabase.from('orders').upsert(upsertPayload, { onConflict: 'id' });
      }

      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      return res.json({ 
        status: 'paid', 
        product: product,
        orderId: orderId
      });
    }

    res.json({ status: session.payment_status });
  } catch (error: any) {
    console.error('[VERIFY SESSION ERROR]', error);
    res.status(500).json({ error: error.message });
  }
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
        .from('assets')
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
const adminRouter = express.Router();

adminRouter.use(async (req, res, next) => {
  const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID missing in request' });
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

adminRouter.get('/users', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    // Fetch all users from Auth (requires Service Role)
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    // Fetch all profiles
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*');

    if (profileError) throw profileError;

    // Merge Auth users with Profiles
    const mergedUsers = authData.users.map(authUser => {
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

adminRouter.post('/products', async (req, res) => {
  try {
    const { 
      title, description, price, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
    } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .insert({ 
        title, description, price, image_url, file_url, category,
        product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, price, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
    } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .update({ 
        title, description, price, image_url, file_url, category,
        product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
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

adminRouter.patch('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, price, image_url, file_url, category,
      product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active 
    } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .update({ 
        title, description, price, image_url, file_url, category,
        product_type, sizes, colors, sizes_enabled, colors_enabled, admin_link, extra_images, is_active
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
    const stripe = getStripe();

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    // Force Stripe sync if order is still pending locally
    if (order.status === 'pending' && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (session.payment_status === 'paid') {
        // Was paid, sync our local DB!
        await supabase
          .from('orders')
          .update({ status: 'paid' })
          .eq('id', id);
          
        order.status = 'paid'; // update local variable for upcoming logic
      }
    }

    // Now update shipping_status
    const { error: updateError } = await supabase
      .from('orders')
      .update({ shipping_status })
      .eq('id', id);

    if (updateError) throw updateError;
    
    // Respond with updated final status and shipping
    res.json({ success: true, status: order.status, shipping_status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post('/orders/:id/sync_payment', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const stripe = getStripe();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (order.stripe_session_id || (order as any).payment_intent_id) {
      let pi: Stripe.PaymentIntent | null = null;
      let session: Stripe.Checkout.Session | null = null;

      try {
        if (order.stripe_session_id) {
          session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
            expand: ['payment_intent']
          });
          pi = session.payment_intent as Stripe.PaymentIntent;
        } else if ((order as any).payment_intent_id) {
          pi = await stripe.paymentIntents.retrieve((order as any).payment_intent_id);
        }
      } catch (stripeErr: any) {
        console.error(`[STRIPE RETRIEVE ERROR] Order ${id}:`, stripeErr);
        return res.status(400).json({ error: `Erro ao buscar dados no Stripe: ${stripeErr.message}` });
      }
      
      let newStatus = order.status;

      // Log Stripe Details for Debugging
      console.log(`[SYNC DEBUG] Order ${id} - Stripe Session: ${order.stripe_session_id}, PI: ${(order as any).payment_intent_id}`);
      if (session) console.log(`[SYNC DEBUG] Session Status: ${session.status}, Payment Status: ${session.payment_status}`);
      if (pi) console.log(`[SYNC DEBUG] PI Status: ${pi.status}, Amount Received: ${pi.amount_received}, Amount Refunded: ${(pi as any).amount_refunded}`);

      // 1. Determine if PAID
      const isPaidOnStripe = session?.payment_status === 'paid' || session?.status === 'complete' || pi?.status === 'succeeded';
      
      if (isPaidOnStripe) {
        newStatus = 'paid';
      }

      // 2. Check if REFUNDED
      if (pi && (pi as any).amount_refunded && (pi as any).amount_refunded > 0) {
        newStatus = 'refunded';
        
        // Force remove access
        await supabase.from('user_reading_progress').delete()
          .eq('book_id', order.product_id)
          .eq('user_id', order.user_id);
          
        console.log(`[SYNC DEBUG] Order ${id} detected as refunded in Stripe.`);
      }

      const updatePayload: any = {};
      if (newStatus !== order.status) updatePayload.status = newStatus;
      
      // Ensure amount is synced - trust Stripe as source of truth
      const stripeAmount = (pi?.amount_received || pi?.amount || session?.amount_total || 0) / 100;
      const currentAmount = Number(order.total_amount) || 0;
      
      if (stripeAmount > 0 && Math.abs(stripeAmount - currentAmount) > 0.01) {
        console.log(`[SYNC DEBUG] Updating Order ${id} amount from ${currentAmount} to ${stripeAmount}`);
        updatePayload.total_amount = stripeAmount;
      }

      if (Object.keys(updatePayload).length > 0) {
        console.log(`[SYNC DEBUG] Persisting updates to DB for Order ${id}:`, updatePayload);
        const { error: updateError } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', id);
        
        if (updateError) {
          console.error(`[SYNC DB ERROR] Order ${id}:`, JSON.stringify(updateError));
          return res.status(500).json({ error: `Erro no banco de dados ao atualizar ordem: ${updateError.message || 'Erro desconhecido'}` });
        }
        
        return res.json({ 
          success: true, 
          status: newStatus, 
          message: `Sincronização concluída com sucesso.` 
        });
      } else {
        return res.json({ 
          success: true, 
          status: order.status, 
          message: `A ordem já está sincronizada (Status: ${order.status}, Valor: €${currentAmount}).` 
        });
      }
    } else {
      return res.status(400).json({ error: 'Não foi encontrado ID de transação (Sessão ou PI) para sincronizar.' });
    }
  } catch (error: any) {
    console.error('[SYNC PAYMENT ERROR]', error);
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
      .select('*, product:products(*) ')
      .eq('id', orderId)
      .in('status', ['paid', 'completed'])
      .single();

    if (orderError) {
      console.error(`[DOWNLOAD ERROR] DB fail:`, orderError);
      return res.status(404).json({ error: `Ordem não encontrada: ${orderError.message}` });
    }

    if (!order || !order.product) {
      return res.status(404).json({ error: 'Produto não associado a esta ordem.' });
    }

    const originalPath = order.product.file_url || '';
    
    // Se for URL externo
    if (originalPath.startsWith('http')) {
      return res.json({ url: originalPath });
    }

    let sanitizedPath = originalPath.replace(/^\/+/, '');
    if (sanitizedPath.startsWith('assets/')) {
      sanitizedPath = sanitizedPath.replace('assets/', '');
    }
    
    console.log(`[DOWNLOAD] Sanitized Path: "${sanitizedPath}" (raw: "${originalPath}") in bucket "assets"`);

    // Try primary path in 'assets' bucket
    let { data, error: storageError } = await supabase.storage
      .from('assets')
      .createSignedUrl(sanitizedPath, 3600);

    // Fallback: Try 'ebooks' bucket
    if (storageError && storageError.message === 'Object not found') {
       console.log(`[DOWNLOAD] Not found in "assets". Trying "ebooks" bucket...`);
       const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('ebooks')
        .createSignedUrl(sanitizedPath, 3600);
       
       if (!fallbackError && fallbackData) {
         data = fallbackData;
         storageError = null;
       }
    }

    // Fallback: If still fails, try 'ebooks/' subfolder in 'assets'
    if (storageError && storageError.message === 'Object not found') {
      console.log(`[DOWNLOAD] Not found in "ebooks" bucket. Trying "ebooks/" subfolder in "assets"...`);
      const fallbackPath = `ebooks/${sanitizedPath}`;
      const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('assets')
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

// Admin Refund Processing (Initiates Stripe refund)
adminRouter.post('/orders/:id/refund', async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();
  const stripe = getStripe();

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (!order.stripe_session_id) {
      return res.status(400).json({ error: 'ID de sessão Stripe ausente.' });
    }

    // Retrieve full session with payment intent expand
    let pi: Stripe.PaymentIntent | null = null;
    
    if (order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
        expand: ['payment_intent']
      });
      pi = session.payment_intent as Stripe.PaymentIntent;
    } else if ((order as any).payment_intent_id) {
      pi = await stripe.paymentIntents.retrieve((order as any).payment_intent_id);
    }
    
    if (!pi || !pi.id) {
      return res.status(400).json({ error: 'Nenhum Payment Intent encontrado. Certifique-se de sincronizar a ordem primeiro.' });
    }

    // Amount needs to be > 0.
    let amountToRefund = pi.amount_received || pi.amount || Math.round(parseFloat(order.total_amount?.toString() || '0') * 100);
    
    // If it is still 0, we have a problem, try to use the product price as last resort
    if (!amountToRefund || amountToRefund <= 0) {
      // Fetch product to get price
      const { data: product } = await supabase.from('products').select('price').eq('id', order.product_id).single();
      if (product && product.price) {
        amountToRefund = Math.round(parseFloat(product.price.toString()) * 100);
      }
    }

    if (!amountToRefund || amountToRefund <= 0) {
      return res.status(400).json({ error: `Valor inválido para estorno. O Stripe reporta montante recebido de 0 e o valor local também é 0.` });
    }

    console.log(`[ADMIN REFUND] Initiating Stripe refund of ${amountToRefund} cents for PI: ${pi.id}`);
    
    const refund = await stripe.refunds.create({
      payment_intent: pi.id,
      amount: amountToRefund,
    });

    // Update to 'refund_pending'
    await supabase.from('orders').update({ 
      status: 'refund_pending',
      selected_options: {
        ...(order.selected_options || {}),
        stripe_refund_id: refund.id,
        refund_approved_at: new Date().toISOString()
      }
    }).eq('id', id);

    // IMMEDIATELY Revoke accessibility for digital products
    await supabase.from('user_reading_progress').delete()
      .eq('book_id', order.product_id)
      .eq('user_id', order.user_id);

    console.log(`[ADMIN REFUND] Order ${id} set to refund_pending and access revoked.`);
    
    return res.json({ 
      success: true, 
      stripe_status: refund.status, 
      message: 'Reembolso aprovado. O acesso foi removido e o status será atualizado para "Reembolsado" assim que o Stripe confirmar.'
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

// Mount Routers
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

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

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S.Art Server running on http://localhost:${PORT}`);
  });
}

export default app;
