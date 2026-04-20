// supabase/functions/resend-auth-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { email, token, token_hash, type, redirect_to } = payload

    // O Supabase envia 'token' se for OTP de 6 dígitos (precisa estar ativado no Dashboard)
    // Se não for OTP, usamos o token_hash para construir o link
    const isOTP = token && token.length === 6 && /^\d+$/.test(token)
    const resetUrl = isOTP ? null : `${redirect_to}?token_hash=${token_hash}&type=${type}`

    let subject = 'Autenticação Digital | S.Art Atelier'
    let title = 'Portal de Acesso'
    let message = 'Aqui está o seu link de acesso exclusivo ao Atelier.'
    let actionText = 'ACEDER AO ATELIER'
    let actionUrl = resetUrl

    if (type === 'recovery') {
      subject = 'Recuperação de Acesso | S.Art Atelier'
      title = 'Recuperar Senha'
      if (isOTP) {
        message = 'Utilize o código de 6 dígitos abaixo para redefinir a sua password diretamente no Atelier.'
        actionText = token // Mostramos o código
      } else {
        message = 'Recebemos um pedido para redefinir a sua palavra-passe. Clique no botão abaixo para prosseguir.'
        actionText = 'REDEFINIR AGORA'
      }
    } else if (type === 'signup') {
      subject = 'Bem-vindo à Boutique S.Art'
      title = 'Confirmar Registo'
      message = 'Obrigado por se juntar à nossa curadoria. Confirme o seu e-mail para desbloquear a sua biblioteca.'
      actionText = isOTP ? token : 'CONFIRMAR E-MAIL'
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'S.Art <suporte@s.art-full.pt>',
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
                <div class="logo">S.ART</div>
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
                  <p style="margin-top: 30px;">S.Art Studio © 2024 | Excellence in Digital Curation</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify(data), {
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
