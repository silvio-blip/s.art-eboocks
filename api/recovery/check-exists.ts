import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database connection failed' });
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({ exists: !!data });
  } catch (error: any) {
    console.error('[API RECOVERY CHECK-EXISTS]', error);
    return res.status(500).json({ error: error.message });
  }
}
