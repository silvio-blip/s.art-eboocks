import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Simple MD5 implementation for environments without subtle MD5
function md5(string: string) {
  function md5cycle(x: any, k: any) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function md5blk(s: string) {
    var md5blks: any[] = [], i;
    for (i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add32(rotl(add32(add32(a, (b & c) | ((~b) & d)), add32(x, t)), s), b); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add32(rotl(add32(add32(a, (b & d) | (c & (~d))), add32(x, t)), s), b); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add32(rotl(add32(add32(a, b ^ c ^ d), add32(x, t)), s), b); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return add32(rotl(add32(add32(a, c ^ (b | (~d))), add32(x, t)), s), b); }
  function rotl(x: number, n: number) { return (x << n) | (x >>> (32 - n)); }
  function add32(a: number, b: number) { return (a + b) & 0xFFFFFFFF; }
  function rhex(n: number) { var s = '', j = 0; for (; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F]; return s; }
  var hex_chr = '0123456789abcdef'.split('');
  var i = 0, n = string.length, x = [1732584193, -271733879, -1732584194, 271733878];
  for (; i <= n - 64; i += 64) md5cycle(x, md5blk(string.substring(i, i + 64)));
  string = string.substring(i);
  var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < string.length; i++) tail[i >> 2] |= string.charCodeAt(i) << ((i % 4) * 8);
  tail[i >> 2] |= 0x80 << ((i % 4) * 8);
  if (i > 55) { md5cycle(x, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
  tail[14] = n * 8;
  md5cycle(x, tail);
  return rhex(x[0]) + rhex(x[1]) + rhex(x[2]) + rhex(x[3]);
}

// Helper to sign AliExpress requests (MD5 format)
async function signAliExpressRequest(params: Record<string, string>, appSecret: string) {
  const sortedKeys = Object.keys(params).sort();
  let baseString = appSecret;
  for (const key of sortedKeys) {
    if (key === "sign") continue;
    const value = params[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      baseString += key + String(value);
    }
  }
  baseString += appSecret;
  return md5(baseString).toUpperCase();
}

/**
 * Limpa qualquer prefixo (como ALI-) de IDs do AliExpress
 */
function cleanAliExpressId(id: string | number | undefined | null): string {
  if (!id) return "";
  return String(id).replace(/[^0-9]/g, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret || "");
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;

      if (!orderId) {
        console.error("No order_id in metadata");
        return new Response("Order ID missing", { status: 400 });
      }

      // Initialize Supabase Client
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Fetch Order Data
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(`
          *,
          product:products(*)
        `)
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("Order fetch error:", orderError);
        return new Response("Order not found", { status: 404 });
      }

      // Trigger Payment Confirmation Email with Invoice (if not already sent)
      if (!order.email_paid_sent) {
        try {
          const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-confirmed`;
          const functionKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

          let customerName = "Cliente";
          try {
            const details = typeof order.shipping_details === 'string' ? JSON.parse(order.shipping_details) : order.shipping_details;
            customerName = details?.fullName || details?.name || (details?.firstName ? `${details.firstName} ${details.lastName || ""}` : session.customer_details?.name || "Cliente");
          } catch (e) {
            customerName = session.customer_details?.name || "Cliente";
          }

          const emailResponse = await fetch(functionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${functionKey}`
            },
            body: JSON.stringify({
              orderId: order.id,
              email: order.customer_email || session.customer_details?.email,
              customerName: customerName.trim(),
              product: {
                id: order.product?.id,
                name: order.product?.title,
                price: order.product?.price || order.total_amount,
                image: order.product?.image_url
              }
            })
          });

          if (emailResponse.ok) {
            await supabase
              .from("orders")
              .update({ email_paid_sent: true })
              .eq("id", orderId);
            console.log(`[EMAIL] Payment confirmation email triggered for order ${orderId}`);
          } else {
            const errorText = await emailResponse.text();
            console.error(`[EMAIL_ERROR] Function returned error: ${errorText}`);
          }
        } catch (emailErr) {
          console.error("[EMAIL_ERROR] Failed to trigger payment confirmation email:", emailErr);
        }
      } else {
        console.log(`[EMAIL] Payment confirmation email skipped (already sent) for order ${orderId}`);
      }

      // 100% Automated Fulfillment Strategy
      if (order.product?.provider === "aliexpress" && order.product?.aliexpress_id) {
        console.log(`[AUTOMATION] Starting International fulfillment for Order ${orderId}`);

        try {
          // Parse Shipping Details
          let address;
          if (typeof order.shipping_details === "string") {
            address = JSON.parse(order.shipping_details);
          } else {
            address = order.shipping_details;
          }

          const appKey = (Deno.env.get("ALIEXPRESS_APP_KEY") || "").trim();
          const appSecret = (Deno.env.get("ALIEXPRESS_APP_SECRET") || "").trim();
          const accessToken = (Deno.env.get("ALIEXPRESS_ACCESS_TOKEN") || "").trim();

          if (!appKey || !appSecret || !accessToken) {
            throw new Error("International API credentials missing");
          }

          const method = "aliexpress.trade.buy.placeorder";
          const timestamp = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
          
          const businessParams = {
            param_place_order_request4_open_api_d_t_o: JSON.stringify({
              logistics_address: {
                address: address.address,
                city: address.city,
                contact_person: address.fullName || `${address.firstName} ${address.lastName}`,
                country: address.countryCode || "PT",
                phone: address.phone,
                province: address.province || address.city,
                zip: address.zip || address.postalCode
              },
              product_items: [
                {
                  product_count: order.quantity || 1,
                  product_id: parseInt(cleanAliExpressId(order.product.aliexpress_id), 10),
                  sku_attr: order.sku || ""
                }
              ]
            })
          };

          const commonParams: Record<string, string> = {
            method,
            app_key: appKey,
            session: accessToken,
            timestamp,
            format: "json",
            v: "2.0",
            sign_method: "md5",
          };

          const allParams = { ...commonParams, ...businessParams };
          const filteredParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(allParams)) {
            if (v !== null && v !== undefined && v !== "") {
              filteredParams[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
            }
          }

          const sign = await signAliExpressRequest(filteredParams, appSecret);
          
          const sortedKeysFinal = Object.keys(filteredParams).sort();
          const bodyParts = sortedKeysFinal.map(k => `${k}=${encodeURIComponent(filteredParams[k] as string)}`);
          bodyParts.push(`sign=${sign}`);
          const body = bodyParts.join('&');

          const response = await fetch(`https://api-sg.aliexpress.com/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
          });

          const result = await response.json();

          if (result.error_response) {
            console.error("[ALIEXPRESS_API_ERROR]", result.error_response);
            
            // Mark for manual intervention if token/permission error
            await supabase
              .from("orders")
              .update({ 
                status: "manual_fulfillment_required",
                fulfillment_error: result.error_response.msg 
              })
              .eq("id", orderId);
              
            return new Response("Supplier API Error handled", { status: 200 });
          }

          // SUCCESS: Update order status to supplier processing
          await supabase
            .from("orders")
            .update({ 
              status: "processing_at_supplier",
              shipping_status: "preparing",
              updated_at: new Date().toISOString()
            })
            .eq("id", orderId);

          console.log(`[AUTOMATION] Order ${orderId} successfully sent to international supplier`);
        } catch (fulfillErr) {
          console.error("[FULLFILLMENT_FATAL_ERROR]", fulfillErr);
          await supabase
            .from("orders")
            .update({ 
              status: "manual_fulfillment_required",
              fulfillment_error: fulfillErr.message 
            })
            .eq("id", orderId);
        }
      } else {
        // Not AliExpress or no ID - might be manual fulfillment
        console.log(`[FULFILLMENT] Order ${orderId} skipped for Automation (Provider: ${order.product?.provider})`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(`Edge Function Runtime Error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
