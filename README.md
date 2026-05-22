# Floe Examples

**Credit and payments for AI agent developers — runnable reference agents. No crypto required.**

1. **Sign up with email + a funding source.** Card, Apple Pay, Google Pay, or bank transfer. Floe provisions your wallets in the background — no MetaMask, no seed phrase, no gas token.
2. **Floe issues an x402 credit line to your agent's wallet.** Set spending controls — per-call cap, daily limit, allowed destinations.
3. **Your agent pays vendors per-call; you get real-time visibility.** Every call is a typed receipt: target URL, amount, status, time. Reconcile, alert, or revoke from the dashboard.

Reference agents here span TypeScript and Python and cover every GA component of the Floe stack. Each is self-contained — clone, configure, run in under 5 minutes. Fork to start.

> **$2 free credit (~200 API calls).** Your agent can start paying for APIs today — no card required. [Get started →](https://dev-dashboard.floelabs.xyz)

> **Proof points:** 3,000+ secured working capital lines issued · zero defaults · 13,000+ x402 APIs reachable via the Floe proxy.

---

## Examples

| Example | Language | Frameworks | Components covered | Status |
|---|---|---|---|---|
| [**financial-os-loop**](./financial-os-loop/) | TypeScript + Python | AgentKit | Wallet · Onramp · Secured credit · x402 · Repay · Credit thresholds | `New` — canonical end-to-end |
| [agentkit-ts-chatbot](./agentkit-ts-chatbot/) | TypeScript | AgentKit + Vercel AI SDK | Wallet · Secured credit · x402 | `New` |
| [yield-optimizer](./yield-optimizer/) | TypeScript | AgentKit | Wallet · Secured credit | |
| [flash-arb-bot](./flash-arb-bot/) | TypeScript | AgentKit | Secured credit (flash loan path) | |
| [x402-client](./x402-client/) | TypeScript | AgentKit | x402 payment facilitator | |
| [mcp-demo](./mcp-demo/) | Config only | Claude Desktop / Cursor (via MCP) | Wallet · Secured credit | |
| [langchain-agent](./langchain-agent/) | Python | LangChain | Wallet · Secured credit · x402 | |
| [crewai-demo](./crewai-demo/) | Python | CrewAI (via MCP) | Wallet · Secured credit | |
| [openai-agents](./openai-agents/) | TypeScript | OpenAI Agents SDK | Wallet · Secured credit · x402 | `Preview` — MCP fallback |
| [vapi-voice-agent](./vapi-voice-agent/) | TypeScript | Vapi + GPT-4o + ElevenLabs | x402 (voice agent tool calls) | `New` |

---

## Where do I start?

| If you... | Start with |
|---|---|
| Just want to see the full Floe loop end-to-end | [`financial-os-loop/`](./financial-os-loop/) |
| Are using Coinbase AgentKit (TypeScript) | [`agentkit-ts-chatbot/`](./agentkit-ts-chatbot/) |
| Are using LangChain (Python) | [`langchain-agent/`](./langchain-agent/) |
| Are using Claude Desktop, Claude Code, Cursor | [`mcp-demo/`](./mcp-demo/) |
| Are using CrewAI | [`crewai-demo/`](./crewai-demo/) |
| Want to call x402 APIs from your own framework | [`x402-client/`](./x402-client/) |
| Are building a yield/treasury agent | [`yield-optimizer/`](./yield-optimizer/) |
| Are arbitraging on-chain markets | [`flash-arb-bot/`](./flash-arb-bot/) |
| Are building a Vapi voice agent | [`vapi-voice-agent/`](./vapi-voice-agent/) |

---

## The Floe Stack covered here

| # | Component | Status | Example coverage |
|---|---|---|---|
| 01 | Agent Wallet | `GA` | All examples |
| 02 | Fiat on-ramp | `GA` (dashboard-driven) | `financial-os-loop` shows the deep link |
| 03 | Secured working capital | `GA` | `financial-os-loop`, `agentkit-ts-chatbot`, `yield-optimizer`, `langchain-agent`, `crewai-demo`, `openai-agents` |
| 04 | Unsecured working capital | `Preview` | Email [hello@floelabs.xyz](mailto:hello@floelabs.xyz) for the design partner program |
| 05 | x402 payment facilitator | `GA` | `financial-os-loop`, `agentkit-ts-chatbot`, `x402-client`, `langchain-agent`, `openai-agents`, `vapi-voice-agent` |
| 06 | Credit & trust bureau | Reader `Beta` · Writer `Preview` | `financial-os-loop` registers a credit threshold |

---

## Prerequisites

- Node.js 18+ (TypeScript examples) or Python 3.10+ (Python examples)
- An RPC endpoint (Base mainnet)
- A Floe API key — get one at [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz)
- USDC on Base (or fund with fiat from the dashboard)

---

## Quick start

```bash
# Clone
git clone https://github.com/Floe-Labs/floe-examples.git
cd floe-examples

# Pick an example (the canonical one is financial-os-loop)
cd financial-os-loop
cp .env.example .env
# Edit .env with your wallet key, RPC URL, and FLOE_API_KEY

# TypeScript
npm install && npx tsx index.ts

# Python (in the same example folder)
pip install -r requirements.txt && python main.py
```

### Don't have USDC?

Fund your agent wallet with fiat directly from the [Floe dashboard](https://dev-dashboard.floelabs.xyz) — credit card, bank transfer, Apple Pay, or Google Pay via Coinbase.

---

## How it works — the full financial loop

```text
1. Setup    register agent + wallet (ERC-8004 identity, spend limits)
2. Fund     USDC in via cards, bank, Apple/Google Pay, or on-chain
3. Borrow   one API call to instant_borrow — fixed rate, fixed term
4. Spend    x402_fetch any of 13,000+ APIs through the Floe proxy
5. Repay    repay_loan — collateral auto-returns in the same tx
6. Trust    every repayment writes to your agent's on-chain credit record
```

No price-volatility risk on the primary market. No crypto complexity for the agent operator. Same-token deposits and borrows.

---

## Packages

| Package | Install | Actions / Tools |
|---|---|---|
| [`floe-agent`](https://www.npmjs.com/package/floe-agent) | `npm install floe-agent` | 45 actions (TypeScript) |
| [`floe-agentkit-actions`](https://pypi.org/project/floe-agentkit-actions/) | `pip install floe-agentkit-actions` | 45 actions (Python) |
| [`@floelabs/mcp-server`](https://github.com/Floe-Labs/floe-mcp-server) | Zero install — hosted | 36 tools (MCP) |

---

## Links

- [Website](https://floelabs.xyz)
- [Dashboard](https://dev-dashboard.floelabs.xyz)
- [Docs](https://floe-labs.gitbook.io/docs)
- [Quickstart](https://floe-labs.gitbook.io/docs/getting-started/quickstart)

## License

MIT
