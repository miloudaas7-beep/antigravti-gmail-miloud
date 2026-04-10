import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Use service role key if available, otherwise fall back to anon key
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("your_service_role")
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
