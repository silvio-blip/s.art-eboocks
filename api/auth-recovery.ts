import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../lib/server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, email, code, password } = req.body;
  const supabase = getSupabase();
  
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    if (action === 'send') {
      console.log(`[RECOVERY] Requesting recovery for: ${email}`);
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { email }
      });

      if (error) {
        console.error(`[RECOVERY ERROR]`, error);
        let errorMessage = "Erro na Edge Function de recuperação.";
        if (error instanceof Error) errorMessage = error.message;
        
        if ((error as any).context) {
          try {
            const bodyText = await (error as any).context.text();
            const bodyJson = JSON.parse(bodyText);
            errorMessage = bodyJson.error || bodyJson.message || errorMessage;
          } catch (e) {}
        }
        return res.status(500).json({ error: errorMessage });
      }
      return res.json(data);
    } 
    
    if (action === 'verify') {
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
      return res.json({ success: true, message: 'Código verificado.' });
    }

    if (action === 'reset') {
      // 1. Verificar o código novamente
      const { data: codeData, error: codeError } = await supabase
        .from('password_recovery_codes')
        .select('*')
        .eq('email', email)
        .eq('code', code)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (codeError || !codeData) {
        return res.status(400).json({ error: 'Código inválido ou transação expirada.' });
      }

      // 2. Atualizar password
      const { data: userData, error: fetchError } = await supabase.auth.admin.listUsers();
      const targetUser = userData?.users?.find((u: any) => u.email === email);

      if (fetchError || !targetUser) {
        return res.status(400).json({ error: 'Utilizador não encontrado.' });
      }

      const { error: authError } = await supabase.auth.admin.updateUserById(targetUser.id, { password });
      if (authError) {
        return res.status(400).json({ error: `Erro ao atualizar senha: ${authError.message}` });
      }

      // 3. Marcar como usado
      await supabase.from('password_recovery_codes').update({ used: true }).eq('id', codeData.id);

      return res.json({ success: true, message: 'Password atualizada com sucesso.' });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (error: any) {
    console.error(`[AUTH RECOVERY FATAL]`, error);
    res.status(500).json({ error: error.message });
  }
}
