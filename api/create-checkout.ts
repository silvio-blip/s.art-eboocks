import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getStripe, getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { productId, userId, email } = req.body;
    console.log('[CHECKOUT] Request body:', { productId, userId, email });

    if (!productId) return res.status(400).json({ error: 'Product ID required' });

    const stripe = getStripe();
    const supabase = getSupabase();

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error) {
      console.error('[CHECKOUT] DB Error:', error);
      return res.status(404).json({ error: 'Product not found' });
    }

    let orderId = '';
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId || null,
        product_id: productId,
        total_amount: product.price,
        status: 'pending',
        customer_email: email
      })
      .select()
      .single();
      
    if (orderError) {
      console.error('[CHECKOUT] Order Insert Error:', orderError);
    } else if (order) {
      orderId = order.id;
    }

    const clientOrigin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'multibanco', 'mbway'],
      billing_address_collection: 'required',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title,
            description: product.description,
            images: product.image_url ? [product.image_url] : [],
          },
          unit_amount: Math.round(Number(product.price) * 100),
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
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error('[STRIPE_ERROR_DETAIL]:', error.message);
    res.status(500).json({ error: error.message });
  }
}
