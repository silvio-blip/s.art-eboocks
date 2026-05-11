/**
 * AliExpressService
 * 
 * Handles communication with the AliExpress Open Platform REST API.
 * Calls a server-side proxy to keep credentials secure and avoid CORS issues.
 */
export class AliExpressService {
  /**
   * Generic method to make requests to AliExpress API via server-side proxy
   */
  public static async makeRequest(apiMethod: string, businessParams: Record<string, any> = {}): Promise<any> {
    try {
      const response = await fetch('/api/aliexpress/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: apiMethod,
          params: businessParams
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `AliExpress Request failed: ${response.status}`);
      }

      const data = await response.json();

      // Check for API errors
      if (data.error_response) {
        console.error('AliExpress API Error:', data.error_response);
        throw new Error(`AliExpress API Error: ${data.error_response.msg} (Code: ${data.error_response.code})`);
      }

      return data;
    } catch (error) {
      console.error('Error in AliExpressService.makeRequest:', error);
      throw error;
    }
  }

  /**
   * Fetches product details from AliExpress
   * Endpoint: aliexpress.ds.product.get
   */
  public static async getProductDetails(productId: string, currency: string = 'EUR', language: string = 'PT'): Promise<any> {
    const businessParams = {
      product_id: productId,
      target_currency: currency,
      target_language: language,
      ship_to_country: 'PT',
    };

    const result = await this.makeRequest('aliexpress.ds.product.get', businessParams);

    // Clean JSON response (extract nested data)
    const responseKey = 'aliexpress_ds_product_get_response';
    if (result && result[responseKey]) {
      return result[responseKey].result || result[responseKey];
    }

    return result;
  }

  /**
   * Fetches product details from AliExpress and maps to internal Product interface
   * Updated to use the integrated server-side endpoint for 100% automation consistency.
   */
  public static async importProduct(productId: string): Promise<any> {
    const userId = JSON.parse(localStorage.getItem('sb-ofdxkoy6wmjezzmm67xzxa-auth-token') || '{}')?.user?.id;
    
    const response = await fetch('/api/admin/products/import-aliexpress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId || ''
      },
      body: JSON.stringify({ productId })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao importar do AliExpress');
    }

    return await response.json();
  }

  /**
   * Places an order on AliExpress for dropshipping
   * Endpoint: aliexpress.trade.buy.placeorder
   */
  public static async placeOrder(order: any, customerAddress: any): Promise<any> {
    const businessParams = {
      param_place_order_request4_open_api_d_t_o: JSON.stringify({
        out_order_id: order.id,
        logistics_address: {
          address: customerAddress.address,
          city: customerAddress.city,
          contact_person: customerAddress.fullName || `${customerAddress.firstName} ${customerAddress.lastName}`,
          country: customerAddress.countryCode || customerAddress.country || 'PT',
          phone: customerAddress.phone,
          province: customerAddress.province || customerAddress.city,
          zip: customerAddress.zip || customerAddress.postalCode
        },
        product_items: [
          {
            product_count: order.quantity || 1,
            product_id: parseInt(String(order.product?.aliexpress_id || order.aliexpress_id).replace(/[^0-9]/g, ''), 10),
            // sku_attr: "" // Can be added if we store SKU info
          }
        ]
      })
    };

    return await this.makeRequest('aliexpress.trade.buy.placeorder', businessParams);
  }
}
