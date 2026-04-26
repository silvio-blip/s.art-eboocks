import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json();
    
    // Usar a chave de serviço para gerir utilizadores auth
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // O método nativo da Supabase para enviar e-mail de recuperação
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.headers.get("origin")}/update-password`, // Define para onde enviar o user
    });

    if (error) {
      // Devolver sucesso mesmo se houver erro para evitar enumeração de e-mails
      console.error("Erro na recuperação nativa:", error);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
