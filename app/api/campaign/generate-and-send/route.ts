import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper: personalize email with Gemini AI
async function generatePersonalizedEmail(prompt: string, rowData: Record<string, string>): Promise<{ subject: string; body: string }> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  const model = genAI.getGenerativeModel({ model: modelName });

  const systemPrompt = `You are an expert B2B sales email copywriter. Generate a highly personalized outreach email.
The user will give you:
1. A base prompt / template describing what the email should be about.
2. Recipient data as JSON (name, company, email, etc.)

Rules:
- Use the recipient's actual name and company to make it feel personal, NOT generic.
- Keep the email concise: max 4 short paragraphs.
- Sound like a real human, NOT a marketing robot.
- Do NOT use phrases like "I hope this email finds you well."
- Output format (strictly follow this, no markdown, no code blocks):
SUBJECT: [Your compelling subject line here]
BODY:
[Your email body here]`;

  const userMessage = `Base Prompt: ${prompt}

Recipient Data:
${JSON.stringify(rowData, null, 2)}

Generate the personalized email now.`;

  const result = await model.generateContent([systemPrompt, userMessage]);
  const text = result.response.text().trim();

  // Parse subject and body from AI output
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

  return {
    subject: subjectMatch?.[1]?.trim() ?? "Hello from us",
    body: bodyMatch?.[1]?.trim() ?? text,
  };
}

// Helper: send email via Gmail API
async function sendGmail(oauth2Client: any, to: string, subject: string, body: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const emailContent = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encodedEmail = Buffer.from(emailContent).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedEmail },
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { rows, prompt, emailColumn, nameColumn, dailyLimit, delaySecs, actualSend } = await req.json();

    if (!rows || rows.length === 0) return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    if (!emailColumn) return NextResponse.json({ error: "Email column must be specified." }, { status: 400 });

    // Get user's OAuth tokens if actually sending
    let oauth2Client: any = null;
    if (actualSend) {
      const { data: tokenData } = await supabase
        .from("user_tokens")
        .select("access_token, refresh_token")
        .eq("user_id", user.id)
        .single();

      if (!tokenData?.refresh_token) {
        return NextResponse.json({
          error: "Gmail not connected. Go to Settings → Connect Account first.",
          needsAuth: true
        }, { status: 401 });
      }

      const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${appUrl}/api/auth/google/callback`
      );

      oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
      });

      // Auto-save refreshed tokens
      oauth2Client.on("tokens", async (tokens: any) => {
        if (tokens.access_token) {
          await supabase.from("user_tokens").update({
            access_token: tokens.access_token,
          }).eq("user_id", user.id);
        }
      });
    }

    const limit = Math.min(dailyLimit ?? 50, rows.length);
    const results: Array<{ email: string; name: string; subject: string; status: "sent" | "preview" | "failed"; preview: string; error?: string }> = [];

    for (let i = 0; i < limit; i++) {
      const row = rows[i];
      const recipientEmail = row[emailColumn]?.trim();
      const recipientName = row[nameColumn ?? "Name"] || row[nameColumn ?? "Company Name"] || "there";

      if (!recipientEmail || !recipientEmail.includes("@")) {
        results.push({ email: recipientEmail ?? "N/A", name: recipientName, subject: "", status: "failed", preview: "", error: "Invalid or missing email address" });
        continue;
      }

      try {
        // AI generation
        const { subject, body } = await generatePersonalizedEmail(prompt, row);

        if (actualSend && oauth2Client) {
          await sendGmail(oauth2Client, recipientEmail, subject, body);

          // Log to Supabase
          await supabase.from("email_logs").insert({
            user_id: user.id,
            to_email: recipientEmail,
            to_name: recipientName,
            subject,
            status: "sent",
          });

          results.push({ email: recipientEmail, name: recipientName, subject, status: "sent", preview: body });
        } else {
          // Preview mode - just return the AI output
          results.push({ email: recipientEmail, name: recipientName, subject, status: "preview", preview: body });
        }

        // Delay between emails (skip on last one)
        if (i < limit - 1 && delaySecs > 0 && actualSend) {
          await new Promise(r => setTimeout(r, (delaySecs ?? 5) * 1000));
        }

      } catch (err: any) {
        results.push({ email: recipientEmail, name: recipientName, subject: "", status: "failed", preview: "", error: err.message });
      }
    }

    const sentCount = results.filter(r => r.status === "sent").length;
    const previewCount = results.filter(r => r.status === "preview").length;
    const failedCount = results.filter(r => r.status === "failed").length;

    return NextResponse.json({
      success: true,
      mode: actualSend ? "sent" : "preview",
      results,
      summary: { total: limit, sent: sentCount, previews: previewCount, failed: failedCount }
    });

  } catch (error: any) {
    console.error("Campaign error:", error);
    return NextResponse.json({ error: error.message || "Campaign failed." }, { status: 500 });
  }
}
