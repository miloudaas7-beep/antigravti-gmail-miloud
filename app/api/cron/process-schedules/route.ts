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
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();

    // 2. Fetch pending leads that are scheduled for now or earlier
    const { data: pendingLeads, error: leadsError } = await admin
      .from("campaign_leads")
      .select("id, campaign_id, user_id, lead:lead_id(id, company_name, email, website, location, niche, phone, address)")
      .eq("status", "pending")
      .lte("scheduled_at", now.toISOString())
      .limit(5);

    if (leadsError) throw new Error("Error fetching pending leads: " + leadsError.message);
    
    if (!pendingLeads || pendingLeads.length === 0) {
      return NextResponse.json({ message: "No pending emails due for now." });
    }

    let processedCount = 0;
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-pro" });

    for (const cl of pendingLeads) {
      try {
        const lead = cl.lead as any;
        if (!lead.email) {
          await admin.from("campaign_leads").update({ status: "failed", error_message: "No email" }).eq("id", cl.id);
          continue;
        }

        // Fetch campaign template
        const { data: campaign } = await admin
          .from("campaigns")
          .select("template, subject")
          .eq("id", cl.campaign_id)
          .single();
          
        if (!campaign) {
          console.error("No campaign found for lead:", cl.id);
          continue;
        }

        // Fetch user google tokens
        const { data: userToken } = await admin
          .from("user_tokens")
          .select("access_token")
          .eq("user_id", cl.user_id)
          .single();

        if (!userToken?.access_token) {
          console.error("No access token for user:", cl.user_id);
          continue;
        }

        // 4. JIT Generation
        const aiContext = `Recipient Data:\n${JSON.stringify(lead, null, 2)}\n\nGoal (Prompt & Rules):\n${campaign.template}\n\nONLY output the email body. Do not include markdown or Subject:`;
        const result = await model.generateContent(aiContext);
        let generatedBody = result.response.text().trim();
        
        let finalSubject = campaign.subject;
        finalSubject = finalSubject.replace(/\{\{company_name\}\}/g, lead.company_name || "there");
        
        // 5. Send via Gmail
        await sendGmailMessage(userToken.access_token, lead.email, finalSubject, generatedBody);

        // 6. Log and Update
        await admin.from("campaign_leads").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", cl.id);
        await admin.from("email_logs").insert({
          user_id: cl.user_id,
          campaign_id: cl.campaign_id,
          to_email: lead.email,
          to_name: lead.company_name,
          subject: finalSubject,
          status: "sent"
        });
        
        processedCount++;
      } catch (e: any) {
        console.error("Cron sending error for lead:", cl.id, e);
        await admin.from("campaign_leads").update({ status: "failed", error_message: e.message }).eq("id", cl.id);
      }
    }

    return NextResponse.json({ message: "Cron finished processing", processedCount });
  } catch (error: any) {
    console.error("CRON Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function sendGmailMessage(accessToken: string, to: string, subject: string, body: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });
  const message = [`To: ${to}`, "Content-Type: text/plain; charset=utf-8", "MIME-Version: 1.0", `Subject: ${subject}`, "", body].join("\n");
  const encoded = Buffer.from(message).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}
