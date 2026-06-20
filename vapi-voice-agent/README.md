# Vapi + Floe: Budget-Governed Voice Agent

A Vapi voice assistant that calls paid APIs through Floe's x402 proxy — and **enforces a budget, not a balance**. The agent **tapers** as it nears its session spend cap (it sees how much it has spent after every call and adapts), then **audibly hard-stops** at the cap ("I've reached my spending limit") instead of overspending. Works over the **phone** and from a **web widget**.

## What this shows

- A real spend control: a session spend-limit that Floe enforces server-side, set with one API call.
- **Taper:** every tool result carries a short `[Floe budget: …]` line. The model reads it and gives shorter answers / makes fewer paid lookups as it approaches the cap.
- **Hard-stop:** when the cap is hit, the proxy denies the paid call and the agent tells the caller it's out of budget — it does not overspend.
- **Two surfaces from one server:** inbound phone calls *and* an in-browser "Talk to the agent" widget.
- **Unified billing as proof:** every paid call is one line item under one credit line — `GET /agents/transactions` shows the whole run and where it stopped.
- No wallet, no USDC management — just `Authorization: Bearer floe_...`.

## Why "a budget, not a balance"

A balance just runs out — silently, mid-task, with no graceful behavior. A **budget** is a policy the agent is aware of: it can pace itself against it and stop cleanly when it's reached. Floe gives you both halves:

1. The **advisory** (soft signal) the agent reads to taper — surfaced via the `X-Floe-Budget-Advisory` response header and the budget line this server appends to each tool result.
2. The **hard cap** (server-side enforcement) — the session spend-limit. When exceeded, the proxy denies the paid call, which drives the audible stop.

## Architecture

```text
Phone caller ─┐
              ├─► Vapi ─► Voice Assistant (GPT-4o + ElevenLabs)
Web widget  ──┘                  │
   (public key, /config)         │  tool call → webhook (auth: VAPI_SERVER_SECRET)
                                  ▼
                         Your server (server.ts)
                                  │  POST /v1/proxy/fetch  (Authorization: Bearer floe_...)
                                  ▼
                            Floe x402 proxy ─► vendor API (Otto AI / OneSource …)
                                  │
        reads X-Floe-Cost-USDC + X-Floe-Budget-Advisory off the response
                                  │
            ┌─────────────────────┴─────────────────────┐
       settled call                                 cap exceeded → non-2xx
   append "[Floe budget: …]" line              return hard-stop instruction
        (model tapers)                            (agent says "I'm out of budget")
```

All paid calls go through **one** Floe credit line. One API key. One balance. One transaction log.

## Setup (5 minutes)

### Prerequisites

- [Vapi account](https://dashboard.vapi.ai) — free tier works (you'll need both the **private** and **public** keys)
- [Floe account](https://dev-dashboard.floelabs.xyz) — get an API key
- [ngrok](https://ngrok.com) — to expose your local server for the **phone** path (the web widget works on `localhost`)

### 1. Install

```bash
cd vapi-voice-agent
cp .env.example .env
npm install
```

### 2. Configure `.env`

```bash
VAPI_API_KEY=your-vapi-private-key       # server-side only (setup.ts) — never in the browser
VAPI_PUBLIC_KEY=your-vapi-public-key     # safe in client HTML — used by the web widget
VAPI_ASSISTANT_ID=                       # filled in after step 4 (setup.ts prints it)
FLOE_API_KEY=floe_your-floe-key
FLOE_SPEND_LIMIT_RAW=50000               # USDC base units (6 decimals): 50000 = $0.05
VAPI_SERVER_SECRET=a-random-secret-string  # webhook auth
SERVER_URL=https://your-ngrok-url.ngrok-free.app
PORT=3000
```

> **Public vs private key.** `VAPI_PUBLIC_KEY` is *designed* to live in client code — the web widget needs it to start a call from the browser. `VAPI_API_KEY` is privileged (it creates assistants) and stays server-side. The server only ever exposes the public key + assistant id, via `GET /config`.

### 3. Start ngrok (separate terminal, only needed for the phone path)

```bash
ngrok http 3000
# Copy the https URL → paste into .env as SERVER_URL
```

### 4. Create the assistant and set the budget cap

```bash
npx tsx setup.ts
```

This creates 3 tools + a budget-aware assistant, then **sets the session spend-limit** via `PUT /v1/agents/spend-limit` (default `$0.05`, from `FLOE_SPEND_LIMIT_RAW`) so the cap is reachable in a short demo call. It prints the cap and the **assistant id** — copy that into `.env` as `VAPI_ASSISTANT_ID`.

> If credit-api is unreachable, `setup.ts` still creates the assistant and prints the manual `curl` to set the cap. Run it before demoing.

### 5. Start the server

```bash
npx tsx server.ts
```

### 6. Talk to the agent — two ways

**Web widget:** open `http://localhost:3000/` and click **Talk to the agent**. (Needs `VAPI_PUBLIC_KEY` + `VAPI_ASSISTANT_ID` in `.env`.)

**Phone:** in the Vapi dashboard, assign a phone number to your assistant and call it.

Then drive it toward the cap:

- "What's the latest crypto news?"
- "What's BTC trading at right now?"
- "How about ETH funding rate?"
- "And SOL? And the Base block number?"

As spend climbs, the agent's answers get terser and it makes fewer lookups. Once the `$0.05` cap is hit, the next paid lookup is blocked and the agent tells you it's out of budget.

### 7. Check the proof

```bash
curl -H "Authorization: Bearer $FLOE_API_KEY" \
  https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10
```

Every tool call is a separate line item with its exact cost — the unified log shows the whole run and where it stopped.

### When your ngrok URL changes

Restarting ngrok hands you a new public hostname. Instead of re-running `setup.ts` (which would create duplicate tools), patch the existing tools in place:

1. Open `update-tool-urls.ts` and paste the three tool IDs printed by `setup.ts` into `TOOL_IDS`.
2. Update `SERVER_URL` in `.env` with the new ngrok URL.
3. Run `npx tsx update-tool-urls.ts`.

The assistant keeps the same ID and phone-number assignment — only the webhook URL is rewritten.

## How the taper + hard-stop work

After each Floe proxy call, `server.ts`:

1. Reads **`X-Floe-Cost-USDC`** (the cost of that call, always present) and adds it to an in-process running total for this server run.
2. Reads **`X-Floe-Budget-Advisory`** if present (a JSON string, flag-gated server-side — handled gracefully when absent). When it signals `near_limit`, that drives the wording.
3. Appends a short line to the tool result, e.g.:

   ```text
   [Floe budget: $0.030 of $0.050 used — approaching limit — keep answers short and make fewer paid lookups]
   ```

   The model *sees* this in the tool output and adapts. That's the taper — no extra plumbing into Vapi required.
4. If the proxy returns a **non-2xx** (cap reached / policy block — 402, 403, or any non-OK), the call is treated as **payment blocked** and the result becomes a hard-stop instruction:

   ```text
   Payment blocked — the agent has reached its Floe spending limit ($0.050).
   Tell the caller you've hit your budget and cannot make any more paid lookups on this call.
   ```

   The system prompt instructs the agent to say this plainly and stop retrying — that's the audible hard-stop.

The in-process total is just for the *advisory* line the model reads; the **real** enforcement is Floe's session spend-limit. Even if the model ignored the taper, the cap still blocks the call.

## Manual live-verification (needs credit-api up)

End-to-end behavior depends on the live Floe API. To verify the full loop:

1. Confirm credit-api is reachable: `curl -i -H "Authorization: Bearer $FLOE_API_KEY" https://credit-api.floelabs.xyz/v1/agents/transactions?limit=1`.
2. Run `setup.ts` and confirm it prints `Spend-limit set … = $0.05`.
3. Start the server, open the web widget (or call the number), and make several paid lookups.
4. Watch the server logs: each settled call logs `cost=… cumulative=$…/$0.050`; the blocked call logs `🛑 … BLOCKED`.
5. Confirm the agent audibly tapers, then says it's out of budget.
6. Run the `transactions` curl and confirm the line items + the point where spend stopped.

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

1. Add the endpoint to `TOOL_ENDPOINTS` in `server.ts` (include `requiredArgs` for validation).
2. Create the tool in the Vapi dashboard (or via the API) and attach it to your assistant.
3. Restart the server.

Any of the [2,000+ vendor API services reachable via the Floe proxy](https://floe-labs.gitbook.io/docs/x402-directory) work — just add the URL.

## Security

- **Webhook auth:** Set `VAPI_SERVER_SECRET` in `.env` and configure the same secret as a credential in Vapi's dashboard. The server rejects requests without a matching secret.
- **Floe proxy auth:** All x402 API calls go through Floe's proxy, which requires your `FLOE_API_KEY`. The key is never exposed to Vapi, the browser, or the caller.
- **Public vs private Vapi key:** Only `VAPI_PUBLIC_KEY` (and the assistant id) reach the browser, via `GET /config`. The private `VAPI_API_KEY` never leaves the server.
- **Spend limits:** Cap how much USDC the agent can spend in a session with one PUT against Floe's credit API. `limitRaw` is in USDC base units (6 decimals), so `50000` = $0.05. The session window resets when you call this; the cap is operator-defined and distinct from the on-chain credit limit. `setup.ts` does this for you.

  ```bash
  curl -X PUT -H "Authorization: Bearer $FLOE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limitRaw":"50000"}' \
    https://credit-api.floelabs.xyz/v1/agents/spend-limit
  ```

## Files

| File | Purpose |
|------|---------|
| `server.ts` | Webhook server — authenticates Vapi requests, routes tool calls through Floe, reads cost/advisory headers, appends the budget line, returns the hard-stop on a blocked call. Also serves the web widget (`GET /`) and its config (`GET /config`). |
| `setup.ts` | Creates Vapi tools + a budget-aware assistant, then sets the session spend-limit (run once). |
| `public/index.html` | Browser widget — uses the Vapi web SDK (public key + assistant id from `/config`) with Talk / Stop buttons. |
| `update-tool-urls.ts` | Patches existing tools' webhook URL when your ngrok tunnel changes (run instead of re-running `setup.ts`). |
| `.env.example` | Configuration template. |
| `package.json` | Dependencies (Vapi server SDK, Fastify, dotenv). |
