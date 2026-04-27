import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verificar se o utilizador existe
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();

    const targetUser = userData?.users?.find((u: any) => u.email === normalizedEmail);

    if (userError || !targetUser) {
      console.log(`Utilizador não encontrado: ${normalizedEmail}`);
      return new Response(JSON.stringify({ error: "Email não encontrado no sistema." }), { 
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. Gerar e salvar código
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars
    const recoveryCode = Array.from({ length: 16 }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');

    const { error: dbError } = await supabase
      .from("password_recovery_codes")
      .insert([{ 
        email: normalizedEmail, 
        code: recoveryCode, 
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        used: false
      }]);

    if (dbError) throw dbError;

    // 3. Enviar e-mail via Nodemailer (Muito mais estável)
    const smtpHost = Deno.env.get("SMTP_HOSTNAME");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      console.error("Configurações SMTP ausentes no ambiente.");
      return new Response(JSON.stringify({ error: "Configuração do servidor de e-mail incompleta." }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

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
      <body style="margin: 0; padding: 0; background-color: #000000; color: #ffffff; font-family: 'Playfair Display', serif; -webkit-font-smoothing: antialiased;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000000;">
          <tr>
            <td align="center" style="padding: 120px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border: 1px solid #1a1a1a; background-color: #000000; box-shadow: 0 50px 100px rgba(0,0,0,0.9);">
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
                    <p style="margin: 0; font-size: 11px; letter-spacing: 4px; color: #666666; text-transform: uppercase; font-family: 'Segoe UI', Arial, sans-serif;">Avis Confidentiel</p>
                    <h2 style="margin: 45px 0 40px 0; font-size: 28px; color: #ffffff; font-style: italic; font-weight: 400; line-height: 1.4; letter-spacing: 1px;">
                      Restauration de l'Accès au Profil
                    </h2>
                    <p style="margin: 0; font-size: 16px; line-height: 2.4; color: #a1a1a1; text-align: center; font-weight: 300;">
                      Para preservar a integridade da sua presença na <strong>maison S.ART</strong>, foi gerada uma nova chave de segurança. Este procedimento garante que apenas o legítimo detentor da curadoria possa aceder ao atelier.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 80px 70px 80px;">
                    <div style="background-color: #080808; border: 1px solid #222; padding: 70px 40px; border-radius: 4px;">
                       <p style="margin: 0 0 35px 0; font-size: 10px; letter-spacing: 6px; text-transform: uppercase; color: #d4af37; font-family: 'Segoe UI', Arial, sans-serif; font-weight: 600;">Código de Verificação de 16 Dígitos</p>
                       <div style="font-size: 32px; font-weight: 600; letter-spacing: 14px; font-family: 'Courier New', monospace; color: #ffffff; text-shadow: 0 0 30px rgba(212,175,55,0.3); margin-right: -14px; word-break: break-all;">
                         ${recoveryCode}
                       </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 80px 100px 80px;">
                    <p style="margin: 0; font-size: 12px; color: #555555; line-height: 2.2; font-family: 'Segoe UI', Arial, sans-serif;">
                      Este código de uso único expira em <strong style="color: #d4af37; letter-spacing: 1px;">15 MINUTOS</strong>. <br> Caso não tenha solicitado esta chave, por favor ignore esta mensagem.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 60px 40px; background-color: #050505; border-top: 1px solid #111;">
                    <p style="margin: 0; font-size: 9px; letter-spacing: 6px; text-transform: uppercase; color: #222222; font-family: 'Segoe UI', Arial, sans-serif;">
                      S.ART ATELIER &bull; PARIS &bull; GENÈVE &bull; MILANO
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

    await transporter.sendMail({
      from: Deno.env.get("SMTP_USER"),
      to: normalizedEmail,
      subject: "S.ART Boutique - Código de Acesso",
      html: htmlContent,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Erro interno:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

