import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, body, name } = await req.json();

    if (!to || !subject || !body) {
      throw new Error("Missing required fields: to, subject, body");
    }

    const client = new SmtpClient();

    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: GMAIL_USER,
      password: GMAIL_APP_PASSWORD,
    });

    // Simple Professional HTML Template
    const htmlMessage = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
            .header { background-color: #1a1a1a; color: #ffffff; padding: 30px; text-align: center; }
            .content { padding: 30px; background-color: #ffffff; }
            .footer { background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #888; }
            .button { display: inline-block; padding: 12px 24px; background-color: #D4AF37; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${name || 'Bem-vindo'}</h1>
            </div>
            <div class="content">
              ${body}
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Sua Empresa. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await client.send({
      from: GMAIL_USER!,
      to: to,
      subject: subject,
      content: htmlMessage,
      html: htmlMessage,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true, message: "Email sent successfully" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
