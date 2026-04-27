-- 1. GARANTIR A COLUNA IS_ADMIN
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. FUNÇÃO PARA EVITAR RECURSÃO INFINITA (Obrigatório para o Supabase)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT is_admin 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TORNAR VOCÊ ADMIN
UPDATE public.profiles SET is_admin = true WHERE email = 'silviok5000@gmail.com';

-- 4. LIMPAR POLÍTICAS ANTIGAS QUE CAUSAM ERRO
DROP POLICY IF EXISTS "Public can view active products" ON products;
DROP POLICY IF EXISTS "Admins manage products" ON products;
DROP POLICY IF EXISTS "Public and Admins view products" ON products;
DROP POLICY IF EXISTS "Admins full access to products" ON products;
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Admins can manage all orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles access" ON profiles;

-- 5. NOVAS POLÍTICAS SEM RECURSÃO

-- PRODUTOS
CREATE POLICY "Produtos visíveis para todos" ON products 
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins controlam produtos" ON products 
  FOR ALL USING (public.is_admin());

-- PEDIDOS (ORDERS)
CREATE POLICY "Ver pedidos próprios ou ser admin" ON orders 
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins gerenciam pedidos" ON orders 
  FOR ALL USING (public.is_admin());

CREATE POLICY "Qualquer um pode criar pedido" ON orders 
  FOR INSERT WITH CHECK (true);

-- PERFIS (PROFILES)
CREATE POLICY "Ver perfil próprio ou ser admin" ON profiles 
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Usuários editam próprio perfil" ON profiles 
  FOR UPDATE USING (auth.uid() = id);
