import { GoogleGenAI } from "@google/genai";

const MAX_AUDIO_BASE64_LENGTH = 9_000_000;
const MODELS = [...new Set([
  process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
])];

async function transcribeNyanjaWithCloudSpeech(audioBase64) {
  const apiKey = process.env.GOOGLE_CLOUD_SPEECH_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  const endpoint = `https://asia-southeast1-speech.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/asia-southeast1/recognizers/_:recognize?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        languageCodes: ["ny-MW"],
        model: "chirp_2",
        features: { enableAutomaticPunctuation: true },
      },
      content: audioBase64,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Google Cloud Nyanja transcription unavailable.", {
      status: response.status,
      detail: detail.slice(0, 400),
    });
    return null;
  }

  const data = await response.json();
  const transcript = (data.results || [])
    .flatMap(result => result.alternatives || [])
    .map(alternative => alternative.transcript || "")
    .filter(Boolean)
    .join(" ")
    .trim();

  return transcript ? { transcript, model: "chirp_2", provider: "google-cloud-speech" } : null;
}

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
  const isChichewa = language === "ny-MW";
  const languageName = language === "en-US" ? "English" : language === "sw-KE" ? "Kiswahili" : "Chichewa (Malawian Nyanja)";

  // Nyanja (Malawi) is explicitly supported by Google Cloud Speech-to-Text
  // Chirp 2 in asia-southeast1. Prefer it for Chichewa when configured.
  if (isChichewa) {
    try {
      const cloudResult = await transcribeNyanjaWithCloudSpeech(audioBase64);
      if (cloudResult) return res.status(200).json(cloudResult);
    } catch (error) {
      console.error("Google Cloud Nyanja transcription request failed.", {
        message: String(error?.message || "unknown").slice(0, 250),
      });
    }
  }

  const instruction = isChichewa
    ? `Transcribe this recording into natural written Chichewa (Nyanja as spoken in Malawi). This is Chichewa, not Swahili and not English. Listen carefully to every spoken word. Preserve the speaker's actual words, order, meaning, names, and code-switching; do not translate, summarize, rewrite, or guess. Use standard Malawian Chichewa spelling, natural word spacing, and punctuation. Keep English words and technical names in English when spoken that way. If a word is genuinely unclear, do not replace it with a different plausible word or invent text; leave that portion out. Return only the transcript.`
    : `Transcribe the supplied audio faithfully into written text. The speaker's selected language is ${languageName}. Preserve the speaker's wording and meaning; do not translate, summarize, or add explanations. Keep names and technical terms as spoken. Return only the transcription. If audio is unclear, do not invent missing words.`;

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
        config: { maxOutputTokens: 1200, temperature: 0 },
      });
      const transcript = typeof response.text === "string" ? response.text.trim() : "";
      if (!transcript) return res.status(422).json({ error: "TRANSCRIPTION_EMPTY" });
      return res.status(200).json({
        transcript,
        model,
        provider: "gemini-fallback",
        ...(isChichewa ? { warning: "NYANJA_SPEECH_SERVICE_NOT_CONFIGURED" } : {}),
      });
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
