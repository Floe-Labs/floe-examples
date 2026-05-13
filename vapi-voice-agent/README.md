# Vapi + Floe: Voice Agent with Unified x402 Billing

A Vapi voice assistant that calls paid APIs through Floe's x402 proxy. All vendor costs — search, news, AI expert — billed to one credit line.

## What this shows

- Voice agent calls 3 paid APIs during a conversation (web search, news, AI analysis)
- All payments routed through Floe — one API key, one balance, one transaction log
- No wallet, no USDC management — just `Authorization: Bearer floe_...`
- After the call, `GET /agents/transactions` shows every charge
- Solves the #1 voice agent builder pain point: fragmented multi-vendor billing

## Architecture

```
Caller  ──►  Vapi  ──►  Voice Assistant (GPT-4o + ElevenLabs)
                              │
                              ├── Tool: "search_web"  ──►  Floe proxy  ──►  Firecrawl
                              ├── Tool: "get_news"    ──►  Floe proxy  ──►  Gloria AI
                              └── Tool: "ask_expert"  ──►  Floe proxy  ──►  AskClaude

                         All 3 tools go through one Floe credit line.
                         One API key. One balance. One transaction log.
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
SERVER_URL=https://your-ngrok-url.ngrok-free.app
PORT=3000
```

### 3. Start ngrok (separate terminal)

```bash
ngrok http 3000
# Copy the https URL → paste into .env as SERVER_URL
```

### 4. Create the assistant

```bash
npx tsx setup.ts
```

This creates a Vapi assistant with three tools pointing at your server.

### 5. Start the server

```bash
npx tsx server.ts
```

### 6. Make a call

In the Vapi dashboard, assign a phone number to your assistant and call it. Or use the Vapi web widget to test.

Try saying:
- "Search for the latest AI agent frameworks"
- "What's in the news about voice AI?"
- "I need an expert analysis of the pros and cons of serverless architecture"

### 7. Check your spending

```bash
curl -H "Authorization: Bearer $FLOE_API_KEY" \
  https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10
```

Every tool call shows up as a separate line item with the exact cost.

## How it works

1. Caller speaks to the Vapi voice assistant
2. GPT-4o decides which tool to call based on the conversation
3. Vapi sends a webhook to your server with the tool call
4. Your server routes the call through Floe's x402 proxy (`/v1/proxy/fetch`)
5. Floe handles the x402 payment to the API provider
6. The API response comes back through Floe → your server → Vapi → caller hears the answer
7. Floe debits your credit line for the exact API cost

The voice agent never knows about payments. Your server is 50 lines of code. Floe handles everything.

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

1. Add the endpoint to `TOOL_ENDPOINTS` in `server.ts`
2. Add the tool definition in `setup.ts`
3. Re-run `npx tsx setup.ts` (or update via Vapi dashboard)

Any of the [76 APIs in Floe's x402 directory](https://floe-labs.gitbook.io/docs/x402-directory) work — just add the URL.

## Files

| File | Purpose |
|------|---------|
| `server.ts` | Webhook server — receives Vapi tool calls, routes through Floe |
| `setup.ts` | Creates the Vapi assistant with tools configured |
| `.env.example` | Configuration template |
| `package.json` | Dependencies (Vapi SDK, Fastify, dotenv) |
