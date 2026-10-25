
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST method." });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Please enter a message." });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    
const response = await ai.models.generateContent({
  model: "gemini-3.8-flash",
  contents: message,
  config: {
    systemInstruction: `
You are Smart Buwaba AI, a helpful, intelligent,
multilingual assistant.

Understand and communicate in as many languages
as possible, including Chichewa, Chiyao, English,
Arabic, French, Chinese, and others.

Always reply in the language the user uses.
If the user greets you, greet them naturally.
Understand the context before answering.
Never give unrelated definitions or guesses.
Keep answers clear, useful, and concise.
For simple questions, answer briefly and quickly.
If you do not understand, politely ask for clarification.
`,
    maxOutputTokens: 300,
  },
});


    return res.status(200).json({
      reply: response.text,
    });
  } catch (error) {
    console.error("AI request failed:", error.message);
    return res.status(500).json({
      error: "AI is temporarily unavailable. Please try again.",
    });
  }
}
