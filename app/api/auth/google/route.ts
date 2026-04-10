import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appUrl}/api/auth/google/callback`
    );

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/spreadsheets"
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent", // Forces consent screen to ensure refresh token is provided
    });

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error("Auth URL generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
