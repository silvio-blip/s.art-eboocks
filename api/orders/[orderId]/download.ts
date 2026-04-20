import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase } from '../../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId } = req.query;
  console.log(`[DOWNLOAD] Attempting download for Order ID: ${orderId}`);

  try {
    const supabase = getSupabase();
    console.log(`[DOWNLOAD] Fetching order from DB...`);
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, product:products(*)')
      .eq('id', orderId)
      .eq('status', 'completed')
      .single();

    if (orderError) {
      console.error(`[DOWNLOAD ERROR] Database fetch failed:`, orderError);
      return res.status(404).json({ error: `Ordem não encontrada ou não concluída. Detalhe: ${orderError.message}` });
    }

    if (!order || !order.product) {
      console.error(`[DOWNLOAD ERROR] Order or associated product missing for ID: ${orderId}`);
      return res.status(404).json({ error: 'Ficheiro do produto não disponível para esta ordem.' });
    }

    console.log(`[DOWNLOAD] Order found. Product file path: ${order.product.file_url}`);

    if (!order.product.file_url) {
      console.error(`[DOWNLOAD ERROR] file_url is empty in products table for ID ${order.product.id}`);
      return res.status(400).json({ error: 'O ficheiro para este e-book ainda não foi carregado.' });
    }

    // Se for um URL externo completo, devolvemos diretamente
    if (order.product.file_url.startsWith('http')) {
      console.log(`[DOWNLOAD] External URL detected: ${order.product.file_url}`);
      return res.json({ url: order.product.file_url });
    }

    // Limpar o caminho de barras iniciais
    const sanitizedPath = order.product.file_url.replace(/^\/+/, '');

    console.log(`[DOWNLOAD] Final path for Storage: "${sanitizedPath}" in bucket "ebooks"`);

    if (!sanitizedPath || sanitizedPath === 'undefined' || sanitizedPath === 'null') {
      console.error(`[DOWNLOAD ERROR] Invalid path resolved: "${sanitizedPath}"`);
      return res.status(400).json({ error: 'Caminho do ficheiro inválido para este e-book.' });
    }

    const { data: signedUrlData, error: storageError } = await supabase.storage
      .from('ebooks')
      .createSignedUrl(sanitizedPath, 3600);

    if (storageError) {
      console.error(`[DOWNLOAD ERROR] Storage fail for "${sanitizedPath}":`, storageError);
      
      const errorMessage = storageError.message === 'Object not found' 
        ? `Ficheiro "${sanitizedPath}" não encontrado no armazenamento.`
        : `Erro no servidor de ficheiros: ${storageError.message}`;

      return res.status(500).json({ error: errorMessage });
    }

    console.log(`[DOWNLOAD SUCCESS] Signed URL generated for order ${orderId}`);
    return res.status(200).json({ url: signedUrlData.signedUrl });
  } catch (error: any) {
    console.error(`[DOWNLOAD FATAL ERROR]:`, error.message);
    return res.status(500).json({ 
      error: 'Ocorreu um erro interno ao processar o seu pedido.',
      details: error.message 
    });
  }
}
