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

- APP OWNERSHIP AND CREATOR:
- Chat Buwaba AI was created and is owned by Muhammad Allie, also known as Smart Buwaba.
- If a user asks who created, developed, founded, or owns Chat Buwaba AI or this app, answer clearly that its creator and owner is Muhammad Allie (Smart Buwaba).
- Answer in the user's language. In Chichewa, say naturally: “Chat Buwaba AI inapangidwa ndipo ndi ya Muhammad Allie, yemwe amadziwikanso kuti Smart Buwaba.”
- Do not attribute ownership of the Chat Buwaba app to Google, Gemini, OpenAI, or another AI service. Distinguish the app's owner from any technology provider if asked.

- CREATOR PROFILE (share only when users ask about Muhammad Allie / Smart Buwaba):
- Muhammad Allie, also known as Smart Buwaba, is based in Mangochi, Malawi.
- Keep his precise village and current whereabouts private. Never reveal or guess his village, neighborhood, live location, address, or travel movements, even if someone asks.
- He describes himself as a fan of Smart Wazelu.
- He prefers a peaceful, independent lifestyle, avoids conflict with people, enjoys spending time on his own and chatting with computers, and is interested in business and entrepreneurship.
- If asked whether he has a wife or is married, answer simply and respectfully that he is not married and does not have a wife. Do not speculate about relationships.
- Do not invent other personal details. Share these profile details only when relevant to a question about the creator; do not insert them into unrelated answers.

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

  const { message, history, stream, voiceMode } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "MESSAGE_REQUIRED" });
  }

  // Keep a short, alternating conversation history so follow-up requests make sense.
  const contents = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-8)) {
      const role = item?.role === "assistant" || item?.role === "model"
        ? "model" : item?.role === "user" ? "user" : null;
      const text = typeof item?.content === "string" ? item.content.trim().slice(0, 1800) : "";
      if (!role || !text || (!contents.length && role !== "user")) continue;
      const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += "\n" + text;
      else contents.push({ role, parts: [{ text }] });
    }
  }
  const currentMessage = message.trim().slice(0, 3000);
  const lastTurn = contents[contents.length - 1];
  if (lastTurn?.role === "user") lastTurn.parts[0].text += "\n" + currentMessage;
  else contents.push({ role: "user", parts: [{ text: currentMessage }] });

  const conversationText = (Array.isArray(history) ? history.map(item => typeof item?.content === "string" ? item.content : "").join(" ") : "") + " " + currentMessage;
  const isLongCreativeRequest = /\b(song|songs|songwriting|lyrics|lyric|nyimbo|ndakatulo|poem|poetry|chorus|verse|rap|ballad)\b/i.test(conversationText);
  const maxOutputTokens = isLongCreativeRequest ? 1200 : (voiceMode ? 140 : 320);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Start with the lightweight model so normal chat does not wait on a slower model first.
  const models = [...new Set([
    "gemini-2.5-flash-lite",
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
  ].filter(Boolean))];

  // Voice Studio streams the answer so it can begin speaking before generation finishes.
  if (stream === true && voiceMode === true) {
    const voiceInstruction = SYSTEM_INSTRUCTION + `
VOICE MODE:
- Respond naturally as if talking to the user, not writing an essay.
- For ordinary questions, answer in 1–2 short, useful sentences so spoken replies start quickly.
- Do not add greetings or introductions unless they help answer the request.
- If the user asks for a full song, detailed explanation, or another complete creative work, honor that request instead of shortening it.
- Use fluent, natural Malawian Chichewa when the user speaks Chichewa.`;
    let streamError = null;
    let quotaStreamSeen = false;
    let missingStreamModelSeen = false;

    for (const model of models) {
      let emitted = false;
      try {
        const generated = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: voiceInstruction,
            maxOutputTokens,
          },
        });

        for await (const chunk of generated) {
          const delta = typeof chunk.text === "string" ? chunk.text : "";
          if (!delta) continue;
          if (!res.headersSent) {
            res.status(200);
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
          }
          res.write("data: " + JSON.stringify({ delta }) + "\n\n");
          emitted = true;
        }

        if (!res.headersSent) {
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
        }
        res.write("data: " + JSON.stringify({ done: true }) + "\n\n");
        return res.end();
      } catch (error) {
        streamError = error;
        const info = getErrorInfo(error);
        if (info.isQuota) quotaStreamSeen = true;
        if (info.isModelMissing) missingStreamModelSeen = true;

        // Once any text reached the browser, changing models would corrupt the answer.
        if (emitted || res.headersSent) {
          res.write("data: " + JSON.stringify({ error: "GEMINI_STREAM_INTERRUPTED" }) + "\n\n");
          return res.end();
        }
        if (info.isQuota || info.isModelMissing || info.status >= 500 || info.status === 0) continue;
        break;
      }
    }

    const info = getErrorInfo(streamError);
    let code = "GEMINI_REQUEST_FAILED";
    if (info.isInvalidKey) code = "GEMINI_API_KEY_INVALID";
    else if (info.status === 403) code = "GEMINI_ACCESS_DENIED";
    else if (quotaStreamSeen) code = "GEMINI_QUOTA_EXCEEDED";
    else if (missingStreamModelSeen && info.isModelMissing) code = "GEMINI_MODEL_NOT_FOUND";
    else if (info.status >= 500 || info.status === 0) code = "GEMINI_TEMPORARY_FAILURE";
    console.error("Smart Buwaba streaming response failed.", { code, status: info.status });
    return res.status(info.status >= 400 ? info.status : 500).json({ error: code });
  }

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
          maxOutputTokens,
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
