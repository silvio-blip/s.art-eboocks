// Vercel Edge Middleware - Standard Web APIs
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
  'ia_archiver',
  'bingbot',
  'linkedinbot',
  'googlebot'
];

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = (req.headers.get('user-agent') || '').toLowerCase();
  
  // Extração direta do 'product'
  const productId = url.searchParams.get('product');
  const isBot = BOT_AGENTS.some(bot => userAgent.includes(bot));

  // Se não for bot ou não tiver produto, deixa a Vercel servir o index.html normal
  if (!isBot || !productId) {
    return undefined;
  }

  // A partir daqui, SÓ para Bots com Produto
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[OG Middleware] Missing Supabase keys');
      return undefined;
    }

    // Tenta buscar o produto
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

    let title = "S.art | Exclusive Boutique";
    let description = "Descubra luxo e exclusividade na S.art Boutique Premium.";
    let image = 'https://sart-full.pt/og-default.jpg';

    if (res.ok) {
      const products = await res.json();
      const product = Array.isArray(products) && products.length > 0 ? products[0] : null;
      if (product) {
        title = (product.title || title).replace(/"/g, '&quot;');
        description = (product.description || description).replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
        image = product.image_url || image;
      }
    }

    const host = req.headers.get('host') || 'sart-full.pt';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
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
    <script>window.location.href = "${absoluteUrl}";</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=0, must-revalidate',
        'Vary': 'User-Agent',
        'X-OG-Status': res.ok ? 'success' : 'db-error'
      },
    });

  } catch (error) {
    console.error('[OG Fatal Error]', error);
    return undefined;
  }
}


