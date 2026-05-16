// Vercel Edge Middleware - Hard Stop for Bots
export const config = {
  // Captura a raiz e todas as rotas de produto
  matcher: ['/((?!api|_next|static|assets|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};

const BOT_REGEX = /facebookexternalhit|whatsapp|twitterbot|discordbot|telegrambot|facebot|slurp|ia_archiver|bingbot|linkedinbot|googlebot|developers.facebook.com/i;

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  const isBot = BOT_REGEX.test(userAgent);
  
  // Extração do ID (suporta ?product=ID e ?v=product-detail&product=ID)
  const productId = url.searchParams.get('product');

  // LOG PARA DEBUG (Ver nos logs da Vercel)
  console.log(`[EDGE] UA: ${userAgent.substring(0, 40)} | Bot: ${isBot} | ID: ${productId}`);

  // SE NÃO FOR BOT OU NÃO TIVER ID, SEGUE NORMAL
  if (!isBot || !productId) {
    return undefined;
  }

  // A PARTIR DAQUI: É BOT E TEM PRODUTO. NÃO HÁ VOLTA ATRÁS.
  let title = "S.art | Boutique Premium";
  let description = "Curadoria de Luxo - Descubra esta peça exclusiva na S.art.";
  let image = 'https://sart-full.pt/og-default.jpg';
  let status = 'default';

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const dbRes = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=title,description,image_url`,
        {
          cache: 'no-store',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
          }
        }
      );

      if (dbRes.ok) {
        const products = await dbRes.json();
        const product = Array.isArray(products) ? products[0] : null;
        if (product) {
          title = (product.title || title).replace(/"/g, '&quot;');
          description = (product.description || description).replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
          image = product.image_url || image;
          status = 'success';
        } else {
          status = 'not-found';
        }
      } else {
        status = 'db-error';
      }
    }
  } catch (err) {
    console.error("[EDGE ERROR]", err);
    status = 'error';
  }

  // Montagem da URL absoluta para os bots
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
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="S.art">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${image}">
    <meta http-equiv="refresh" content="0;url=${absoluteUrl}">
</head>
<body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;margin:0;">
    <div style="text-align:center;">
        <p>A carregar: ${title}...</p>
        <script>window.location.href = "${absoluteUrl}";</script>
    </div>
</body>
</html>`;

  console.log(`[HARD STOP] Serving ${status} content for ${productId}`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Vary': 'User-Agent',
      'X-OG-Edge': 'true'
    }
  });
}
