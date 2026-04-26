import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getStripe, getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { productId, userId, email, options, shippingInfo } = req.body;
    console.log('[CHECKOUT] Request body:', { productId, userId, email, options, shippingInfo });

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

    // Gerar URL pública da imagem para o Stripe
    let stripeImage = product.image_url;
    if (stripeImage && !stripeImage.startsWith('http')) {
      const { data } = supabase.storage.from('assets').getPublicUrl(stripeImage);
      stripeImage = data.publicUrl;
    }

    const product_data: any = {
      name: product.title,
      images: stripeImage ? [stripeImage] : [],
    };

    if (product.description && product.description.trim() !== '') {
      product_data.description = product.description.substring(0, 500); // Stripe has limits
    }

    let orderId = '';
    const orderPayload: any = {
      user_id: userId || null,
      product_id: productId,
      total_amount: product.price,
      status: 'pending',
      customer_email: email,
      selected_options: options || {}
    };

    if (shippingInfo) {
      orderPayload.shipping_details = shippingInfo;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();
      
    if (orderError) {
      console.error('[CHECKOUT] Order Insert Error:', orderError);
      // Fallback
      if (orderError.code === 'PGRST204' || orderError.message?.includes('shipping_details')) {
        const { data: fallbackOrder } = await supabase
          .from('orders')
          .insert({
            user_id: userId || null,
            product_id: productId,
            total_amount: product.price,
            status: 'pending',
            customer_email: email,
            selected_options: options || {}
          })
          .select()
          .single();
        if (fallbackOrder) orderId = fallbackOrder.id;
      }
    } else if (order) {
      orderId = order.id;
    }

    const clientOrigin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      billing_address_collection: 'required',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data,
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

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error('[STRIPE_CHECKOUT_FATAL_ERROR]:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar checkout' });
  }
}
