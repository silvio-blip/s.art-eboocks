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
    if (!supabase) {
      return res.status(500).json({ error: 'Erro de configuração do servidor (Supabase Keys em falta na Vercel).' });
    }

    // Prepare path - clean up leading slashes and handle potential bucket prefix
    const baseName = resolveStoragePath(filePath);
    
    console.log(`[S.ART GET-BOOK] Resolved Base Name: "${baseName}" (from: "${filePath}")`);

    // Tentar múltiplos caminhos possíveis para máxima compatibilidade
    const possiblePaths = [
      baseName,               // Raiz do bucket assets
      `ebooks/${baseName}`    // Subpasta ebooks
    ];

    let signedData = null;
    let storageError = null;

    for (const p of possiblePaths) {
      console.log(`[S.ART GET-BOOK] Trying path: "${p}" in bucket "assets"`);
      const { data, error } = await supabase.storage
        .from('assets')
        .createSignedUrl(p, 3600);
      
      if (!error && data) {
        signedData = data;
        storageError = null;
        console.log(`[S.ART GET-BOOK] Success with path: "${p}"`);
        break;
      }
      storageError = error;
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
