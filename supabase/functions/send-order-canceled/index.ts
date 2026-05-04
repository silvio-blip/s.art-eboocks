import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT"));
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");

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
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `Pedido Cancelado - Pedido #${orderRef}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
          <h1 style="color: #d32f2f; text-align: center;">Pedido Cancelado</h1>
          <p>Olá ${customerName},</p>
          <p>O seu pedido <strong>#${orderId}</strong> foi cancelado.</p>
          <p>O reembolso será processado nos próximos dias.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999; text-align: center;">Equipa SArt Boutique</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
