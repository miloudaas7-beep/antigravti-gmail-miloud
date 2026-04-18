-- ==============================================================================
-- 00_FULL_SCHEMA.SQL (Comprehensive Reset Migration)
-- Description: Complete schema for SmartScout AI
-- INSTRUCTIONS: Run this entire script in your Supabase SQL Editor.
-- WARNING: This contains DROP statements. It will wipe existing data.
-- ==============================================================================

-- 1. Enable Dependencies
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Clean up old tables (Reverse order of dependencies)
DROP TABLE IF EXISTS public.campaign_schedules CASCADE;
DROP TABLE IF EXISTS public.email_logs CASCADE;
DROP TABLE IF EXISTS public.campaign_leads CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.user_tokens CASCADE;
DROP TABLE IF EXISTS public.connected_accounts CASCADE;
DROP TABLE IF EXISTS public.credit_transactions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. Pre-cleanup Triggers & Functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_dashboard_stats(UUID, TIMESTAMPTZ) CASCADE;

-- =============================================
-- USER PROFILES & HYBRID AUTH
-- =============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  credits INTEGER NOT NULL DEFAULT 100, -- Retained for legacy/analytics
  credits_balance INTEGER NOT NULL DEFAULT 100,
  plan TEXT NOT NULL DEFAULT 'free',
  has_password BOOLEAN DEFAULT false, -- For Hybrid Auth System tracking
  emails_sent_today INTEGER NOT NULL DEFAULT 0,
  last_email_reset DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- =============================================
-- MULTI-PROFILE COMPONENT (Connected Accounts)
-- =============================================
CREATE TABLE public.connected_accounts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  account_email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, account_email)
);
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connected accounts" ON public.connected_accounts USING (auth.uid() = user_id);

-- LEGACY OAUTH TOKENS (Maintained for backwards compatibility in existing code)
CREATE TABLE public.user_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  google_sheet_id TEXT, -- Persistent Google Sheet Link
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON public.user_tokens USING (auth.uid() = user_id);


-- =============================================
-- LEADS & CONTACTS
-- =============================================
CREATE TABLE public.leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT,
  email TEXT,
  website TEXT,
  phone TEXT,
  address TEXT,
  niche TEXT,
  location TEXT,
  rating NUMERIC(3,1),
  review_count INTEGER,
  source TEXT DEFAULT 'smartscout',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own leads" ON public.leads USING (auth.uid() = user_id);
CREATE INDEX leads_user_idx ON public.leads(user_id);


-- =============================================
-- CAMPAIGNS & SCHEDULING (Background Automation)
-- =============================================
CREATE TABLE public.campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'
  total_leads INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON public.campaigns USING (auth.uid() = user_id);

CREATE TABLE public.campaign_schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE, -- Unique Removed for multi-row logic Day by Day
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  time_slots TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.campaign_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own schedules" ON public.campaign_schedules USING (auth.uid() = user_id);


-- =============================================
-- CAMPAIGN LEADS (Queue)
-- =============================================
CREATE TABLE public.campaign_leads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  icebreaker TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage campaign_leads" ON public.campaign_leads USING (auth.uid() = user_id);
CREATE INDEX campaign_leads_status_idx ON public.campaign_leads(campaign_id, status);


-- =============================================
-- EMAIL LOGS (Analytics)
-- =============================================
CREATE TABLE public.email_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT,
  status TEXT DEFAULT 'sent', -- 'sent' | 'failed' | 'opened'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own logs" ON public.email_logs USING (auth.uid() = user_id);
CREATE INDEX email_logs_user_idx ON public.email_logs(user_id);


-- =============================================
-- CREDIT TRANSACTIONS (Optional / Legacy)
-- =============================================
CREATE TABLE public.credit_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON public.credit_transactions USING (auth.uid() = user_id);


-- ==============================================================================
-- RPC FUNCTIONS: DYNAMIC DASHBOARD STATS (Daily/Weekly/Monthly)
-- ==============================================================================

-- Unified RPC to fetch dashboard stats aggregated by time filter
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id UUID, p_start_date TIMESTAMPTZ)
RETURNS TABLE (
  total_leads BIGINT,
  emails_sent BIGINT,
  emails_opened BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.leads WHERE user_id = p_user_id AND created_at >= p_start_date) as total_leads,
    (SELECT COUNT(*) FROM public.email_logs WHERE user_id = p_user_id AND sent_at >= p_start_date) as emails_sent,
    (SELECT COUNT(*) FROM public.email_logs WHERE user_id = p_user_id AND status = 'opened' AND sent_at >= p_start_date) as emails_opened;
END;
$$;

-- Notification for completing schema load
COMMENT ON SCHEMA public IS 'SmartScout Comprehensive V2 Schema - Deployed successfully.';
