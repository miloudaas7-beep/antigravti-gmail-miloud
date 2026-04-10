import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type Sentiment = "Interested/Positive" | "Not Interested/Negative" | "General Inquiry";

async function analyzeReply(threadBody: string, fromEmail: string): Promise<{
  sentiment: Sentiment;
  suggestedReply: string;
}> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are an expert sales assistant analyzing email replies from potential B2B clients.

Analyze the following email reply and:
1. CLASSIFY the sentiment as exactly one of:
   - "Interested/Positive" (they want to work together, asking for price/call, showing strong interest)
   - "Not Interested/Negative" (they declined, asked to stop, unsubscribe, or are clearly dismissive)
   - "General Inquiry" (asking a question, needs more info, neutral response)

2. DRAFT a professional, concise "next step" reply (3-4 sentences max):
   - For Positive: Schedule a call, express excitement, provide next steps
   - For Negative: Thank them graciously and acknowledge their decision professionally
   - For Inquiry: Answer their question and invite further discussion

Reply from: ${fromEmail}
---
${threadBody}
---

Output strictly as valid JSON (no markdown, no code blocks):
{
  "sentiment": "Interested/Positive" | "Not Interested/Negative" | "General Inquiry",
  "suggestedReply": "Your drafted response here"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  const parsed = JSON.parse(text);
  return { sentiment: parsed.sentiment, suggestedReply: parsed.suggestedReply };
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    oauth2Client.on("tokens", async (tokens: any) => {
      if (tokens.access_token) {
        await supabase.from("user_tokens").update({ access_token: tokens.access_token }).eq("user_id", user.id);
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch profile to know the user's own email address
    const profile = await gmail.users.getProfile({ userId: "me" });
    const myEmail = profile.data.emailAddress?.toLowerCase() || "";

    // List threads that have at least one message (inbox only)
    const threadsRes = await gmail.users.threads.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 30,
    });

    const threads = threadsRes.data.threads || [];
    const replies = [];

    for (const thread of threads) {
      const threadDetail = await gmail.users.threads.get({
        userId: "me",
        id: thread.id!,
        format: "full",
      });

      const messages = threadDetail.data.messages || [];
      if (messages.length < 2) continue; // Skip single-message threads (no reply)

      const lastMessage = messages[messages.length - 1];
      const fromHeader = lastMessage.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const subjectHeader = lastMessage.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No subject)";
      const dateHeader = lastMessage.payload?.headers?.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      // If last message was sent by ME, it's not a reply from client — skip
      const fromEmailAddr = fromHeader.match(/<([^>]+)>/)?.[1]?.toLowerCase() || fromHeader.toLowerCase();
      if (fromEmailAddr.includes(myEmail) || myEmail.includes(fromEmailAddr)) continue;

      // Extract body from last message
      let body = "";
      const extractBody = (part: any): string => {
        if (part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        if (part.parts) {
          for (const p of part.parts) {
            const text = extractBody(p);
            if (text) return text;
          }
        }
        return "";
      };

      body = extractBody(lastMessage.payload);
      if (!body) continue;
      const snippet = body.substring(0, 300);

      try {
        const { sentiment, suggestedReply } = await analyzeReply(snippet, fromEmailAddr);
        replies.push({
          threadId: thread.id,
          fromEmail: fromEmailAddr,
          fromName: fromHeader.replace(/<[^>]+>/, "").trim().replace(/"/g, "") || fromEmailAddr,
          subject: subjectHeader,
          date: dateHeader,
          snippet: snippet.substring(0, 150),
          fullBody: snippet,
          sentiment,
          suggestedReply,
          messageCount: messages.length,
        });
      } catch {
        // Skip threads where AI fails
        continue;
      }
    }

    return NextResponse.json({ success: true, replies });

  } catch (error: any) {
    console.error("Tracking error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch replies" }, { status: 500 });
  }
}
