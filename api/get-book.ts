import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, resolveStoragePath } from './server-utils';

/**
 * S.ART Atelier - Get Book Access Link
 * Modernized with WHATWG URL API and 'assets' bucket.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. WHATWG URL Parsing
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url!, `${protocol}://${host}`);
    const filePath = fullUrl.searchParams.get('filePath');

    if (!filePath) {
      return res.status(400).json({ error: 'Caminho do ficheiro (filePath) não fornecido.' });
    }

    const supabase = getSupabase();

    // Prepare path - clean up leading slashes and handle potential bucket prefix
    const sanitizedPath = resolveStoragePath(filePath);
    
    console.log(`[S.ART GET-BOOK] Resolved: "${sanitizedPath}" (from: "${filePath}")`);

    // 3. Generate Signed URL (1 hour)
    let { data: signedData, error: storageError } = await supabase.storage
      .from('assets')
      .createSignedUrl(sanitizedPath, 3600);

    // Fallback: If not found, try ebooks/ subfolder
    if (storageError && storageError.message === 'Object not found') {
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('assets')
          .createSignedUrl(`ebooks/${sanitizedPath}`, 3600);
        
        if (!fallbackError && fallbackData) {
            signedData = fallbackData;
            storageError = null;
        }
    }

    if (storageError) {
      console.error(`[S.ART GET-BOOK ERROR] Storage fail:`, storageError);
      return res.status(404).json({ 
        error: `Obra não encontrada: ${storageError.message}`,
        path: sanitizedPath,
        bucket: 'assets'
      });
    }

    return res.status(200).json({ url: signedData.signedUrl });
  } catch (error: any) {
    console.error('[S.ART GET-BOOK FATAL]', error);
    return res.status(500).json({ error: 'Erro interno ao aceder à obra digital.' });
  }
}
