import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

/**
 * S.ART Atelier - Session Verification API
 * Standardized with WHATWG URL API to avoid url.parse deprecation.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Standard URL parsing to satisfy security requirements
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url!, `${protocol}://${host}`);
    const sessionId = fullUrl.searchParams.get('session_id');

    if (!sessionId) {
      return res.status(400).json({ error: 'ID de sessão não fornecido.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    console.log(`[S.ART VERIFY] Checking Session: ${sessionId}`);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status === 'complete' && session.payment_status === 'paid') {
      const { productId, orderId } = session.metadata || {};
      const customerEmail = session.customer_details?.email || session.customer_email;

      // Ensure the order is marked as completed (Atomic sync for the UI)
      if (orderId) {
        await supabase
          .from('orders')
          .update({ 
            status: 'completed', 
            stripe_session_id: session.id,
            customer_email: customerEmail 
          })
          .eq('id', orderId);
      }

      // Fetch the product details for the success page
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      return res.status(200).json({ 
        status: 'paid', 
        product,
        orderId
      });
    }

    return res.status(200).json({ 
      status: session.status,
      payment_status: session.payment_status 
    });
  } catch (error: any) {
    console.error('[S.ART VERIFY FATAL ERROR]', error);
    return res.status(500).json({ 
      error: 'Erro na validação do checkout do Stripe.',
      details: error.message 
    });
  }
}
