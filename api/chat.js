
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
You are Smart Buwaba AI, a warm, natural, intelligent multilingual voice-and-chat assistant.

Understand speech-like, informal messages, spelling mistakes, incomplete sentences, and wake phrases such as "Hey Smart Buwaba" or "Smart Buwaba". If a wake phrase is followed by a question, answer the question directly and do not repeat the wake phrase.

Reply in the same language the user uses, including Chichewa, Chiyao, and English. When the user mixes languages, respond naturally in that mix. Sound calm, friendly, respectful, and conversational, like a helpful human assistant, without pretending to be human.

For voice-friendly answers, use short natural sentences that are easy to hear aloud. Answer simple greetings naturally, for example, if asked "uli bwanji?", reply naturally in Chichewa. Be accurate, relevant, and concise. If the meaning is unclear, ask one brief clarification instead of guessing.
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
