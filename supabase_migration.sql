-- ============================================================
-- SMARTSCOUT — Full Schema Setup
-- امسح القديم والصق هذا كاملاً في Supabase SQL Editor
-- آمن 100%: كل شيء يستخدم IF NOT EXISTS لا يمسح بيانات قديمة
-- ============================================================


-- ══════════════════════════════════════════════════════════
-- 1. جدول المستخدمين (profiles)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits_balance integer DEFAULT 0;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);


-- ══════════════════════════════════════════════════════════
-- 2. جدول توكنات Gmail (user_tokens)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_tokens (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token  text,
  refresh_token text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.user_tokens
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- RLS
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own tokens" ON public.user_tokens;
CREATE POLICY "Users can manage own tokens"
  ON public.user_tokens FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════
-- 3. جدول جهات الاتصال (leads)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leads (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email         text NOT NULL,
  company_name  text,
  website       text,
  location      text,
  niche         text,
  phone         text,
  address       text,
  source        text DEFAULT 'csv_import',
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own leads" ON public.leads;
CREATE POLICY "Users can manage own leads"
  ON public.leads FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════
-- 4. جدول الحملات (campaigns)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaigns (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  subject       text,
  template      text,
  status        text DEFAULT 'draft',
  total_leads   integer DEFAULT 0,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own campaigns" ON public.campaigns;
CREATE POLICY "Users can manage own campaigns"
  ON public.campaigns FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════
-- 5. جدول ربط الحملة بجهات الاتصال (campaign_leads)
--    هذا هو القلب — الكرون يقرأ منه ويبعث الإيميلات
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaign_leads (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id   uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- الحالة: pending → sent | failed
  status        text NOT NULL DEFAULT 'pending',

  -- وقت الإرسال المجدول (UTC دائماً)
  scheduled_at  timestamptz,

  -- وقت الإرسال الفعلي
  sent_at       timestamptz,

  -- سبب الفشل إذا فشل
  error_message text,

  -- عدد المحاولات (الكرون يعاود 3 مرات قبل ما يستسلم)
  retry_count   integer NOT NULL DEFAULT 0,

  created_at    timestamptz DEFAULT now() NOT NULL
);

-- إضافة الأعمدة للجدول القديم إذا كان موجوداً
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS sent_at       timestamptz;
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS retry_count   integer NOT NULL DEFAULT 0;

-- RLS
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own campaign leads" ON public.campaign_leads;
CREATE POLICY "Users can manage own campaign leads"
  ON public.campaign_leads FOR ALL
  USING (auth.uid() = user_id);

-- Index للأداء: يخلي استعلام الكرون سريع جداً
CREATE INDEX IF NOT EXISTS idx_campaign_leads_cron
  ON public.campaign_leads(scheduled_at ASC)
  WHERE status = 'pending';


-- ══════════════════════════════════════════════════════════
-- 6. جدول أنماط الجدولة (campaign_schedules)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaign_schedules (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_index   integer NOT NULL DEFAULT 1,
  range_start integer,
  range_end   integer,
  time_slots  text[],
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.campaign_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own schedules" ON public.campaign_schedules;
CREATE POLICY "Users can manage own schedules"
  ON public.campaign_schedules FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════
-- 7. جدول سجلات الإيميلات (email_logs)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  to_email    text NOT NULL,
  to_name     text,
  subject     text,
  status      text DEFAULT 'sent',
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own email logs" ON public.email_logs;
CREATE POLICY "Users can view own email logs"
  ON public.email_logs FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════
-- 8. جدول الأكواد الترويجية (promo_codes)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code         text UNIQUE NOT NULL,
  credit_value integer NOT NULL,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role can manage promo codes" ON public.promo_codes;
CREATE POLICY "Service Role can manage promo codes"
  ON public.promo_codes
  USING (true) WITH CHECK (true);

INSERT INTO public.promo_codes (code, credit_value) VALUES
  ('LAUNCH50',   50),
  ('WELCOME100', 100),
  ('SECRETMM',   10000)
ON CONFLICT (code) DO NOTHING;


-- ══════════════════════════════════════════════════════════
-- ✅ تم! قاعدة البيانات جاهزة بالكامل
-- ══════════════════════════════════════════════════════════
