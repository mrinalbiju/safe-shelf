// Serverless proxy for Groq: the API key lives in the GROQ_API_KEY env var on
// Vercel, never in client code. GET reports availability; POST forwards a chat
// completion request (messages only — model and limits are pinned here;
// vision:true switches to the multimodal model for photo identification).
module.exports = async function handler(req, res) {
  const key = process.env.GROQ_API_KEY;

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hasKey: Boolean(key) });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!key) {
    return res.status(503).json({ error: "nokey" });
  }

  const messages = req.body && req.body.messages;
  const vision = Boolean(req.body && req.body.vision);
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 8) {
    return res.status(400).json({ error: "bad request" });
  }

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: vision ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages
      })
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: "upstream unreachable" });
  }
};
