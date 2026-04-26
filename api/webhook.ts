import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { resolveStoragePath } from '../lib/server-utils.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia' as any,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY!);

export const config = {
  api: {
    bodyParser: false,
  },
};

const buffer = async (readable: any) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = await buffer(req);
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`[WEBHOOK ERROR] ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`[WEBHOOK] Processing completed session: ${session.id}`);
    
    // 1. Extrair Metadados
    const { userId, productId, orderId } = session.metadata || {};
    const customerEmail = session.customer_details?.email || session.customer_email;

    console.log(`[WEBHOOK] Metadata - OrderID: ${orderId}, ProductID: ${productId}, UserID: ${userId}`);

    if (!productId || !customerEmail) {
      console.error('[WEBHOOK ERROR] Missing essential data');
      return res.status(400).json({ error: 'Missing metadata or email' });
    }

    try {
      // 2. Atualizar Pedido no Supabase
      if (orderId) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            status: 'completed', 
            stripe_session_id: session.id,
            customer_email: customerEmail 
          })
          .eq('id', orderId);
        
        if (updateError) {
          console.error(`[WEBHOOK ERROR] Failed to update order ${orderId}:`, updateError);
        } else {
          console.log(`[WEBHOOK SUCCESS] Order ${orderId} marked as completed`);
        }
      }

      // 3. Buscar Dados do Produto
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (product) {
        // 4. Gerar Link Assinado (Privado)
        const sanitizedPath = resolveStoragePath(product.file_url || '');
        
        let { data: signedData, error: signedError } = await supabase.storage
          .from('assets')
          .createSignedUrl(sanitizedPath, 3600); // Expira em 1 hora

        // Fallback para subpasta ebooks/
        if (signedError && signedError.message === 'Object not found') {
          const { data: fallbackData, error: fallbackError } = await supabase.storage
            .from('assets')
            .createSignedUrl(`ebooks/${sanitizedPath}`, 3600);
          if (!fallbackError && fallbackData) {
            signedData = fallbackData;
            signedError = null;
          }
        }

        if (signedError) throw signedError;

        // Note: Automatic email delivery of the book link is being disabled per user request.
        // Users can now download/read directly from the application dashboard.
        // The Resend integration is maintained for future use (e.g., password recovery).
        /*
        await resend.emails.send({
          from: 'S.Art Atelier <vendas@s.art-full.pt>',
          to: customerEmail,
          ...
        });
        */

        console.log(`[S.ART SUCCESS] Order ${orderId} finalized. eBook link generated (skipping email delivery per config).`);
      }
    } catch (err) {
      console.error(`[S.ART PROCESSING ERROR]`, err);
      return res.status(500).json({ error: 'Internal processing error' });
    }
  }

  res.json({ received: true });
}
