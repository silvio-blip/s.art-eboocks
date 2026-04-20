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
      const updateData: any = { 
        status: 'completed',
        stripe_session_id: session.id 
      };
      
      if (email) updateData.customer_email = email;

      try {
        await supabase.from('orders').update(updateData).eq('id', orderId);
      } catch (err) {
        console.warn("[S.ART WEBHOOK] Partial update on order. customer_email might be missing from schema.");
        // Fallback update without customer_email if it fails
        await supabase.from('orders').update({
          status: 'completed',
          stripe_session_id: session.id
        }).eq('id', orderId);
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

app.use(express.json());

// --- API ROUTES ---
const apiRouter = express.Router();

// Health check
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create Stripe Checkout Session
apiRouter.post('/create-checkout', async (req, res) => {
  try {
    const { productId, userId, email } = req.body;
    console.log(`[S.ART] Create Checkout Request - Product: ${productId}, User: ${userId}, Email: ${email}`);
    
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
      const { data } = supabase.storage.from('covers').getPublicUrl(stripeImage);
      stripeImage = data.publicUrl;
    }

    // Create Order Record in Pending State
    let orderId = '';
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: userId || null,
          product_id: productId,
          total_amount: product.price,
          status: 'pending'
        })
        .select()
        .single();
        
      if (!orderError && order) {
        orderId = order.id;
      } else {
        console.warn("[S.ART] DB Sync Warning: Could not create initial order record.", orderError);
      }
    } catch (dbErr) {
      console.warn("[S.ART] DB Exception: Failed to insert order.", dbErr);
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
            description: product.description,
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
        orderId: orderId
      }
    } as any);

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error(`[S.ART CHECKOUT FATAL ERROR]`, error);
    res.status(500).json({ error: error.message || 'Erro interno no checkout do Stripe' });
  }
});

// Reset Password
apiRouter.post('/auth/reset-password', async (req, res) => {
  const { action, email, otp, password } = req.body;
  const supabase = getSupabase(); // Admin client (service_role)
  const resend = getResend();

  try {
    if (action === 'request') {
      // 1. Verificar se usuário existe
      const { data: usersData } = await supabase.auth.admin.listUsers();
      if (!usersData.users.find(u => u.email === email)) 
        return res.status(404).json({ error: 'E-mail não encontrado.' });

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 2. Guardar OTP
      await supabase.from('otp_verifications').upsert({ 
        email, 
        otp: otpCode, 
        created_at: new Date().toISOString() 
      });

      // 3. E-mail "Luxury Boutique"
      await resend.emails.send({
        from: 'S.Art Atelier <seguranca@s.art-full.pt>',
        to: email,
        subject: 'Código de Recuperação S.Art',
        html: `
          <div style="font-family: 'Georgia', serif; background-color: #000; color: #fff; padding: 60px 20px; text-align: center; border: 1px solid #333;">
            <h1 style="color: #D4AF37; letter-spacing: 8px; text-transform: uppercase; font-size: 20px; margin-bottom: 40px;">S.ART</h1>
            <p style="font-size: 16px; color: #aaa; margin-bottom: 30px;">Recuperação de Acesso à Boutique Digital</p>
            <div style="font-size: 56px; color: #D4AF37; margin: 40px 0; font-weight: 700; letter-spacing: 12px; border: 1px solid #D4AF37; padding: 20px;">${otpCode}</div>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">Este código é pessoal e confidencial.<br>Expira em 5 minutos.</p>
            <div style="margin-top: 50px; font-size: 10px; color: #333; text-transform: uppercase; letter-spacing: 2px;">Boutique Digital S.Art © 2026</div>
          </div>
        `
      });
      return res.json({ success: true });
    }

    if (action === 'verify_and_reset') {
      const { data: record, error: recordError } = await supabase.from('otp_verifications').select('*').eq('email', email).single();
      
      if (!record || record.otp !== otp) return res.status(401).json({ error: 'Código inválido.' });

      // Verificar tempo (5 min)
      if (new Date().getTime() - new Date(record.created_at).getTime() > 300000) {
        return res.status(400).json({ error: 'Código expirado.' });
      }

      // Alterar Senha (Admin API)
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const user = usersData.users.find(u => u.email === email);
      await supabase.auth.admin.updateUserById(user!.id, { password });

      // Limpar código
      await supabase.from('otp_verifications').delete().eq('email', email);
      
      return res.json({ success: true });
    }
  } catch (err: any) {
    console.error('[RESET ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Get Session Status
apiRouter.get('/session-status', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

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
    res.status(500).json({ error: error.message });
  }
});

// Verify Session (Updated with WHATWG URL)
apiRouter.get('/verify-session', async (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const fullUrl = new URL(req.url, `${protocol}://${host}`);
    const session_id = fullUrl.searchParams.get('session_id');

    if (!session_id) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const productId = session.metadata?.productId;
      const orderId = session.metadata?.orderId;
      
      // Update order status to completed
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderId);

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
    res.status(500).json({ error: error.message });
  }
});

// Get Book Signed URL (assets bucket)
apiRouter.get('/get-book', async (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const fullUrl = new URL(req.url, `${protocol}://${host}`);
    const filePath = fullUrl.searchParams.get('filePath');

    if (!filePath) return res.status(400).json({ error: 'filePath matching products.file_url is required' });

    const supabase = getSupabase();
    
    // Smart Path Resolver
    const resolveStoragePath = (input: string) => {
      let path = input.replace(/^\/+/, '');
      
      // If it's a full URL, try to extract the core path
      if (path.startsWith('http')) {
        try {
          const urlObj = new URL(path);
          // Standard Supabase storage URL: .../storage/v1/object/public/bucketName/path/to/file
          if (urlObj.pathname.includes('/storage/v1/object/')) {
            const parts = urlObj.pathname.split('/');
            const bucketIndex = parts.findIndex(p => p === 'assets' || p === 'ebooks' || p === 'covers');
            if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
              return parts.slice(bucketIndex + 1).join('/');
            }
          }
          // Generic fallback for any other URL format - take the last parts
          const parts = urlObj.pathname.split('/');
          return parts[parts.length - 1];
        } catch (e) {
          console.warn('[STORAGE RESOLVER] Failed to parse URL:', path);
        }
      }

      // Handle common bucket prefixes that shouldn't be in the path
      const prefixesToRemove = ['assets/', 'ebooks/', 'ebook/'];
      for (const prefix of prefixesToRemove) {
        if (path.toLowerCase().startsWith(prefix)) {
          return path.substring(prefix.length);
        }
      }
      
      return path;
    };

    const sanitizedPath = resolveStoragePath(filePath);
    console.log(`[S.ART GET-BOOK] Attempting signed URL. Raw: "${filePath}" -> Resolved: "${sanitizedPath}"`);

    // Try primary path in 'assets' bucket
    let { data: signedData, error: storageError } = await supabase.storage
      .from('assets')
      .createSignedUrl(sanitizedPath, 3600);

    // Fallback: Try 'ebooks' bucket
    if (storageError && storageError.message === 'Object not found') {
       console.log(`[S.ART GET-BOOK] Not found in "assets". Trying "ebooks" bucket...`);
       const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('ebooks')
        .createSignedUrl(sanitizedPath, 3600);
       
       if (!fallbackError && fallbackData) {
         signedData = fallbackData;
         storageError = null;
       }
    }

    // Fallback: If still fails, try 'ebooks/' subfolder in 'assets'
    if (storageError && storageError.message === 'Object not found') {
      console.log(`[S.ART GET-BOOK] Not found in "ebooks" bucket. Trying "ebooks/" subfolder in "assets"...`);
      const fallbackPath = `ebooks/${sanitizedPath}`;
      const { data: fallbackData, error: fallbackError } = await supabase.storage
        .from('assets')
        .createSignedUrl(fallbackPath, 3600);
      
      if (!fallbackError && fallbackData) {
        signedData = fallbackData;
        storageError = null;
      }
    }

    if (storageError) {
      console.error(`[S.ART GET-BOOK STORAGE ERROR] Path: "${sanitizedPath}"`, storageError);
      return res.status(404).json({ 
        error: `Obra não encontrada no servidor: ${storageError.message}`,
        triedPath: sanitizedPath,
        bucket: 'assets'
      });
    }
    res.json({ url: signedData.signedUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN API ---
const adminRouter = express.Router();

adminRouter.use((req, res, next) => {
  const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];
  const ADMIN_IDS = ['3d596215-583e-498f-9fd5-36b83d8bccf5', '00d44feb-0b51-405e-86f7-31b67edfb7b6'];
  if (!ADMIN_IDS.includes(userId as string)) {
    return res.status(403).json({ error: 'Unauthorized admin access' });
  }
  next();
});

adminRouter.post('/products', async (req, res) => {
  try {
    const { title, description, price, image_url, file_url, category } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .insert({ title, description, price, image_url, file_url, category })
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
    const { title, description, price, image_url, file_url, category } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .update({ title, description, price, image_url, file_url, category })
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
      .eq('status', 'completed')
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

    const { data, error: storageError } = await supabase.storage
      .from('assets')
      .createSignedUrl(sanitizedPath, 3600);

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
