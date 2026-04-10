async function getModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  if (data.error) {
    console.error("API ERROR:", data.error.message);
    return;
  }
  const supported = data.models
    .filter(m => m.supportedGenerationMethods.includes("generateContent"))
    .map(m => m.name.replace("models/", ""));
  console.log("SUPPORTED MODELS:", supported.join(", "));
}
getModels();
