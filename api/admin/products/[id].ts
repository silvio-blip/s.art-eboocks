import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase, ADMIN_IDS } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (req.method === 'PATCH') {
    try {
      const { title, description, price, image_url, file_url, category, userId } = req.body;
      if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('products')
        .update({ title, description, price, image_url, file_url, category })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { userId } = req.body;
      if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });

      const supabase = getSupabase();
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
