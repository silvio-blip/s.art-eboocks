-- S.ART Atelier - Migrações de E-reader
-- 1. Tabela de Perfis de Utilizador (caso não exista)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabela de Progresso de Leitura
CREATE TABLE IF NOT EXISTS public.user_reading_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  last_page_read INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  annotations JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reading_progress ENABLE ROW LEVEL SECURITY;

-- Políticas para user_profiles
CREATE POLICY "Utilizadores podem ver perfis públicos" ON public.user_profiles
  FOR SELECT USING (true);

CREATE POLICY "Utilizadores podem editar o próprio perfil" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Políticas para user_reading_progress
CREATE POLICY "Utilizadores podem ver o próprio progresso" ON public.user_reading_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Utilizadores podem gerir o próprio progresso" ON public.user_reading_progress
  FOR ALL USING (auth.uid() = user_id);
