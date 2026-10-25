import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("Smart Buwaba AI configuration error: GEMINI_API_KEY is missing.");
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "MESSAGE_REQUIRED" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: message,
      config: {
        systemInstruction: `
You are Smart Buwaba AI, a warm, natural, intelligent multilingual voice-and-chat assistant.

Understand speech-like, informal messages, spelling mistakes, incomplete sentences, and wake phrases such as "Hey Smart Buwaba" or "Smart Buwaba". If a wake phrase is followed by a question, answer the question directly and do not repeat the wake phrase.

Reply in the same language the user uses, including Chichewa, Chiyao, and English. When the user mixes languages, respond naturally in that mix. Sound calm, friendly, respectful, and conversational, like a helpful human assistant, without pretending to be human.

For voice-friendly answers, use short natural sentences that are easy to hear aloud. Answer simple greetings naturally in Chichewa. Be accurate, relevant, and concise. If the meaning is unclear, ask one brief clarification instead of guessing.
`,
        maxOutputTokens: 300,
      },
    });

    const reply = typeof response.text === "string" ? response.text.trim() : "";
    if (!reply) {
      console.error("Smart Buwaba Gemini returned an empty reply.");
      return res.status(502).json({ error: "GEMINI_EMPTY_RESPONSE" });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
    const detail = String(error?.message || "");
    let code = "GEMINI_REQUEST_FAILED";

    if (status === 401 || /invalid api key|api key.*invalid|api key must be set|api_key_invalid/i.test(detail)) {
      code = "GEMINI_API_KEY_INVALID";
    } else if (status === 403) {
      code = "GEMINI_ACCESS_DENIED";
    } else if (status === 404) {
      code = "GEMINI_MODEL_NOT_FOUND";
    } else if (status === 429) {
      code = "GEMINI_QUOTA_EXCEEDED";
    } else if (status >= 500 || status === 0) {
      code = "GEMINI_TEMPORARY_FAILURE";
    }

    // Keep the detailed provider error in Vercel logs only; never return secrets to the browser.
    console.error("Smart Buwaba Gemini failure:", { status, code, detail });
    return res.status(500).json({ error: code });
  }
}
