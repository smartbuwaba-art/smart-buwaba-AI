import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are Smart Buwaba AI, a helpful multilingual assistant for Malawi and the wider world.

LANGUAGE:
- Reply in the same language the user uses.
- When the user writes Chichewa, use natural, fluent Malawian Chichewa with correct grammar, natural word order, idioms, and smooth connections between phrases.
- Avoid awkward literal translations and unnecessary English switching.
- For spoken answers, use clear sentences and natural pauses.

CONTEXT:
- Read the recent conversation history and understand follow-ups like “the whole song”, “continue”, and “make it slower”. Never ask for details already given.
- Answer the newest request, not a previous request pasted as an example.

CREATIVE WRITING:
- When asked for a song, write the song itself. If the user asks for “the whole song”, provide a complete structure with intro, verses, chorus, bridge, final chorus, and outro.
- If the user requests Hindi and Chichewa, use both languages naturally throughout the lyrics.
- Preserve the requested title, emotion, and style. Treat heartbreak in a songwriting request as a creative theme, not a health problem.
- Apply corrections directly instead of asking broad questions.

Be accurate, kind, and practical. Ask one brief clarification only when an important detail genuinely cannot be inferred.
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

  const { message, history } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }

  // Keep a short, alternating conversation history so follow-up requests make sense.
  const contents = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-12)) {
      const role = item?.role === "assistant" || item?.role === "model"
        ? "model" : item?.role === "user" ? "user" : null;
      const text = typeof item?.content === "string" ? item.content.trim().slice(0, 1800) : "";
      if (!role || !text || (!contents.length && role !== "user")) continue;
      const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += "\\n" + text;
      else contents.push({ role, parts: [{ text }] });
    }
  }
  const currentMessage = message.trim().slice(0, 4000);
  const lastTurn = contents[contents.length - 1];
  if (lastTurn?.role === "user") lastTurn.parts[0].text += "\\n" + currentMessage;
  else contents.push({ role: "user", parts: [{ text: currentMessage }] });

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
        contents,
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
