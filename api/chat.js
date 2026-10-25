import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are Smart Buwaba AI, a warm, natural, intelligent multilingual voice-and-chat assistant.

Understand speech-like, informal messages, spelling mistakes, incomplete sentences, and wake phrases such as "Hey Smart Buwaba" or "Smart Buwaba". If a wake phrase is followed by a question, answer the question directly and do not repeat the wake phrase.

Reply in the same language the user uses, including Chichewa, Chiyao, and English. When the user mixes languages, respond naturally in that mix. Sound calm, friendly, respectful, and conversational, like a helpful human assistant, without pretending to be human.

For voice-friendly answers, use short natural sentences that are easy to hear aloud. Answer simple greetings naturally in Chichewa. Be accurate, relevant, and concise. If the meaning is unclear, ask one brief clarification instead of guessing.
`;

function getErrorInfo(error) {
  const rawStatus = error?.status ?? error?.statusCode ?? error?.code ?? error?.response?.status;
  const parsedStatus = Number(rawStatus);
  const status = Number.isFinite(parsedStatus) ? parsedStatus : 0;
  const detail = String(error?.message || error || "");
  const isQuota = status === 429 || /resource_exhausted|quota|rate.?limit|too many requests/i.test(detail);
  const isModelMissing = status === 404 || /model.{0,50}(not found|not supported|unavailable)/i.test(detail);
  const isInvalidKey = status === 401 || /invalid api key|api key.{0,30}invalid|api_key_invalid/i.test(detail);
  return { status, detail, isQuota, isModelMissing, isInvalidKey };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("Smart Buwaba AI configuration error: GEMINI_API_KEY is missing.");
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = [...new Set([
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
  ])];

  let lastError = null;
  let quotaSeen = false;
  let modelMissingSeen = false;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: 300,
        },
      });

      const reply = typeof response.text === "string" ? response.text.trim() : "";
      if (!reply) {
        const emptyError = new Error("Gemini returned an empty response.");
        emptyError.status = 502;
        throw emptyError;
      }

      console.info("Smart Buwaba AI reply generated.", { model });
      return res.status(200).json({ reply, model });
    } catch (error) {
      lastError = error;
      const info = getErrorInfo(error);

      if (info.isQuota) {
        quotaSeen = true;
        console.warn("Gemini model quota/rate limit reached; trying fallback model.", {
          model, status: info.status, detail: info.detail,
        });
        continue;
      }

      if (info.isModelMissing) {
        modelMissingSeen = true;
        console.warn("Gemini model unavailable; trying fallback model.", {
          model, status: info.status, detail: info.detail,
        });
        continue;
      }

      if (info.status >= 500 || info.status === 0) {
        console.warn("Gemini model temporarily failed; trying fallback model.", {
          model, status: info.status, detail: info.detail,
        });
        continue;
      }

      // Invalid credentials or access errors are not fixed by changing model.
      console.error("Smart Buwaba Gemini request stopped.", {
        model, status: info.status, detail: info.detail,
      });
      break;
    }
  }

  const info = getErrorInfo(lastError);
  let code = "GEMINI_REQUEST_FAILED";
  if (info.isInvalidKey) {
    code = "GEMINI_API_KEY_INVALID";
  } else if (info.status === 403) {
    code = "GEMINI_ACCESS_DENIED";
  } else if (quotaSeen) {
    code = "GEMINI_QUOTA_EXCEEDED";
  } else if (modelMissingSeen && info.isModelMissing) {
    code = "GEMINI_MODEL_NOT_FOUND";
  } else if (info.status >= 500 || info.status === 0) {
    code = "GEMINI_TEMPORARY_FAILURE";
  }

  console.error("All Smart Buwaba Gemini model attempts failed.", {
    code, lastStatus: info.status, triedModels: models,
  });
  return res.status(500).json({ error: code });
}
