import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { resolveStoragePath } from './server-utils';

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

        // 5. Enviar Email Luxuoso via Resend
        await resend.emails.send({
          from: 'S.Art Atelier <vendas@s.art-full.pt>',
          to: customerEmail,
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
                <a href="${signedData.signedUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 18px 36px; text-decoration: none; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; transition: all 0.3s ease;">Descarregar Guia Digital</a>
                <p style="font-size: 9px; color: #9ca3af; margin-top: 15px; font-style: italic;">* Este link de acesso privado expira em 60 minutos por motivos de segurança.</p>
              </div>
              
              <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #f0f0f0; text-align: center;">
                <p style="font-size: 11px; color: #6b7280; line-height: 1.8;">Esperamos que esta obra seja uma peça fundamental no teu percurso.</p>
                <p style="font-size: 9px; color: #9ca3af; margin-top: 20px;">S.Art Studio © 2024 | Curadoria Digital de Luxo</p>
              </div>
            </div>
          `
        });

        console.log(`[S.ART SUCCESS] E-book entregue a ${customerEmail}`);
      }
    } catch (err) {
      console.error(`[S.ART PROCESSING ERROR]`, err);
      return res.status(500).json({ error: 'Internal processing error' });
    }
  }

  res.json({ received: true });
}
