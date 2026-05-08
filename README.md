# Floe Examples

Working capital for AI agents — example integrations for the [Floe](https://dev-dashboard.floelabs.xyz) credit protocol on Base.

**3,000+ secured working capital lines issued. Zero defaults.** Deposit USDC, borrow up to 95%, spend it on APIs, compute, or anything your agent needs. Gas-free. Fund with fiat.

Each example is self-contained — clone, configure, run in under 5 minutes.

## Examples

| Example | Language | What it does |
|---|---|---|
| [yield-optimizer](./yield-optimizer/) | TypeScript | Deposits USDC, borrows working capital, deploys to yield strategy, repays on maturity |
| [flash-arb-bot](./flash-arb-bot/) | TypeScript | Monitors price diffs, executes flash arb via Aerodrome |
| [x402-client](./x402-client/) | TypeScript | Delegates credit to Floe facilitator, calls x402 APIs gas-free |
| [mcp-demo](./mcp-demo/) | Config only | Connect Claude Desktop to Floe in one line |
| [langchain-agent](./langchain-agent/) | Python | LangChain agent with Floe working capital tools |
| [crewai-demo](./crewai-demo/) | Python | CrewAI crew with DeFi lending capabilities |

## Prerequisites

- Node.js 18+ (TypeScript examples) or Python 3.10+ (Python examples)
- USDC on Base (or buy from the [dashboard](https://dev-dashboard.floelabs.xyz) with a credit card)
- An RPC endpoint (Base mainnet)

## Quick start

```bash
# Clone
git clone https://github.com/Floe-Labs/floe-examples.git
cd floe-examples

# Pick an example
cd yield-optimizer
cp .env.example .env
# Edit .env with your wallet key and RPC URL

npm install
npx tsx index.ts
```

### Don't have USDC?

Fund your agent wallet with fiat directly from the [Floe dashboard](https://dev-dashboard.floelabs.xyz) — credit card or bank transfer via Coinbase.

## How it works

```
Agent deposits $10,000 USDC
  → Borrows $9,500 USDC (95% LTV)
  → Spends on API calls, compute, services
  → Repays $9,500 + fixed interest fee
  → Gets $10,000 deposit back
```

No price-volatility risk. No crypto complexity. Same token in, same token out.

## Packages

| Package | Install | Actions |
|---|---|---|
| [`floe-agent`](https://www.npmjs.com/package/floe-agent) | `npm install floe-agent` | 45 (TypeScript) |
| [`floe-agentkit-actions`](https://pypi.org/project/floe-agentkit-actions/) | `pip install floe-agentkit-actions` | 45 (Python) |
| [`@floelabs/mcp-server`](https://github.com/Floe-Labs/floe-mcp-server) | Zero install — hosted | 36 tools (MCP) |

## Links

- [Dashboard](https://dev-dashboard.floelabs.xyz)
- [Docs](https://floe-labs.gitbook.io/docs)
- [Agent Quick Start](https://floe-labs.gitbook.io/docs/agents/quickstart-agents)
- [Website](https://floelabs.xyz)

## License

MIT
