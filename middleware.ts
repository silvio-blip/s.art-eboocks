export const config = {
  matcher: ['/((?!api|_next|static|assets|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};

const BOT_REGEX = /facebookexternalhit|whatsapp|twitterbot|discordbot|telegrambot|facebot|slurp|ia_archiver|bingbot|linkedinbot|googlebot/i;

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  const isBot = BOT_REGEX.test(userAgent);
  const productId = url.searchParams.get('product');

  if (!isBot || !productId) return undefined;

  let title = "DEBUG: A iniciar...";
  let desc = "";

  // Forçamos a leitura de todas as variantes possíveis das tuas chaves
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    title = "ERRO: A Vercel está CEGA e não lê as chaves ENV!";
  } else {
    try {
      // ATENÇÃO: Se a tua tabela no Supabase não se chamar "products", muda aqui!
      const fetchUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/products?id=eq.${productId}&select=*`;
      
      const res = await fetch(fetchUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (!res.ok) {
        title = `ERRO DB: Status ${res.status}`;
        desc = await res.text();
      } else {
        const data = await res.json();
        if (data && data.length > 0) {
          title = "SUCESSO: Leu da Base de Dados!";
          // Vai mostrar o nome verdadeiro da coluna se existir
          desc = JSON.stringify(data[0]).substring(0, 150); 
        } else {
          title = "ERRO: Produto não existe com este ID";
        }
      }
    } catch (error) {
      title = "ERRO FATAL NO FETCH";
      desc = String(error);
    }
  }

  const html = `<!DOCTYPE html>
  <html lang="pt">
  <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
  </head>
  <body><h1>${title}</h1><p>${desc}</p></body>
  </html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}