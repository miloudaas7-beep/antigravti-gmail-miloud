-- ============================================================
-- Migration: Add retry tracking + performance index to campaign_leads
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add error_message column: stores WHY a send failed (e.g. "401 invalid_grant")
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS error_message text;

-- 2. Add retry_count column: cron retries up to 3 times before giving up
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- 3. Add sent_at column: records exact UTC timestamp when the email was delivered
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 4. Performance index: makes the cron query (status=pending + scheduled_at <= now)
--    extremely fast, even with 100,000+ rows in the table.
--    The WHERE clause turns it into a partial index (only indexes pending rows).
CREATE INDEX IF NOT EXISTS idx_campaign_leads_cron
  ON public.campaign_leads(scheduled_at ASC)
  WHERE status = 'pending';

-- 5. Verify the columns were added correctly
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'campaign_leads'
  AND column_name IN ('error_message', 'retry_count', 'sent_at')
ORDER BY column_name;
