import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getStripe, getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === 'paid') {
      const { userId, productId, orderId } = session.metadata || {};
      const customerEmail = session.customer_details?.email || session.customer_email;

      // Fallback update in case webhook is delayed
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
}
