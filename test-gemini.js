const { GoogleGenerativeAI } = require("@google/generative-ai");

async function test() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });
    const result = await model.generateContent("hello");
    console.log("SUCCESS:", result.response.text());
  } catch (error) {
    console.error("ERROR HTTP STATUS:", error.status);
    console.error("ERROR MESSAGE:", error.message);
  }
}

test();
