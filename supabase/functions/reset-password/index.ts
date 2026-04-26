import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
};

// Polyfill para Deno 2.0 (necessário para bibliotecas SMTP antigas)
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
    const { email } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const recoveryCode = Array.from({ length: 15 }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');

    const normalizedEmail = email.trim().toLowerCase();

    // 0. Verificar se o utilizador existe
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    const targetUser = userData?.users?.find((u: any) => u.email === normalizedEmail);

    if (userError || !targetUser) {
      console.log(`Utilizador não encontrado: ${normalizedEmail}`);
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. Salvar na tabela (expira em 15 minutos)
    const { error: dbError } = await supabase
      .from("password_recovery_codes")
      .insert([
        { 
          email: normalizedEmail, 
          code: recoveryCode, 
          expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
          used: false
        }
      ]);

    if (dbError) throw dbError;

    // 3. Enviar e-mail via SMTP (Preferencialmente via Secrets)
    const smtpHostname = Deno.env.get("SMTP_HOSTNAME") || "smtp.gmail.com";
    const smtpUser = Deno.env.get("SMTP_USER") || "silviok5000@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS") || "sziofpaflypbjbce";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");

    console.log(`Iniciando conexão SMTP para: ${normalizedEmail}`);
    const client = new SmtpClient();
    try {
      await client.connectTLS({
        hostname: smtpHostname,
        port: smtpPort,
        username: smtpUser,
        password: smtpPass,
      });
    } catch (smtpError: any) {
      console.error("Erro na conexão SMTP:", smtpError);
      throw new Error(`Falha SMTP: ${smtpError.message}`);
    }

    const htmlContent = `
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
                      <p style="margin: 20px 0 0 0; font-size: 8px; letter-spacing: 6px; text-transform: uppercase; color: #d4af37; font-family: Arial, sans-serif;">Protocolos de Segurança Exclusivos</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 60px 60px;">
                    <p style="margin: 0; font-size: 13px; letter-spacing: 3px; color: #555555; text-transform: uppercase; font-family: Arial, sans-serif;">notificação confidencial</p>
                    <h2 style="margin: 40px 0 30px 0; font-size: 24px; color: #ffffff; font-style: italic; font-weight: 400; line-height: 1.5;">
                      Verificação de Integridade de Perfil
                    </h2>
                    <p style="margin: 0; font-size: 15px; line-height: 2.2; color: #999999; text-align: center; font-weight: 300;">
                      Para preservar a aura de exclusividade da sua conta na boutique S.ART, iniciámos um procedimento de autenticação. Este código é a chave única e temporária para o restauro das suas credenciais de acesso.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 60px 60px;">
                    <div style="background-color: #050505; border: 1px solid #222; padding: 60px 30px;">
                       <p style="margin: 0 0 25px 0; font-size: 9px; letter-spacing: 4px; text-transform: uppercase; color: #d4af37; font-family: Arial, sans-serif;">Chave Alfanumérica de 15 Caracteres</p>
                       <div style="font-size: 28px; font-weight: bold; letter-spacing: 12px; font-family: 'Courier New', monospace; color: #ffffff; text-shadow: 0 0 20px rgba(212,175,55,0.2);">
                         ${recoveryCode}
                       </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 60px 80px 60px;">
                    <p style="margin: 0; font-size: 11px; color: #444444; line-height: 2; font-family: Arial, sans-serif;">
                      Este protocolo expira em <strong style="color: #d4af37;">15 MINUTOS</strong>. <br> A S.ART nunca solicita este código por vias externas ao nosso portal oficial de segurança. Trate esta informação como estritamente privada.
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

    await client.send({
      from: smtpUser,
      to: email,
      subject: "S.ART Boutique - Código de Acesso Exclusivo",
      html: htmlContent,
    });

    await client.close();
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
