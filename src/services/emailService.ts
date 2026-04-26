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
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to, subject, body, name },
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
}
