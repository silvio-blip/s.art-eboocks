import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase credentials (URL or ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log('--- DB CHECK ---');
  const { data, error, count } = await supabase.from('products').select('*', { count: 'exact' });
  if (error) {
    console.error('Error fetching products:', error);
  } else {
    console.log(`Found ${count} products.`);
    if (data && data.length > 0) {
        console.log('Sample product:', data[0].title);
        console.log('Is Active:', data[0].is_active);
        console.log('Is Featured:', data[0].is_featured);
        console.log('Image URL:', data[0].image_url);
    }
    const featured = data?.filter(p => p.is_featured);
    console.log(`Featured products count: ${featured?.length || 0}`);
  }
}

check();
