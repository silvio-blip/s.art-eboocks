import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Polyfill for Deno 2.0
if (!(Deno as any).writeAll) {
  Object.defineProperty(Deno, "writeAll", {
    value: async (w: any, data: Uint8Array) => {
      let nwritten = 0;
      while (nwritten < data.length) {
        const n = await w.write(data.subarray(nwritten));
        if (n === null) throw new Error("Deno.writeAll: unexpected EOF");
        nwritten += n;
      }
    },
    writable: true,
    configurable: true,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const smtpHostname = Deno.env.get("SMTP_HOSTNAME") || "smtp.gmail.com";
    const smtpUser = Deno.env.get("SMTP_USER") || "silviok5000@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS") || "sziofpaflypbjbce";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");

    const { record } = await req.json();
    const email = record.email;
    const name = record.raw_user_meta_data?.full_name || "Membro";
    const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
    const siteUrl = Deno.env.get("SITE_URL") || "https://ais-dev-ofdxkoy6wmjezzmm67xzxa-96926789601.europe-west2.run.app";

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
          body { margin: 0; padding: 0; background-color: #000000; -webkit-text-size-adjust: 100%; }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #000000; color: #ffffff; font-family: 'Playfair Display', serif; -webkit-font-smoothing: antialiased;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000000;">
          <tr>
            <td align="center" style="padding: 120px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border: 1px solid #1a1a1a; background-color: #000000; box-shadow: 0 40px 100px rgba(0,0,0,0.8);">
                <tr>
                  <td align="center" style="padding: 100px 40px 80px 40px;">
                    <div style="border-bottom: 2px solid #d4af37; padding-bottom: 40px; width: 120px;">
                      <h1 style="margin: 0; font-size: 48px; letter-spacing: 28px; text-transform: uppercase; color: #ffffff; font-weight: 400; margin-right: -28px;">S.ART</h1>
                    </div>
                    <p style="margin: 30px 0 0 0; font-size: 9px; letter-spacing: 8px; text-transform: uppercase; color: #d4af37; font-family: 'Segoe UI', Arial, sans-serif; opacity: 0.8;">Boutique d'Élite &bullet; Paris</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 80px 70px 80px;">
                    <div style="width: 30px; height: 1px; background-color: #333; margin-bottom: 40px;"></div>
                    <p style="margin: 0; font-size: 11px; letter-spacing: 4px; color: #666666; text-transform: uppercase; font-family: 'Segoe UI', Arial, sans-serif;">${date}</p>
                    <p style="margin: 20px 0 0 0; font-size: 13px; letter-spacing: 4px; color: #666666; text-transform: uppercase; font-family: 'Segoe UI', Arial, sans-serif;">Bienvenue</p>
                    <h2 style="margin: 45px 0 40px 0; font-size: 32px; color: #ffffff; font-style: italic; font-weight: 400; line-height: 1.3; letter-spacing: 1px;">
                      Boas-vindas ao Atelier S.ART
                    </h2>
                    <p style="margin: 0; font-size: 16px; line-height: 2.4; color: #a1a1a1; text-align: center; font-weight: 300;">
                      Prezado(a) <strong>${name}</strong>, é um privilégio recebê-lo(a) no nosso círculo restrito. A partir deste momento, o seu acesso à curadoria de arte digital e design de alta-costura está plenamente autenticado.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 80px 70px 80px;">
                    <div style="background-color: #080808; border: 1px solid #222; padding: 60px 40px; text-align: center; border-radius: 4px;">
                       <p style="margin: 0 0 35px 0; font-size: 15px; color: #d4af37; font-family: 'Playfair Display', serif; font-style: italic; opacity: 0.9; line-height: 1.6;">
                         "A arte não é o que você vê, mas o que você faz os outros verem."
                       </p>
                       <a href="${siteUrl}" style="display: inline-block; padding: 18px 45px; background-color: transparent; border: 1px solid #d4af37; color: #d4af37; text-decoration: none; text-transform: uppercase; font-size: 10px; letter-spacing: 5px; font-family: 'Segoe UI', Arial, sans-serif; font-weight: 600; transition: all 0.4s ease;">
                         Aceder ao Atelier
                       </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 80px 100px 80px;">
                    <p style="margin: 0; font-size: 12px; color: #555555; line-height: 2.2; font-family: 'Segoe UI', Arial, sans-serif;">
                      O seu registo de membro foi processado com distinção. Convidamo-lo(a) a explorar o nosso portfólio digital e a desfrutar da exclusividade que define a essência S.ART.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 60px 40px; background-color: #050505; border-top: 1px solid #111;">
                    <p style="margin: 0; font-size: 9px; letter-spacing: 6px; text-transform: uppercase; color: #222222; font-family: 'Segoe UI', Arial, sans-serif;">
                      S.ART ATELIER &bull; PARIS &bull; LISBOA &bull; MILÃO
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const client = new SmtpClient();
    await client.connectTLS({ hostname: smtpHostname, port: smtpPort, username: smtpUser, password: smtpPass });
    
    await client.send({
      from: smtpUser,
      to: email,
      subject: "Bem-vindo à S.ART Boutique - Curadoria de Elite",
      html: emailHtml,
    });

    await client.close();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
