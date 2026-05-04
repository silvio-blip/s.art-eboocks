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
  secure: SMTP_PORT === 465,
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
      ? `<img src="${product.image}" style="width: 100%; max-width: 120px; border-radius: 8px; margin: 15px 0;" />`
      : "";

    await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `🖤 Entrega Concluída! Pedido #${orderRef}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #D4AF37; margin: 10px auto;"></div>
          </div>

          <div style="text-align: center;">
            ${avatarHtml}
            <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0;">Já chegou, ${customerName}!</h1>
            <p style="font-size: 15px; color: #666; line-height: 1.6;">Confirmamos que a sua encomenda foi entregue com sucesso. Esperamos que adore a sua nova peça!</p>
          </div>

          <div style="background: #fafafa; border: 1px dashed #ddd; border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center;">
             <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 10px;">Resumo da Compra</div>
             ${productImageHtml}
             <div style="font-size: 16px; font-weight: bold;">${product?.name || "Peça SArt"}</div>
             
             <p style="font-size: 14px; color: #666; margin-top: 20px;">Gostou da peça? A sua opinião é muito importante para nós.</p>
             
             <div style="margin-top: 25px;">
                <a href="${SITE_URL}/evaluate/${orderId}" style="background: #000; color: #fff; padding: 15px 35px; text-decoration: none; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Deixar uma Avaliação</a>
             </div>
          </div>

          <div style="text-align: center; font-size: 11px; color: #999; margin-top: 50px; border-top: 1px solid #eee; padding-top: 30px;">
            <p>Siga-nos nas redes sociais e partilhe o seu look com #SArtBoutique</p>
            <p style="margin-top: 15px; letter-spacing: 1px; font-weight: bold;">SART BOUTIQUE | EXCLUSIVITY & STYLE</p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
