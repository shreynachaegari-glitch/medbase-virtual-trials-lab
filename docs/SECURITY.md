# Security

MedBase Virtual Trials Lab has no accounts, no user database and no server of its own beyond one small proxy. That removes most of the usual risks, so this page covers what is left.

To re-run the automated checks: `.venv/bin/python scripts/security_check.py` (results in `results/security_check.json`).

## What is protected, and how

| Risk | Measure | Where |
|---|---|---|
| The AI key leaks | The key exists only in the proxy's environment. The build refuses to deploy if a key pattern appears in the site. Tracked files and git history are scanned | `proxy/api/chat.js`, `scripts/deploy_static.sh`, `scripts/security_check.py` |
| The proxy is used as a free general AI | It accepts only the lab's exact system prompts and tool lists, checked by hash. It also rebuilds each message and tool call from allowed fields, caps the size of every part, and limits the rate per address and overall | `proxy/api/chat.js` |
| Prompt injection or requests for the prompt | A rule-based guard runs before any model. Asking for the system prompt is refused | `medlab/agent/guard.py` |
| Personal or urgent text reaches a third party | The guard runs before the question is embedded or sent to a model. Refused, urgent and non-English messages stay on the device, as far as the guard recognises them | `medlab/agent/assistant.py` |
| A model invents a figure or answers from memory | Code checks figures against tool output and wording against the notes. Unsupported text is removed or replaced, and the page says so. If the removed part carries a safety warning, the whole reply is replaced instead | `medlab/agent/guard.py`, `medlab/agent/assistant.py` |
| Script injection (XSS) | React escapes all model text and no raw HTML is rendered. The built site carries a Content Security Policy | `web/vite.config.ts` |
| A forged earlier question | The `previous` field is untrusted: merged text goes through the guard again, and a refused question carries nothing forward | `assistant.resolve_followup` |
| Malformed embeddings or database replies | Size, type and finiteness are validated, with a fallback to numpy or keyword search | `medlab/agent/knowledge.py` |
| Oversized or abusive API calls | Rate limits, a body size limit that counts bytes actually received, security headers and no API docs in public mode | `medlab/api.py` |
| Vulnerable packages | `npm audit` on production dependencies, and Python versions pinned in `requirements.lock` | `scripts/security_check.py` |

## Known limits

- **The Origin header can be forged.** The proxy cannot prove a request came from the site. Someone can still replay the lab's own prompts and spend quota, within the rate limits, and may coax the model off topic. The limits and NVIDIA's own quota are the final backstop.
- **Rate limits are best effort.** Serverless instances do not share memory, so the real limit can be higher than the stated one.
- **Questions sent to a provider leave the device.** The proxy stores no question text, but the lab does not control what NVIDIA keeps. The page warns visitors not to enter personal details.
- **The Content Security Policy is delivered by a meta tag.** A static host gives no control of headers, so `frame-ancestors` cannot be set, and `style-src` allows inline styles because the animation library needs them. Web workers are governed by the host's headers, not this tag.
- **The regex guard is not airtight.** See the guard tables in the README. It suits a supervised demo. Language detection is a word list, so some non-English messages will be missed and reach a provider.
- **A replayed conversation can still be forged within the caps.** Someone can write fake assistant turns that fit the limits. Replies on the real page are checked in the browser, but the proxy can't check a reply it forwards to someone else.
- **No third-party penetration test has been done.** These measures were checked by the project's own tests and an internal adversarial review.

## Reporting a problem

Please open an issue on the GitHub repository, without including any working key or exploit detail.
