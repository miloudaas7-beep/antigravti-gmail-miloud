import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { to, subject, body, draftOnly } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing email fields" }, { status: 400 });
    }

    const { data: tokenData } = await supabase
      .from("user_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .single();

    if (!tokenData?.refresh_token) {
      return NextResponse.json({ error: "Gmail not connected", needsAuth: true }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    
    // Construct email
    const messageParts = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body.replace(/\n/g, "<br>"),
    ];

    const message = messageParts.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (draftOnly) {
      await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw: encodedMessage }
        }
      });
      return NextResponse.json({ success: true, mode: "draft" });
    } else {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });
      return NextResponse.json({ success: true, mode: "sent" });
    }
  } catch (error: any) {
    console.error("Send error:", error);
    return NextResponse.json({ error: error.message || "Failed to send email" }, { status: 500 });
  }
}
