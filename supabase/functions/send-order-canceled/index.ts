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
    const { orderId, email, customerName, customerAvatar, product } = await req.json();
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "";

    const avatarHtml = customerAvatar 
      ? `<img src="${customerAvatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc; margin-bottom: 10px;" />`
      : "";

    const productImageHtml = product?.image
      ? `<img src="${product.image}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; margin-left: 15px;" />`
      : "";

    await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `Pedido Cancelado - #${orderRef}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #e53e3e; margin: 10px auto;"></div>
          </div>

          <div style="text-align: center;">
            ${avatarHtml}
            <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0; color: #e53e3e;">Pedido Cancelado</h1>
            <p style="font-size: 15px; color: #666; line-height: 1.6;">Olá ${customerName}, confirmamos o cancelamento da sua encomenda.</p>
          </div>

          <div style="background: #fdf2f2; border: 1px solid #fed7d7; border-radius: 12px; padding: 25px; margin: 30px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="flex: 1;">
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #c53030; font-weight: bold; margin-bottom: 5px;">Informação de Reembolso</div>
                <div style="font-size: 14px; color: #333;">O valor de <strong>€${product?.price || "---"}</strong> será devolvido através do seu método original de pagamento.</div>
                <div style="font-size: 11px; color: #a44; margin-top: 5px;">Pedido ID: ${orderId}</div>
              </div>
              ${productImageHtml}
            </div>
          </div>

          <div style="text-align: center; font-size: 11px; color: #999; margin-top: 50px; line-height: 1.8;">
            <p>Se este cancelamento foi um erro ou se tiver alguma dúvida, por favor contacte o nosso suporte.</p>
            <p style="margin-top: 20px; letter-spacing: 1px; font-weight: bold; text-transform: uppercase;">SART BOUTIQUE</p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
