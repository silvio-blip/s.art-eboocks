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
    
    console.log(`[RECOVERY API] Requesting recovery for: ${email}`);
    
    // Invocação da Edge Function 'reset-password'
    const { data, error } = await supabase.functions.invoke('reset-password', {
      body: { email: email.trim() }
    });

    if (error) {
      console.error(`[RECOVERY API ERROR] Function call failed:`, error);
      
      let errorMessage = "Erro na função de recuperação.";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      if ((error as any).context) {
        try {
          const bodyText = await (error as any).context.text();
          const bodyJson = JSON.parse(bodyText);
          errorMessage = bodyJson.error || bodyJson.message || errorMessage;
        } catch (e) {
          console.error("[RECOVERY API] Failed to parse error body:", e);
        }
      }
      
      return res.status(500).json({ error: errorMessage });
    }
    
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(`[RECOVERY API FATAL]`, error);
    return res.status(500).json({ error: error.message });
  }
}
