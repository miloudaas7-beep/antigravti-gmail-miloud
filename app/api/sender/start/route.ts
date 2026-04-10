import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { google } from "googleapis";

// Removed fixed daily limit; now relying on credits_balance
const MIN_DELAY_MS = 45000; // 45 seconds
const MAX_DELAY_MS = 60000; // 60 seconds

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(message).toString("base64url");
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

function replacePlaceholders(template: string, lead: any, icebreaker: string): string {
  const firstName = (lead.company_name ?? "").split(" ")[0] ?? "there";
  return template
    .replace(/\{\{company_name\}\}/g, lead.company_name ?? "")
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{icebreaker\}\}/g, icebreaker || "I wanted to reach out directly")
    .replace(/\{\{website\}\}/g, lead.website ?? "")
    .replace(/\{\{email\}\}/g, lead.email ?? "")
    .replace(/\{\{location\}\}/g, lead.location ?? "");
}

function encode(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { campaignId } = await req.json();
  if (!campaignId) return new Response(JSON.stringify({ error: "Missing campaignId" }), { status: 400 });

  const admin = createAdminClient();

  // Check profile and credits
  const { data: profile } = await admin.from("profiles").select("credits_balance, emails_sent_today, last_email_reset").eq("id", user.id).single();
  if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });

  let currentCredits = profile.credits_balance || 0;
  if (currentCredits <= 0) {
    return new Response(JSON.stringify({ error: "Not enough credits. Please recharge your balance." }), { status: 403 });
  }

  // Reset daily count if day changed (optional metric)
  const today = new Date().toISOString().split("T")[0];
  let dailyTotal = profile.emails_sent_today || 0;
  if (profile.last_email_reset !== today) {
    await admin.from("profiles").update({ emails_sent_today: 0, last_email_reset: today }).eq("id", user.id);
    dailyTotal = 0;
  }


  // Get campaign data
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", campaignId).eq("user_id", user.id).single();
  if (!campaign) return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });

  // Get pending campaign leads with lead details
  const { data: campaignLeads } = await admin
    .from("campaign_leads")
    .select("id, icebreaker, lead:lead_id(id, company_name, email, website, location)")
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  const leads = campaignLeads ?? [];
  if (leads.length === 0) {
    return new Response(JSON.stringify({ error: "No pending leads in this campaign" }), { status: 400 });
  }

  // Get user access token
  const { data: tokenRow } = await admin.from("user_tokens").select("access_token").eq("user_id", user.id).single();
  const accessToken = tokenRow?.access_token;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Gmail not connected. Please re-login with Google." }), { status: 400 });
  }

  // Mark campaign as running
  await admin.from("campaigns").update({ status: "running" }).eq("id", campaignId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(encode(data)));

      let sentCount = 0;
      const total = Math.min(leads.length, currentCredits); // Can only send as many as credits available

      if (total === 0) {
        send({ type: "log", message: `⚠️ You do not have enough credits to start this campaign.`, level: "warning" });
        controller.close();
        return;
      }

      send({ type: "progress", done: 0, total, dailyTotal });

      for (let i = 0; i < total; i++) {
        const cl = leads[i] as any;
        const lead = cl.lead;
        if (!lead?.email) {
          send({ type: "failed", id: cl.id, to_name: lead?.company_name ?? "?", to_email: lead?.email ?? "?", error: "No email" });
          await admin.from("campaign_leads").update({ status: "failed", error_message: "No email address" }).eq("id", cl.id);
          continue;
        }

        const personalizedBody = replacePlaceholders(campaign.template, lead, cl.icebreaker ?? "");
        const personalizedSubject = replacePlaceholders(campaign.subject, lead, cl.icebreaker ?? "");

        try {
          await sendGmailMessage(accessToken, lead.email, personalizedSubject, personalizedBody);

          // Update DB
          await admin.from("campaign_leads").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", cl.id);
          await admin.from("email_logs").insert({
            user_id: user.id,
            campaign_id: campaignId,
            to_email: lead.email,
            to_name: lead.company_name,
            subject: personalizedSubject,
            status: "sent",
          });

          sentCount++;
          dailyTotal++;
          currentCredits--; // Deduct 1 credit for sending

          // Update profile daily count and credits
          await admin.from("profiles").update({ 
            emails_sent_today: dailyTotal,
            credits_balance: currentCredits
          }).eq("id", user.id);

          send({ type: "sent", id: cl.id, to_name: lead.company_name, to_email: lead.email });
          send({ type: "progress", done: sentCount, total, dailyTotal });

          // Anti-spam delay (skip after last email)
          if (i < total - 1) {
            const delay = randomDelay();
            await new Promise(r => setTimeout(r, delay));
          }
        } catch (e: any) {
          await admin.from("campaign_leads").update({ status: "failed", error_message: e.message }).eq("id", cl.id);
          send({ type: "failed", id: cl.id, to_name: lead.company_name, to_email: lead.email, error: e.message });
        }

        // Stop if credits hit 0
        if (currentCredits <= 0) {
          send({ type: "log", message: `⚠️ Out of credits. Stopping campaign.`, level: "warning" });
          break;
        }
      }

      // Mark campaign completed if all done
      const { count } = await admin.from("campaign_leads").select("id", { count: "exact" }).eq("campaign_id", campaignId).eq("status", "pending");
      if ((count ?? 0) === 0) {
        await admin.from("campaigns").update({ status: "completed", sent_count: sentCount }).eq("id", campaignId);
      } else {
        await admin.from("campaigns").update({ sent_count: sentCount }).eq("id", campaignId);
      }

      send({ type: "done", sent: sentCount });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
