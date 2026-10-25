export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Smart Buwaba TTS configuration error: GEMINI_API_KEY is missing.");
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "TEXT_REQUIRED" });
  if (text.length > 2400) return res.status(413).json({ error: "TEXT_TOO_LONG" });

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text,
            annotations: [{
              type: "speech_metadata",
              style: "Speak clearly and naturally in fluent Malawian Chichewa (Nyanja), joining words and phrases smoothly. Use a warm, friendly conversational voice at a moderate pace with natural pauses. Read only the given transcript; do not add or translate anything."
            }]
          }]
        }],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: "Kore" }]
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error?.message || "Gemini TTS request failed.");
      console.error("Smart Buwaba TTS request failed:", { status: response.status, detail });
      const isQuota = response.status === 429 || /quota|resource exhausted|rate limit/i.test(detail);
      return res.status(isQuota ? 429 : 502).json({
        error: isQuota ? "GEMINI_TTS_QUOTA_EXCEEDED" : "GEMINI_TTS_FAILED"
      });
    }

    const outputAudio =
      data?.output_audio ||
      data?.outputAudio ||
      (Array.isArray(data?.steps)
        ? data.steps
            .filter(step => step?.type === "model_output")
            .flatMap(step => Array.isArray(step?.content) ? step.content : [])
            .filter(part => part?.type === "audio")
            .at(-1)
        : null);

    const audio = typeof outputAudio?.data === "string" ? outputAudio.data : "";
    if (!audio) {
      console.error("Smart Buwaba TTS response contained no audio data.");
      return res.status(502).json({ error: "GEMINI_TTS_EMPTY_AUDIO" });
    }

    return res.status(200).json({
      audio,
      mimeType: outputAudio?.mime_type || outputAudio?.mimeType || "audio/wav"
    });
  } catch (error) {
    console.error("Smart Buwaba TTS internal error:", error?.message || error);
    return res.status(502).json({ error: "GEMINI_TTS_FAILED" });
  }
}
