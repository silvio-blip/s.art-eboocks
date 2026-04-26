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

    const body = await req.json();
    console.log("Recebido payload:", JSON.stringify(body, null, 2));

    // Supabase Webhooks enviam o registro no campo 'record'
    const { record } = body;
    if (!record || !record.email) {
      console.error("Payload inválido - Record em falta");
      return new Response(JSON.stringify({ error: "Payload inválido: campo 'record' ou 'email' em falta." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const email = record.email;
    const metadata = record.raw_user_meta_data || {};
    const name = metadata.full_name || "Membro";
    const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
    const siteUrl = Deno.env.get("SITE_URL") || "https://sart-full.pt";

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
      <body style="margin: 0; padding: 0; background-color: #000000; color: #ffffff; font-family: 'Playfair Display', serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000000;">
          <tr>
            <td align="center" style="padding: 100px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border: 1px solid #1a1a1a; background-color: #000000;">
                <tr>
                  <td align="center" style="padding: 80px 40px 60px 40px;">
                    <div style="border-bottom: 1px solid #d4af37; padding-bottom: 30px; width: 80%;">
                      <h1 style="margin: 0; font-size: 45px; letter-spacing: 25px; text-transform: uppercase; color: #ffffff; font-weight: 400;">S.ART</h1>
                      <p style="margin: 20px 0 0 0; font-size: 8px; letter-spacing: 6px; text-transform: uppercase; color: #d4af37; font-family: Arial, sans-serif;">Curadoria Digital de Elite</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 60px 60px;">
                    <p style="margin: 0; font-size: 11px; letter-spacing: 3px; color: #555555; text-transform: uppercase; font-family: Arial, sans-serif;">${date}</p>
                    <p style="margin: 20px 0 0 0; font-size: 13px; letter-spacing: 3px; color: #555555; text-transform: uppercase; font-family: Arial, sans-serif;">bienvenue</p>
                    <h2 style="margin: 40px 0 30px 0; font-size: 24px; color: #ffffff; font-style: italic; font-weight: 400; line-height: 1.5;">
                      Boas-vindas ao Atelier S.ART
                    </h2>
                    <p style="margin: 0; font-size: 15px; line-height: 2.2; color: #999999; text-align: center; font-weight: 300;">
                      Prezado(a) <strong>${name}</strong>, é com imenso prazer que o(a) recebemos na nossa boutique digital. A partir de agora, tem acesso exclusivo à nossa curadoria de arte e design de luxo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 60px 60px;">
                    <div style="background-color: #050505; border: 1px solid #222; padding: 40px; text-align: center;">
                       <p style="margin: 0 0 30px 0; font-size: 14px; color: #d4af37; font-family: 'Times New Roman', serif; font-style: italic;">
                         "A arte não é o que você vê, mas o que você faz os outros verem."
                       </p>
                       <a href="${siteUrl}" style="display: inline-block; padding: 15px 40px; background-color: #ffffff; border: 1px solid #ffffff; color: #000000; text-decoration: none; text-transform: uppercase; font-size: 10px; letter-spacing: 4px; font-family: Arial, sans-serif; font-weight: bold;">
                         Explorar Coleção
                       </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 80px 60px;">
                    <p style="margin: 0; font-size: 11px; color: #444444; line-height: 2; font-family: Arial, sans-serif;">
                      O seu registo foi concluído com sucesso. Explore o nosso portfólio e sinta a essência do design contemporâneo diretamente do seu painel de membro.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 50px 40px; background-color: #030303; border-top: 1px solid #111;">
                    <p style="margin: 0; font-size: 8px; letter-spacing: 4px; text-transform: uppercase; color: #222222; font-family: Arial, sans-serif;">
                      S.ART ATELIER DIGITAL &bull; PARIS &bull; LISBOA &bull; MILÃO
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
