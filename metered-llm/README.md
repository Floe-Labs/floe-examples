# metered-llm

**Route any agent's LLM through Floe's metered proxy.** One OpenAI-compatible
endpoint fronts **any** OpenAI or Anthropic model — billed per token to your Floe
credit line and **capped server-side**. No model lock, no provider account juggling,
your provider key never leaves your request.

This is the framework-agnostic version: just the standard `openai` SDK pointed at
Floe. (For the budget-aware "$1-not-$414 loop kill", see [`../crewai-demo`](../crewai-demo).)

## How it works

| | |
|---|---|
| Endpoint | `https://credit-api.floelabs.xyz/v1/llm/chat/completions` (OpenAI-compatible; `/embeddings` too) |
| `Authorization: Bearer` | your Floe agent key `floe_<hex>` — auth + billing identity |
| `X-Floe-Provider-Key` | your OpenAI/Anthropic key — passed through to the provider, **never stored** |
| `model` (in body) | **any** priced model: `gpt-5.5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `gpt-5.4-mini`, … |
| Cost | metered to your credit line; returned on the `X-Floe-Cost-USDC` response header |
| Cap | set a session spend limit — calls past your budget are **refused server-side**, not billed |

## Run

```bash
cp .env.example .env
# fill in FLOE_API_KEY (floe_<hex>) and PROVIDER_API_KEY (your OpenAI/Anthropic key)

# TypeScript
npm install && npm start

# Python
pip install -r requirements.txt && python main.py
```

Get a Floe agent key at the [dashboard](https://dev-dashboard.floelabs.xyz) →
Create an agent. Fund it with a card — no crypto, no wallet to manage.

→ Full reference: [Compute / metered LLM docs](https://floe-labs.gitbook.io/docs/x402-directory/compute)
