// Vercel Edge Middleware - Standard Web APIs
export const config = {
  // Capture the root and any sub-path, excluding static assets and API
  matcher: ['/((?!api|assets|_next|favicon.ico|robots.txt).*)'],
};

const BOT_AGENTS = [
  'facebookexternalhit',
  'whatsapp',
  'twitterbot',
  'discordbot',
  'telegrambot',
  'facebot',
  'slurp',
  'ia_archiver'
];

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent')?.toLowerCase() || '';
  
  const isBot = BOT_AGENTS.some(bot => userAgent.includes(bot));
  const productId = url.searchParams.get('product');

  if (isBot && productId) {
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return undefined; 
      }

      const res = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=title,description,image_url`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!res.ok) return undefined;

      const products = await res.json();
      const product = Array.isArray(products) && products.length > 0 ? products[0] : null;

      if (product) {
        const title = (product.title || "S.art | Exclusive Boutique").replace(/"/g, '&quot;');
        const description = (product.description || "Descubra esta peça exclusiva na S.art.").replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
        const image = product.image_url || 'https://sart-full.pt/og-default.jpg';
        
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('host') || 'sart-full.pt';
        const absoluteUrl = `${protocol}://${host}${url.pathname}${url.search}`;

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
    <meta property="og:site_name" content="S.art">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${image}">
    <meta http-equiv="refresh" content="0;url=${absoluteUrl}">
</head>
<body>
    <p>A carregar: ${title}...</p>
</body>
</html>`;

        return new Response(html, {
          headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600'
          },
        });
      }
    } catch (e) {
      console.error('[OG MIDDLEWARE ERROR]', e);
    }
  }

  return undefined; 
}

