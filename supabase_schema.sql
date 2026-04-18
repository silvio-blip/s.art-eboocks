-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (Public information for users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ensure the specific admin ID is set to is_admin = true
-- This can be handled in the app or via a manual insert later, 
-- but we'll prepare the column.

-- 2. Products (E-books Boutique)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT, -- Capa do E-book
  file_url TEXT, -- Link para o PDF no Storage/CDN
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Orders (Digital Sales)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  product_id UUID REFERENCES products(id), -- Direct link since it's "compra direta"
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  total_amount DECIMAL(10,2) NOT NULL,
  stripe_session_id TEXT,
  customer_email TEXT, -- For guest checkouts or verification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Products: Everyone can see active products
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

-- Orders: Users can view their own orders
CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Admin Access (Example UIDs from prompt or current user)
-- Using a common admin check via auth.uid() if needed
-- For now, let's allow the user silviok5000@gmail.com full access if we had their ID, 
-- but we'll use a generic "admin" role concept if implemented.
