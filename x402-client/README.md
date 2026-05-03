# x402 Client

Delegates credit to the Floe facilitator, then calls x402 APIs without managing payments. Gas-free.

## Setup

```bash
cp .env.example .env
# Edit .env with your private key, RPC URL, and facilitator details
npm install
```

## Run

```bash
npx tsx index.ts
```

## What it does

1. Delegates credit to the Floe facilitator via `grant_credit_delegation`
2. Calls x402-enabled APIs via `x402_fetch` — payment is automatic
3. Checks remaining credit balance via `x402_get_balance`

Your agent never holds or transfers USDC directly. Floe handles all payment mechanics behind the scenes.

## Key actions used

- `grant_credit_delegation` — one-time credit delegation setup
- `x402_fetch` — call any x402 API with automatic payment
- `x402_get_balance` — check remaining credit balance
