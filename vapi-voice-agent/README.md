# Vapi + Floe: Budget-Governed Voice Concierge (Outbound)

A Vapi voice **concierge** that calls *you*, answers questions by searching the live web (Exa, paid through Floe's x402 proxy), and **enforces a budget, not a balance**. The agent **tapers** as it nears its session spend cap (it sees how much it has spent after every search and adapts), then **audibly hard-stops** at the cap ("I've hit my lookup budget for this call") instead of overspending.

## What this shows

- **Outbound call:** the agent dials the user's phone (`call.ts`) — no inbound number needed.
- **Real paid lookups:** a `search_web` tool hits **Exa** (`https://api.exa.ai/search`, ~$0.005/call) through Floe — one API key, one balance, one ledger. No wallet, no USDC management.
- **A real spend control:** a session spend-limit Floe enforces server-side, set with one API call.
- **Taper:** every tool result carries a short `[Floe budget: …]` line. The model reads it and searches less / answers shorter as it approaches the cap.
- **Hard-stop:** when the cap is hit, the proxy returns 402/403 and the agent tells the caller it's out of lookup budget — it does not overspend.
- **Unified billing as proof:** every search is one line item under one credit line — `GET /agents/transactions` shows the whole run and where it stopped.

## Why "a budget, not a balance"

A balance just runs out — silently, mid-task, with no graceful behavior. A **budget** is a policy the agent is aware of: it can pace itself against it and stop cleanly when it's reached. Floe gives you both halves:

1. The **advisory** (soft signal) the agent reads to taper — surfaced via the `X-Floe-Budget-Advisory` response header and the budget line this server appends to each tool result.
2. The **hard cap** (server-side enforcement) — the session spend-limit. When exceeded, the proxy denies the paid call, which drives the audible stop.

## Architecture

```text
call.ts ──► Vapi (outbound) ──► dials the user's phone
                                       │
                user answers ──► Voice Concierge (GPT-4o + ElevenLabs)
                                       │  search_web tool → webhook (auth: VAPI_SERVER_SECRET)
                                       ▼
                              Your server (server.ts)
                                       │  POST /v1/proxy/fetch  (Authorization: Bearer floe_...)
                                       ▼
                              Floe x402 proxy ─► Exa  (https://api.exa.ai/search)
                                       │
            reads X-Floe-Cost-USDC + X-Floe-Budget-Advisory off the response
                                       │
            ┌──────────────────────────┴──────────────────────────┐
       settled call                                          402 / 403 → cap reached
   append "[Floe budget: …]" line                       return hard-stop instruction
        (model tapers)                                   (agent says "I'm out of budget")
```

All paid calls go through **one** Floe credit line. One API key. One balance. One transaction log.

## Setup (5 minutes)

### Prerequisites

- [Vapi account](https://dashboard.vapi.ai) — free tier works. You need the **private** key and **one phone number** (to call *from*). The public key is only needed for the optional web widget.
- [Floe account](https://dev-dashboard.floelabs.xyz) — a funded agent API key.
- [ngrok](https://ngrok.com) — to expose your local server so Vapi can reach the tool-call webhook during the call.

### 1. Install

```bash
cd vapi-voice-agent
cp .env.example .env
npm install
```

### 2. Configure `.env`

```bash
VAPI_API_KEY=your-vapi-private-key       # server-side only (setup.ts + call.ts)
VAPI_ASSISTANT_ID=                       # filled in after step 4 (setup.ts prints it)
VAPI_PHONE_NUMBER_ID=                    # the Vapi number to call FROM (blank = use your first one)
TARGET_PHONE_NUMBER=+14155551234         # the user's cell to call (E.164)
FLOE_API_KEY=floe_your-floe-key
FLOE_SPEND_LIMIT_RAW=30000               # USDC base units (6 decimals): 30000 = $0.03 (~6 Exa searches)
VAPI_SERVER_SECRET=a-random-secret-string  # webhook auth
SERVER_URL=https://your-ngrok-url.ngrok-free.app
PORT=3000
# VAPI_PUBLIC_KEY=...                     # only for the optional web widget
```

### 3. Start ngrok (separate terminal)

```bash
ngrok http 3000
# Copy the https URL → paste into .env as SERVER_URL
```

### 4. Create the assistant and set the budget cap

```bash
npx tsx setup.ts
```

This sets the session spend-limit **first** via `PUT /v1/agents/spend-limit` (default `$0.03`, from `FLOE_SPEND_LIMIT_RAW`) and **fails closed** if it can't — it refuses to create an uncapped "spend-governed" agent. Then it creates the `search_web` tool and a budget-aware concierge assistant, and prints the **assistant id** — copy that into `.env` as `VAPI_ASSISTANT_ID`.

### 5. Start the server

```bash
npx tsx server.ts
```

Keep this running (and ngrok pointed at it) — tool calls during the phone call hit `SERVER_URL/vapi/tool-call`.

### 6. Place the outbound call

In another terminal:

```bash
npx tsx call.ts
```

The agent dials `TARGET_PHONE_NUMBER`. If `VAPI_PHONE_NUMBER_ID` is blank, it uses your first Vapi number (and logs which). It prints the **call id** so you can fetch the recording afterward.

Answer the phone and ask things that need a lookup:

- "What's the weather in San Francisco right now?"
- "What time does Tartine Bakery close today?"
- "Any good ramen near downtown Austin?"
- "What's the latest on the Fed meeting?"

As spend climbs, the concierge gives terser answers and searches less. Once the `$0.03` cap is hit, the next search is blocked and it tells you it's out of lookup budget for the call.

### 7. Check the proof

```bash
curl -H "Authorization: Bearer $FLOE_API_KEY" \
  https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10
```

Every search is a separate line item with its exact cost — the unified log shows the whole run and where it stopped.

### When your ngrok URL changes

Restarting ngrok hands you a new public hostname. Instead of re-running `setup.ts` (which would create a duplicate tool), patch the existing tool in place:

1. Open `update-tool-urls.ts` and paste the `search_web` tool id printed by `setup.ts` into `TOOL_IDS`.
2. Update `SERVER_URL` in `.env` with the new ngrok URL.
3. Run `npx tsx update-tool-urls.ts`.

The assistant keeps the same id — only the webhook URL is rewritten.

## How the taper + hard-stop work

After each Floe proxy call, `server.ts`:

1. Reads **`X-Floe-Cost-USDC`** (the cost of that call, always present) and adds it to a per-call running total (scoped by Vapi call id, so concurrent callers don't pollute each other's budget line).
2. Reads **`X-Floe-Budget-Advisory`** if present (a JSON string, flag-gated server-side — handled gracefully when absent). When it signals `near_limit`, that drives the wording.
3. Appends a short line to the tool result, e.g.:

   ```text
   [Floe budget: $0.020 of $0.030 used — approaching limit — keep answers short and make fewer paid lookups]
   ```

   The model *sees* this in the tool output and adapts. That's the taper — no extra plumbing into Vapi required.
4. If the proxy returns **402 or 403** (cap reached / policy block), the call is treated as **payment blocked** and the result becomes a hard-stop instruction:

   ```text
   Payment blocked — the agent has reached its Floe spending limit ($0.030).
   Tell the caller you've hit your budget and cannot make any more paid lookups on this call.
   ```

   The system prompt instructs the agent to say this plainly and stop retrying — that's the audible hard-stop. **Any other non-2xx** (upstream 5xx, timeout) is reported as a temporary *data-source* failure, **not** a budget hit, so the agent doesn't falsely claim you're out of money.

The per-call total only feeds the *advisory* line the model reads; the **real** enforcement is Floe's session spend-limit. Even if the model ignored the taper, the cap still blocks the call.

## Manual live-verification (needs credit-api up)

End-to-end behavior depends on the live Floe API. To verify the full loop:

1. Confirm credit-api is reachable: `curl -i -H "Authorization: Bearer $FLOE_API_KEY" https://credit-api.floelabs.xyz/v1/agents/transactions?limit=1`.
2. Run `setup.ts` and confirm it prints `Spend-limit set … = $0.030`.
3. Start the server, then run `call.ts` and answer the phone.
4. Ask several questions that need a search. Watch the server logs: each settled call logs `cost=… cumulative=$…/$0.030`; the blocked call logs `🛑 … BLOCKED`.
5. Confirm the concierge audibly tapers, then says it's out of lookup budget.
6. Fetch the call recording (`https://api.vapi.ai/call/<call-id>`) and run the `transactions` curl to confirm the line items + the point where spend stopped.

## Optional: web widget

A browser surface is included for quick testing without a phone. Set `VAPI_PUBLIC_KEY` in `.env`, start the server, open `http://localhost:3000/`, and click **Talk to the agent**. The page reads the **public** key + assistant id from `GET /config`; your private `VAPI_API_KEY` never reaches the browser.

## Why this matters for Vapi builders

| Problem today | With Floe |
|---|---|
| Separate bills for every API vendor | One credit line, one invoice |
| No visibility into per-call costs | Every API call logged with exact cost |
| Agent overspends with no guardrail | Session spend-limit enforced server-side |
| No graceful behavior near a limit | Agent tapers on a budget advisory, stops cleanly at the cap |
| Pre-fund every vendor account | One Floe balance covers all x402 APIs |
| Complex billing reconciliation | `GET /agents/transactions` — done |

## Adding more tools

1. Add the endpoint to `TOOL_ENDPOINTS` in `server.ts` (include `requiredArgs`; for POST tools, return a stringified JSON from `buildBody`).
2. Create the tool in the Vapi dashboard (or via the API) and attach it to your assistant.
3. Restart the server.

Any of the [2,000+ vendor API services reachable via the Floe proxy](https://floe-labs.gitbook.io/docs/x402-directory) work — just add the URL.

## Security

- **Webhook auth:** Set `VAPI_SERVER_SECRET` in `.env` and configure the same secret as a credential in Vapi's dashboard. The server rejects requests without a matching secret.
- **Floe proxy auth:** All x402 API calls go through Floe's proxy, which requires your `FLOE_API_KEY`. The key is never exposed to Vapi, the browser, or the caller.
- **Public vs private Vapi key:** Only `VAPI_PUBLIC_KEY` (and the assistant id) reach the browser, via `GET /config`. The private `VAPI_API_KEY` never leaves the server.
- **Spend limits:** Cap how much USDC the agent can spend in a session with one PUT against Floe's credit API. `limitRaw` is in USDC base units (6 decimals), so `30000` = $0.03. The session window resets when you call this; the cap is operator-defined and distinct from the on-chain credit limit. `setup.ts` does this for you (and fails closed if it can't).

  ```bash
  curl -X PUT -H "Authorization: Bearer $FLOE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limitRaw":"30000"}' \
    https://credit-api.floelabs.xyz/v1/agents/spend-limit
  ```

## Files

| File | Purpose |
|------|---------|
| `setup.ts` | Sets the session spend-limit (fails closed), then creates the `search_web` tool + a budget-aware concierge assistant (run once). |
| `server.ts` | Webhook server — authenticates Vapi requests, routes `search_web` through Floe, reads cost/advisory headers, appends the budget line, returns the hard-stop on a 402/403. Also serves the optional web widget (`GET /`) and its config (`GET /config`). |
| `call.ts` | Places the outbound call — the agent dials `TARGET_PHONE_NUMBER`. Prints the call id. |
| `public/index.html` | Optional browser widget — Vapi web SDK (public key + assistant id from `/config`) with Talk / Stop buttons. |
| `update-tool-urls.ts` | Patches the tool's webhook URL when your ngrok tunnel changes (run instead of re-running `setup.ts`). |
| `.env.example` | Configuration template. |
| `package.json` | Dependencies (Vapi server SDK, Fastify, dotenv). |
