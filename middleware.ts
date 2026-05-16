// Vercel Edge Middleware - Hard Stop for Bots to prevent Cache 206
export const config = {
  // Capture all routes to ensure middleware always runs
  matcher: ['/((?!api|_next|static|assets|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)', '/'],
};

const BOT_REGEX = /facebookexternalhit|whatsapp|twitterbot|discordbot|telegrambot|facebot|slurp|ia_archiver|bingbot|linkedinbot|googlebot|developers.facebook.com/i;

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  const isBot = BOT_REGEX.test(userAgent);
  const productId = url.searchParams.get('product');
  const rangeHeader = req.headers.get('range');

  // LOG PARA DEBUG (Crucial para ver nos logs da Vercel)
  console.log(`[EDGE] Bot: ${isBot} | ID: ${productId} | Range: ${rangeHeader} | UA: ${userAgent.substring(0, 40)}`);

  // Se não for bot ou não tiver ID, deixa o Vercel servir o estático normalmente
  if (!isBot || !productId) {
    return undefined;
  }

  // A partir daqui: RESPOSTA FORÇADA PARA BOTS
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
          cache: 'no-store', // Fura o cache do backend
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
    console.error(`[EDGE FETCH ERROR] ${err}`);
    status = 'error';
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
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="S.art">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${image}">
    <meta http-equiv="refresh" content="0;url=${absoluteUrl}">
</head>
<body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
    <div style="text-align:center;">
        <p>A carregar: ${title}...</p>
        <script>window.location.href = "${absoluteUrl}";</script>
    </div>
</body>
</html>`;

  console.log(`[HARD STOP] Status: ${status} | Serving bot response for ${productId}`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Accept-Ranges': 'none',
      'Vary': '*', // Crucial para furar cache de Edge
      'X-Robots-Tag': 'noarchive',
      'X-OG-Edge': 'intercept'
    }
  });
}

