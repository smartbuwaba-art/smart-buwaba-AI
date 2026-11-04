import { GoogleGenAI } from "@google/genai";

const MAX_AUDIO_BASE64_LENGTH = 9_000_000;
const MODELS = [...new Set([
  process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
])];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });

  const { audioBase64, mimeType, language } = req.body || {};
  if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
    return res.status(400).json({ error: "AUDIO_REQUIRED" });
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return res.status(413).json({ error: "AUDIO_TOO_LARGE" });
  }

  const safeMime = typeof mimeType === "string" && /^audio\/[a-z0-9.+-]+(?:;[a-z0-9=.-]+)?$/i.test(mimeType)
    ? mimeType.split(";")[0].toLowerCase() : "audio/webm";
  const languageName = language === "en-US" ? "English" : language === "sw-KE" ? "Kiswahili" : "Chichewa (Malawian Nyanja)";
  const instruction = `Transcribe the supplied audio faithfully into written text.
The speaker's selected language is ${languageName}. If it is Chichewa, write natural, correct Malawian Chichewa with proper spelling, punctuation, and word spacing. Preserve the speaker's meaning and wording; do not translate it into English, do not summarize, and do not add explanations. Keep common English names and technical terms as spoken. Return only the transcription. If the audio is unclear, transcribe only the words that are genuinely audible and do not invent missing words.`;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: "user",
          parts: [
            { text: instruction },
            { inlineData: { mimeType: safeMime, data: audioBase64 } },
          ],
        }],
        config: { maxOutputTokens: 1200, temperature: 0.1 },
      });
      const transcript = typeof response.text === "string" ? response.text.trim() : "";
      if (!transcript) return res.status(422).json({ error: "TRANSCRIPTION_EMPTY" });
      return res.status(200).json({ transcript, model });
    } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      const message = String(error?.message || "");
      if (status === 429 || status === 404 || status >= 500 || /quota|rate.?limit|model.{0,40}(not found|unavailable)/i.test(message)) continue;
      console.error("Chat Buwaba audio transcription failed.", { status });
      return res.status(status >= 400 && status < 500 ? status : 500).json({ error: "TRANSCRIPTION_FAILED" });
    }
  }
  const status = Number(lastError?.status ?? lastError?.statusCode ?? 0);
  const msg = String(lastError?.message || "");
  const code = status === 429 || /quota|rate.?limit/i.test(msg) ? "GEMINI_QUOTA_EXCEEDED"
    : status === 404 || /model.{0,40}(not found|unavailable)/i.test(msg) ? "GEMINI_MODEL_NOT_FOUND"
    : "TRANSCRIPTION_FAILED";
  console.error("All Chat Buwaba transcription models failed.", { code, status });
  return res.status(503).json({ error: code });
}
