/*
# Create profiles and scan_history tables

1. New Tables
   - `profiles`
     - `id` (uuid, primary key, references auth.users with CASCADE delete)
     - `display_name` (text, nullable)
     - `email` (text, nullable)
     - `avatar_url` (text, nullable)
     - `zip_code` (text, nullable)
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())
   - `scan_history`
     - `id` (uuid, primary key, default gen_random_uuid())
     - `user_id` (uuid, not null, defaults to auth.uid(), references profiles with CASCADE delete)
     - `label` (text, not null)
     - `recyclable` (boolean, nullable)
     - `special` (boolean, nullable)
     - `confidence` (real, nullable)
     - `weight_estimate` (real, nullable)
     - `created_at` (timestamptz, default now())

2. Security
   - Enable RLS on both tables.
   - `profiles`: owner-scoped CRUD (auth.uid() = id).
   - `scan_history`: owner-scoped CRUD (auth.uid() = user_id).
   - The `user_id` column defaults to auth.uid() so inserts omitting it succeed.

3. Indexes
   - Index on scan_history.user_id for fast per-user queries.

4. Important Notes
   - The `id` column on `profiles` IS the auth.users id (no separate generated id),
     so there is a 1:1 relationship between auth.users and profiles.
   - A trigger auto-updates `updated_at` on profiles when the row changes.
*/

-- Profiles table (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  avatar_url text,
  zip_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Scan history table
CREATE TABLE IF NOT EXISTS scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  recyclable boolean,
  special boolean,
  confidence real,
  weight_estimate real,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_scans" ON scan_history;
CREATE POLICY "select_own_scans" ON scan_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_scans" ON scan_history;
CREATE POLICY "insert_own_scans" ON scan_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_scans" ON scan_history;
CREATE POLICY "update_own_scans" ON scan_history FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_scans" ON scan_history;
CREATE POLICY "delete_own_scans" ON scan_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON scan_history(user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
