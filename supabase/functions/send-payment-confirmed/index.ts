import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SITE_URL = Deno.env.get("SITE_URL") || "https://sart-boutique.com";

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // True for 465, false for 587
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const { orderId, email, customerName, customerAvatar, product } = await req.json();
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "";

    const avatarHtml = customerAvatar 
      ? `<img src="${customerAvatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #D4AF37; margin-bottom: 10px;" />`
      : "";

    const productImageHtml = product?.image
      ? `<img src="${product.image}" style="width: 100%; max-width: 200px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px 0;" />`
      : "";

    await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `✨ Pagamento Confirmado! Pedido #${orderRef}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase; margin-bottom: 10px;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #D4AF37; margin: 0 auto;"></div>
          </div>

          <div style="text-align: center;">
            ${avatarHtml}
            <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 10px 0;">Olá, ${customerName}!</h1>
            <p style="font-size: 16px; color: #666; line-height: 1.6;">O seu pagamento foi processado com sucesso. A sua peça exclusiva já está a ser preparada!</p>
          </div>

          <div style="background: #fdfbf7; border: 1px solid #f1e9d6; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #9a8044; margin-bottom: 15px; font-weight: bold;">Detalhes da Encomenda</div>
            
            ${productImageHtml}
            
            <div style="font-size: 18px; font-weight: 800; margin-bottom: 5px;">${product?.name || "Produto SArt"}</div>
            <div style="font-size: 12px; color: #999; margin-bottom: 15px;">REF: ${product?.id || "N/A"}</div>
            
            <div style="font-size: 24px; color: #D4AF37; font-weight: 900;">€${product?.price || "0.00"}</div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              Pedido ID: <span style="font-family: monospace;">${orderId}</span>
            </div>
          </div>

          <div style="text-align: center; margin: 40px 0;">
            <a href="${SITE_URL}/profile" style="background: #000; color: #fff; padding: 18px 40px; text-decoration: none; border-radius: 0; font-weight: bold; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">Acompanhar Pedido</a>
          </div>

          <div style="text-align: center; font-size: 12px; color: #999; margin-top: 60px;">
            <p>Se tiver alguma dúvida, responda a este e-mail ou visite a nossa central de ajuda.</p>
            <p style="margin-top: 20px; letter-spacing: 1px;">© 2026 SART BOUTIQUE | PORTO - PORTUGAL</p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
