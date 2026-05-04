import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

// Configurações SMTP extraídas das tuas Secrets do Supabase
const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT"));
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SITE_URL = Deno.env.get("SITE_URL") || "https://sart-boutique.com";

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true, // Porta 465 geralmente exige secure: true
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { orderId, email, type, customerName, status, shippingStatus, trackingNumber, trackingUrl } = await req.json();

    let subject = "";
    let html = "";
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "---";

    // Lógica de Templates Baseada no Tipo de Evento
    switch (type) {
      case 'payment_confirmed':
        subject = `Pagamento Confirmado! Pedido #${orderRef}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
            <h1 style="color: #000; text-align: center;">Pagamento Recebido!</h1>
            <p>Olá <strong>${customerName}</strong>,</p>
            <p>Boas notícias! O pagamento do seu pedido <strong>#${orderId}</strong> foi confirmado com sucesso.</p>
            <p>A nossa equipa já está a preparar a sua encomenda com todo o carinho.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/profile" style="background: #000; color: #fff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Ver no Meu Perfil</a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999; text-align: center;">SArt Boutique - A sua moda, a nossa arte.</p>
          </div>
        `;
        break;

      case 'order_shipped':
        subject = `A sua encomenda foi enviada! Pedido #${orderRef}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
            <h1 style="color: #000; text-align: center;">Encomenda a Caminho!</h1>
            <p>Olá <strong>${customerName}</strong>,</p>
            <p>O seu pedido <strong>#${orderId}</strong> acaba de ser enviado.</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Código de Rastreio:</strong> ${trackingNumber || 'A processar'}</p>
              ${trackingUrl ? `<p style="margin: 10px 0 0 0;"><a href="${trackingUrl}" style="color: #d4af37;">Clique aqui para rastrear a sua encomenda</a></p>` : ''}
            </div>
            <p>Poderá acompanhar o estado da entrega através do link acima ou no nosso site.</p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999; text-align: center;">SArt Boutique</p>
          </div>
        `;
        break;

      case 'order_canceled':
        subject = `Pedido Cancelado - Pedido #${orderRef}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
            <h1 style="color: #d32f2f; text-align: center;">Pedido Cancelado</h1>
            <p>Olá ${customerName},</p>
            <p>Lamentamos informar que o seu pedido <strong>#${orderId}</strong> foi cancelado.</p>
            <p>Se o pagamento já tinha sido efetuado, o reembolso será processado automaticamente nos próximos dias úteis.</p>
            <p>Se tiver alguma dúvida, por favor responda a este e-mail.</p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999; text-align: center;">Equipa SArt Boutique</p>
          </div>
        `;
        break;

      case 'order_refunded':
        subject = `Reembolso Concluído - Pedido #${orderRef}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; color: #333;">
            <h1 style="color: #2e7d32; text-align: center;">Reembolso Processado</h1>
            <p>Olá ${customerName},</p>
            <p>Confirmamos que o reembolso relativo ao pedido <strong>#${orderId}</strong> foi concluído.</p>
            <p>O valor deverá aparecer no seu extrato bancário num prazo de 5 a 10 dias úteis, dependendo do seu banco.</p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999; text-align: center;">SArt Boutique</p>
          </div>
        `;
        break;

      default:
        subject = `Atualização do Pedido #${orderRef}`;
        html = `<p>Olá ${customerName}, o estado do seu pedido <strong>#${orderId}</strong> foi atualizado para: <strong>${status}</strong>.</p>`;
    }

    // Enviar o E-mail usando SMTP
    const info = await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: email,
      subject: subject,
      html: html,
    });

    console.log(`[EMAIL SUCCESS] Pedido: ${orderId} | Tipo: ${type} | Destino: ${email}`);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    console.error(`[EMAIL FATAL]`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

