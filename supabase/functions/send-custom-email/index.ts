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
    const json = await req.json();
    const to = json.to || json.email;
    const subject = json.subject;
    const body = json.body || json.message;
    const name = json.name || json.customerName;

    if (!to) throw new Error("Destinatário (to/email) é obrigatório");
    if (!subject) throw new Error("Assunto (subject) é obrigatório");

    console.log(`[SMTP] Enviando email para ${to}: ${subject}`);

    await transporter.sendMail({
      from: `"SArt Boutique" <${SMTP_USER}>`,
      to: to,
      subject: subject,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; padding: 40px 20px; border: 1px solid #f0f0f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 24px; font-weight: 300; letter-spacing: 5px; color: #000; text-transform: uppercase;">SArt Boutique</div>
            <div style="height: 1px; width: 50px; background: #D4AF37; margin: 10px auto;"></div>
          </div>
          
          <div style="line-height: 1.6;">
            ${name ? `<p style="font-weight: bold; font-size: 16px;">Olá ${name},</p>` : ''}
            <div style="color: #444; font-size: 15px;">
              ${body}
            </div>
          </div>

          <div style="text-align: center; margin-top: 50px; padding-top: 30px; border-top: 1px solid #eee;">
            <p style="font-size: 11px; color: #999; letter-spacing: 1px; font-weight: bold; text-transform: uppercase;">
              © 2026 SART BOUTIQUE | PORTO - PORTUGAL
            </p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    console.error('[SMTP ERROR]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
