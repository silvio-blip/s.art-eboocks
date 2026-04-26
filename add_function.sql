-- 1. Función para disparar el email de bienvenida
-- Esta función se puede usar como base para el Webhook de Supabase
-- o para ser llamada manualmente.
CREATE OR REPLACE FUNCTION public.handle_new_user_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Esta función por sí sola no envía e-mails.
  -- Debe estar vinculada a un Webhook de Supabase (Dashboard -> Database -> Webhooks)
  -- que apunte a la Edge Function 'welcome-email'.
  
  -- Si prefieres usar la extensión pg_net (debe estar habilitada):
  -- PERFORM net.http_post(
  --   url := 'https://your-project.supabase.co/functions/v1/welcome-email',
  --   headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || auth.role()),
  --   body := jsonb_build_object('record', row_to_json(new))
  -- );

  RETURN NEW;
END;
$$;

-- 2. Trigger en la tabla de perfiles (o auth.users si tienes permisos)
-- Se recomienda usar el Dashboard de Supabase para configurar Webhooks en la tabla auth.users
-- pero aquí tienes cómo crear el trigger en 'public.profiles' si lo prefieres sincronizar allí.

-- DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
-- CREATE TRIGGER on_profile_created
--   AFTER INSERT ON public.profiles
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_welcome();
