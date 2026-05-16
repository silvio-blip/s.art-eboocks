// api/bot.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { product } = req.query;
  const productId = Array.isArray(product) ? product[0] : (product as string);

  // Padrões de Luxo
  let title = "S.art | Boutique Premium";
  let description = "Curadoria de Luxo - Descubra esta peça exclusiva na S.art.";
  let image = 'https://sart-full.pt/og-default.jpg';
  
  const host = (req.headers['host'] as string) || 'sart-full.pt';
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
  const absoluteUrl = `${protocol}://${host}${req.url}`;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (productId) {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const fetchUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=title,description,image_url`;
        const dbRes = await fetch(fetchUrl, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
          }
        });

        if (dbRes.ok) {
          const products = await dbRes.json();
          const productData = products?.[0];
          if (productData) {
            title = (productData.title || title).replace(/[<>"/]/g, '');
            description = (productData.description || description)
              .replace(/\n/g, ' ')
              .replace(/[<>"/]/g, '')
              .substring(0, 160) + '...';
            image = productData.image_url || image;
          }
        }
      } catch (err) {
        console.error("[BOT-FUNCTION-ERROR]", err);
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${absoluteUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="S.art">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
</head>
<body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
    <div style="text-align:center;">
        <p>A redirecionar: ${title}...</p>
        <script>window.location.href = "/?v=product-detail&product=${productId || ''}";</script>
    </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
  return res.status(200).send(html);
}
