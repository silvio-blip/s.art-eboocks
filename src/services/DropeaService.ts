
export interface DropeaProduct {
  id: string;
  name: string;
  pvp: number;
  price?: number; // fallback/calculated field
  description: string;
  images: string[];
  category: string;
}

export interface DropeaCheckoutSession {
  product_id: string;
  customer_email: string;
  success_url: string;
  cancel_url: string;
  metadata?: any;
}

export const DropeaService = {
  async getProducts(userId?: string, retries = 2): Promise<DropeaProduct[]> {
    try {
      // Usar o endpoint do servidor que já possui CACHE para evitar 429 da Dropea
      const fetchUrl = '/api/dropea-products';
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`--- [DropeaService] Proxy Error ${response.status} ---`, errorText);
        
        // Se for 429, não adianta tentar em 1s, melhor falhar ou esperar muito mais
        if (response.status === 429 && retries > 0) {
           console.log(`--- [DropeaService] Rate limit hit. Waiting 5s before last retry... ---`);
           await new Promise(resolve => setTimeout(resolve, 5000));
           return DropeaService.getProducts(userId, retries - 1);
        }
        return [];
      }
      
      const rawProducts = await response.json();
      
      if (!Array.isArray(rawProducts)) {
        console.error('--- [DropeaService] Invalid data format from server ---');
        return [];
      }
      
      // Map to our DropeaProduct interface
      const products = rawProducts.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        pvp: Number(p.pvp || p.pvpr),
        pvpr: Number(p.pvpr),
        description: p.description || "",
        images: Array.isArray(p.images) ? p.images : [],
        category: p.category || "General"
      }));

      return products;
    } catch (error: any) {
      if (retries > 0) {
        console.log(`--- [DropeaService] Retrying fetch in 2s... (${retries} left) ---`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return DropeaService.getProducts(userId, retries - 1);
      }
      console.error('--- [DropeaService] FATAL ERROR ---', error);
      return [];
    }
  },

  /**
   * TAREFA: Função de importação/busca por ID corrigida seguindo as regras da Dropea
   * Note: O fetch real dos dados da Dropea ocorre no server.ts para proteger a API KEY.
   * Esta função atua como interface para o Painel Administrativo.
   */
  async importProduct(dropeaId: string | number, userId: string) {
    try {
      const response = await fetch(`/api/admin/products/import-dropea?userId=${userId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId 
        },
        body: JSON.stringify({ 
          // O ID deve seguir como um número dentro de um contexto numérico no server
          dropeaId: Number(dropeaId),
          userId 
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao importar produto da Dropea');
      }
      return data;
    } catch (error: any) {
      console.error('[DROPEA SERVICE] Erro na importação:', error.message);
      throw error;
    }
  },

  async createCheckout(session: any): Promise<{ order_id: string }> {
    // 1. Mapear País (CustomerCountryEnum)
    const { customer, ...rest } = session;
    const countryMap: Record<string, string> = {
        'Portugal': 'PT',
        'Espanha': 'ES',
        'Spain': 'ES'
    };
    const countryCode = countryMap[customer?.country] || customer?.country;
    
    // Tentar encontrar o product_id no root ou no primeiro produto
    const productIdRaw = session.product_id || (session.products && session.products[0]?.product_id);
    const productId = Number(productIdRaw);
    
    // console.log("[CHECKOUT] Payload check ID:", productIdRaw, "->", productId, "Country:", countryCode);
    
    if (!productId || isNaN(productId)) {
        throw new Error("ID do produto ausente ou inválido no checkout");
    }

    const payload = {
        ...rest,
        product_id: productId, // Se a API precisar no root
        customer: {
            ...customer,
            country: countryCode
        }
    };

    const response = await fetch('/api/dropea/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao criar sessão de checkout na Dropea');
    }
    
    const data = await response.json();
    return { order_id: data.order_id };
  }
};
