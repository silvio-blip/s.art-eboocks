-- 1. ADICIONAR COLUNA IS_ADMIN SE NÃO EXISTIR
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. TORNAR O UTILIZADOR ATUAL ADMIN (silviok5000@gmail.com)
UPDATE profiles SET is_admin = true WHERE email = 'silviok5000@gmail.com';

-- 3. SAFER RLS POLICIES FOR ORDERS
-- Vamos remover as antigas e colocar novas que permitem ao Admin ver tudo

DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;

CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Admins can manage all orders" ON orders
  FOR ALL USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT WITH CHECK (true);

-- 4. SAFER RLS FOR PRODUCTS
DROP POLICY IF EXISTS "Public can view active products" ON products;
DROP POLICY IF EXISTS "Admins can manage products" ON products;

CREATE POLICY "Public and Admins view products" ON products
  FOR SELECT USING (
    is_active = true OR 
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Admins full access to products" ON products
  FOR ALL USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- 5. SAFER RLS FOR PROFILES
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Profiles access" ON profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 6. ENSURE STORAGE POLICIES (Handled in UI usually, but good to note)
-- Certifique-se que o bucket 'assets' tem políticas de leitura pública ou para admins.
