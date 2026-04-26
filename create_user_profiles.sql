-- Criando a tabela user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  description TEXT,
  avatar_url TEXT,
  custom_id TEXT UNIQUE,
  theme TEXT DEFAULT 'light',
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Exemplo de policy para a nova tabela
CREATE POLICY "Users can view their own user_profiles" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
