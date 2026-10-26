export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY_MISSING" });
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "IMAGE_PROMPT_REQUIRED" });
  }
  if (prompt.length > 1800) {
    return res.status(400).json({ error: "IMAGE_PROMPT_TOO_LONG" });
  }

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
        input: [{
          type: "text",
          text: "Create one beautiful, high-quality image based on this description. Use thoughtful composition, clear visual details, natural lighting, and a polished professional finish. Follow the requested subject and style: " + prompt
        }],
        response_format: {
          type: "image",
          mime_type: "image/png",
          aspect_ratio: "1:1",
          image_size: "1K"
        },
        store: false
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = String(data?.error?.message || "");
      console.error("Smart Buwaba image generation failed.", {
        status: upstream.status,
        detail: detail.slice(0, 400)
      });
      if (upstream.status === 429 || /resource_exhausted|quota|rate.?limit/i.test(detail)) {
        return res.status(429).json({ error: "GEMINI_IMAGE_QUOTA_EXCEEDED" });
      }
      if (upstream.status === 401 || /api key.*invalid|invalid api key/i.test(detail)) {
        return res.status(401).json({ error: "GEMINI_API_KEY_INVALID" });
      }
      if (upstream.status === 403) {
        return res.status(403).json({ error: "GEMINI_IMAGE_ACCESS_DENIED" });
      }
      if (upstream.status === 404 || /model.{0,60}(not found|not supported|unavailable)/i.test(detail)) {
        return res.status(503).json({ error: "GEMINI_IMAGE_MODEL_UNAVAILABLE" });
      }
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
        .json({ error: "GEMINI_IMAGE_REQUEST_FAILED" });
    }

    let image = data?.output_image;
    if (!image?.data) {
      const steps = Array.isArray(data?.steps) ? [...data.steps].reverse() : [];
      for (const step of steps) {
        const blocks = Array.isArray(step?.content) ? [...step.content].reverse() : [];
        const match = blocks.find(block =>
          block?.type === "image" && typeof block.data === "string" && block.data.length > 100
        );
        if (match) {
          image = match;
          break;
        }
      }
    }

    if (!image || typeof image.data !== "string" || !image.data) {
      console.error("Smart Buwaba image generation returned no inline image.", {
        status: upstream.status,
        responseKeys: Object.keys(data || {})
      });
      return res.status(502).json({ error: "GEMINI_IMAGE_NO_OUTPUT" });
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      imageData: image.data,
      mimeType: typeof image.mime_type === "string" && image.mime_type.startsWith("image/")
        ? image.mime_type : "image/png"
    });
  } catch (error) {
    console.error("Smart Buwaba image generation network error.", error?.message || error);
    return res.status(502).json({ error: "GEMINI_IMAGE_TEMPORARY_FAILURE" });
  }
}
