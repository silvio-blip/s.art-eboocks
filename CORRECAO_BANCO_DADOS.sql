-- S.ART - CORREÇÃO FINAL DE SINCRONIZAÇÃO DE PERFIS
-- Execute este script no SQL Editor do seu Supabase Dashboard para resolver o problema de salvar dados.

-- 1. Garantir que a coluna 'welcomed' existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcomed BOOLEAN DEFAULT false;

-- 2. Função de Automação (Trigger)
-- Esta função cria o perfil AUTOMATICAMENTE assim que o utilizador se regista, 
-- seja por E-mail ou por Google, sem depender do código do site.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_custom_id text;
BEGIN
  -- Gerar ID personalizado (ex: SART-A1B2)
  v_custom_id := 'SART-' || UPPER(SUBSTRING(new.id::text, 1, 4));
  
  INSERT INTO public.profiles (id, email, full_name, avatar_url, custom_id, theme, welcomed)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    v_custom_id,
    'dark',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE 
      WHEN profiles.full_name IS NULL OR profiles.full_name = '' THEN EXCLUDED.full_name 
      ELSE profiles.full_name 
    END,
    avatar_url = CASE 
      WHEN profiles.avatar_url IS NULL OR profiles.avatar_url = '' THEN EXCLUDED.avatar_url 
      ELSE profiles.avatar_url 
    END;
  RETURN new;
END;
$$;

-- 3. Trigger de Inserção
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Correção de Políticas de Segurança (RLS)
-- Se as políticas estiverem erradas, o site não consegue ler nem escrever os dados.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfis públicos são visíveis por todos" ON public.profiles;
CREATE POLICY "Perfis públicos são visíveis por todos" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Utilizadores podem criar o próprio perfil" ON public.profiles;
CREATE POLICY "Utilizadores podem criar o próprio perfil" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Utilizadores podem atualizar o próprio perfil" ON public.profiles;
CREATE POLICY "Utilizadores podem atualizar o próprio perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 5. Função para Desativar Outros Triggers Conflitantes (Opcional - Use se necessário)
-- DROP TRIGGER IF EXISTS trigger_nome_antigo ON auth.users;
