export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Smart Buwaba Live Voice configuration error: GEMINI_API_KEY is missing.");
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  try {
    const now = Date.now();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 20 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: "models/gemini-3.8-live",
          config: {
            responseModalities: ["AUDIO"]
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.name !== "string" || !data.name) {
      console.error("Smart Buwaba Live Voice token request failed.", {
        status: response.status,
        detail: String(data?.error?.message || "No ephemeral token returned.")
      });
      const status = response.status >= 400 && response.status < 600 ? response.status : 502;
      return res.status(status).json({ error: "GEMINI_LIVE_TOKEN_FAILED" });
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({ token: data.name });
  } catch (error) {
    console.error("Smart Buwaba Live Voice token error:", error?.message || error);
    return res.status(502).json({ error: "GEMINI_LIVE_TOKEN_FAILED" });
  }
}
