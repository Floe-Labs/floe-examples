# agentkit-ts-chatbot

Minimal conversational agent in TypeScript: **AgentKit + Vercel AI SDK + Floe**.

Mirrors the Python `langchain-agent` example. Shows how to expose every Floe action as a tool to an LLM and have it borrow, pay an x402 endpoint, and repay through natural language.

## Components covered

- 01 Agent Wallet (`GA`)
- 03 Secured working capital (`GA`)
- 05 x402 payment facilitator (`GA`)

## Setup

```bash
cp .env.example .env
# Fill in PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY, OPENAI_API_KEY
npm install
npx tsx index.ts
```

## Example session

```
You: What credit do I have available?
Agent: (calls get_credit_remaining) You have 4,500 USDC available, 10% utilized.

You: Borrow 5 USDC against 6 USDC of collateral for 7 days.
Agent: (calls instant_borrow) Done — loan #42 opened at 8% APR.

You: Call https://api.example.com/premium for me.
Agent: (calls estimate_x402_cost then x402_fetch) Cost was $0.03. Response: { "...": "..." }

You: Repay loan 42.
Agent: (calls repay_loan) Repaid. Collateral returned in the same tx.
```

## Why two TS examples?

`agentkit-ts-chatbot` is conversational (LLM-in-the-loop). [`financial-os-loop`](../financial-os-loop/) is deterministic (script-driven). Use the chatbot to demo to humans; use the loop to verify the stack in CI.
