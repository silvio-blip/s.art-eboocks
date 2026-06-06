/**
 * content_script.js
 *
 * Executado diretamente nas páginas do AliExpress e Temu.
 * Extrai dados semânticos precisos via JSON-LD, Metadados e Seletores estruturais,
 * e injeta um botão flutuante para importação com 1 clique direto na página.
 */

// Listener para solicitações vindas do popup da extensão
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    sendResponse({ success: true, message: "PONG" });
    return true;
  }

  if (request.action === "EXTRACT") {
    try {
      const result = runMasterExtraction();
      sendResponse({ success: true, data: result });
    } catch (error) {
      console.error("[CyberExtract Content Script] Erro:", error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

// Inicialização: Se estiver numa página de produto, injeta o botão de importação instantânea
if (isProductPage()) {
  setTimeout(injectFloatingImporter, 1500);
}

/**
 * Verifica se a URL atual corresponde a uma página de produto no AliExpress ou Temu
 */
function isProductPage() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes("aliexpress.com")) {
    return url.includes("/item/") || url.includes(".html") || url.includes("/p/") || url.includes("aliexpress.com/item");
  }
  if (hostname.includes("temu.com")) {
    return url.includes("/g/") || url.includes("-g-") || url.includes("/goods") || url.includes(".html") || url.includes("goods_id=");
  }
  return false;
}

/**
 * Função unificada principal de extração estruturada de dados do produto
 */
function runMasterExtraction() {
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes("aliexpress.com")) {
    return extractAliExpress();
  } else if (hostname.includes("temu.com")) {
    return extractTemu();
  } else {
    throw new Error("Plataforma incompatível para extração inteligente CyberExtract.");
  }
}

/**
 * Conversor profundo para extrair dados estruturados JSON-LD (Search Engine Optimization)
 */
function extractFromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      
      const findProductNode = (obj) => {
        if (!obj) return null;
        if (obj["@type"] === "Product" || obj["@type"] === "http://schema.org/Product") return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findProductNode(item);
            if (found) return found;
          }
        } else if (typeof obj === "object") {
          if (obj["@graph"]) {
            const found = findProductNode(obj["@graph"]);
            if (found) return found;
          }
          for (const key in obj) {
            if (typeof obj[key] === "object") {
              const found = findProductNode(obj[key]);
              if (found) return found;
            }
          }
        }
        return null;
      };

      const product = findProductNode(data);
      if (product) {
        console.log("[CyberExtract] Sucesso ao ler nó semântico JSON-LD de e-commerce:", product);
        
        let title = product.name || product.title || "";
        let description = product.description || "";
        let image = "";
        
        if (typeof product.image === "string") {
          image = product.image;
        } else if (Array.isArray(product.image)) {
          image = product.image[0];
        } else if (product.image && typeof product.image === "object") {
          image = product.image.url || product.image.image || "";
        }

        let price = "";
        if (product.offers) {
          const offers = product.offers;
          if (Array.isArray(offers)) {
            const firstOffer = offers[0];
            price = firstOffer.price || firstOffer.lowPrice || firstOffer.priceSpecification?.price || "";
          } else if (typeof offers === "object") {
            price = offers.price || offers.lowPrice || offers.priceSpecification?.price || "";
          }
        }

        return { title, description, image, price };
      }
    } catch (e) {
      // Avançar silenciosamente para o próximo script caso haja erro de sintaxe
    }
  }
  return null;
}

/**
 * Motor AliExpress refinado de alto padrão
 */
function extractAliExpress() {
  console.log("[CyberExtract] Executando análise inteligente no AliExpress...");
  
  // Tentar JSON-LD estruturado
  const jld = extractFromJsonLd();
  
  // 1. Título
  let title = (jld && jld.title) ? jld.title : "";
  if (!title) {
    const titleSelectors = [
      "h1[data-pl='product-title']",
      ".product-title",
      "h1.product-name",
      "meta[property='og:title']"
    ];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        title = el.tagName === "META" ? el.getAttribute("content") : el.textContent.trim();
        if (title) break;
      }
    }
  }

  // 2. Preço
  let price = (jld && jld.price) ? String(jld.price) : "";
  if (!price) {
    const priceSelectors = [
      ".product-price-current",
      ".product-price-value",
      "[data-pl='product-price'] .price--currentPriceText--S606FeV",
      "span.price-current",
      "meta[property='twitter:data1']",
      "meta[property='og:price:amount']"
    ];
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        price = el.tagName === "META" ? el.getAttribute("content") : el.textContent.trim();
        if (price) break;
      }
    }
  }

  // 3. Imagem Principal
  let mainImage = (jld && jld.image) ? jld.image : "";
  if (!mainImage) {
    const imgSelectors = [
      "meta[property='og:image']",
      ".magnifier-image",
      "img.magnifier-image",
      ".image-view-magnifier img",
      ".product-main-image img"
    ];
    for (const selector of imgSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        mainImage = el.tagName === "META" ? el.getAttribute("content") : el.src;
        if (mainImage) break;
      }
    }
  }

  // Recolher as variações/skus
  const variations = [];
  const skuElements = document.querySelectorAll(".item-sku-image, .sku-property-item, [sku-value]");
  skuElements.forEach(el => {
    const imgEl = el.querySelector("img");
    const labelEl = el.querySelector("span");
    const name = el.getAttribute("title") || el.getAttribute("aria-label") || (labelEl ? labelEl.textContent.trim() : "");
    const imgUrl = imgEl ? imgEl.src : "";
    if (name || imgUrl) {
      variations.push({ name, imgUrl });
    }
  });

  return {
    platform: "AliExpress",
    title: title || document.title || "Produto AliExpress importado",
    price: price || "0",
    mainImage: mainImage || "",
    variations: variations.slice(0, 10),
    url: window.location.href
  };
}

/**
 * Motor Temu refinado e à prova de mudanças de classes
 */
function extractTemu() {
  console.log("[CyberExtract] Executando análise inteligente na Temu...");
  
  // Tentar JSON-LD estruturado (Altamente resiliente na Temu para fugir de mangling de classes)
  const jld = extractFromJsonLd();
  
  // 1. Título do Produto
  let title = (jld && jld.title) ? jld.title : "";
  if (!title) {
    const titleSelectors = [
      "meta[property='og:title']",
      "h1",
      "h1[data-as-title='true']",
      "h2"
    ];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        title = el.tagName === "META" ? el.getAttribute("content") : el.textContent.trim();
        if (title) break;
      }
    }
  }

  // Limpar possíveis sufixos de branding da Temu do título
  if (title) {
    title = title.replace(/\s*-\s*Temu\s*Portugal/gi, "").replace(/\s*-\s*Temu/gi, "").trim();
  }

  // 2. Preço
  let price = (jld && jld.price) ? String(jld.price) : "";
  if (!price) {
    // Escanear metatags prioritárias fornecidas pelos robôs de SEO da Temu
    const metaPrices = [
      "meta[property='og:price:amount']",
      "meta[property='product:price:amount']",
      "meta[property='goods:price']",
      "meta[name='twitter:data1']"
    ];
    for (const sel of metaPrices) {
      const el = document.querySelector(sel);
      if (el && el.getAttribute("content")) {
        price = el.getAttribute("content").trim();
        break;
      }
    }
  }

  // Fallback de Seleção Textual de Símbolos Monetários na tela
  if (!price) {
    const allEls = document.querySelectorAll("span, div, p");
    for (const el of allEls) {
      const text = el.textContent.trim();
      if (/^(€|\$|R\$|£)\s?\d+([.,]\d{2})?$/.test(text) || /^(\d+([.,]\d{2})?)\s?(€|\$|R\$|£)$/.test(text)) {
        price = text;
        break;
      }
    }
  }

  // 3. Imagem Master
  let mainImage = (jld && jld.image) ? jld.image : "";
  if (!mainImage) {
    const imgSelectors = [
      "meta[property='og:image']",
      "main img",
      "#main-image",
      "[class*='mainImage'] img",
      "[class*='gallery'] img",
      "img[data-as-main-img='true']"
    ];
    for (const selector of imgSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        mainImage = el.tagName === "META" ? el.getAttribute("content") : el.src;
        if (mainImage) break;
      }
    }
  }

  // Fallback extra de Imagem de tamanho razoável na Viewport
  if (!mainImage) {
    const imgs = Array.from(document.querySelectorAll("img"));
    const bestImg = imgs.find(i => i.naturalWidth > 320 && i.src && i.src.startsWith("http"));
    if (bestImg) mainImage = bestImg.src;
  }

  // Variações de produtos Temu aproximadas
  const variations = [];
  const variationEls = document.querySelectorAll("[class*='sku'], [class*='spec'], [class*='prop'], [class*='item']");
  variationEls.forEach(el => {
    const txt = el.textContent ? el.textContent.trim() : "";
    const img = el.querySelector("img");
    const imgUrl = img ? img.src : "";
    
    if (txt && txt.length > 0 && txt.length < 25 && variations.length < 10) {
      // Verificar se já não cadastrou esta mesma variação
      if (!variations.some(v => v.name === txt)) {
        variations.push({ name: txt, imgUrl });
      }
    }
  });

  return {
    platform: "Temu",
    title: title || document.title || "Produto Temu extraído",
    price: price || "0",
    mainImage: mainImage || "",
    variations,
    url: window.location.href
  };
}

/**
 * Constrói e injeta um botão elegante e flutuante direto na tela do usuário
 */
function injectFloatingImporter() {
  if (document.getElementById("cyberextract-floating-button-container")) return;

  const container = document.createElement("div");
  container.id = "cyberextract-floating-button-container";
  container.style.position = "fixed";
  container.style.bottom = "120px";
  container.style.right = "24px";
  container.style.zIndex = "2147483647"; // Sempre acima de qualquer overlay do site
  container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const btn = document.createElement("button");
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.gap = "8px";
  btn.style.background = "linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)";
  btn.style.color = "#ffffff";
  btn.style.border = "2px solid #a855f7";
  btn.style.borderRadius = "50px";
  btn.style.padding = "10px 22px";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 8px 30px rgba(168, 85, 247, 0.4), inset 0 0 12px rgba(0, 242, 254, 0.2)";
  btn.style.fontSize = "11px";
  btn.style.fontWeight = "900";
  btn.style.letterSpacing = "1.5px";
  btn.style.textTransform = "uppercase";
  btn.style.transition = "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  btn.style.outline = "none";

  // Efeito de hover e clique amigável
  btn.onmouseover = () => {
    btn.style.transform = "scale(1.06) translateY(-2px)";
    btn.style.border = "2px solid #00f2fe";
    btn.style.boxShadow = "0 12px 35px rgba(0, 242, 254, 0.5), inset 0 0 15px rgba(168, 85, 247, 0.3)";
  };
  btn.onmouseout = () => {
    btn.style.transform = "scale(1) translateY(0px)";
    btn.style.border = "2px solid #a855f7";
    btn.style.boxShadow = "0 8px 30px rgba(168, 85, 247, 0.4), inset 0 0 12px rgba(0, 242, 254, 0.2)";
  };

  const lightningIcon = document.createElement("span");
  lightningIcon.textContent = "⚡";
  lightningIcon.style.fontSize = "14px";
  lightningIcon.style.animation = "pulse 1.5s infinite";

  const textNode = document.createElement("span");
  textNode.innerText = "IMPORTAR PARA A LOJA";

  btn.appendChild(lightningIcon);
  btn.appendChild(textNode);
  container.appendChild(btn);
  document.body.appendChild(container);

  // Manipulador de clique do botão flutuante
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    textNode.innerText = "EXTRAINDO...";
    btn.style.opacity = "0.7";
    btn.style.border = "2px dashed #00f2fe";

    try {
      // 1. Executar a extração automática avançada
      const productData = runMasterExtraction();
      console.log("[CyberExtract Floating Button] Dados coletados na página:", productData);

      // 2. Obter a URL de backend armazenada
      chrome.storage.local.get(["BACKEND_URL"], (storageResult) => {
        const savedUrl = storageResult.BACKEND_URL || "https://ais-pre-ofdxkoy6wmjezzmm67xzxa-96926789601.europe-west2.run.app";
        
        // 3. Enviar mensagem de ponte para o background.js que não sofre de bloqueios CORS do navegador
        chrome.runtime.sendMessage({
          action: "SEND_BACKEND",
          data: productData,
          backendUrl: savedUrl
        }, (backendResponse) => {
          if (backendResponse && backendResponse.success) {
            btn.style.backgroundColor = "#16a34a";
            btn.style.border = "2px solid #4ade80";
            btn.style.boxShadow = "0 8px 30px rgba(74, 222, 128, 0.5)";
            textNode.innerText = "✓ IMPORTADO!";
            showInPageToast(true, `Produto "${productData.title.substring(0, 30)}..." adicionado com sucesso à sua base de dados nacional!`, savedUrl);
            
            // Restaura o estado em 5 segundos
            setTimeout(() => {
              btn.disabled = false;
              btn.style.background = "linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)";
              btn.style.border = "2px solid #a855f7";
              btn.style.boxShadow = "0 8px 30px rgba(168, 85, 247, 0.4)";
              textNode.innerText = "IMPORTAR PARA A LOJA";
              btn.style.opacity = "1";
            }, 5000);
          } else {
            const errDetail = (backendResponse && backendResponse.error) ? backendResponse.error : "Falha ao contactar servidor";
            console.error("[CyberExtract] Erro de rede:", errDetail);
            triggerFailure(errDetail);
          }
        });
      });
    } catch (e) {
      console.error("[CyberExtract] Erro no analisador:", e);
      triggerFailure(e.message);
    }

    function triggerFailure(failMsg) {
      btn.style.background = "linear-gradient(135deg, #991b1b, #ef4444)";
      btn.style.border = "2px solid #f87171";
      btn.style.boxShadow = "0 8px 30px rgba(239, 68, 68, 0.5)";
      textNode.innerText = "❌ FALHA NA EXT.";
      showInPageToast(false, `Falha ao importar produto: ${failMsg}`);
      
      setTimeout(() => {
        btn.disabled = false;
        btn.style.background = "linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)";
        btn.style.border = "2px solid #a855f7";
        btn.style.boxShadow = "0 8px 30px rgba(168, 85, 247, 0.4)";
        textNode.innerText = "IMPORTAR PARA A LOJA";
        btn.style.opacity = "1";
      }, 5000);
    }
  });
}

/**
 * Cria uma pequena caixa flutuante de aviso (Toast) elegante dentro da página (AliExpress/Temu)
 */
function showInPageToast(success, message, backendUrl = "") {
  const existing = document.getElementById("cyberextract-inpage-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "cyberextract-inpage-toast";
  toast.style.position = "fixed";
  toast.style.bottom = "190px";
  toast.style.right = "24px";
  toast.style.zIndex = "2147483647";
  toast.style.width = "300px";
  toast.style.background = "rgba(10, 10, 12, 0.95)";
  toast.style.backdropFilter = "blur(10px) saturate(180%)";
  toast.style.border = success ? "1px solid #4ade80" : "1px solid #f87171";
  toast.style.borderRadius = "16px";
  toast.style.padding = "16px";
  toast.style.color = "#ffffff";
  toast.style.boxShadow = success ? "0 10px 40px rgba(74, 222, 128, 0.15)" : "0 10px 40px rgba(239, 68, 68, 0.15)";
  toast.style.fontFamily = "-apple-system, BlinkMacSystemFont, sans-serif";
  toast.style.fontSize = "12px";
  toast.style.lineHeight = "1.5";
  toast.style.animation = "slideIn 0.4s ease-out";

  const header = document.createElement("div");
  header.style.fontWeight = "bold";
  header.style.marginBottom = "6px";
  header.style.color = success ? "#4ade80" : "#f87171";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "6px";
  header.innerHTML = success ? "<span>✓</span> SUCESSO COMPLETO!" : "<span>⚠</span> ERRO DE CONEXÃO";
  
  const text = document.createElement("div");
  text.innerText = message;
  text.style.color = "#d4d4d8";

  toast.appendChild(header);
  toast.appendChild(text);

  if (success && backendUrl) {
    // Adicionar um link atalho para ir direto para o Admin do Cliente gerenciar o produto recém importado!
    const linkContainer = document.createElement("div");
    linkContainer.style.marginTop = "12px";
    linkContainer.style.textAlign = "right";

    const link = document.createElement("a");
    link.href = backendUrl.replace("/api/products/extract-ingest", "") + "/admin";
    link.target = "_blank";
    link.innerText = "ABRIR MEU PAINEL ↗";
    link.style.color = "#00f2fe";
    link.style.fontSize = "10px";
    link.style.fontWeight = "bold";
    link.style.textDecoration = "none";
    link.style.borderBottom = "1px solid #00f2fe";
    link.style.paddingBottom = "2px";
    link.style.cursor = "pointer";
    
    linkContainer.appendChild(link);
    toast.appendChild(linkContainer);
  }

  document.body.appendChild(toast);

  // Animador básico de entrada
  const styleEl = document.createElement("style");
  styleEl.innerHTML = `
    @keyframes slideIn {
      from { transform: translateY(20px) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(styleEl);

  // Desaparecer automaticamente após 8 segundos
  setTimeout(() => {
    toast.style.transition = "all 0.5s ease-out";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    setTimeout(() => toast.remove(), 500);
  }, 8000);
}
