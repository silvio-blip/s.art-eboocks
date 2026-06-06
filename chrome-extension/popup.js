/**
 * popup.js
 *
 * Controla os eventos da popup da extensão e gere a comunicação com o content script
 * e background script de forma segura e contextual.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const platformBadge = document.getElementById("platform-badge");
  const platformText = document.getElementById("platform-text");
  const btnExtract = document.getElementById("btn-extract");
  const consolePane = document.getElementById("console-pane");

  // Instanciar referências para a gerência da URL de backend dinâmico
  const backendUrlInput = document.getElementById("backend-url");
  const btnSaveUrl = document.getElementById("btn-save-url");
  const DEFAULT_BACKEND = "https://ais-pre-ofdxkoy6wmjezzmm67xzxa-96926789601.europe-west2.run.app";

  chrome.storage.local.get(["BACKEND_URL"], (res) => {
    backendUrlInput.value = res.BACKEND_URL || DEFAULT_BACKEND;
  });

  btnSaveUrl.addEventListener("click", () => {
    const freshUrl = backendUrlInput.value.trim();
    if (freshUrl) {
      chrome.storage.local.set({ "BACKEND_URL": freshUrl }, () => {
        addLog("URL de Conexão salva com sucesso!", "success");
      });
    } else {
      addLog("Por favor insira uma URL de backend válida.", "error");
    }
  });

  // Helper para adicionar logs à consola visual da popup
  function addLog(message, type = "info") {
    const line = document.createElement("div");
    line.className = `console-line ${type}`;
    line.textContent = `> ${message}`;
    consolePane.appendChild(line);
    consolePane.scrollTop = consolePane.scrollHeight;
  }

  // Descobrir qual é a tab corrente para identificar o domínio e habilitar as ações
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab || !activeTab.url) {
    addLog("Nenhuma tab ativa ou válida encontrada.", "error");
    platformText.textContent = "INCOMPATÍVEL";
    return;
  }

  const url = new URL(activeTab.url);
  const hostname = url.hostname.toLowerCase();
  let platform = "unknown";

  if (hostname.includes("aliexpress.com")) {
    platform = "aliexpress";
    platformText.textContent = "ALIEXPRESS DETETADO";
    platformBadge.className = "status-badge aliexpress";
    btnExtract.removeAttribute("disabled");
    addLog("Mecanismo AliExpress pronto para acoplamento.", "success");
  } else if (hostname.includes("temu.com")) {
    platform = "temu";
    platformText.textContent = "TEMU DETETADA";
    platformBadge.className = "status-badge temu";
    btnExtract.removeAttribute("disabled");
    addLog("Mecanismo Temu pronto para acoplamento.", "success");
  } else {
    platformText.textContent = "SITE NÃO SUPORTADO";
    addLog("Vá para o site do AliExpress ou Temu para continuar.", "info");
  }

  // Evento de clique para disparar a extração
  btnExtract.addEventListener("click", () => {
    addLog("Ligando a transmissão com o content_script...", "info");
    
    // Injetar o content script opcionalmente se ele ainda não estiver carregado na página
    chrome.tabs.sendMessage(activeTab.id, { action: "PING" }, (pingResponse) => {
      // Se não houver resposta, o script não está ativo ou há um erro. Vamos tentar executar a injeção ao vivo
      if (chrome.runtime.lastError || !pingResponse) {
        addLog("Injetando motor de extração na tab...", "info");
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ["content_script.js"]
        }, () => {
          if (chrome.runtime.lastError) {
            addLog("Falha ao injetar script: " + chrome.runtime.lastError.message, "error");
          } else {
            addLog("Script injetado com sucesso! Inicializando extração...", "info");
            requestExtraction(activeTab.id);
          }
        });
      } else {
        // Já está instanciado, executamos o pedido de extração diretamente
        requestExtraction(activeTab.id);
      }
    });
  });

  // Envia a instrução de extração final para o content script na página
  function requestExtraction(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "EXTRACT" }, (response) => {
      if (chrome.runtime.lastError) {
        addLog("Erro na conversa: " + chrome.runtime.lastError.message, "error");
        return;
      }

      if (response && response.success && response.data) {
        addLog("Dados recolhidos! Enviando para o background...", "success");
        // Enviar os dados recebidos para o background de forma segura
        const savedUrl = backendUrlInput.value.trim() || DEFAULT_BACKEND;
        chrome.runtime.sendMessage({ 
          action: "SEND_BACKEND", 
          data: response.data,
          backendUrl: savedUrl
        }, (backResponse) => {
          if (backResponse && backResponse.success) {
            addLog("Informação transmitida ao backend com êxito!", "success");
            addLog("URL: " + response.data.url.substring(0, 30) + "...", "info");
          } else {
            addLog("Falha no envio ao backend: " + (backResponse?.error || "Desconhecido"), "error");
          }
        });
      } else {
        addLog("Falha na extração: " + (response?.error || "Nenhum dado retornado"), "error");
      }
    });
  }
});
