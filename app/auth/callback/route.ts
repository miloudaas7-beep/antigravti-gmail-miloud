import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Store OAuth tokens in user_tokens table for Gmail/Sheets access
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;
      const userId = data.session.user.id;

      if (providerToken) {
        const admin = createAdminClient();
        
        let retries = 3;
        let profileReady = false;
        while (retries > 0 && !profileReady) {
          const { data } = await admin.from("profiles").select("id").eq("id", userId).single();
          if (data) {
            profileReady = true;
          } else {
            await new Promise(r => setTimeout(r, 500));
            retries--;
          }
        }

        // Failsafe: If profile STILL missing (happens when DB is wiped but auth.users persists)
        if (!profileReady) {
           await admin.from("profiles").upsert({
               id: userId,
               email: data.session.user.email,
               full_name: data.session.user.user_metadata?.full_name || "",
               avatar_url: data.session.user.user_metadata?.avatar_url || ""
           }, { onConflict: "id" });
        }

        await admin.from("user_tokens").upsert({
          user_id: userId,
          access_token: providerToken,
          refresh_token: providerRefreshToken ?? null,
          token_expiry: data.session.expires_at
            ? new Date(data.session.expires_at * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
