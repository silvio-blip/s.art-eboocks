import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase, resolveStoragePath } from '../lib/server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId } = req.query;
  console.log(`[DOWNLOAD] Attempting download for Order ID: ${orderId}`);

  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Falha ao inicializar Supabase.');
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, product:products(*)')
      .eq('id', orderId)
      .eq('status', 'completed')
      .single();

    if (orderError || !order || !order.product) {
      return res.status(404).json({ error: 'Ordem não encontrada ou produto indisponível.' });
    }

    if (!order.product.file_url) {
      return res.status(400).json({ error: 'O ficheiro para este e-book ainda não foi carregado.' });
    }

    if (order.product.file_url.startsWith('http')) {
      return res.json({ url: order.product.file_url });
    }

    const baseName = resolveStoragePath(order.product.file_url);
    if (!baseName) return res.status(400).json({ error: 'Caminho do ficheiro inválido.' });

    const possiblePaths = [baseName, `ebook/${baseName}`];
    let signedUrlData = null;
    let storageError = null;

    for (const p of possiblePaths) {
      const { data, error } = await supabase.storage.from('assets').createSignedUrl(p, 3600);
      if (!error && data) {
        signedUrlData = data;
        storageError = null;
        break;
      }
      storageError = error;
    }

    if (storageError) {
      return res.status(404).json({ error: `Erro no servidor de ficheiros: ${storageError.message}` });
    }

    return res.status(200).json({ url: signedUrlData.signedUrl });
  } catch (error: any) {
    console.error(`[DOWNLOAD FATAL ERROR]:`, error.message);
    return res.status(500).json({ error: 'Erro interno ao processar download.' });
  }
}
