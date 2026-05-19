import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const productId = req.query.product as string || req.query.id as string;

  if (!productId) {
    return res.status(400).send('Product ID required');
  }

  try {
    // In Vercel, these should be set in the project settings
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[OG] Missing Supabase config');
      return res.status(500).send('Server configuration error');
    }

    // Fetch product data directly using fetch for maximum speed and Edge compatibility
    const supabaseRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=id,title,description,image_url`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!supabaseRes.ok) {
      const errorMsg = await supabaseRes.text();
      console.error('[OG] DB Fetch failed:', errorMsg);
      // If DB fails, we still want to show the site but generic
      return res.status(200).send('<!-- DB Error -->');
    }

    const products = await supabaseRes.json();
    const product = Array.isArray(products) && products.length > 0 ? products[0] : null;

    if (!product) {
      console.log(`[OG] Product not found: ${productId}`);
      return res.status(404).send('Produto não encontrado');
    }

    const title = (product.title || "S.art Boutique | Moda, Tendências e Lifestyle").replace(/"/g, '&quot;');
    const rawDescription = product.description || "Descubra a seleção inteligente da S.art. De vestuário e calçado a gadgets inovadores, reunimos as últimas tendências num só lugar. Qualidade, estilo e uma compra segura.";
    const description = rawDescription.replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
    const image = product.image_url || 'https://sart-full.pt/og-default.jpg';
    
    // Determine absolute URL for og:url
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'sart-full.pt';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const fullUrl = `${protocol}://${host}/?product=${productId}`;

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    
    <!-- WhatsApp extra hints -->
    <meta property="og:site_name" content="S.art">
    
    <!-- Redirection for non-bot agents that might end up here -->
    <meta http-equiv="refresh" content="0;url=/?product=${productId}">
</head>
<body>
    <p>A carregar produto: ${title}...</p>
    <script>window.location.href = "/?product=${productId}";</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(html);

  } catch (error) {
    console.error('[OG] Fatal error:', error);
    return res.status(500).send('Erro interno ao processar meta tags');
  }
}
