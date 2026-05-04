import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT"));
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "SArt Boutique";
const SMTP_FROM_EMAIL = Deno.env.get("SMTP_FROM_EMAIL") || SMTP_USER;
const SITE_URL = Deno.env.get("SITE_URL") || "https://sart-boutique.com";

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const { orderId, email, customerName } = await req.json();
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "";

    await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
      to: email,
      subject: `Como foi a sua experiência? - Pedido #${orderRef}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
          <h1 style="color: #000; text-align: center;">Entrega Concluída!</h1>
          <p>Olá ${customerName},</p>
          <p>A sua entrega do pedido <strong>#${orderId}</strong> foi concluída.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${SITE_URL}/evaluate/${orderId}" style="background: #D4AF37; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Avaliar Compra</a>
          </div>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999; text-align: center;">SArt Boutique</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
