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

// Helper to sign AliExpress requests via HMAC-SHA256
async function signAliExpressRequest(params: Record<string, string>, appSecret: string) {
  const sortedKeys = Object.keys(params).sort();
  let baseString = "";
  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      baseString += key + value;
    }
  }

  const encoder = new TextEncoder();
  const secretData = encoder.encode(appSecret);
  const messageData = encoder.encode(baseString);

  const key = await crypto.subtle.importKey(
    "raw",
    secretData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  
  return hashHex;
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

      // 100% Automated Fulfillment Strategy
      if (order.product?.provider === "aliexpress" && order.product?.aliexpress_id) {
        console.log(`[AUTOMATION] Starting AliExpress fulfillment for Order ${orderId}`);

        try {
          // Parse Shipping Details
          let address;
          if (typeof order.shipping_details === "string") {
            address = JSON.parse(order.shipping_details);
          } else {
            address = order.shipping_details;
          }

          const appKey = Deno.env.get("ALIEXPRESS_APP_KEY");
          const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET");
          const accessToken = Deno.env.get("ALIEXPRESS_ACCESS_TOKEN");

          if (!appKey || !appSecret || !accessToken) {
            throw new Error("AliExpress API credentials missing");
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
                  product_id: parseInt(String(order.product.aliexpress_id).replace(/[^0-9]/g, ""), 10),
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
            sign_method: "hmac",
          };

          const allParams = { ...commonParams, ...businessParams };
          const filteredParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(allParams)) {
            if (v !== null && v !== undefined && v !== "") {
              filteredParams[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
            }
          }

          const sign = await signAliExpressRequest(filteredParams, appSecret);
          
          const urlParams = new URLSearchParams({ ...filteredParams, sign });
          const response = await fetch(`https://eco.aliexpress.com/router/rest?${urlParams.toString()}`, {
            method: "POST"
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
              
            return new Response("AliExpress API Error handled", { status: 200 });
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

          console.log(`[AUTOMATION] Order ${orderId} successfully sent to AliExpress`);
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
        // Not AliExpress or no ID - might be Dropea or manual
        console.log(`[FULFILLMENT] Order ${orderId} skipped for AliExpress automation (Provider: ${order.product?.provider})`);
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
