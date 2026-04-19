import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { getSupabase, ADMIN_IDS } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { title, description, price, image_url, file_url, category, userId } = req.body;
    
    if (!ADMIN_IDS.includes(userId)) return res.status(403).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('products')
      .insert({ title, description, price, image_url, file_url, category, is_active: true })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
