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
    const { orderId, email, customerName, product } = await req.json();
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "";

    await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `Reembolso Processado - Pedido #${orderRef}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #2e7d32; margin: 10px auto;"></div>
          </div>

          <div style="text-align: center;">
            <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0; color: #2e7d32;">Reembolso Concluído</h1>
            <p style="font-size: 15px; color: #666; line-height: 1.6;">Olá ${customerName}, informamos que o processo de reembolso para o seu pedido foi finalizado.</p>
          </div>

          <div style="background: #f1f8f1; border: 1px solid #c3e6cb; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #155724; font-weight: bold; margin-bottom: 10px;">Valor Devolvido</div>
            <div style="font-size: 28px; font-weight: 900; color: #1a1a1a;">€${product?.price || "---"}</div>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">O montante foi enviado para o seu método original de pagamento e poderá demorar alguns dias a ficar disponível conforme a sua instituição bancária.</p>
          </div>

          <div style="font-size: 13px; color: #666; line-height: 1.6;">
            <p><strong>Detalhes:</strong></p>
            <ul style="padding-left: 20px;">
              <li>Pedido ID: ${orderId}</li>
              <li>Produto: ${product?.name || "Peça SArt"}</li>
            </ul>
          </div>

          <div style="text-align: center; font-size: 11px; color: #999; margin-top: 50px; border-top: 1px solid #eee; padding-top: 30px;">
            <p>Lamentamos qualquer inconveniente causado e esperamos vê-lo(a) novamente em breve.</p>
            <p style="margin-top: 15px; letter-spacing: 1px; font-weight: bold;">SART BOUTIQUE</p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
