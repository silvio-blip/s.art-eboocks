import { supabase } from "../lib/supabase";

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  name?: string;
}

/**
 * Sends a custom HTML email via Supabase Edge Function using Gmail SMTP.
 */
export async function sendCustomEmail({ to, subject, body, name }: SendEmailParams) {
  try {
    const { data, error } = await supabase.functions.invoke("send-order-email", {
      body: { 
        email: to, 
        subject, 
        customerName: name || 'Cliente',
        type: 'custom', // Um tipo genérico para quando não é um evento de pedido específico
        status: subject
      },
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
}
