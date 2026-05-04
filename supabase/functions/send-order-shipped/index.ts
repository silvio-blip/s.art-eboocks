import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const { orderId, email, customerName, customerAvatar, product, trackingNumber, trackingUrl } = await req.json();
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
      subject: `🚚 Encomenda a Caminho! Pedido #${orderRef}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #D4AF37; margin: 10px auto;"></div>
          </div>

          <div style="text-align: center;">
            ${avatarHtml}
            <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0;">Já falta pouco, ${customerName}!</h1>
            <p style="font-size: 15px; color: #666; line-height: 1.6;">O seu pedido foi enviado e já está a caminho da sua morada.</p>
          </div>

          <div style="background: #000; color: #fff; border-radius: 12px; padding: 30px; margin: 30px 0;">
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #D4AF37; margin-bottom: 15px; font-weight: bold; text-align: center;">Rastreio da Encomenda</div>
            
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="font-size: 22px; font-weight: 900; letter-spacing: 1px; font-family: monospace;">${trackingNumber || 'A processar...'}</div>
              <p style="font-size: 12px; color: #999; margin-top: 5px;">Utilize este código para acompanhar a entrega.</p>
            </div>

            ${trackingUrl ? `
              <div style="text-align: center;">
                <a href="${trackingUrl}" style="background: #D4AF37; color: #000; padding: 12px 30px; text-decoration: none; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Rastrear no Site da Transportadora</a>
              </div>
            ` : ''}
          </div>

          <div style="border-top: 1px solid #f0f0f0; padding-top: 25px; margin-top: 25px; display: flex; align-items: center; justify-content: space-between;">
            <div style="flex: 1;">
              <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #999; margin-bottom: 5px;">Produto</div>
              <div style="font-size: 14px; font-weight: bold; color: #333;">${product?.name || "Peça SArt"}</div>
              <div style="font-size: 12px; color: #999;">€${product?.price || "---"}</div>
            </div>
            ${productImageHtml}
          </div>

          <div style="text-align: center; font-size: 11px; color: #999; margin-top: 50px; line-height: 1.8;">
            <p>Se tiver dúvidas sobre a sua entrega, não hesite em contactar-nos.</p>
            <p style="margin-top: 20px; letter-spacing: 1px; font-weight: bold;">SART BOUTIQUE | PORTO - PORTUGAL</p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
