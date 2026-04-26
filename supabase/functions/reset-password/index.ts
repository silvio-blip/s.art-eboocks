import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verificar se o utilizador existe
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();

    const targetUser = userData?.users?.find((u: any) => u.email === normalizedEmail);

    if (userError || !targetUser) {
      console.log(`Utilizador não encontrado: ${normalizedEmail}`);
      return new Response(JSON.stringify({ error: "Email não encontrado no sistema." }), { 
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. Gerar e salvar código
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars
    const recoveryCode = Array.from({ length: 15 }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');

    const { error: dbError } = await supabase
      .from("password_recovery_codes")
      .insert([{ 
        email: normalizedEmail, 
        code: recoveryCode, 
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        used: false
      }]);

    if (dbError) throw dbError;

    // 3. Enviar e-mail via Nodemailer (Muito mais estável)
    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOSTNAME"),
      port: parseInt(Deno.env.get("SMTP_PORT") || "465"),
      secure: parseInt(Deno.env.get("SMTP_PORT") || "465") === 465,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; text-align: center;">
        <h1 style="color: #333;">S.ART</h1>
        <p>Código de verificação para redefinir o seu acesso:</p>
        <h2 style="font-size: 32px; letter-spacing: 5px;">${recoveryCode}</h2>
        <p style="font-size: 12px; color: #888;">Este código expira em 15 minutos.</p>
      </div>
    `;

    await transporter.sendMail({
      from: Deno.env.get("SMTP_USER"),
      to: normalizedEmail,
      subject: "S.ART Boutique - Código de Acesso",
      html: htmlContent,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Erro interno:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

