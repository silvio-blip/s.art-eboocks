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

/**
 * Filtra imagens de ruído como logotipos, avatares, banners, selos, propagandas ou ícones decorativos
 */
function isNoiseImage(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  const noiseWords = [
    "avatar", "logo", "icon", "banner", "flag", "sprite", "pay", "payment", "trust", 
    "cert", "shield", "badge", "footer", "header", "recomis_", "empathy_", "loading", 
    "placeholder", "check", "close", "arrow", "play", "video", "star", "bullet", "marker",
    "favicon", "captcha", "g-icon", "service", "wechat", "whatsapp", "facebook", "instagram",
    "promo", "email", "opening", "frontpage", "static", "marketing", "promotion", "delivery",
    "free_shipping", "openingemail", "supplier-public-tag", "policy", "terms", "guarantee",
    "refund", "security", "customer", "support", "help", "rating", "star-", "reviews"
  ];
  return noiseWords.some(word => lower.includes(word));
}

/**
 * Filtra descrições de ruído como contadores de carrinho, subtotais, termos legais ou checkout de site
 */
function isNoiseDescription(text) {
  if (!text) return true;
  const lower = text.trim().toLowerCase();
  
  // Se contiver números em formato de contador de carrinho ou termos de checkout
  if (lower.includes("\n0\n1\n2\n3") || lower.includes("\n01\n02\n03") || lower.includes("subtotal") || lower.includes("finalizar a compra") || lower.includes("ir para o carrinho") || lower.includes("selecionar tudo")) return true;
  if (lower.includes("subtotal") && (lower.includes("carrinho") || lower.includes("bag") || lower.includes("sacola"))) return true;
  
  // Palavras de ruído de checkout/footer/UI do site
  const noise = [
    "política de privacidade", "termos de serviço", "todos os direitos reservados",
    "carrinho de compras", "finalizar compra", "cupom de desconto", "métodos de pagamento", 
    "custo de envio", "esqueci a minha senha", "criar uma conta", "taxas alfandegárias",
    "termos e condições", "política de devolução", "entrega grátis", "comprar agora",
    "adicionar ao carrinho", "compras seguras", "garantia de entrega", "reembolso", "devoluções gratuitas"
  ];
  if (noise.some(n => lower.includes(n))) return true;
  
  return false;
}

/**
 * Verifica se um elemento está situado dentro de áreas lixo, headers, footers, popups de cupom ou carrinhos flutuantes.
 * Isto impede o extrator de capturar dados de variação, preço ou especificações fora da caixinha do produto.
 */
function isElementNoiseOrOutsideProduct(el) {
  if (!el || typeof el.closest !== 'function') return false;
  
  const noiseSelectors = [
    "[class*='cart']", "[class*='bag']", "[class*='sacola']", "[class*='carrinho']", "[id*='cart']", "[id*='bag']",
    "[class*='header']", "[class*='footer']", "[id*='header']", "[id*='footer']",
    "[class*='modal']", "[class*='popup']", "[class*='dialog']", "[class*='drawer']", "[class*='overlay']",
    "[class*='sidebar']", "[class*='aside']", "[class*='lateral']", "[class*='nav']",
    "[class*='recommend']", "[class*='recomis_']", "[class*='suggest']", "[class*='related']",
    "[class*='quick-checkout']", "[class*='pay-']", "[class*='payment']", "[class*='buy-box']"
  ];
  
  for (const sel of noiseSelectors) {
    try {
      if (el.closest(sel)) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}


/**
 * Limpa URLs de miniaturas/múltiplas resoluções para obter as imagens em alta resolução originais
 */
function cleanProductImageUrl(url) {
  if (!url || typeof url !== 'string') return "";
  let clean = url.trim();
  if (clean.startsWith("//")) {
    clean = "https:" + clean;
  }
  
  // Limpar transformações do AliExpress (ex: _50x50.jpg, _Q90.jpg, _.webp)
  clean = clean.replace(/_\d+x\d+q?\d*\.(jpg|png|jpeg|webp)/i, "");
  clean = clean.replace(/_\d+x\d+px\.(jpg|png|jpeg|webp)/i, "");
  clean = clean.replace(/_\.webp/i, "");
  clean = clean.replace(/_Q\d+\.(jpg|png|jpeg|webp)/i, "");
  
  // Limpar transformações do Temu (parâmetros do imageView2 de corte e miniatura)
  if (clean.includes("imageView2")) {
    clean = clean.split("?")[0];
  }
  
  // Remover query strings que reduzem tamanho ou têm sessões, mantendo as originais
  const urlObj = clean.split("?");
  const baseUrl = urlObj[0];
  if (urlObj[1]) {
    const params = urlObj[1].split("&").filter(p => !p.startsWith("w=") && !p.startsWith("h=") && !p.startsWith("width=") && !p.startsWith("height=") && !p.startsWith("imageView"));
    clean = params.length > 0 ? baseUrl + "?" + params.join("&") : baseUrl;
  }
  
  return clean;
}

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
 * Motor AliExpress refinado de alto padrão com extração completa de variações e descrição
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
  let mainImage = "";
  let rawImg = (jld && jld.image) ? jld.image : "";
  if (rawImg && !isNoiseImage(rawImg)) {
    mainImage = cleanProductImageUrl(rawImg);
  }
  
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
        let candidateSrc = el.tagName === "META" ? el.getAttribute("content") : el.src;
        if (candidateSrc && candidateSrc.startsWith("http")) {
          candidateSrc = cleanProductImageUrl(candidateSrc);
          if (!isNoiseImage(candidateSrc)) {
            mainImage = candidateSrc;
            break;
          }
        }
      }
    }
  }

  // Recolher as variações/skus brutas
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

  // Heurística de Cores e Tamanhos separados no AliExpress com fuso de fallbacks
  let extractedCores = [];
  let extractedTamanhos = [];

  const skuContainers = document.querySelectorAll(".sku-property, [class*='sku-property'], [class*='SkuProperty']");
  skuContainers.forEach(container => {
    const titleEl = container.querySelector(".sku-title, [class*='title'], [class*='header'], [class*='name']");
    const titleText = titleEl ? titleEl.textContent.trim().toLowerCase() : "";
    
    const items = container.querySelectorAll(".sku-property-val, .sku-property-item, [class*='value'], [class*='item'], li, button");
    items.forEach(item => {
      let txt = item.getAttribute("title") || item.getAttribute("aria-label") || "";
      if (!txt) {
        const span = item.querySelector("span");
        txt = span ? span.textContent.trim() : item.textContent.trim();
      }
      txt = txt.trim();
      if (txt && txt.length > 0 && txt.length < 35) {
        if (titleText.includes("cor") || titleText.includes("color") || titleText.includes("modelo") || titleText.includes("geração") || titleText.includes("style")) {
          if (!extractedCores.includes(txt)) extractedCores.push(txt);
        } else if (titleText.includes("tamanho") || titleText.includes("size") || titleText.includes("medida") || titleText.includes("comprimento") || titleText.includes("largura") || titleText.includes("dimens")) {
          if (!extractedTamanhos.includes(txt)) extractedTamanhos.push(txt);
        } else {
          // Heurística rápida
          const isSz = /^(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|xs|[0-9]{2,3}(\s*cm|\s*mm|m)?)$/i.test(txt);
          if (isSz) {
            if (!extractedTamanhos.includes(txt)) extractedTamanhos.push(txt);
          } else if (item.querySelector("img") || txt.toLowerCase().includes("preto") || txt.toLowerCase().includes("branco") || txt.toLowerCase().includes("azul")) {
            if (!extractedCores.includes(txt)) extractedCores.push(txt);
          }
        }
      }
    });
  });

  // Fallbacks adaptativos se os seletores restritos do AliExpress voltarem vazios
  if (extractedCores.length === 0) {
    const kwColors = ["cor", "cores", "color", "colors", "estilo", "style", "pattern", "padrão", "cor:"];
    extractedCores = findOptionsByLabelKeywords(kwColors);
  }
  if (extractedTamanhos.length === 0) {
    const kwSizes = ["tamanho", "tamanhos", "size", "sizes", "medida", "medidas", "talla", "tallas", "comprimento"];
    extractedTamanhos = findOptionsByLabelKeywords(kwSizes);
  }
  if (extractedTamanhos.length === 0) {
    extractedTamanhos = findTamanhosBySizingRegex();
  }

  // Descrição / Especificações
  const metaDesc = document.querySelector("meta[name='description']")?.getAttribute("content") || 
                   document.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

  let descriptionText = "";
  const specContainers = document.querySelectorAll(".product-params, .specification-keys, #product-detail, #nav-description, .product-description, [class*='params'], [class*='spec']");
  const descParagraphs = [];
  specContainers.forEach(container => {
    const text = container.innerText ? container.innerText.trim() : "";
    if (text && text.length > 30 && text.length < 8000 && !descParagraphs.includes(text)) {
      if (!isNoiseDescription(text)) {
        descParagraphs.push(text);
      }
    }
  });
  
  descriptionText = descParagraphs.join("\n\n").trim();
  
  if (!descriptionText) {
    descriptionText = findAdaptiveDescription();
  }
  
  descriptionText = descriptionText.substring(0, 8000);

  return {
    platform: "AliExpress",
    title: title || document.title || "Produto AliExpress importado",
    price: price || "0",
    mainImage: mainImage || "",
    variations: variations.slice(0, 10),
    extractedCores,
    extractedTamanhos,
    descriptionText,
    metaDescription: metaDesc,
    extraImages: findCarouselImages(),
    url: window.location.href
  };
}

/**
 * Motor Temu refinado de alta precisão com extração de variações e descrição profunda
 */
function extractTemu() {
  console.log("[CyberExtract] Executando análise inteligente na Temu...");
  
  // Tentar JSON-LD estruturado
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
  let mainImage = "";
  let rawImg = (jld && jld.image) ? jld.image : "";
  if (rawImg && !isNoiseImage(rawImg)) {
    mainImage = cleanProductImageUrl(rawImg);
  }
  
  if (!mainImage) {
    const imgSelectors = [
      "meta[property='og:image']",
      "img.magnifier-image",
      "[class*='main-img']",
      "[class*='mainImage'] img",
      "[class*='main_img']",
      "div[class*='mainImage'] img",
      "img[data-as-main-img='true']",
      "#main-image",
      "[class*='gallery'] img"
    ];
    for (const selector of imgSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        let candidateSrc = el.tagName === "META" ? el.getAttribute("content") : el.src;
        if (candidateSrc && candidateSrc.startsWith("http")) {
          candidateSrc = cleanProductImageUrl(candidateSrc);
          if (!isNoiseImage(candidateSrc)) {
            mainImage = candidateSrc;
            break;
          }
        }
      }
    }
  }

  // Fallback extra de Imagem de tamanho razoável na Viewport
  if (!mainImage) {
    const imgs = Array.from(document.querySelectorAll("img"));
    const bestImg = imgs.find(i => {
      const src = i.src || "";
      if (!src.startsWith("http") || isNoiseImage(src)) return false;
      const isProductCDN = src.includes("kwcdn.com") || src.includes("alicdn.com");
      return isProductCDN || i.naturalWidth > 250 || i.width > 250;
    });
    if (bestImg) mainImage = cleanProductImageUrl(bestImg.src);
  }

  // Variações brutas
  const variations = [];
  const variationEls = document.querySelectorAll("[class*='sku'], [class*='spec'], [class*='prop'], [class*='item']");
  variationEls.forEach(el => {
    if (isElementNoiseOrOutsideProduct(el)) return;
    const txt = el.textContent ? el.textContent.trim() : "";
    const img = el.querySelector("img");
    const imgUrl = img ? img.src : "";
    
    if (txt && txt.length > 0 && txt.length < 25 && variations.length < 10) {
      if (!variations.some(v => v.name === txt)) {
        variations.push({ name: txt, imgUrl });
      }
    }
  });

  // Heurística de Cores e Tamanhos na Temu com fusão de fallbacks
  let extractedCores = [];
  let extractedTamanhos = [];

  // Mapeamos os blocos de variação da Temu
  const skuContainers = document.querySelectorAll(
    "[class*='sku'], [class*='spec'], [class*='prop'], [class*='StandardProductSlices'], [class*='Variation'], [class*='skus']"
  );
  
  skuContainers.forEach(container => {
    if (isElementNoiseOrOutsideProduct(container)) return;
    const headerEl = container.querySelector("[class*='title'], [class*='label'], [class*='header'], [class*='name']");
    const headerText = headerEl ? headerEl.textContent.trim().toLowerCase() : "";
    
    const items = container.querySelectorAll(
      "[class*='item'], [class*='value'], [class*='btn'], button, li, [role='radio'], [class*='cell']"
    );
    
    items.forEach(item => {
      if (isElementNoiseOrOutsideProduct(item)) return;
      let txt = item.getAttribute("title") || item.getAttribute("aria-label") || "";
      if (!txt) {
        const textSpan = item.querySelector("span, p, div");
        txt = textSpan ? textSpan.textContent.trim() : item.textContent.trim();
      }
      
      // Limpeza suave (como retirar preço que some no botão)
      txt = txt.split("\n")[0].trim().replace(/\s+/g, " ");
      
      if (txt && txt.length > 0 && txt.length < 25) {
        // Ignorar se for preço, moeda ou botão de quantidade
        if (/^(€|\$|R\$|£|\+|-|\d+)$/.test(txt)) return;
        
        if (headerText.includes("cor") || headerText.includes("color") || headerText.includes("modelo") || headerText.includes("pattern") || headerText.includes("style")) {
          if (!extractedCores.includes(txt)) extractedCores.push(txt);
        } else if (headerText.includes("tamanho") || headerText.includes("size") || headerText.includes("medida") || headerText.includes("dimens") || headerText.includes("largura") || headerText.includes("altura")) {
          if (!extractedTamanhos.includes(txt)) extractedTamanhos.push(txt);
        } else {
          // Heurística de tipo por conteúdo
          const isSize = /^(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|xs|[0-9]{2,3}(\s*cm|\s*mm|m)?)$/i.test(txt);
          if (isSize) {
            if (!extractedTamanhos.includes(txt)) extractedTamanhos.push(txt);
          } else {
            const hasImg = item.querySelector("img");
            if (hasImg || txt.toLowerCase().includes("preto") || txt.toLowerCase().includes("branco") || txt.toLowerCase().includes("azul")) {
              if (!extractedCores.includes(txt)) extractedCores.push(txt);
            }
          }
        }
      }
    });
  });

  // Fallbacks adaptativos se os seletores estruturais com classes Temu falharem
  if (extractedCores.length === 0) {
    const kwColors = ["cor", "cores", "color", "colors", "cor/modelo", "modelo", "style", "estilo", "pattern", "padrão", "cor:"];
    extractedCores = findOptionsByLabelKeywords(kwColors);
  }
  if (extractedTamanhos.length === 0) {
    const kwSizes = ["tamanho", "tamanhos", "size", "sizes", "medida", "medidas", "talla", "tallas", "comprimento", "dimensão"];
    extractedTamanhos = findOptionsByLabelKeywords(kwSizes);
  }
  if (extractedTamanhos.length === 0) {
    extractedTamanhos = findTamanhosBySizingRegex();
  }

  // Se nada foi categorizado, mas temos variações, tentamos separar usando heurística fina
  if (extractedCores.length === 0 && extractedTamanhos.length === 0 && variations.length > 0) {
    variations.forEach(v => {
      const name = v.name;
      const isSize = /^(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|xs|[0-9]{2,3}(\s*cm|\s*mm|m)?)$/i.test(name);
      if (isSize) {
        if (!extractedTamanhos.includes(name)) extractedTamanhos.push(name);
      } else {
        if (!extractedCores.includes(name)) extractedCores.push(name);
      }
    });
  }

  // Descrição / Especificações
  const metaDesc = document.querySelector("meta[name='description']")?.getAttribute("content") || 
                   document.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

  let descriptionText = "";
  const descSelectors = [
    "[class*='desc']",
    "[class*='specification']",
    "[class*='details']",
    "[class*='parameter']",
    "[class*='attribute']",
    "[class*='spec-list']",
    "[class*='specs']",
    "[class*='prop-list']"
  ];
  const descTexts = [];
  descSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (isElementNoiseOrOutsideProduct(el)) return;
      const text = el.innerText ? el.innerText.trim() : "";
      if (text && text.length > 20 && text.length < 5000 && !descTexts.includes(text)) {
        if (!isNoiseDescription(text)) {
          descTexts.push(text);
        }
      }
    });
  });
  
  descriptionText = descTexts.join("\n\n").trim();
  
  if (!descriptionText) {
    descriptionText = findAdaptiveDescription();
  }
  
  descriptionText = descriptionText.substring(0, 8000);

  return {
    platform: "Temu",
    title: title || document.title || "Produto Temu extraído",
    price: price || "0",
    mainImage: mainImage || "",
    variations,
    extractedCores,
    extractedTamanhos,
    descriptionText,
    metaDescription: metaDesc,
    extraImages: findCarouselImages(),
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
      // 1. Verificar de forma segura se as APIs do Chrome estão ativas no tab (Prevenir o "Extension context invalidated")
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.sendMessage) {
        throw new Error("O plug-in foi atualizado ou reiniciado. Por favor, RECARREGUE (F5) esta página para reatar a ligação automática.");
      }

      // 2. Executar a extração automática avançada
      const productData = runMasterExtraction();
      console.log("[CyberExtract Floating Button] Dados coletados na página:", productData);

      // 3. Obter a URL de backend armazenada de forma segura
      chrome.storage.local.get(["BACKEND_URL"], (storageResult) => {
        const fallbackUrl = "https://sart-full.pt/";
        const savedUrl = (storageResult && storageResult.BACKEND_URL) ? storageResult.BACKEND_URL : fallbackUrl;
        
        // 4. Enviar mensagem de ponte para o background.js que não sofre de bloqueios CORS do navegador
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

/**
 * Heurística adaptativa avançada para encontrar opções de variações (Cores ou Tamanhos)
 * escaneando rótulos de texto na página e capturando os elementos clicáveis irmãos ou filhos.
 * Isso garante independência de alterações de classes (mangling) pelas plataformas.
 */
function findOptionsByLabelKeywords(keywords) {
  const options = [];
  try {
    const allElements = Array.from(document.querySelectorAll("div, span, h2, h3, h4, p, label, legend, strong, b"));
    
    for (const el of allElements) {
      if (el.children.length > 5) continue; // Pular nós contenedores genéricos muito grandes
      
      const text = el.textContent.trim().toLowerCase();
      if (!text || text.length > 50) continue;
      
      const match = keywords.some(kw => {
        const k = kw.toLowerCase();
        return text === k || text === k + ":" || text.startsWith(k + " ") || text.startsWith(k + ":");
      });
      
      if (match) {
        // Encontramos um rótulo de especificação! Subimos no DOM para obter o bloco de botões/opções
        let parent = el.parentElement;
        let depth = 0;
        
        while (parent && depth < 4) {
          const candidates = parent.querySelectorAll(
            "button, li, a, [role='button'], [role='radio'], [class*='option'], [class*='item'], [class*='value'], [class*='btn'], [class*='sku'], [class*='cell']"
          );
          
          const foundTexts = [];
          candidates.forEach(cand => {
            // Obter texto do candidato de forma agressiva e limpa
            let txt = cand.getAttribute("title") || cand.getAttribute("aria-label") || "";
            if (!txt) {
              const span = cand.querySelector("span, p, div");
              txt = span ? span.textContent.trim() : cand.textContent.trim();
            }
            
            // Dividir por quebra de linha para ignorar pequenos badges de preço ou desconto interno ao botão
            txt = txt.split("\n")[0].trim().replace(/\s+/g, " ");
            
            // Validar que o texto faça sentido (que não zero caracteres, que não seja maior que 35, e que não seja um número puro de preço)
            if (txt && txt.length > 0 && txt.length < 35) {
              if (!/^(€|\$|R\$|£|\+|-|\d+\.?\d*|\d+%)$/.test(txt)) {
                if (!foundTexts.includes(txt) && txt.toLowerCase() !== text) {
                  foundTexts.push(txt);
                }
              }
            }
          });
          
          if (foundTexts.length > 0) {
            options.push(...foundTexts);
            break; // Encontramos as opções neste nível, parar de subir
          }
          
          parent = parent.parentElement;
          depth++;
        }
      }
    }
  } catch (err) {
    console.error("[CyberExtract Heuristic Error]", err);
  }
  return [...new Set(options)];
}

/**
 * Heurística específica de tamanhos clássicos de vestuário na página
 */
function findTamanhosBySizingRegex() {
  const sizes = [];
  try {
    const allButtons = document.querySelectorAll("button, li, [role='button'], [role='radio']");
    const sizeRegex = /^(s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|xs|[0-9]{2,3}(\s*cm|\s*mm|m)?)$/i;
    allButtons.forEach(btn => {
      let txt = btn.textContent.trim();
      txt = txt.split("\n")[0].replace(/\s+/g, " ").trim();
      if (sizeRegex.test(txt) && txt.length < 10) {
        sizes.push(txt.toUpperCase());
      }
    });
  } catch (e) {}
  return [...new Set(sizes)];
}

/**
 * Heurística adaptativa de descrição rica do produto
 */
function findAdaptiveDescription() {
  const paragraphs = [];
  try {
    const keywordsDesc = [
      "especificações", "especificação", "detalhes", "descrição", "características", "propriedades", "especificação técnica",
      "specification", "specifications", "details", "description", "features", "attributes", "parâmetros", "parameters", "sobre este item"
    ];
    
    const allContainers = Array.from(document.querySelectorAll("div, section, article, table"));
    allContainers.forEach(el => {
      const header = el.querySelector("h2, h3, h4, h5, div[class*='title'], span[class*='title'], div[id*='title'], span[id*='title']");
      if (header) {
        const headerText = header.textContent.trim().toLowerCase();
        const match = keywordsDesc.some(kw => headerText === kw || headerText.includes(kw));
        if (match) {
          const textContent = el.innerText || el.textContent;
          const cleaned = textContent.trim();
          if (cleaned && cleaned.length > 50 && cleaned.length < 5000) {
            if (!paragraphs.includes(cleaned)) {
              paragraphs.push(cleaned);
            }
          }
        }
      }
    });
    
    // Se não achou de forma granular, escanear os seletores de classe comumente usados por e-commerce
    if (paragraphs.length === 0) {
      const fallbacks = [
        "[class*='desc']",
        "[class*='specification']",
        "[class*='details']",
        "[class*='parameter']",
        "[class*='attribute']",
        "[class*='spec-list']",
        "[class*='specs']",
        "[class*='prop-list']"
      ];
      fallbacks.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const txt = el.innerText ? el.innerText.trim() : "";
          if (txt && txt.length > 50 && txt.length < 4000) {
            if (!paragraphs.includes(txt)) {
              paragraphs.push(txt);
            }
          }
        });
      });
    }
  } catch (err) {}
  return paragraphs.join("\n\n").substring(0, 8000);
}

/**
 * Heurística adaptativa avançada para extrair imagens suplementares da galeria/carrossel oficial do produto
 */
function findCarouselImages() {
  const images = [];
  try {
    const selectors = [
      ".images-view-list img",
      ".image-thumb-list img",
      ".slider-wrap img",
      ".image-gallery img",
      "[class*='thumb'] img",
      "[class*='gallery'] img",
      "[class*='indicator'] img",
      "[class*='slide'] img",
      ".product-main-image img",
      ".magnifier-image",
      "img.magnifier-image",
      ".image-view-magnifier img",
      "[class*='swiper-slide'] img"
    ];
    
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(img => {
        if (isElementNoiseOrOutsideProduct(img)) return;
        let src = img.src || img.getAttribute("data-src") || img.getAttribute("src") || "";
        if (src && src.startsWith("http")) {
          const cleanSrc = cleanProductImageUrl(src);
          if (cleanSrc && !isNoiseImage(cleanSrc)) {
            images.push(cleanSrc);
          }
        }
      });
    });

    if (images.length < 3) {
      document.querySelectorAll("img").forEach(img => {
        if (isElementNoiseOrOutsideProduct(img)) return;
        const src = img.src;
        if (src && src.startsWith("http")) {
          const cleanSrc = cleanProductImageUrl(src);
          if (cleanSrc && !isNoiseImage(cleanSrc)) {
            const isProductDomain = src.includes("alicdn.com") || src.includes("kwcdn.com");
            if (isProductDomain || img.naturalWidth > 150 || img.width > 150) {
              images.push(cleanSrc);
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("[CyberExtract Carousel Heuristic Error]", err);
  }
  return [...new Set(images)].slice(0, 15); // Limita a até 15 imagens suplementares elegantes
}

