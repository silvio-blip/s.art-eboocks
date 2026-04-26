import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from './server-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, bookId, lastPage, totalPages, annotations } = req.body;

  if (!userId || !bookId) {
    return res.status(400).json({ error: 'Missing userId or bookId' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  try {
    const upsertData: any = {
      user_id: userId,
      book_id: bookId,
      last_page_read: lastPage,
      updated_at: new Date().toISOString()
    };

    if (typeof totalPages === 'number') {
      upsertData.total_pages = totalPages;
    }

    if (annotations) {
      upsertData.annotations = annotations;
    }

    const { data, error } = await supabase
      .from('user_reading_progress')
      .upsert(upsertData, { onConflict: 'user_id,book_id' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[SAVE STATE ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
