-- STORAGE POLICIES FOR ASSETS BUCKET
-- Run this in Supabase SQL Editor if you get permission errors when uploading avatars

-- 1. Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Policy to allow anyone to READ from assets
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'assets');

-- 3. Policy to allow authenticated users to UPLOAD to avatars folder in assets
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'assets' AND 
    (storage.foldername(name))[1] = 'avatars'
);

-- 4. Policy to allow users to UPDATE their own avatars
DROP POLICY IF EXISTS "Users Update Own Avatars" ON storage.objects;
CREATE POLICY "Users Update Own Avatars" ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'assets' AND 
    (storage.foldername(name))[1] = 'avatars'
);

-- 5. Policy to allow users to DELETE their own avatars (optional)
DROP POLICY IF EXISTS "Users Delete Own Avatars" ON storage.objects;
CREATE POLICY "Users Delete Own Avatars" ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'assets' AND 
    (storage.foldername(name))[1] = 'avatars'
);
