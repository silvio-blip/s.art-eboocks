-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (Public information for users)
CREATE TABLE IF NOT EXISTS profiles (
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
  category TEXT DEFAULT 'Geral',
  product_type TEXT DEFAULT 'digital', -- digital, physical
  sizes TEXT, -- comma separated sizes
  colors TEXT, -- comma separated colors
  sizes_enabled BOOLEAN DEFAULT false,
  colors_enabled BOOLEAN DEFAULT false,
  admin_link TEXT, -- private management link
  extra_images TEXT, -- comma separated image URLs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Orders (Digital Sales)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  product_id UUID REFERENCES products(id), -- Direct link since it's "compra direta"
  status TEXT DEFAULT 'pending', -- pending, completed, failed, refunded, refund_pending
  shipping_status TEXT DEFAULT 'pending', -- pending, sent, delivered
  total_amount DECIMAL(10,2) NOT NULL,
  stripe_session_id TEXT,
  customer_email TEXT, -- For guest checkouts or verification
  selected_options JSONB DEFAULT '{}'::jsonb, -- Store size, color, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. User Reading Progress & Annotations
CREATE TABLE IF NOT EXISTS user_reading_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  book_id UUID REFERENCES products(id) NOT NULL,
  last_page_read INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  annotations JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

-- 5. Password Recovery Codes (Bypass standard Auth for custom UI)
CREATE TABLE IF NOT EXISTS password_recovery_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_recovery_email ON password_recovery_codes(email);

-- 6. Trigger for New User Profile Creation
-- Ensures Google OAuth and Email signups automatically get a profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reading_progress ENABLE ROW LEVEL SECURITY;

-- ... (outras policies)

-- Reading Progress: Users manage their own
CREATE POLICY "Users manage their own progress" ON user_reading_progress
  FOR ALL USING (auth.uid() = user_id);

-- Profiles: Users can read their own
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Profiles: Users can insert their own profile
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Profiles: Users can update their own profile
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Products: Everyone can see active products
CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

-- Orders: Users can view their own orders
CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- 4. STORAGE SETUP (Specific Buckets)
-- Run these in the SQL Editor to create buckets and set dynamic policies

-- Create 'covers' bucket (Public for images)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true) ON CONFLICT (id) DO NOTHING;

-- Create 'assets' bucket (Private for PDF delivery)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', false) ON CONFLICT (id) DO NOTHING;

-- Policy: Public Access for covers
-- CREATE POLICY "Public Covers" ON storage.objects FOR SELECT USING (bucket_id = 'covers');

-- Policy: Admin Upload for both (Uids: 3d596215-583e-498f-9fd5-36b83d8bccf5, 00d44feb-0b51-405e-86f7-31b67edfb7b6)
-- CREATE POLICY "Admin Storage Manage" ON storage.objects FOR ALL WITH CHECK (
--   bucket_id IN ('covers', 'assets') AND 
--   auth.uid() IN ('3d596215-583e-498f-9fd5-36b83d8bccf5', '00d44feb-0b51-405e-86f7-31b67edfb7b6')
-- );
