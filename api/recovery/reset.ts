import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Database connection failed' });

    // 1. Verificar o código novamente
    const { data: codeData, error: codeError } = await supabase
      .from('password_recovery_codes')
      .select('*')
      .ilike('email', email.trim())
      .eq('code', code.trim())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (codeError || !codeData) {
      return res.status(400).json({ error: 'Código inválido ou transação expirada.' });
    }

    // 2. Localizar utilizador no Auth
    const { data: userData, error: fetchError } = await supabase.auth.admin.listUsers();
    const targetUser = userData?.users?.find((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase());

    if (fetchError || !targetUser) {
      return res.status(400).json({ error: 'Utilizador não encontrado no sistema de autenticação.' });
    }

    // 3. Atualizar senha
    const { error: authError } = await supabase.auth.admin.updateUserById(targetUser.id, { 
      password: password 
    });

    if (authError) {
      return res.status(400).json({ error: `Erro ao atualizar senha: ${authError.message}` });
    }

    // 4. Marcar código como usado
    await supabase
      .from('password_recovery_codes')
      .update({ used: true })
      .eq('id', codeData.id);

    return res.status(200).json({ success: true, message: 'Password atualizada com sucesso.' });
  } catch (error: any) {
    console.error('[API RECOVERY RESET]', error);
    return res.status(500).json({ error: error.message });
  }
}
