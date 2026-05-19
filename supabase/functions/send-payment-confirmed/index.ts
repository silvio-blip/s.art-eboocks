import { createTransport } from "npm:nodemailer";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

const formatEur = (value) => {
  const num = Number(value) || 0;
  return num.toFixed(2).replace('.', ',');
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  
  try {
    const json = await req.json();
    
    const orderId = json.orderId;
    const email = json.email || json.to;
    const customerName = json.customerName || json.name || "Cliente S.art";

    if (!email) throw new Error("Destinatário (email) é obrigatório");

    let orderRef = "SART";
    if (orderId) orderRef = orderId.slice(0, 8).toUpperCase();

    console.log(`[PAGAMENTO] A sincronizar 100% dados financeiros para: #${orderRef}`);

    // ==========================================
    // 1. SINCRONIZAÇÃO E MATEMÁTICA FINANCEIRA
    // ==========================================
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let finalProductName = "Peça Exclusiva S.art";
    let finalImageUrl = null;
    let detailsExtra = ""; 
    
    let subtotal = 0;
    let shippingCost = 0;
    let discount = 0;
    let finalTotal = 0;

    if (orderId) {
        const { data: orderData } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();

        if (orderData) {
            // Caça às colunas financeiras (tenta todos os nomes lógicos possíveis)
            finalTotal = Number(orderData.total_amount || orderData.total || orderData.amount || 0);
            subtotal = Number(orderData.subtotal || 0);
            shippingCost = Number(orderData.shipping_cost || orderData.frete || orderData.freight || orderData.shipping || orderData.portes || 0);
            discount = Number(orderData.discount_amount || orderData.discount || orderData.desconto || orderData.cupao_valor || 0);

            if (orderData.metadata?.size) detailsExtra += `Tamanho: ${orderData.metadata.size} `;
            if (orderData.metadata?.color) detailsExtra += `| Cor: ${orderData.metadata.color}`;

            const pId = orderData.product_id || orderData.productId || orderData.item_id || orderData.produto_id;
            
            if (pId) {
                const { data: prodData } = await supabase.from('products').select('*').eq('id', pId).maybeSingle();
                if (prodData) {
                    finalProductName = prodData.title || prodData.name || finalProductName;
                    finalImageUrl = prodData.image_url || prodData.image || finalImageUrl;
                    if (subtotal === 0) subtotal = Number(prodData.price || 0); // Fallback do subtotal
                }
            } else if (orderData.metadata?.product) {
                finalProductName = orderData.metadata.product.title || finalProductName;
                finalImageUrl = orderData.metadata.product.image_url || finalImageUrl;
                if (subtotal === 0) subtotal = Number(orderData.metadata.product.price || 0);
            }

            // A MATEMÁTICA SALVA TUDO: Se o desconto ou frete não estiverem na base de dados, deduz pela diferença!
            if (finalTotal > 0 && subtotal > 0) {
                // Se só temos o total e o subtotal, e eles divergem, temos que descobrir quem falta
                const diferenca = finalTotal - subtotal;
                
                if (diferenca > 0 && shippingCost === 0) {
                    // Se o cliente pagou mais que o subtotal, a diferença é o frete!
                    shippingCost = diferenca; 
                } else if (diferenca < 0 && discount === 0) {
                    // Se o cliente pagou MENOS que o subtotal, a diferença é o desconto!
                    discount = Math.abs(diferenca);
                } else if (diferenca !== 0 && (shippingCost > 0 || discount > 0)) {
                  // Se temos algum valor mas não fecha a conta (ex: subtotal 20 + frete 2 = 22, mas total é 17)
                  // Significa que o que falta é o desconto
                  const esperado = subtotal + shippingCost;
                  if (esperado > finalTotal) {
                    discount = esperado - finalTotal;
                  }
                }
            } else if (finalTotal === 0 && subtotal > 0) {
                finalTotal = subtotal + shippingCost - discount;
            }
        }
    }

    // Calcula a percentagem exata
    const discountPercent = (subtotal > 0 && discount > 0) ? Math.round((discount / subtotal) * 100) : 0;

    // ==========================================
    // 2. DESIGN DO PDF PREMIUM ORGANIZADO
    // ==========================================
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); 
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const colorPrimary = rgb(0.788, 0.576, 0.447); 
    const colorDark = rgb(0.08, 0.08, 0.08);
    const colorGray = rgb(0.45, 0.45, 0.45);
    const colorLightGray = rgb(0.97, 0.97, 0.97); 
    const colorBorder = rgb(0.90, 0.90, 0.90);

    page.drawText("S.ART", { x: 50, y: 765, size: 26, font: fontBold, color: colorDark });
    page.drawText("BOUTIQUE PREMIUM", { x: 50, y: 750, size: 9, font: fontNormal, color: colorPrimary });
    
    page.drawText("COMPROVATIVO DE COMPRA", { x: 360, y: 760, size: 12, font: fontBold, color: colorGray });
    page.drawLine({ start: { x: 50, y: 735 }, end: { x: 545, y: 735 }, thickness: 1, color: colorPrimary });

    page.drawText("EMITIDO PARA:", { x: 50, y: 705, size: 9, font: fontBold, color: colorPrimary });
    page.drawText(customerName, { x: 50, y: 685, size: 12, font: fontBold, color: colorDark });
    page.drawText(email, { x: 50, y: 668, size: 10, font: fontNormal, color: colorGray });

    page.drawText("DETALHES DO PEDIDO:", { x: 360, y: 705, size: 9, font: fontBold, color: colorPrimary });
    page.drawText(`Referência: #SART-${orderRef}`, { x: 360, y: 685, size: 11, font: fontBold, color: colorDark });
    page.drawText(`Data de Emissão: ${new Date().toLocaleDateString('pt-PT')}`, { x: 360, y: 668, size: 10, font: fontNormal, color: colorGray });

    const tableTopY = 620;
    page.drawRectangle({ x: 50, y: tableTopY, width: 495, height: 25, color: colorDark });
    page.drawText("ARTIGO EXCLUSIVO", { x: 65, y: tableTopY + 8, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("VALOR", { x: 495, y: tableTopY + 8, size: 9, font: fontBold, color: rgb(1, 1, 1) });

    const boxY = 475;
    const boxHeight = 135;
    page.drawRectangle({ x: 50, y: boxY, width: 495, height: boxHeight, color: colorLightGray });
    page.drawRectangle({ x: 50, y: boxY, width: 495, height: boxHeight, color: rgb(0,0,0), thickness: 0.5, opacity: 0.1 });

    // FORÇAR O ALIEXPRESS A MANDAR JPG
    if (finalImageUrl) {
      try {
        const imgRes = await fetch(finalImageUrl, {
            headers: { "Accept": "image/jpeg, image/png" }
        });
        if (imgRes.ok) {
          const imgBytes = await imgRes.arrayBuffer();
          let embeddedImage;
          try { embeddedImage = await pdfDoc.embedJpg(imgBytes); } 
          catch { try { embeddedImage = await pdfDoc.embedPng(imgBytes); } catch (e) { console.log("Imagem era WEBP mesmo forçando."); } }

          if (embeddedImage) {
            const imgDims = embeddedImage.scaleToFit(105, 105);
            page.drawRectangle({ x: 65, y: boxY + 15, width: 115, height: 105, color: rgb(1,1,1) });
            page.drawImage(embeddedImage, {
              x: 65 + (115 / 2) - (imgDims.width / 2),
              y: boxY + 15 + (105 / 2) - (imgDims.height / 2),
              width: imgDims.width,
              height: imgDims.height,
            });
          }
        }
      } catch (err) {}
    }

    const textStartX = finalImageUrl ? 200 : 70;
    const nameLine1 = finalProductName.substring(0, 48);
    page.drawText(nameLine1, { x: textStartX, y: boxY + 100, size: 11, font: fontBold, color: colorDark });
    if (finalProductName.length > 48) {
        const nameLine2 = finalProductName.substring(48, 90) + "...";
        page.drawText(nameLine2, { x: textStartX, y: boxY + 85, size: 11, font: fontBold, color: colorDark });
    }

    if (detailsExtra) page.drawText(detailsExtra, { x: textStartX, y: boxY + 60, size: 9, font: fontNormal, color: colorGray });
    page.drawText("Qtd: 1", { x: textStartX, y: boxY + 40, size: 10, font: fontNormal, color: colorGray });
    
    page.drawText(`€ ${formatEur(subtotal)}`, { x: 485, y: boxY + 100, size: 11, font: fontBold, color: colorDark });

    // CÁLCULOS TOTAIS
    let calcY = boxY - 30;
    
    page.drawText("Subtotal:", { x: 360, y: calcY, size: 11, font: fontNormal, color: colorGray });
    page.drawText(`€ ${formatEur(subtotal)}`, { x: 485, y: calcY, size: 11, font: fontNormal, color: colorDark });
    calcY -= 22;

    if (shippingCost >= 0) {
        page.drawText("Custo de Frete:", { x: 360, y: calcY, size: 11, font: fontNormal, color: colorGray });
        page.drawText(`€ ${formatEur(shippingCost)}`, { x: 485, y: calcY, size: 11, font: fontNormal, color: colorDark });
        calcY -= 22;
    }

    if (discount > 0) {
        page.drawText(`Desconto (${discountPercent}%):`, { x: 360, y: calcY, size: 11, font: fontBold, color: colorPrimary });
        page.drawText(`- € ${formatEur(discount)}`, { x: 485, y: calcY, size: 11, font: fontBold, color: colorPrimary });
        calcY -= 15;
    }

    page.drawLine({ start: { x: 350, y: calcY }, end: { x: 545, y: calcY }, thickness: 1, color: colorBorder });
    calcY -= 25;

    page.drawText("TOTAL LIQUIDADO:", { x: 320, y: calcY, size: 12, font: fontBold, color: colorDark });
    page.drawText(`€ ${formatEur(finalTotal)}`, { x: 465, y: calcY, size: 18, font: fontBold, color: colorPrimary });

    page.drawLine({ start: { x: 50, y: 100 }, end: { x: 545, y: 100 }, thickness: 0.5, color: colorGray });
    page.drawText("Este documento serve como garantia de pagamento e processamento logístico na Boutique S.art.", { x: 50, y: 80, size: 8.5, font: fontNormal, color: colorGray });
    page.drawText("S.art Boutique | Apoio ao cliente: geral@sart-full.pt", { x: 50, y: 65, size: 8.5, font: fontBold, color: colorDark });

    const pdfBuffer = await pdfDoc.save();
    const attachments = [{ filename: `comprovativo-SART-${orderRef}.pdf`, content: new Uint8Array(pdfBuffer), contentType: 'application/pdf' }];

    // ==========================================
    // 3. DESIGN DO EMAIL
    // ==========================================
    const productImageHtml = finalImageUrl 
      ? `<tr><td align="center" style="padding-bottom: 20px;"><img src="${finalImageUrl}" alt="Artigo S.art" width="280" style="width: 100%; max-width: 280px; height: auto; border-radius: 6px; border: 1px solid #333333; display: block;" /></td></tr>`
      : "";

    let receiptHtml = `
        <tr>
            <td style="padding-top: 15px; border-top: 1px solid #333333;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                        <td align="left" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #aaaaaa;">Subtotal</p></td>
                        <td align="right" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #ffffff;">€${formatEur(subtotal)}</p></td>
                    </tr>
                    <tr>
                        <td align="left" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #aaaaaa;">Frete</p></td>
                        <td align="right" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #ffffff;">€${formatEur(shippingCost)}</p></td>
                    </tr>`;

    if (discount > 0) {
        receiptHtml += `
                    <tr>
                        <td align="left" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #c99372; font-weight: bold;">Desconto (${discountPercent}%)</p></td>
                        <td align="right" style="padding-bottom: 6px;"><p style="margin: 0; font-size: 13px; color: #c99372; font-weight: bold;">- €${formatEur(discount)}</p></td>
                    </tr>`;
    }

    receiptHtml += `
                    <tr>
                        <td align="left" style="padding-top: 12px;"><p style="margin: 0; font-size: 14px; color: #ffffff; font-weight: bold;">TOTAL PAGO</p></td>
                        <td align="right" style="padding-top: 12px;"><p style="margin: 0; font-size: 19px; color: #c99372; font-weight: bold;">€${formatEur(finalTotal)}</p></td>
                    </tr>
                </table>
            </td>
        </tr>
    `;

    const emailSubject = `✨ Pagamento Confirmado! Pedido Sart-${orderRef}`;

    await transporter.sendMail({
      from: `"S.art Boutique" <${SMTP_USER}>`,
      to: email,
      subject: emailSubject,
      attachments: attachments,
      html: `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${emailSubject}</title>
    <style type="text/css">
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; outline: none; text-decoration: none; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #0a0a0a; }
        @media screen and (max-width: 600px) {
            .email-container { width: 100% !important; margin: auto !important; }
            .content-padding { padding: 30px 15px !important; }
            .hero-title { font-size: 26px !important; letter-spacing: 2px !important; }
            .product-card { padding: 20px 15px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <center style="width: 100%; background-color: #0a0a0a;">
        <div style="max-width: 600px; margin: 0 auto;" class="email-container">
            <table align="center" border="0" width="100%" style="margin: auto; background-color: #141414; border: 1px solid #222222;">
                <tr>
                    <td align="center" style="padding: 35px 20px; border-bottom: 1px solid #2a2a2a;">
                        <a href="https://sart-full.pt" style="text-decoration: none; font-size: 32px; font-weight: bold; color: #ffffff; font-family: 'Times New Roman', Times, serif; letter-spacing: 1px;">S.art</a>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="background-color: #1a1a1a; background-image: url('https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80'); background-size: cover; background-position: center; background-repeat: no-repeat;">
                        <div style="background-color: rgba(0, 0, 0, 0.75); padding: 70px 20px; text-align: center;">
                            <h1 class="hero-title" style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 36px; font-weight: normal; color: #ffffff; letter-spacing: 4px; text-transform: uppercase;">Exclusividade</h1>
                            <table border="0" align="center" style="margin-top: 15px;">
                                <tr>
                                    <td align="center" style="background-color: #c99372; padding: 6px 18px; border-radius: 2px;">
                                        <span style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; color: #000000; letter-spacing: 3px; text-transform: uppercase;">S.art Boutique</span>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td class="content-padding" style="padding: 45px 40px; text-align: left; background-color: #141414;">
                        <p style="margin: 0 0 20px 0; font-size: 18px; color: #ffffff; font-weight: 500;">Olá, <strong>${customerName}</strong>,</p>
                        <p style="margin: 0 0 30px 0; font-size: 15px; color: #aaaaaa; line-height: 1.6;">Temos ótimas notícias: o seu pagamento para o pedido <strong style="color: #ffffff;">Sart-${orderRef}</strong> foi processado com sucesso.</p>

                        <table width="100%" class="product-card" style="background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 30px;">
                            <tr>
                                <td style="padding: 25px;">
                                    <table width="100%">
                                        ${productImageHtml}
                                        <tr>
                                            <td style="padding-bottom: 15px;">
                                                <p style="margin: 0; font-size: 12px; color: #777777; text-transform: uppercase; letter-spacing: 1px;">Item Selecionado</p>
                                                <p style="margin: 5px 0 5px 0; font-size: 16px; color: #ffffff; line-height: 1.4;">${finalProductName}</p>
                                                <p style="margin: 0; font-size: 12px; color: #888888;">${detailsExtra}</p>
                                            </td>
                                        </tr>
                                        ${receiptHtml}
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 0 0 35px 0; font-size: 15px; color: #aaaaaa; line-height: 1.6;">O seu produto já está a ser preparado. Enviaremos um novo e-mail com o rastreio.</p>

                        <table border="0" align="center" style="width: 100%;">
                            <tr>
                                <td align="center">
                                    <table border="0">
                                        <tr>
                                            <td align="center" style="border-radius: 30px; background-color: #1a1a1a; border: 1px solid #c99372;">
                                                <a href="https://sart-full.pt/profile" target="_blank" style="font-size: 13px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: bold; color: #c99372; text-decoration: none; border-radius: 30px; padding: 15px 35px; display: inline-block; letter-spacing: 2px; text-transform: uppercase;">Acompanhar Pedido</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <p style="margin: 40px 0 0 0; font-size: 13px; color: #666666; text-align: center;">Equipa S.art Boutique</p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 30px 20px; border-top: 1px solid #2a2a2a; background-color: #0f0f0f;">
                        <p style="margin: 0 0 10px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #555555;">Anexamos a este e-mail o seu comprovativo PDF gerado para os seus registos.</p>
                        <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #444444;">&copy; ${new Date().getFullYear()} S.art | Global &bull; Portugal</p>
                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>
</html>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    console.error('[ERRO FATAL]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
