import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { google } from "googleapis";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    const appUrl = "https://antigravti-gmail-miloud.vercel.app";

    if (error) {
      return NextResponse.redirect(`${appUrl}/dashboard/settings?error=${error}`);
    }

    if (!code) {
      return NextResponse.redirect(`${appUrl}/dashboard/settings?error=NoCodeProvided`);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login?redirect=/dashboard/settings`);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appUrl}/api/auth/google/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    // Save or update the user_tokens table
    // Important: we only update refresh_token if it's provided. Sometimes Google only provides it on the FIRST consent.
    const tokenData: any = {
      user_id: user.id,
      access_token: tokens.access_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString()
    };

    if (tokens.refresh_token) {
      tokenData.refresh_token = tokens.refresh_token;
    }

    // Ensure the Supabase profile trigger has finished to avoid foreign key constraints
    let retries = 3;
    let profileReady = false;
    while (retries > 0 && !profileReady) {
      const { data } = await supabase.from("profiles").select("id").eq("id", user.id).single();
      if (data) {
        profileReady = true;
      } else {
        await new Promise(r => setTimeout(r, 500));
        retries--;
      }
    }

    if (!profileReady) {
       const admin = createAdminClient();
       await admin.from("profiles").upsert({
           id: user.id,
           email: user.email,
           full_name: user.user_metadata?.full_name || "",
           avatar_url: user.user_metadata?.avatar_url || ""
       }, { onConflict: "id" });
       
       await new Promise(r => setTimeout(r, 200));
    }

    const { error: dbError } = await supabase
      .from("user_tokens")
      .upsert(tokenData, { onConflict: "user_id" });

    if (dbError) {
      console.error("Database error saving token:", dbError);
      return NextResponse.redirect(`${appUrl}/dashboard/settings?error=DatabaseError`);
    }

    return NextResponse.redirect(`${appUrl}/dashboard/settings?success=1`);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    const appUrl = "https://antigravti-gmail-miloud.vercel.app";
    return NextResponse.redirect(`${appUrl}/dashboard/settings?error=CallbackFailed`);
  }
}
