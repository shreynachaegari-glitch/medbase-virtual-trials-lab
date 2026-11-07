// Keeps the NVIDIA key off the public site. Forwards one chat or embedding request from the lab's own page to
// NVIDIA NIM, with fixed models, bounded size and rate limits. It runs no tools and stores nothing.
const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const MAX_EMBED_CHARS = 500;
const MODEL = process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
const MAX_BODY_CHARS = 60000;
const MAX_MESSAGES = 14;
const PER_IP = { limit: 15, windowMs: 60_000 };
const GLOBAL = { limit: 300, windowMs: 3_600_000 };
const hits = new Map();

// Best effort: serverless instances do not share memory, so NVIDIA's own quota is the final limit.
const allow = (key, { limit, windowMs }) => {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const permitted = ALLOWED.includes(origin);
  if (permitted) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(permitted ? 204 : 403).end();
  if (req.method !== "POST" || !permitted) return res.status(403).json({ error: "not allowed" });
  if (!process.env.NVIDIA_API_KEY) return res.status(503).json({ error: "AI service is not configured" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || "unknown";
  if (!allow(`ip:${ip}`, PER_IP) || !allow("all", GLOBAL)) return res.status(429).json({ error: "Too many requests. Please try again shortly." });

  const { embed, messages, tools } = req.body || {};
  if (embed !== undefined) {
    if (typeof embed !== "string" || !embed.trim() || embed.length > MAX_EMBED_CHARS) return res.status(400).json({ error: "bad request" });
    try {
      const upstream = await fetch(EMBED_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: [embed], input_type: "query" }),
        signal: AbortSignal.timeout(10_000),
      });
      const vector = upstream.ok ? (await upstream.json())?.data?.[0]?.embedding : null;
      if (!Array.isArray(vector)) {
        console.error("embedding status", upstream.status);
        return res.status(502).json({ error: "AI service error" });
      }
      return res.status(200).json({ vector });
    } catch (error) {
      console.error("embedding failure", error?.name);
      return res.status(502).json({ error: "AI service unavailable" });
    }
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES || !Array.isArray(tools)) return res.status(422).json({ error: "bad request" });
  if (JSON.stringify(req.body).length > MAX_BODY_CHARS) return res.status(413).json({ error: "request too large" });

  try {
    const upstream = await fetch(NIM_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
      // Hidden reasoning used up the token budget and left replies empty, and it added most of the wait.
      body: JSON.stringify({ model: MODEL, messages, tools, max_tokens: 1200, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!upstream.ok) {
      console.error("NIM status", upstream.status);
      return res.status(502).json({ error: "AI service error" });
    }
    const data = await upstream.json();
    const message = data?.choices?.[0]?.message;
    if (!message) return res.status(502).json({ error: "AI service returned no reply" });
    return res.status(200).json({ message: { content: message.content ?? "", tool_calls: message.tool_calls ?? [] } });
  } catch (error) {
    console.error("proxy failure", error?.name);
    return res.status(502).json({ error: "AI service unavailable" });
  }
}
