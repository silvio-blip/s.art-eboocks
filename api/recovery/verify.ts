import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database connection failed' });
    
    const { data, error } = await supabase
      .from('password_recovery_codes')
      .select('*')
      .ilike('email', email.trim())
      .eq('code', code.trim())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    return res.status(200).json({ success: true, message: 'Código verificado.' });
  } catch (error: any) {
    console.error('[API RECOVERY VERIFY]', error);
    return res.status(500).json({ error: error.message });
  }
}
