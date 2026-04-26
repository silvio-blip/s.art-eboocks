import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe, getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

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
}
