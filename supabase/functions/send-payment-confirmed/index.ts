import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createTransport } from "npm:nodemailer";

const SMTP_HOST = Deno.env.get("SMTP_HOSTNAME");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SITE_URL = Deno.env.get("SITE_URL") || "https://sart-full.pt";

const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // True for 465, false for 587
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  
  try {
    const { orderId, email, customerName, customerAvatar, product, invoiceUrl } = await req.json();
    const orderRef = orderId ? orderId.slice(0, 8).toUpperCase() : "";

    let pdfBuffer: Uint8Array | null = null;
    
    // Fetch Invoice from Stripe if URL provided
    if (invoiceUrl) {
      try {
        console.log(`[INFO] Fetching PDF from: ${invoiceUrl}`);
        const pdfRes = await fetch(invoiceUrl);
        if (pdfRes.ok) {
          const arrayBuffer = await pdfRes.arrayBuffer();
          pdfBuffer = new Uint8Array(arrayBuffer);
          console.log(`[INFO] PDF successfully downloaded (${pdfBuffer.length} bytes)`);
        } else {
          console.error(`[ERROR] Failed to download PDF. Status: ${pdfRes.status}`);
        }
      } catch (err) {
        console.error(`[ERROR] Error fetching Stripe PDF: ${err.message}`);
      }
    }

    const avatarHtml = customerAvatar 
      ? `<img src="${customerAvatar}" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid #c99372; margin-bottom: 10px;" />`
      : "";

    const productImageHtml = product?.image
      ? `<img src="${product.image}" style="width: 100%; max-width: 250px; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);" />`
      : "";

    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: `fatura-${orderRef}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    await transporter.sendMail({
      from: `"S.art Boutique" <${SMTP_USER}>`,
      to: email,
      subject: `✨ Pagamento Confirmado! Pedido #${orderRef}`,
      attachments,
      html: `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>S.art | Boutique Premium</title>
    <style type="text/css">
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #0a0a0a; }
        
        @media screen and (max-width: 600px) {
            .email-container { width: 100% !important; margin: auto !important; }
            .hero-title { font-size: 24px !important; letter-spacing: 2px !important; }
            .content-padding { padding: 30px 20px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="600" class="email-container" style="background-color: #141414; border: 1px solid #222222;">
                    
                    <tr>
                        <td align="center" style="padding: 30px 20px; border-bottom: 1px solid #2a2a2a;">
                            <a href="${SITE_URL}" style="text-decoration: none; font-size: 28px; font-weight: bold; color: #ffffff; font-family: 'Times New Roman', Times, serif; letter-spacing: 1px;">
                                S.art
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="background-color: #1a1a1a; background-image: url('https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80'); background-size: cover; background-position: center;">
                            <div style="background-color: rgba(0, 0, 0, 0.75); padding: 50px 20px; text-align: center;">
                                <h1 class="hero-title" style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 32px; font-weight: normal; color: #ffffff; letter-spacing: 3px; text-transform: uppercase;">
                                    Pagamento Confirmado
                                </h1>
                                <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin-top: 15px;">
                                    <tr>
                                        <td align="center" style="background-color: #c99372; padding: 6px 15px;">
                                            <span style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: bold; color: #000000; letter-spacing: 2px; text-transform: uppercase;">
                                                Pedido #${orderRef}
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" class="content-padding" style="padding: 40px; color: #cccccc; font-size: 16px; line-height: 1.6; text-align: center;">
                            
                            ${avatarHtml}
                            
                            <p style="margin-top: 5px; color: #ffffff; font-size: 20px;">Olá, <strong>${customerName}</strong>!</p>
                            
                            <p style="margin-bottom: 35px; font-size: 15px; color: #aaaaaa;">
                                O seu pagamento foi processado com sucesso. A sua peça exclusiva de arte e design já está a ser meticulosamente preparada pela nossa equipa na <strong>Boutique S.art</strong>.
                            </p>
                            
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; margin-bottom: 35px;">
                                <tr>
                                    <td align="center" style="padding: 30px 20px;">
                                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c99372; margin-bottom: 20px; font-weight: bold;">Detalhes da Peça</div>
                                        
                                        ${productImageHtml}
                                        
                                        <div style="font-size: 20px; font-weight: normal; color: #ffffff; margin-bottom: 5px; font-family: 'Times New Roman', Times, serif; letter-spacing: 1px;">
                                            ${product?.name || "Peça Exclusiva S.art"}
                                        </div>
                                        
                                        <div style="font-size: 12px; color: #777777; margin-bottom: 15px;">REF: ${product?.id || "N/A"}</div>
                                        
                                        <div style="font-size: 22px; color: #c99372; font-weight: normal; letter-spacing: 1px;">
                                            €${product?.price || "0.00"}
                                        </div>
                                        
                                        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 12px; color: #666666;">
                                            ID da Transação: <span style="font-family: monospace; color: #888888;">${orderId}</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin-bottom: 25px; font-size: 13px; color: #888888;">Anexamos a este e-mail a fatura detalhada da sua compra para os seus registos.</p>

                            <table border="0" cellpadding="0" cellspacing="0" align="center" style="width: 100%;">
                                <tr>
                                    <td align="center">
                                        <div style="display: inline-block; border-radius: 30px; background-color: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.4);">
                                            <a href="${SITE_URL}/profile" target="_blank" style="display: inline-block; padding: 14px 30px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: bold; color: #ffffff; text-decoration: none; letter-spacing: 2px; text-transform: uppercase; border-radius: 30px;">
                                                Acompanhar Pedido
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <hr style="border: 0; border-top: 1px solid #2a2a2a; margin: 0;">
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 30px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #777777;">
                            <p style="margin: 0 0 10px 0;">Se tiver alguma dúvida sobre a sua peça, basta responder a este e-mail.</p>
                            <p style="margin: 0;">&copy; ${new Date().getFullYear()} S.art | Boutique</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    console.error("Erro na função send-payment-confirmed:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

