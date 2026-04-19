import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase } from '../../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId } = req.query;

  try {
    const supabase = getSupabase();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, product:products(*)')
      .eq('id', orderId)
      .eq('status', 'completed')
      .single();

    if (orderError || !order || !order.product) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const { data, error: storageError } = await supabase.storage
      .from('ebooks')
      .createSignedUrl(order.product.file_url, 3600);

    if (storageError) throw storageError;
    res.json({ url: data.signedUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
