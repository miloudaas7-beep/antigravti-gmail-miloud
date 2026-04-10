import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type CompanySize = "Startup/Small" | "Enterprise/Large";

interface EnrichedLead {
  email: string;
  companyName: string;
  companySize: CompanySize;
  address: string;
  rawData: Record<string, string>;
  subject: string;
  body: string;
  status: "pending" | "approved" | "rejected" | "sent" | "failed";
  error?: string;
}

async function classifyAndGenerateEmail(
  rowData: Record<string, string>,
  startupRules: string,
  enterpriseRules: string,
  targetCountry: string,
  baseEmailTemplate: string,
  customInstructions: string
): Promise<{ companySize: CompanySize; address: string; subject: string; body: string }> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  const model = genAI.getGenerativeModel({ model: modelName });

  const systemPrompt = `You are a B2B lead intelligence and email personalization expert.

Given company/contact data, you must:
1. CLASSIFY the company as either "Startup/Small" (fewer than 200 employees, early-stage, or clearly a small business) OR "Enterprise/Large" (established corporation, 200+ employees, or a large well-known brand).
2. INFER a likely address/location from all available data (website domain, company name patterns, or explicit location fields). If country is known, use it. Otherwise write "Location Unknown".
3. GENERATE a highly personalized email using the correct tone rules based on classification.

RULES FOR EMAIL TONE:
- If Startup/Small: ${startupRules || "Be warm, enthusiastic. Focus on growing together, passion, and agility. Mention their innovative spirit."}
- If Enterprise/Large: ${enterpriseRules || "Be formal and authoritative. Focus on ROI, scalability, and professional standards. Reference market leadership."}

${baseEmailTemplate ? `BASE EMAIL TEMPLATE (MUST USE AS FOUNDATION):\n"""\n${baseEmailTemplate}\n"""\n\nCUSTOM MODIFICATION INSTRUCTIONS:\n${customInstructions || "Only personalize the greeting and tone according to classification rules, keep the core message exactly as in the template."}` : "No base template provided. Generate a highly personalized email from scratch."}

CRITICAL: Address the email directly to the company/person name. Reference their industry/domain. Sound like a real human, not a robot.

OUTPUT FORMAT (strict JSON, no markdown, no code blocks):
{
  "companySize": "Startup/Small" or "Enterprise/Large",
  "address": "City, Country or Location Unknown",
  "subject": "Your compelling subject line",
  "body": "Full email body text"
}`;

  const userMessage = `Target Country Filter: ${targetCountry || "Any"}

Contact/Company Data:
${JSON.stringify(rowData, null, 2)}

Analyze, classify, and generate the personalized email now. Return only valid JSON.`;

  const result = await model.generateContent([systemPrompt, userMessage]);
  const text = result.response.text().trim();

  // Strip any accidental markdown code blocks
  const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    companySize: parsed.companySize,
    address: parsed.address,
    subject: parsed.subject,
    body: parsed.body,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      rows,
      emailColumn,
      companyColumn,
      targetCountry,
      startupRules,
      enterpriseRules,
      baseEmailTemplate,
      customInstructions,
    } = await req.json();

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    // --- CREDIT SYSTEM LOGIC ---
    // Calculate required credits (10 credits per email/row)
    const requiredCredits = rows.length * 10;

    // Fetch user's current credits_balance
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Could not fetch user profile to verify credits." }, { status: 500 });
    }

    const currentBalance = profile.credits_balance || 0;

    if (currentBalance < requiredCredits) {
      return NextResponse.json({ 
        error: `Not enough credits. You need ${requiredCredits} credits, but you only have ${currentBalance}. Please recharge.` 
      }, { status: 403 });
    }

    // Deduct credits immediately
    const newBalance = currentBalance - requiredCredits;
    const { error: deductError } = await supabase
      .from("profiles")
      .update({ credits_balance: newBalance })
      .eq("id", user.id);

    if (deductError) {
      return NextResponse.json({ error: "Failed to deduct credits. Please try again." }, { status: 500 });
    }
    // ---------------------------

    const leads: EnrichedLead[] = [];

    for (const row of rows) {
      const email = row[emailColumn]?.trim();
      const companyName = row[companyColumn] || row["Company"] || row["Company Name"] || row["Name"] || "Unknown Company";

      if (!email || !email.includes("@")) {
        leads.push({
          email: email || "N/A",
          companyName,
          companySize: "Startup/Small",
          address: "Unknown",
          rawData: row,
          subject: "",
          body: "",
          status: "failed",
          error: "Invalid or missing email address",
        });
        continue;
      }

      try {
        const { companySize, address, subject, body } = await classifyAndGenerateEmail(
          row,
          startupRules,
          enterpriseRules,
          targetCountry,
          baseEmailTemplate,
          customInstructions
        );

        leads.push({
          email,
          companyName,
          companySize,
          address,
          rawData: row,
          subject,
          body,
          status: "pending",
        });
      } catch (err: any) {
        leads.push({
          email,
          companyName,
          companySize: "Startup/Small",
          address: "Unknown",
          rawData: row,
          subject: "",
          body: "",
          status: "failed",
          error: err.message,
        });
      }
    }

    return NextResponse.json({ success: true, leads });
  } catch (error: any) {
    console.error("Hyper-campaign error:", error);
    return NextResponse.json({ error: error.message || "Generation failed." }, { status: 500 });
  }
}
