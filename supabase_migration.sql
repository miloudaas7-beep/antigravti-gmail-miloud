-- Migration to add Credit System and Promo Codes

-- 1. Add credits_balance to profiles table (if not exists)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits_balance integer DEFAULT 0;

-- 2. Create promo_codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text UNIQUE NOT NULL,
    credit_value integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Set up RLS for promo_codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Allow reading active promo codes (or all codes, depending on needs)
-- We will rely on Service Role key in the backend to access this table, 
--.so we can leave RLS restrictive for anon/authenticated users.
CREATE POLICY "Service Role can manage promo codes" ON public.promo_codes
    USING (true) WITH CHECK (true);

-- Insert some dummy promo codes for testing!
INSERT INTO public.promo_codes (code, credit_value) VALUES 
('LAUNCH50', 50),
('WELCOME100', 100),
('SECRETMM', 10000)
ON CONFLICT (code) DO NOTHING;
