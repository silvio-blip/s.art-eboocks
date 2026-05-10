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
   */
  public static async importProduct(productId: string, currency: string = 'EUR', language: string = 'PT'): Promise<any> {
    const result = await this.getProductDetails(productId, currency, language);
    
    if (!result) {
      throw new Error('Não foi possível obter dados do produto do AliExpress.');
    }

    const baseInfo = result.ae_item_base_info_dto;
    const skuInfo = result.ae_item_sku_info_dtos;
    const multimedia = result.ae_multimedia_info_dto;

    if (!baseInfo) {
      throw new Error('Dados básicos do produto não encontrados no AliExpress.');
    }

    // Get the first price found in SKUs
    const price = skuInfo && skuInfo.length > 0 
      ? parseFloat(skuInfo[0].offer_sale_price || skuInfo[0].sku_price || "0")
      : 0;

    // Extract images
    const mainImage = baseInfo.main_image_urls?.length > 0 
      ? baseInfo.main_image_urls[0] 
      : (multimedia?.image_urls?.length > 0 ? multimedia.image_urls[0] : "");
    
    const extraImages = (multimedia?.image_urls || [])
      .filter((img: string) => img !== mainImage)
      .join(',');

    return {
      title: baseInfo.subject,
      description: baseInfo.detail || "",
      price: price,
      pvp: price, // Initial PVP same as price
      image_url: mainImage,
      extra_images: extraImages,
      category: 'AliExpress',
      product_type: 'physical',
      is_active: true,
      aliexpress_id: String(baseInfo.product_id),
      metadata: {
        source: 'AliExpress',
        import_date: new Date().toISOString()
      }
    };
  }
}
