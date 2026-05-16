// Vercel Edge Middleware - Intercepção Total para Bots
export const config = {
  // Captura tudo para garantir que o middleware corre sempre
  matcher: ['/:path*'],
};

const BOT_REGEX = /facebookexternalhit|whatsapp|twitterbot|discordbot|telegrambot|facebot|slurp|ia_archiver|bingbot|linkedinbot|googlebot|developers.facebook.com/i;

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  
  // Ignorar ficheiros estáticos e API rapidamente
  if (
    url.pathname.includes('.') || 
    url.pathname.startsWith('/api') || 
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/static') ||
    url.pathname.startsWith('/assets')
  ) {
    return undefined;
  }

  const isBot = BOT_REGEX.test(userAgent);
  const productId = url.searchParams.get('product');

  // DEBUG LOG - Verifique isto nos logs do Vercel
  console.log(`[EDGE-DB] Bot: ${isBot} | Product: ${productId} | UA: ${userAgent.substring(0, 30)}`);

  if (isBot && productId) {
    let title = "S.art | Boutique Premium";
    let description = "Curadoria de Luxo - Descubra esta peça exclusiva na S.art.";
    let image = 'https://sart-full.pt/og-default.jpg';

    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        title = "DEBUG: Falta a variável ENV do Supabase";
      } else {
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
          const product = products?.[0];
          if (product) {
            title = (product.title || title).replace(/"/g, '&quot;');
            description = (product.description || description).replace(/"/g, '&quot;').replace(/\n/g, ' ').substring(0, 200);
            image = product.image_url || image;
          } else {
            title = "DEBUG: Produto ID não encontrado na BD";
          }
        } else {
          title = `DEBUG: Erro de Fetch ao Supabase (Status ${dbRes.status})`;
        }
      }
    } catch (err) {
      title = "DEBUG: Erro fatal no Middleware";
      console.error("[EDGE-FETCH-ERROR]", err);
    }

    console.log(`[EDGE-GATE] Bot: ${isBot} | Product: ${productId} | Final Title: ${title}`);

    const host = req.headers.get('host') || 'sart-full.pt';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const absoluteUrl = `${protocol}://${host}${url.pathname}${url.search}`;

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="fb:app_id" content="">
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
<body style="background:#000;color:#fff;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
    <div style="text-align:center;">
        <p>A carregar: ${title}...</p>
        <script>window.location.href = "${absoluteUrl}";</script>
    </div>
</body>
</html>`;

    // Resposta IMEDIATA e FINAL
    const response = new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Vary': '*', // Força o Edge Cache a ignorar este objeto
        'X-Robots-Tag': 'noarchive',
        'X-Edge-Debug': 'active',
        'Accept-Ranges': 'none'
      },
    });

    return response;
  }

  return undefined;
}
