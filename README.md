# Floe Examples

Example agents and integrations for the [Floe](https://floelabs.xyz) credit protocol on Base.

Each example is self-contained — clone, configure, run in under 5 minutes.

## Examples

| Example | Language | What it does |
|---|---|---|
| [yield-optimizer](./yield-optimizer/) | TypeScript | Borrows USDC, deploys to yield strategy, repays on maturity |
| [flash-arb-bot](./flash-arb-bot/) | TypeScript | Monitors price diffs, executes flash arb via Aerodrome |
| [x402-client](./x402-client/) | TypeScript | Pays for x402 APIs using Floe credit delegation |
| [mcp-demo](./mcp-demo/) | Config only | Connect Claude Desktop to Floe in one line |
| [langchain-agent](./langchain-agent/) | Python | LangChain agent with Floe lending tools |
| [crewai-demo](./crewai-demo/) | Python | CrewAI crew with DeFi lending capabilities |

## Prerequisites

- Node.js 18+ (TypeScript examples) or Python 3.10+ (Python examples)
- A wallet with WETH/cbBTC on Base for collateral
- An RPC endpoint (Base mainnet)

## Quick start

```bash
# Clone
git clone https://github.com/Floe-Labs/floe-examples.git
cd floe-examples

# Pick an example
cd yield-optimizer
cp .env.example .env
# Edit .env with your private key and RPC URL

npm install
npx tsx index.ts
```

## Packages

- **npm:** [`floe-agent`](https://www.npmjs.com/package/floe-agent) (TypeScript)
- **PyPI:** [`floe-agentkit-actions`](https://pypi.org/project/floe-agentkit-actions/) (Python)
- **MCP:** [`@floelabs/mcp-server`](https://github.com/Floe-Labs/floe-mcp-server)

## Links

- [Docs](https://floe-labs.gitbook.io/docs)
- [AgentKit Integration](https://floe-labs.gitbook.io/docs/developers/agentkit)
- [Website](https://floelabs.xyz)

## License

MIT
