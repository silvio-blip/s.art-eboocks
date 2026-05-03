
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
  async getProducts(): Promise<DropeaProduct[]> {
    try {
      console.log('--- Iniciando fetch para /api/dropea-products ---');
      const response = await fetch('/api/dropea-products');
      
      console.log('--- Resposta recebida. Status:', response.status, '---');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const products = await response.json();
      console.log('--- Sucesso! Produtos:', products.length, '---');
      return Array.isArray(products) ? products : [];
    } catch (error: any) {
      console.error('--- ERRO DETALHADO NO GET_PRODUCTS:', error);
      return [];
    }
  },

  /**
   * TAREFA: Função de importação/busca por ID corrigida seguindo as regras da Dropea
   * Note: O fetch real dos dados da Dropea ocorre no server.ts para proteger a API KEY.
   * Esta função atua como interface para o Painel Administrativo.
   */
  async importProduct(dropeaId: string | number) {
    try {
      const response = await fetch('/api/admin/products/import-dropea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          // O ID deve seguir como um número dentro de um contexto numérico no server
          dropeaId: Number(dropeaId) 
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
    
    console.log("[CHECKOUT] Payload check ID:", productIdRaw, "->", productId, "Country:", countryCode);
    
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
