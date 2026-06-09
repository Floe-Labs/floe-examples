# Floe Examples

**Runnable reference agents for the Floe spend layer.** Clone, configure, run in
under 5 minutes. TypeScript and Python. Walletless. No crypto required.

[Website](https://floelabs.xyz) · [Dashboard](https://dev-dashboard.floelabs.xyz) · [Docs](https://floe-labs.gitbook.io/docs) · [Quickstart](https://floe-labs.gitbook.io/docs/developers/agent-quickstart)

---

Floe is the spend layer for AI agents: your agent pays across 2,000+ vendor APIs
through one endpoint, governed by programmable, context-aware budgets — no
per-vendor accounts, no wallet, no crypto. These examples show it working in real
frameworks.

> **Start free.** Get an agent key at [the dashboard](https://dev-dashboard.floelabs.xyz),
> fund with a card, and your agent makes its first paid API call in minutes.

## Where to start

| If you're… | Start with | Runs today |
|---|---|---|
| Building a **voice agent** (Vapi) | [`vapi-voice-agent/`](./vapi-voice-agent) | ✅ |
| Calling **x402 APIs** from your own framework | [`x402-client/`](./x402-client) | ✅ |
| On **Coinbase AgentKit** (TypeScript) | [`agentkit-ts-chatbot/`](./agentkit-ts-chatbot) | ✅ |
| On **LangChain** (Python) | [`langchain-agent/`](./langchain-agent) | ✅ |
| On **CrewAI** | [`crewai-demo/`](./crewai-demo) | ✅ |
| On **Claude Desktop / Code / Cursor** | [`mcp-demo/`](./mcp-demo) | ✅ |
| On **OpenAI Agents SDK** | [`openai-agents/`](./openai-agents) | Preview (MCP fallback) |

## Examples

### Spend & payments — live today

| Example | Language | Frameworks | What it shows |
|---|---|---|---|
| [`vapi-voice-agent`](./vapi-voice-agent) | TypeScript | Vapi · GPT-4o · ElevenLabs | A voice agent that pays per-call for its tools via x402 — the per-minute-economics use case |
| [`x402-client`](./x402-client) | TypeScript | AgentKit | Pay any x402 API through the Floe proxy — the minimal payment example |
| [`agentkit-ts-chatbot`](./agentkit-ts-chatbot) | TypeScript | AgentKit · Vercel AI SDK | Conversational agent with wallet + x402 spend |
| [`langchain-agent`](./langchain-agent) | Python | LangChain | Wallet + x402 spend in a LangChain agent |
| [`crewai-demo`](./crewai-demo) | Python | CrewAI · `crewai-floe` | Per-agent budgets via the `crewai-floe` package — the $1-not-$414 loop-kill + a procurement crew with merchant allowlists |
| [`mcp-demo`](./mcp-demo) | Config only | Claude Desktop / Cursor | Zero-install MCP connection — wallet + spend |
| [`openai-agents`](./openai-agents) | TypeScript | OpenAI Agents SDK | x402 spend via MCP fallback *(Preview — native adapter on the way)* |

### Self-custody & lending — advanced / on-chain

> These depend on the on-chain lending surface (borrow/repay against collateral)
> and are for self-custody and crypto-native use cases. Working-capital **credit
> lines are in development** — see [Roadmap](#roadmap). Check each example's
> README for its current run status.

| Example | Language | Frameworks | What it shows |
|---|---|---|---|
| [`financial-os-loop`](./financial-os-loop) | TS + Python | AgentKit | The full end-to-end loop: wallet → fund → borrow → x402 spend → repay → credit record. *Lending steps depend on the credit roadmap.* |
| [`yield-optimizer`](./yield-optimizer) | TypeScript | AgentKit | A treasury/yield agent using the lending surface |
| [`flash-arb-bot`](./flash-arb-bot) | TypeScript | AgentKit | On-chain arbitrage via the flash-loan path (crypto-native / MEV) |

## Prerequisites

- Node.js 18+ (TypeScript) or Python 3.10+ (Python)
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)
- For x402 spend: a funded wallet (fund with a card from the dashboard — no crypto on-ramp needed)
- A Base mainnet RPC endpoint (for self-custody examples)

## Quick start

```bash
git clone https://github.com/Floe-Labs/floe-examples.git
cd floe-examples

# Pick an example that runs today — e.g. the minimal x402 client
cd x402-client
cp .env.example .env
# Edit .env: FLOE_API_KEY (and RPC URL if the example needs it)

# TypeScript
npm install && npx tsx index.ts

# Python examples (e.g. langchain-agent)
pip install -r requirements.txt && python main.py
```

**Don't have USDC?** Fund your agent wallet with fiat directly from the dashboard
— card, bank transfer, Apple Pay, or Google Pay via Coinbase.

## What the spend loop looks like

The pattern every live example follows:

```
Setup    register an agent + wallet (ERC-8004 identity, spend limits)
Fund     USDC in via card / bank / Apple Pay / Google Pay — or on-chain
Budget   set per-call, daily, and session spend caps; allowed destinations
Spend    x402_fetch any of 2,000+ APIs through the Floe proxy
Reason   estimate_x402_cost before paying; the agent stays inside its budget
See      every call is a typed receipt — reconcile, alert, or revoke
```

No wallet for the operator to manage, no crypto for the agent to touch. The
stablecoin rails are invisible.

## SDKs used by these examples

| Package | Install | Surface |
|---|---|---|
| `floe-agent` | `npm install floe-agent` | 47 actions (TypeScript) |
| `floe-agentkit-actions` | `pip install floe-agentkit-actions` | 47 actions (Python) |
| `@floelabs/mcp-server` | zero install (hosted) | 36 tools (MCP) |

## Roadmap

The spend layer is live today. Credit is built on top of it:

- **Working capital / credit lines** — *in development.* The `borrow` / `repay`
  steps in the lending examples exercise this surface; check each example's
  README for current status.
- **Unsecured / receivables-backed credit** — *in development.* Email
  hello@floelabs.xyz for the design-partner program.
- **Portable ERC-8004 credit record** — *in development.* Every transaction
  builds the data behind it.

## Links

[Website](https://floelabs.xyz) · [Dashboard](https://dev-dashboard.floelabs.xyz) · [Docs](https://floe-labs.gitbook.io/docs) · [TypeScript SDK](https://github.com/Floe-Labs/agentkit-actions) · [Python SDK](https://github.com/Floe-Labs/agentkit-actions-py) · [MCP server](https://github.com/Floe-Labs/floe-mcp-server)

## License

MIT
