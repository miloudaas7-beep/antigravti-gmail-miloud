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

        // --- Hybrid Authentication Link ---
        const { cookies } = await import("next/headers");
        const cookieStore = cookies();
        const hybridPwdCookie = cookieStore.get("hybrid_pwd");
        const hybridNameCookie = cookieStore.get("hybrid_name");

        if (hybridPwdCookie || hybridNameCookie) {
          const hybridPwd = hybridPwdCookie ? decodeURIComponent(hybridPwdCookie.value) : undefined;
          const hybridName = hybridNameCookie ? decodeURIComponent(hybridNameCookie.value) : undefined;
          
          await admin.auth.admin.updateUserById(userId, {
            password: hybridPwd,
            user_metadata: { 
              ...data.session.user.user_metadata,
              full_name: hybridName || data.session.user.user_metadata?.full_name
            }
          });

          // Update the profile table with the new name if available
          if (hybridName) {
            await admin.from("profiles").update({ full_name: hybridName, has_password: true }).eq("id", userId);
          } else if (hybridPwd) {
            await admin.from("profiles").update({ has_password: true }).eq("id", userId);
          }
        }
        // --- End Hybrid Auth Link ---

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

      const response = NextResponse.redirect(`${origin}/dashboard`);
      response.cookies.delete("hybrid_pwd");
      response.cookies.delete("hybrid_name");
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
