import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email } = req.body;
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    console.log(`[RECOVERY VERCEL] Requesting recovery for: ${email}`);
    
    const { data, error } = await supabase.functions.invoke('reset-password', {
      body: { email }
    });

    if (error) {
      console.error(`[RECOVERY VERCEL ERROR] Chamada falhou:`, error);
      let errorMessage = "Erro na Edge Function de recuperação.";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      if ((error as any).context) {
        try {
          const bodyText = await (error as any).context.text();
          const bodyJson = JSON.parse(bodyText);
          errorMessage = bodyJson.error || bodyJson.message || errorMessage;
        } catch (e) {
          // ignore
        }
      }
      
      return res.status(500).json({ error: errorMessage });
    }
    
    res.json(data);
  } catch (error: any) {
    console.error(`[RECOVERY VERCEL FATAL]`, error);
    res.status(500).json({ error: error.message });
  }
}
