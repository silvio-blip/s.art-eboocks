import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase, ADMIN_IDS } from '../lib/server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, PATCH, DELETE, POST, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  const { id } = req.query; // For updates/deletes

  try {
    if (req.method === 'POST') {
      const { title, description, price, image_url, file_url, category, is_active, userId } = req.body;
      if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });

      const { data, error } = await supabase
        .from('products')
        .insert({ title, description, price, image_url, file_url, category, is_active })
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { title, description, price, image_url, file_url, category, is_active, userId } = req.body;
      if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });
      if (!id) return res.status(400).json({ error: 'Product ID required' });

      const { data, error } = await supabase
        .from('products')
        .update({ title, description, price, image_url, file_url, category, is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { userId } = req.body;
      if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });
      if (!id) return res.status(400).json({ error: 'Product ID required' });

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
