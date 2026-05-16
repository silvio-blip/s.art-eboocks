// Vercel Edge Middleware - Standard Web APIs (No Next.js needed)
export const config = {
  matcher: ['/'],
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
  
  // Extração do ID do parâmetro ?product=
  const productId = url.searchParams.get('product');

  if (isBot && productId) {
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return new Response(null, { status: 302, headers: { 'Location': url.pathname + url.search } });
      }

      const supabaseRes = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=title,description,image_url`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
          },
        }
      );

      if (!supabaseRes.ok) return new Response(null, { status: 302, headers: { 'Location': url.pathname + url.search } });

      const products = await supabaseRes.json();
      const product = Array.isArray(products) && products.length > 0 ? products[0] : null;

      if (product) {
        const title = (product.title || "S.art | Exclusive Boutique").replace(/"/g, '&quot;');
        const description = (product.description || "Descubra esta peça exclusiva na S.art.").replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
        const image = product.image_url || 'https://sart-full.pt/og-default.jpg';
        
        const html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url.toString()}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:site_name" content="S.art">
    <meta http-equiv="refresh" content="0;url=${url.toString()}">
</head>
<body>
    <p>A carregar produto: ${title}...</p>
</body>
</html>`;

        return new Response(html, {
          headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600'
          },
        });
      }
    } catch (error) {
      console.error('[MIDDLEWARE OG ERROR]', error);
    }
  }

  // Em middleware Vercel padrão (não-Next), se retornar nada, ele segue para o próximo passo (render da original)
  // Mas para ser explícito, podemos retornar null se for suportado ou apenas deixar passar.
  // No Vercel, o middleware pode retornar um Response ou não retornar nada para seguir.
  return undefined; 
}
