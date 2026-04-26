import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe, getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, userId } = req.body;
  if (!orderId || !userId) return res.status(400).json({ error: 'Missing parameters' });

  const supabase = getSupabase();
  const stripe = getStripe();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

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

    if (order.status !== 'completed') {
      return res.status(400).json({ error: 'Ordem não é elegível para reembolso' });
    }

    const daysSincePurchase = (new Date().getTime() - new Date(order.created_at).getTime()) / (1000 * 3600 * 24);
    if (daysSincePurchase > 14) {
      return res.status(400).json({ error: 'O período da garantia de 14 dias já expirou.' });
    }

    if (!order.stripe_session_id) {
      return res.status(400).json({ error: 'Ordem não contém uma transação na Stripe válida.' });
    }

    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (!session.payment_intent) {
      return res.status(400).json({ error: 'Payment Intent não encontrado nesta checkout session.' });
    }

    const refund = await stripe.refunds.create({
      payment_intent: session.payment_intent as string,
    });

    if (refund.status === 'succeeded') {
      await supabase.from('orders').update({ status: 'refunded' }).eq('id', orderId);
      await supabase.from('user_reading_progress').delete().eq('book_id', order.product_id).eq('user_id', userId);
    } else {
      await supabase.from('orders').update({ status: 'refund_pending' }).eq('id', orderId);
    }

    return res.json({ success: true, status: refund.status });
  } catch (err: any) {
    console.error('[REFUND ERROR]', err);
    return res.status(500).json({ error: err.message || 'Erro ao processar o reembolso.' });
  }
}
