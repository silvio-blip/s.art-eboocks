import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, code } = req.body;
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    const { data, error } = await supabase
      .from('password_recovery_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    res.json({ success: true, message: 'Código verificado.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
