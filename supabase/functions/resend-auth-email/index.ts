// supabase/functions/resend-auth-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const smtpHostname = Deno.env.get("SMTP_HOSTNAME") || "smtp.gmail.com";
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");

    if (!smtpUser || !smtpPass) {
       // Se não houver SMTP configurado ainda, mostramos o erro mas não bloqueamos o boot
       throw new Error("SMTP credentials not configured in Supabase secrets.");
    }

    const payload = await req.json()
    const { email, token, token_hash, type, redirect_to } = payload

    // O Supabase envia 'token' se for OTP de 6 dígitos (precisa estar ativado no Dashboard)
    // Se não for OTP, usamos o token_hash para construir o link
    const isOTP = token && token.length === 6 && /^\d+$/.test(token)
    const resetUrl = isOTP ? null : `${redirect_to}?token_hash=${token_hash}&type=${type}`

    let subject = 'Autenticação Digital | S.art Atelier'
    let title = 'Portal de Acesso'
    let message = 'Aqui está o seu link de acesso exclusivo ao Atelier.'
    let actionText = 'ACEDER AO ATELIER'
    let actionUrl = resetUrl

    if (type === 'recovery') {
      subject = 'Recuperação de Acesso | S.art Atelier'
      title = 'Recuperar Senha'
      if (isOTP) {
        message = 'Utilize o código de 6 dígitos abaixo para redefinir a sua password diretamente no Atelier.'
        actionText = token // Mostramos o código
      } else {
        message = 'Recebemos um pedido para redefinir a sua palavra-passe. Clique no botão abaixo para prosseguir.'
        actionText = 'REDEFINIR AGORA'
      }
    } else if (type === 'signup') {
      subject = 'Bem-vindo à Boutique S.art'
      title = 'Confirmar Registo'
      message = 'Obrigado por se juntar à nossa curadoria. Confirme o seu e-mail para desbloquear a sua biblioteca.'
      actionText = isOTP ? token : 'CONFIRMAR E-MAIL'
    }

    const client = new SmtpClient();
    await client.connectTLS({ hostname: smtpHostname, port: smtpPort, username: smtpUser, password: smtpPass });
    
    await client.send({
      from: smtpUser!,
      to: email,
      subject: subject,
      html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { margin: 0; padding: 0; background-color: #000000; font-family: 'serif', 'Georgia', serif; }
                .container { max-width: 600px; margin: 0 auto; color: #ffffff; padding: 60px 40px; text-align: center; }
                .logo { font-size: 32px; letter-spacing: 12px; margin-bottom: 40px; color: #ffffff; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 20px; }
                .title { font-size: 20px; letter-spacing: 2px; color: #D4AF37; margin-bottom: 30px; text-transform: uppercase; }
                .message { font-size: 14px; line-height: 1.8; color: #a1a1a1; margin-bottom: 40px; font-style: italic; }
                .action-box {
                  padding: 30px;
                  border: 1px solid rgba(212, 175, 55, 0.2);
                  display: inline-block;
                  margin: 20px 0;
                }
                .otp-code {
                  font-size: 36px;
                  letter-spacing: 15px;
                  color: #D4AF37;
                  font-weight: bold;
                  font-family: monospace;
                }
                .button { 
                  display: inline-block; 
                  background-color: #D4AF37; 
                  color: #000000 !important; 
                  padding: 20px 40px; 
                  text-decoration: none; 
                  font-size: 11px; 
                  font-weight: bold; 
                  letter-spacing: 3px; 
                  text-transform: uppercase;
                }
                .footer { margin-top: 60px; font-size: 9px; color: #444; letter-spacing: 1px; line-height: 1.6; }
                .security { color: #555; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo">S.art</div>
                <div class="title">${title}</div>
                <p class="message">${message}</p>
                
                <div class="action-box">
                  ${isOTP ? `
                    <div class="otp-code">${token}</div>
                  ` : `
                    <a href="${actionUrl}" class="button">${actionText}</a>
                  `}
                </div>
                
                <div class="footer">
                  <p class="security">Este código/link é exclusivo e expira em breve. <br> Se não solicitou isto, ignore este e-mail por segurança.</p>
                  <p style="margin-top: 30px;">S.art Studio © 2024 | Excellence in Digital Curation</p>
                </div>
              </div>
            </body>
          </html>
        `,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
