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

  // Evento de clique para disparar a extração com resiliência total a portas de mensagens quebradas
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
            // Dar um delay mínimo estratégico de 150ms para que os ouvintes da tab se assentem no navegador
            setTimeout(() => {
              requestExtraction(activeTab.id);
            }, 150);
          }
        });
      } else {
        // Já está instanciado, executamos o pedido de extração diretamente
        requestExtraction(activeTab.id);
      }
    });
  });

  // Envia a instrução de extração final para o content script na página (com duplo-bypass inline)
  function requestExtraction(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "EXTRACT" }, (response) => {
      // Se a conexão direta de mensagens de abas falhar (ex: Receiving end does not exist ou contexto invalidado),
      // acionamos instantaneamente o bypass direto via execução de script. É inquebrável!
      if (chrome.runtime.lastError || !response || !response.success) {
        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response?.error || "Sem resposta");
        addLog("Ligação de canais clássicos indisponível (" + errorMsg + "). Acionando bypass da página nativa...", "info");
        attemptExecuteScriptExtract(tabId);
        return;
      }

      handleExtractionSuccess(response.data);
    });
  }

  // Bypass ultra-resiliente executando a extração diretamente via escopo de scripting na aba ativa
  function attemptExecuteScriptExtract(tabId) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const checkExtractor = window.runMasterExtraction || (typeof runMasterExtraction === "function" ? runMasterExtraction : null);
        if (checkExtractor) {
          try {
            return { success: true, data: checkExtractor() };
          } catch (e) {
            return { success: false, error: e.message };
          }
        } else {
          return { success: false, error: "O motor de extração não pôde se ligar ao escopo nativo da página. Por favor, recarregue a aba (F5) para restaurar os ganchos da extensão." };
        }
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        addLog("Erro na injeção de bypass direto: " + chrome.runtime.lastError.message, "error");
        return;
      }
      
      const res = results?.[0]?.result;
      if (res && res.success && res.data) {
        addLog("Dados coletados via bypass direto com absoluto sucesso!", "success");
        handleExtractionSuccess(res.data);
      } else {
        const detail = res?.error || "Ganchos indisponíveis no contexto atual do browser.";
        addLog("Erro de bypass: " + detail, "error");
      }
    });
  }

  // Processo consolidado de trânsito dos dados para o background.js enviar ao servidor
  function handleExtractionSuccess(productData) {
    addLog("Dados recolhidos com sucesso! Enviando para o background...", "success");
    const savedUrl = backendUrlInput.value.trim() || DEFAULT_BACKEND;
    
    chrome.runtime.sendMessage({ 
      action: "SEND_BACKEND", 
      data: productData,
      backendUrl: savedUrl
    }, (backResponse) => {
      if (backResponse && backResponse.success) {
        addLog("Informação transmitida ao backend com êxito!", "success");
        addLog("Produto: " + productData.title.substring(0, 30) + "...", "info");
      } else {
        addLog("Falha no envio ao backend: " + (backResponse?.error || "Desconhecido"), "error");
      }
    });
  }
});
