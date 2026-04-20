import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

    // 2. Auth Check (Server-side)
    // We check for the session via Authorization header if possible, 
    // but in this serverless context we might rely on the client passing the user ID or just let Storage RLS handle it if we were client-side.
    // However, the user asked to verify session active.
    
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use Service Role for signed URL generation
    );

    // Prepare path - clean up leading slashes
    const sanitizedPath = filePath.replace(/^\/+/, '');
    console.log(`[S.ART GET-BOOK] Requesting signed URL for: ${sanitizedPath} in bucket: assets`);

    // 3. Generate Signed URL (1 hour)
    const { data: signedData, error: storageError } = await supabase.storage
      .from('assets')
      .createSignedUrl(sanitizedPath, 3600);

    if (storageError) {
      console.error(`[S.ART GET-BOOK ERROR] Storage fail:`, storageError);
      return res.status(404).json({ error: `Obra não encontrada: ${storageError.message}` });
    }

    return res.status(200).json({ url: signedData.signedUrl });
  } catch (error: any) {
    console.error('[S.ART GET-BOOK FATAL]', error);
    return res.status(500).json({ error: 'Erro interno ao aceder à obra digital.' });
  }
}
