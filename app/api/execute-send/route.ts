import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ─── Auth Helper ──────────────────────────────────────────────────────────────
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.N8N_SECRET_KEY;
  if (!secret) {
    console.error("[EXECUTE-SEND] N8N_SECRET_KEY is not set in environment.");
    return false;
  }
  return authHeader === `Bearer ${secret}`;
}

// ─── Gmail Send Helper ────────────────────────────────────────────────────────
async function sendGmailMessage(
  auth: any,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });

  const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ];

  const message = messageParts.join("\n");
  const encoded = Buffer.from(message).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // 1. Verify n8n secret key
  if (!isAuthorized(request)) {
    console.warn("[EXECUTE-SEND] Unauthorized request blocked.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let emailId: string | undefined;

  try {
    const body = await request.json();
    emailId = body.emailId;

    if (!emailId) {
      return NextResponse.json(
        { error: "Missing emailId in request body" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 2. Fetch the campaign_lead with its related lead and campaign data
    const { data: campaignLead, error: clError } = await admin
      .from("campaign_leads")
      .select(
        `
        id,
        user_id,
        campaign_id,
        status,
        lead:lead_id (
          id,
          email,
          company_name,
          website,
          location,
          niche,
          phone,
          address
        ),
        campaign:campaign_id (
          id,
          template,
          subject
        )
      `
      )
      .eq("id", emailId)
      .single();

    if (clError || !campaignLead) {
      console.error(`[EXECUTE-SEND] campaign_lead not found for id ${emailId}:`, clError?.message);
      return NextResponse.json(
        { error: "campaign_lead not found" },
        { status: 404 }
      );
    }

    const lead = campaignLead.lead as any;
    const campaign = campaignLead.campaign as any;

    if (!lead?.email) {
      await admin
        .from("campaign_leads")
        .update({ status: "failed", error_message: "Lead has no email address" })
        .eq("id", emailId);
      return NextResponse.json(
        { error: "Lead has no email address" },
        { status: 422 }
      );
    }

    // 3. Fetch user's Google OAuth tokens
    const { data: userToken, error: tokenError } = await admin
      .from("user_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", campaignLead.user_id)
      .single();

    if (tokenError || !userToken?.refresh_token) {
      const errMsg =
        "User Gmail not connected (missing refresh token). Please reconnect in Settings.";
      console.error(`[EXECUTE-SEND] No refresh token for user ${campaignLead.user_id}`);
      await admin
        .from("campaign_leads")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", emailId);
      return NextResponse.json({ error: errMsg }, { status: 422 });
    }

    // 4. Build OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: userToken.access_token,
      refresh_token: userToken.refresh_token,
    });

    // Auto-save refreshed tokens back to Supabase
    oauth2Client.on("tokens", async (tokens: any) => {
      if (tokens.access_token) {
        console.log(`[EXECUTE-SEND] Refreshed access_token for user ${campaignLead.user_id}`);
        await admin
          .from("user_tokens")
          .update({ access_token: tokens.access_token })
          .eq("user_id", campaignLead.user_id);
      }
    });

    // 5. Generate personalized email body with Gemini AI
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
    });

    const aiContext = `Recipient Data:\n${JSON.stringify(lead, null, 2)}\n\nGoal (Prompt & Rules):\n${campaign.template}\n\nONLY output the email body. Do not include markdown or Subject:`;
    const result = await model.generateContent(aiContext);
    const generatedBody = result.response.text().trim();

    // 6. Build subject
    let finalSubject = campaign.subject || "Hello from us";
    finalSubject = finalSubject.replace(
      /\{\{company_name\}\}/g,
      lead.company_name || "there"
    );

    // 7. Send via Gmail API
    await sendGmailMessage(oauth2Client, lead.email, finalSubject, generatedBody);

    // 8. Update campaign_lead status to 'sent'
    const sentAt = new Date().toISOString();
    await admin
      .from("campaign_leads")
      .update({ status: "sent", sent_at: sentAt, error_message: null })
      .eq("id", emailId);

    // 9. Insert email log
    await admin.from("email_logs").insert({
      user_id: campaignLead.user_id,
      campaign_id: campaignLead.campaign_id,
      to_email: lead.email,
      to_name: lead.company_name,
      subject: finalSubject,
      status: "sent",
    });

    console.log(`[EXECUTE-SEND] ✅ Sent to ${lead.email} (campaignLead ${emailId})`);

    return NextResponse.json({ success: true, sentTo: lead.email });
  } catch (error: any) {
    console.error(`[EXECUTE-SEND] ❌ Error for emailId ${emailId}:`, error.message);

    // Mark as failed in Supabase so the Archive page reflects it
    if (emailId) {
      try {
        await createAdminClient()
          .from("campaign_leads")
          .update({
            status: "failed",
            error_message: error.message,
          })
          .eq("id", emailId);
      } catch (updateErr: any) {
        console.error("[EXECUTE-SEND] Could not update status to failed:", updateErr.message);
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
