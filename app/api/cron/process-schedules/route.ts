import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";

// Ensure this is treated as a dynamic route
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret
  //    Vercel automatically injects this header when CRON_SECRET is set in env vars.
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[CRON] Unauthorized request. Header:", authHeader);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();

    console.log(`[CRON] Running at ${now.toISOString()}`);

    // 2. Fetch pending leads that are due now or earlier.
    //    - status = 'pending' (not yet sent)
    //    - scheduled_at is NOT NULL (prevents accidental immediate sends)
    //    - scheduled_at <= NOW() (the scheduled time has arrived)
    //    - retry_count < 3 (don't retry permanently failed leads)
    //    - Limit to 10 per run to stay within Vercel function timeout
    const { data: pendingLeads, error: leadsError } = await admin
      .from("campaign_leads")
      .select("id, campaign_id, user_id, scheduled_at, retry_count, lead:lead_id(id, company_name, email, website, location, niche, phone, address)")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now.toISOString())
      .lt("retry_count", 3)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (leadsError) {
      console.error("[CRON] Error fetching pending leads:", leadsError.message);
      throw new Error("Error fetching pending leads: " + leadsError.message);
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      console.log("[CRON] No pending emails due.");
      return NextResponse.json({ message: "No pending emails due for now." });
    }

    console.log(`[CRON] Found ${pendingLeads.length} leads to process.`);

    let processedCount = 0;
    let failedCount = 0;
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-pro" });

    for (const cl of pendingLeads) {
      try {
        const lead = cl.lead as any;

        if (!lead?.email) {
          await admin.from("campaign_leads").update({
            status: "failed",
            error_message: "Lead has no email address",
          }).eq("id", cl.id);
          failedCount++;
          continue;
        }

        // 3. Fetch campaign template
        const { data: campaign, error: campaignError } = await admin
          .from("campaigns")
          .select("template, subject")
          .eq("id", cl.campaign_id)
          .single();

        if (campaignError || !campaign) {
          console.error(`[CRON] No campaign found for lead ${cl.id}:`, campaignError?.message);
          await admin.from("campaign_leads").update({
            status: "failed",
            error_message: "Campaign template not found",
          }).eq("id", cl.id);
          failedCount++;
          continue;
        }

        // 4. Fetch user Google tokens — BOTH access_token AND refresh_token
        //    This is the critical fix: without refresh_token, emails fail after 1 hour.
        const { data: userToken, error: tokenError } = await admin
          .from("user_tokens")
          .select("access_token, refresh_token")
          .eq("user_id", cl.user_id)
          .single();

        if (tokenError || !userToken?.refresh_token) {
          console.error(`[CRON] No refresh token for user ${cl.user_id}`);
          await admin.from("campaign_leads").update({
            status: "failed",
            error_message: "User Gmail not connected (missing refresh token). Please reconnect in Settings.",
          }).eq("id", cl.id);
          failedCount++;
          continue;
        }

        // 5. Build OAuth2 client with BOTH tokens so Google auto-refreshes when needed
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
        );

        oauth2Client.setCredentials({
          access_token: userToken.access_token,
          refresh_token: userToken.refresh_token,
        });

        // 6. Auto-save the refreshed access_token back to Supabase when Google refreshes it.
        //    This ensures the next cron run also has a valid token.
        oauth2Client.on("tokens", async (tokens: any) => {
          if (tokens.access_token) {
            console.log(`[CRON] Refreshed access_token for user ${cl.user_id}`);
            await admin.from("user_tokens").update({
              access_token: tokens.access_token,
            }).eq("user_id", cl.user_id);
          }
        });

        // 7. JIT (Just-In-Time) Email Generation with Gemini
        const aiContext = `Recipient Data:\n${JSON.stringify(lead, null, 2)}\n\nGoal (Prompt & Rules):\n${campaign.template}\n\nONLY output the email body. Do not include markdown or Subject:`;
        const result = await model.generateContent(aiContext);
        const generatedBody = result.response.text().trim();

        let finalSubject = campaign.subject || "Hello from us";
        finalSubject = finalSubject.replace(/\{\{company_name\}\}/g, lead.company_name || "there");

        // 8. Send via Gmail API
        await sendGmailMessage(oauth2Client, lead.email, finalSubject, generatedBody);

        // 9. Mark as sent and log
        const sentAt = new Date().toISOString();

        await admin.from("campaign_leads").update({
          status: "sent",
          sent_at: sentAt,
          error_message: null,
        }).eq("id", cl.id);

        await admin.from("email_logs").insert({
          user_id: cl.user_id,
          campaign_id: cl.campaign_id,
          to_email: lead.email,
          to_name: lead.company_name,
          subject: finalSubject,
          status: "sent",
        });

        console.log(`[CRON] ✅ Sent to ${lead.email} (lead ${cl.id})`);
        processedCount++;

      } catch (e: any) {
        // Increment retry_count so we don't retry forever.
        // After 3 failures, the lead won't be fetched again (lt("retry_count", 3) above).
        const currentRetry = (cl.retry_count ?? 0) + 1;
        const newStatus = currentRetry >= 3 ? "failed" : "pending";

        console.error(`[CRON] ❌ Error for lead ${cl.id} (attempt ${currentRetry}/3):`, e.message);

        await admin.from("campaign_leads").update({
          status: newStatus,
          retry_count: currentRetry,
          error_message: `Attempt ${currentRetry}/3: ${e.message}`,
        }).eq("id", cl.id);

        failedCount++;
      }
    }

    console.log(`[CRON] Done. Sent: ${processedCount}, Failed/Retried: ${failedCount}`);
    return NextResponse.json({
      message: "Cron finished processing",
      processedCount,
      failedCount,
    });

  } catch (error: any) {
    console.error("[CRON] Fatal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Gmail Send Helper ──────────────────────────────────────────────
async function sendGmailMessage(
  auth: any,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });

  // Encode subject as UTF-8 base64 to handle special characters
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
