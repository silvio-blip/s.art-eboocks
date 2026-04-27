-- 1. LIMPEZA TOTAL DE POLÍTICAS PROBLEMÁTICAS
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins gerenciam pedidos" ON public.orders;
DROP POLICY IF EXISTS "Ver pedidos próprios ou ser admin" ON public.orders;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Produtos visíveis para todos" ON public.products;
DROP POLICY IF EXISTS "Admins controlam produtos" ON public.products;

-- 2. CRIAR FUNÇÃO PARA EVITAR RECURSÃO (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TORNAR O SILVIO ADMIN
UPDATE public.profiles SET is_admin = true WHERE email = 'silviok5000@gmail.com';

-- 4. POLÍTICAS LIMPAS E FUNCIONAIS

-- PRODUTOS
CREATE POLICY "ver_produtos" ON public.products 
FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "admin_produtos" ON public.products 
FOR ALL USING (public.is_admin());

-- PEDIDOS (ORDERS)
CREATE POLICY "ver_pedidos" ON public.orders 
FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "criar_pedidos" ON public.orders 
FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_pedidos" ON public.orders 
FOR ALL USING (public.is_admin());

-- PERFIS (PROFILES)
CREATE POLICY "ver_perfis" ON public.profiles 
FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "atualizar_perfil" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);
