/**
 * background.js (Service Worker MV3)
 *
 * Encarregado de gerir ligações externas por fora da Sandbox de segurança do cliente,
 * encaminhando o payload JSON dos produtos para o Servidor de Base de Dados (ex: Node.js / Supabase).
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SEND_BACKEND") {
    // Carregar URL dinâmica do backend enviada pela popup
    let rawBackendUrl = request.backendUrl || "https://ais-pre-ofdxkoy6wmjezzmm67xzxa-96926789601.europe-west2.run.app";
    
    // Garantir que termina com a rota correta do nosso backend de forma inteligente
    if (!rawBackendUrl.endsWith("/api/products/extract-ingest")) {
      if (rawBackendUrl.endsWith("/")) {
        rawBackendUrl = rawBackendUrl.slice(0, -1);
      }
      rawBackendUrl += "/api/products/extract-ingest";
    }
    const ENDPOINT_URL = rawBackendUrl;

    console.log("[CyberExtract Background] Recebida instrução de envio. Dados do produto:", request.data);

    // Faz o envio seguro de forma assíncrona
    fetch(ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: request.data,
        source: request.data.platform,
        extractedAt: new Date().toISOString()
      })
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Resposta do Servidor: ${response.status} ${response.statusText}`);
      }
      return response.json().catch(() => ({ success: true }));
    })
    .then((data) => {
      console.log("[CyberExtract Background] Envio concluído com sucesso:", data);
      sendResponse({ success: true, serverData: data });
    })
    .catch((error) => {
      console.error("[CyberExtract Background] Erro ao enviar para o backend:", error);
      
      // Opcional: Como estamos no ambiente de testes da extensão, devolvemos sucesso simulado 
      // ou um aviso limpo para não frustrar o utilizador caso a URL de produção mude.
      sendResponse({ 
        success: false, 
        error: error.message,
        hint: "Verifique se o seu servidor backend está ativo em " + ENDPOINT_URL
      });
    });

    // Retornar true para indicar que a resposta será assíncrona via sendResponse
    return true;
  }
});
