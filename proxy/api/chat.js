// Keeps the NVIDIA key off the public site. Forwards one chat or embedding request from the lab's own page to
// NVIDIA NIM, with fixed models, bounded size and rate limits. It runs no tools and stores nothing.
import { createHash } from "node:crypto";

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
const MAX_TRACKED_ADDRESSES = 5000;
const MAX_CONTENT_CHARS = { system: 8000, user: 8000, assistant: 6000, tool: 16000 };
const MAX_TOOL_CALLS = 6;
const MAX_TOOL_ARGUMENT_CHARS = 2000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 400;
const RETRY_ONLY_WITHIN_MS = 15_000;
// Hashes of the lab's own prompts and tool lists, so this can't be used as a general AI. Python tests keep them in step.
const ALLOWED_PROMPTS = new Set(["b9323543050b03f64e867260803497be388f7d0f08f3f693d03465479ad93b31", "d3341e57afd1155b57abdc4de31a32e438d1aeb0beff879eaf49dd47ef2eb332"]);
const ALLOWED_TOOLS = new Set(["186c4883759e6ef2042f0807ec1cc35f34019f4827dc47bfb981b8fffef7e253", "c03ae0ed1be97f62461c4464ad6b19aebae9369a5dca9c3432684eeef387f06b"]);
const ROLES = new Set(["system", "user", "assistant", "tool"]);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** A tool call the model could really have made: a tool from the lab's list, with short arguments. */
const cleanToolCalls = (calls, toolNames) => {
  if (!Array.isArray(calls) || calls.length > MAX_TOOL_CALLS) return null;
  const clean = [];
  for (const call of calls) {
    const name = call?.function?.name;
    const args = call?.function?.arguments;
    if (typeof call?.id !== "string" || call.id.length > 200 || !toolNames.has(name) || typeof args !== "string" || args.length > MAX_TOOL_ARGUMENT_CHARS) return null;
    clean.push({ id: call.id, type: "function", function: { name, arguments: args } });
  }
  return clean;
};

/** Only the fields the model needs, from a conversation that starts with one of the lab's prompts. Anything else is refused. */
const cleanMessages = (messages, toolNames) => {
  if (messages[0]?.role !== "system" || typeof messages[0].content !== "string" || !ALLOWED_PROMPTS.has(sha256(messages[0].content))) return null;
  const clean = [];
  for (const [index, m] of messages.entries()) {
    if (!m || !ROLES.has(m.role) || (m.role === "system" && index > 0)) return null;
    if (m.content !== null && m.content !== undefined && typeof m.content !== "string") return null;
    if ((m.content ?? "").length > MAX_CONTENT_CHARS[m.role]) return null;
    const kept = { role: m.role, content: m.content ?? "" };
    if (m.role === "assistant" && m.tool_calls !== undefined) {
      const calls = cleanToolCalls(m.tool_calls, toolNames);
      if (!calls) return null;
      if (calls.length > 0) kept.tool_calls = calls;
    }
    if (m.role === "tool") {
      if (typeof m.tool_call_id !== "string") return null;
      kept.tool_call_id = m.tool_call_id;
    }
    clean.push(kept);
  }
  return clean;
};

/** One retry on a brief failure, unless the first try has already used most of the time. Logs carry no question text. */
const callNim = async (url, body, timeoutMs, kind) => {
  const startedAt = Date.now();
  const once = () => fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let response = await once();
  let retried = false;
  if (RETRY_STATUSES.has(response.status) && Date.now() - startedAt < RETRY_ONLY_WITHIN_MS) {
    retried = true;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    response = await once();
  }
  console.log(JSON.stringify({ event: "nim", kind, status: response.status, ms: Date.now() - startedAt, retried }));
  return response;
};

// Best effort: serverless instances do not share memory, so NVIDIA's own quota is the final limit.
const allow = (key, { limit, windowMs }) => {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  if (hits.size > MAX_TRACKED_ADDRESSES) hits.clear();
  hits.set(key, recent);
  return true;
};

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
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
      const upstream = await callNim(EMBED_URL, { model: EMBED_MODEL, input: [embed], input_type: "query" }, 10_000, "embed");
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
  if (!ALLOWED_TOOLS.has(sha256(JSON.stringify(tools)))) return res.status(403).json({ error: "not allowed" });
  const clean = cleanMessages(messages, new Set(tools.map((tool) => tool.function.name)));
  if (!clean) return res.status(403).json({ error: "not allowed" });

  try {
    // Hidden reasoning used up the token budget and left replies empty, and it added most of the wait.
    const upstream = await callNim(NIM_URL, { model: MODEL, messages: clean, tools, max_tokens: 1200, chat_template_kwargs: { enable_thinking: false } }, 50_000, "chat");
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
