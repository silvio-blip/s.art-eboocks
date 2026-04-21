import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * S.ART Atelier - Get Book Access Link - FIXED VERSION
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url!, `${protocol}://${host}`);
    
    // Suporta ambos os nomes para máxima compatibilidade
    const filePath = fullUrl.searchParams.get('fileName') || fullUrl.searchParams.get('filePath');
    const bookTitle = fullUrl.searchParams.get('bookTitle') || 'ebook';

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    // Instanciar supabase com Service Role Key para permissão total
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        return res.status(500).json({ error: "SERVICE_ROLE_KEY_MISSING" });
    }
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, serviceRoleKey);
    
    // Caminho forçado e fixo: assegurar prefixo 'ebook/' (singular)
    // Se já tiver ebook/, não duplica.
    const finalPath = filePath.startsWith('ebook/') ? filePath : `ebook/${filePath}`;
    
    console.log("[S.ART FINAL CHECK] Path solicitado: ", finalPath);

    // Slugify book title for the download filename
    const safeTitle = bookTitle.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-') + '.pdf';

    const { data, error } = await supabase.storage
        .from('assets')
        .createSignedUrl(finalPath, 3600, {
          download: safeTitle
        });

    if (error) {
      console.error(`[S.ART GET-BOOK ERROR] Storage fail:`, error);
      return res.status(404).json({ 
        error: `Obra não encontrada: ${error?.message || 'Object not found'}`,
        triedPath: finalPath
      });
    }
    
    return res.status(200).json({ url: data.signedUrl });
  } catch (error: any) {
    console.error('[S.ART GET-BOOK SERVER ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
