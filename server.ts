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
  }

  res.json({ received: true });
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = getSupabase();
  const resend = getResend();
  
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;
  const orderId = session.metadata?.orderId;
  const email = session.customer_email || session.customer_details?.email;

  console.log(`[S.ART] Payment confirmed for Order: ${orderId}, Product: ${productId}`);

  try {
    // 1. Update Order in Supabase
    if (orderId) {
      await supabase.from('orders').update({ 
        status: 'completed',
        stripe_session_id: session.id 
      }).eq('id', orderId);
    }

    // 2. Get Product Info (for the download link)
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (product && email) {
      // 3. Trigger Email via Resend
      await resend.emails.send({
        from: 'S.Art <vendas@s.art-full.pt>',
        to: email,
        subject: `O seu E-book: ${product.title} - S.Art`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
            <h1 style="color: #000; font-size: 24px;">Obrigado pela sua compra na S.Art</h1>
            <p>O seu e-book digital está pronto para download.</p>
            <div style="margin: 30px 0; background: #f5f5f5; padding: 20px; border-radius: 8px;">
              <h2 style="font-size: 18px; margin-top: 0;">${product.title}</h2>
              <a href="${product.file_url}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 600;">Download do E-book (PDF)</a>
            </div>
            <p style="font-size: 12px; color: #666;">Se tiver algum problema com o download, responda a este email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="text-align: center; font-size: 10px; uppercase; letter-spacing: 1px;">S.Art | Boutique Digital</p>
          </div>
        `
      });
      console.log(`[S.ART] Download link sent to ${email}`);
    }
  } catch (error) {
    console.error('[S.ART WEBHOOK ERROR]', error);
  }
}

app.use(express.json());

// --- API ROUTES ---

// Create Stripe Checkout Session
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { productId, userId, email } = req.body;
    const stripe = getStripe();
    const supabase = getSupabase();

    // Get product info
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !product) return res.status(404).json({ error: 'Product not found' });

    // Create Order Record in Pending State
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId || null,
        product_id: productId,
        total_amount: product.price,
        customer_email: email,
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title,
            description: product.description,
            images: [product.image_url],
          },
          unit_amount: Math.round(product.price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/`,
      metadata: {
        userId: userId || '',
        productId: productId,
        orderId: order.id
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Session Status (for Success Page)
app.get('/api/session-status', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === 'paid') {
      const productId = session.metadata?.productId;
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      return res.json({ 
        status: 'paid', 
        product: product 
      });
    }

    res.json({ status: session.payment_status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- OAUTH CALLBACK (Skill: oauth-integration) ---
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  res.send(`
    <html>
      <body style="background: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center;">
          <h2 style="font-weight: 300;">Autenticação concluída</h2>
          <p style="color: #666; font-size: 14px;">Esta janela fechará automaticamente...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            setTimeout(() => window.close(), 1000);
          } else {
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `);
});

// --- ADMIN API ---

// Create Product
app.post('/api/admin/products', async (req, res) => {
  try {
    const { title, description, price, image_url, file_url, userId } = req.body;
    const ADMIN_ID = 'f86cf7f4-0f86-4f89-952f-0cb62f6dc93d';
    
    if (userId !== ADMIN_ID) return res.status(403).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .insert({ title, description, price, image_url, file_url })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Product
app.patch('/api/admin/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, image_url, file_url, userId } = req.body;
    const ADMIN_ID = 'f86cf7f4-0f86-4f89-952f-0cb62f6dc93d';
    
    if (userId !== ADMIN_ID) return res.status(403).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .update({ title, description, price, image_url, file_url })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Product (Soft delete or toggle active)
app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const ADMIN_ID = 'f86cf7f4-0f86-4f89-952f-0cb62f6dc93d';
    
    if (userId !== ADMIN_ID) return res.status(403).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`S.Art Server running on http://localhost:${PORT}`);
});

export default app;
