import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { code, app_key, app_secret, redirect_uri } = body;

    // Use provided credentials or fallback to production defaults / env
    const appKey = (app_key || Deno.env.get("ALIEXPRESS_APP_KEY") || "533964").trim();
    const appSecret = (app_secret || Deno.env.get("ALIEXPRESS_APP_SECRET") || "Fmek9qAohE8K2tgkyGcAeC2tQ8dMZiq7").trim();
    const redirectUri = (redirect_uri || "https://sart-full.pt/").trim();

    if (!code) {
      return new Response(
        JSON.stringify({ 
          error: "O parâmetro 'code' (código de autorização gerado pelo AliExpress) é obrigatório.",
          auth_url: `https://oauth.aliexpress.com/authorize?response_type=code&force_auth=true&client_id=${appKey}&redirect_uri=${encodeURIComponent(redirectUri)}&sp=ae`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ALIEXPRESS TOKEN EXCHANGE] Trocando code com AppKey ${appKey}...`);

    const formData = new URLSearchParams();
    formData.append("grant_type", "authorization_code");
    formData.append("code", code.trim());
    formData.append("client_id", appKey);
    formData.append("client_secret", appSecret);
    formData.append("redirect_uri", redirectUri);
    formData.append("sp", "ae");

    const tokenRes = await fetch("https://oauth.aliexpress.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: formData.toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error_response || tokenData.error || !tokenData.access_token) {
      console.error("[ALIEXPRESS TOKEN ERROR]", tokenData);
      return new Response(
        JSON.stringify({
          success: false,
          error: tokenData.error_description || tokenData.msg || tokenData.error || "Falha ao obter token da AliExpress",
          details: tokenData,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ALIEXPRESS TOKEN SUCCESS] Access Token gerado com sucesso para user_id: ${tokenData.user_id}`);

    // Salvar automaticamente na tabela site_settings
    const configValue = {
      app_key: appKey,
      app_secret: appSecret,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      expires_in: tokenData.expires_in,
      user_id: tokenData.user_id,
      user_nick: tokenData.user_nick || "",
      updated_at: new Date().toISOString(),
      status: "active"
    };

    const { error: dbError } = await supabase
      .from("site_settings")
      .upsert({
        key: "aliexpress_config",
        value: configValue,
        updated_at: new Date()
      });

    if (dbError) {
      console.warn("[ALIEXPRESS DB SAVE WARN]", dbError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Token oficial de Produção obtido e gravado com sucesso!",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        user_id: tokenData.user_id,
        user_nick: tokenData.user_nick
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ALIEXPRESS TOKEN FATAL]", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
