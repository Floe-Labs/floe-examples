# Vapi + Floe: Voice Agent with Unified x402 Billing

A Vapi voice assistant that calls paid crypto-market APIs through Floe's x402 proxy. All vendor costs — news, prices, on-chain data — billed to one credit line.

## What this shows

- Voice agent calls 3 paid APIs during a conversation (crypto news, market price, Base block number)
- All payments routed through Floe — one API key, one balance, one transaction log
- No wallet, no USDC management — just `Authorization: Bearer floe_...`
- After the call, `GET /agents/transactions` shows every charge
- Webhook authentication prevents unauthorized callers from triggering paid calls

## Architecture

```text
Caller  ──►  Vapi  ──►  Voice Assistant (GPT-4o + ElevenLabs)
                              │
                              ├── Tool: "get_crypto_news"    ──►  Floe proxy  ──►  Otto AI / crypto-news       (~$0.001–$0.003)
                              ├── Tool: "get_market_price"   ──►  Floe proxy  ──►  Otto AI / hyperliquid       (~$0.001–$0.003)
                              └── Tool: "get_block_number"   ──►  Floe proxy  ──►  OneSource / chain           (~$0.001–$0.003)

                         All 3 tools go through one Floe credit line.
                         One API key. One balance. One transaction log.
                         All endpoints settle via Coinbase's CDP x402 facilitator.
```

## Setup (5 minutes)

### Prerequisites

- [Vapi account](https://dashboard.vapi.ai) — free tier works
- [Floe account](https://dev-dashboard.floelabs.xyz) — get an API key
- [ngrok](https://ngrok.com) — to expose your local server (or deploy somewhere)

### 1. Install

```bash
cd vapi-voice-agent
cp .env.example .env
npm install
```

### 2. Configure `.env`

```bash
VAPI_API_KEY=your-vapi-key
FLOE_API_KEY=floe_your-floe-key
VAPI_SERVER_SECRET=a-random-secret-string    # webhook auth
SERVER_URL=https://your-ngrok-url.ngrok-free.app
PORT=3000
```

Set `VAPI_SERVER_SECRET` to any random string. You'll configure the same secret in Vapi's dashboard when setting up the server URL credential (see [Vapi server authentication docs](https://docs.vapi.ai/server-url/server-authentication)).

### 3. Start ngrok (separate terminal)

```bash
ngrok http 3000
# Copy the https URL → paste into .env as SERVER_URL
```

### 4. Create the assistant

```bash
npx tsx setup.ts
```

This creates 3 custom tools and a Vapi assistant that uses them. The assistant ID is printed — you'll need it to assign a phone number.

### 5. Start the server

```bash
npx tsx server.ts
```

### 6. Make a call

In the Vapi dashboard, assign a phone number to your assistant and call it. Or use the Vapi web widget to test.

Try saying:
- "What's the latest crypto news?"
- "What's BTC trading at right now?"
- "How about ETH funding rate?"
- "What block is Base on right now?"

### 7. Check your spending

```bash
curl -H "Authorization: Bearer $FLOE_API_KEY" \
  https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10
```

Every tool call shows up as a separate line item with the exact cost.

### When your ngrok URL changes

Restarting ngrok hands you a new public hostname. Instead of re-running `setup.ts` (which would create three new duplicate tools every time), patch the existing tools in place:

1. Open `update-tool-urls.ts` and paste the three tool IDs printed by `setup.ts` into `TOOL_IDS`.
2. Update `SERVER_URL` in `.env` with the new ngrok URL.
3. Run `npx tsx update-tool-urls.ts`.

The assistant keeps the same ID and the same phone-number assignment — only the webhook URL is rewritten.

## How it works

1. Caller speaks to the Vapi voice assistant
2. GPT-4o decides which tool to call based on the conversation
3. Vapi sends a webhook to your server with the tool call
4. Your server verifies the request (webhook secret), then routes through Floe's proxy
5. Floe handles the x402 payment to the API provider
6. The API response comes back through Floe → your server → Vapi → caller hears the answer
7. Floe debits your credit line for the exact API cost

The voice agent never thinks about payments. Floe handles everything.

## Why this matters for Vapi builders

| Problem today | With Floe |
|---|---|
| Separate bills for every API vendor | One credit line, one invoice |
| No visibility into per-call costs | Every API call logged with exact cost |
| Hard to set spend limits | Per-agent spend caps built in |
| Pre-fund every vendor account | One Floe balance covers all x402 APIs |
| Complex billing reconciliation | `GET /agents/transactions` — done |

## Adding more tools

To add a new x402 API as a tool:

1. Add the endpoint to `TOOL_ENDPOINTS` in `server.ts` (include `requiredArgs` for validation)
2. Create the tool in the Vapi dashboard (or via the API) and attach it to your assistant
3. Restart the server

Any of the [2,000+ vendor API services reachable via the Floe proxy](https://floe-labs.gitbook.io/docs/x402-directory) work — just add the URL.

## Security

- **Webhook auth:** Set `VAPI_SERVER_SECRET` in `.env` and configure the same secret as a credential in Vapi's dashboard. The server rejects requests without a matching secret.
- **Floe proxy auth:** All x402 API calls go through Floe's proxy, which requires your `FLOE_API_KEY`. The API key is never exposed to Vapi or the caller.
- **Spend limits:** Cap how much USDC the agent can spend in a session with a single PUT against Floe's credit API. `limitRaw` is in USDC base units (6 decimals), so `500000` = $0.50. The session window resets when you call this; the cap is operator-defined and distinct from the on-chain credit limit.

  ```bash
  curl -X PUT -H "Authorization: Bearer $FLOE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limitRaw":"500000"}' \
    https://credit-api.floelabs.xyz/v1/agents/spend-limit
  ```

## Files

| File | Purpose |
|------|---------|
| `server.ts` | Webhook server — authenticates Vapi requests, routes tool calls through Floe |
| `setup.ts` | Creates Vapi tools + assistant (run once) |
| `update-tool-urls.ts` | Patches existing Vapi tools' webhook URL when your ngrok tunnel changes (run instead of re-running `setup.ts`) |
| `.env.example` | Configuration template |
| `package.json` | Dependencies (Vapi SDK, Fastify, dotenv) |
