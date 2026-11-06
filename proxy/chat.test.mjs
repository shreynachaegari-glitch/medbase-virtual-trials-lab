// Run: node proxy/chat.test.mjs. Exercises the handler with a stubbed NVIDIA endpoint; no network, no quota.
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGINS = "https://allowed.example";
process.env.NVIDIA_API_KEY = "test-key";
const { default: handler } = await import("./api/chat.js");

const call = async (origin, body, method = "POST") => {
  const out = { status: 0, headers: {}, json: null };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    json(value) { out.json = value; return this; },
    end() { return this; },
  };
  await handler({ method, headers: { origin, "x-forwarded-for": "1.2.3.4" }, body }, res);
  return out;
};

let sent = null;
globalThis.fetch = async (_url, init) => {
  sent = { body: JSON.parse(init.body), auth: init.headers.Authorization };
  return { ok: true, json: async () => ({ choices: [{ message: { content: "ok", tool_calls: [] } }] }) };
};

const good = { messages: [{ role: "user", content: "hi" }], tools: [] };
const allowed = await call("https://allowed.example", good);
assert.equal(allowed.status, 200);
assert.equal(allowed.json.message.content, "ok");
assert.deepEqual(sent.body.chat_template_kwargs, { enable_thinking: false });
assert.equal(sent.auth, "Bearer test-key");
assert.ok(!JSON.stringify(allowed.json).includes("test-key"));

assert.equal((await call("https://evil.example", good)).status, 403);
assert.equal((await call("https://evil.example", good, "OPTIONS")).status, 403);
assert.equal((await call("https://allowed.example", good, "OPTIONS")).status, 204);
assert.equal((await call("https://allowed.example", { messages: [], tools: [] })).status, 422);

globalThis.fetch = async () => ({ ok: false, status: 500 });
assert.equal((await call("https://allowed.example", good)).status, 502);
console.log("proxy tests passed");
