import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

export async function POST(req: Request) {
  try {
    const { prompt, rowData } = await req.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI/Gemini API key is missing." },
        { status: 500 }
      );
    }

    // No credit system logic - Unlimited Free Plan

    if (!prompt || !rowData) {
      return NextResponse.json(
        { error: "Prompt and row data are required." },
        { status: 400 }
      );
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
    const model = genAI.getGenerativeModel({ model: modelName });

    const systemInstructions = `You are an expert sales email copywriter. You will be given a target prompt of what the email should be about, and a JSON object containing the recipient's details (Name, Company, Niche, Location, etc. depending on what they provided).
Your goal is to write the final customized email. Focus on making it natural, relevant, and directly using the variables.
Output ONLY the raw content of the email without any surrounding markdown blocks or commentary. Include the subject line at the very top as "Subject: [Your Subject]\n\n[Email Body]"`;

    const userMessage = `Recipient Data:
${JSON.stringify(rowData, null, 2)}

Goal (Prompt):
${prompt}

Please generate the sales email for this specific recipient.`;

    const result = await model.generateContent([
      systemInstructions,
      userMessage
    ]);

    const generatedText = result.response.text();

    return NextResponse.json({ success: true, text: generatedText.trim() });
  } catch (error: any) {
    console.error("Generative AI error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate email." },
      { status: 500 }
    );
  }
}
