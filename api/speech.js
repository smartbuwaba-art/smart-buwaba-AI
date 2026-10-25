export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Smart Buwaba TTS configuration error: GEMINI_API_KEY is missing.");
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  const body = req.body || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "TEXT_REQUIRED" });
  if (text.length > 2400) return res.status(413).json({ error: "TEXT_TOO_LONG" });

  const input = [
    "Read the following transcript aloud in clear, natural Chichewa (Nyanja) as spoken in Malawi.",
    "Use fluent Chichewa pronunciation, natural connected phrasing, a warm friendly conversational voice, moderate pace, and small natural pauses.",
    "Read the transcript faithfully. Do not translate, summarise, or add introductory words.",
    "",
    text,
  ].join("\n");

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
        input,
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: "Aoede", language: "ny" }],
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error?.message || "Gemini TTS request failed.");
      console.error("Smart Buwaba TTS request failed:", { status: response.status, detail });
      const isQuota = response.status === 429 || /quota|resource exhausted|rate limit/i.test(detail);
      return res.status(isQuota ? 429 : 502).json({
        error: isQuota ? "GEMINI_TTS_QUOTA_EXCEEDED" : "GEMINI_TTS_FAILED",
      });
    }

    const audio = data?.output_audio?.data || data?.outputAudio?.data;
    if (typeof audio !== "string" || !audio) {
      console.error("Smart Buwaba TTS returned no output_audio payload.");
      return res.status(502).json({ error: "GEMINI_TTS_EMPTY_AUDIO" });
    }

    return res.status(200).json({
      audio,
      mimeType: data?.output_audio?.mime_type || data?.outputAudio?.mimeType || "audio/wav",
    });
  } catch (error) {
    console.error("Smart Buwaba TTS internal error:", error?.message || error);
    return res.status(502).json({ error: "GEMINI_TTS_FAILED" });
  }
}
