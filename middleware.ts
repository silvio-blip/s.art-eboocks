// Vercel Edge Middleware - Hard Stop for Bots
export const config = {
  // Capture all routes except API and typical static extensions
  matcher: ['/((?!api|_next|static|assets|favicon.ico|robots.txt|sitemap.xml).*)'],
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
  'googlebot',
  'developers.facebook.com'
];

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = (req.headers.get('user-agent') || '').toLowerCase();
  
  // Extração do Product ID
  const productId = url.searchParams.get('product');
  const isBot = BOT_AGENTS.some(bot => userAgent.includes(bot));

  // LOG DE DEBUG OBRIGATÓRIO (Visível nos logs da Vercel)
  console.log(`[DEBUG] UA: ${userAgent.substring(0, 50)}... | isBot: ${isBot} | productID: ${productId}`);

  // SE FOR BOT E TIVER PRODUTO: BLOQUEIO TOTAL (HARD STOP)
  if (isBot && productId) {
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase configuration");
      }

      // Fetch com timeout curto e no-store
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=title,description,image_url`,
        {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
          }
        }
      );
      clearTimeout(timeoutId);

      let title = "S.art | Boutique Premium";
      let description = "Curadoria de Luxo - Descubra esta peça exclusiva.";
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

      const htmlString = `<!DOCTYPE html>
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
<body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
    <div style="text-align: center;">
        <p>A carregar: ${title}...</p>
        <script>window.location.href = "${absoluteUrl}";</script>
    </div>
</body>
</html>`;

      console.log(`[SUCCESS] Bot ${userAgent.split('/')[0]} served for product ${productId}`);

      return new Response(htmlString, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Vary': 'User-Agent'
        },
      });

    } catch (err) {
      console.error("[ERROR] OG Fetch caught:", err);
      // HARD STOP Fallback: Se der erro, ainda devolvemos um HTML básico para o bot não ler lixo
      return new Response(`<!DOCTYPE html><html><head><title>S.art</title><meta property="og:title" content="S.art | Boutique Premium" /></head><body></body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }

  // Utilizador normal: deixa seguir (Vercel serve o index.html via rewrites ou direto)
  return undefined;
}
