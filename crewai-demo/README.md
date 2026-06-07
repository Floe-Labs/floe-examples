# CrewAI + Floe — budget-enabled crews

**One Floe credit line caps everything a crew spends — LLM tokens *and* paid tool calls — with a hard, server-side ceiling. The 3 AM infinite loop dies at $1, not $414.**

CrewAI's #1 community complaint is runaway cost from agentic loops. These two demos show Floe putting a single, server-enforced dollar wall around a crew:

| Demo | What it proves |
|---|---|
| [`loop_kill.py`](./loop_kill.py) | A crew deliberately rigged to loop, with its LLM routed through the Floe metered proxy and a `FloeBudget($1)`. The proxy auto-borrows then **refuses past $1** (`402 budget_exhausted`), so the loop **halts**. Contrast: Ondřej Popelka's real overnight CrewAI run that burned **$414 on Gemini** ([crewAI#4495](https://github.com/crewAIInc/crewAI/issues/4495)). Prints cumulative spend at halt. |
| [`procurement_crew.py`](./procurement_crew.py) | Three `budget_enabled_agent`s — Researcher ($1), Buyer ($5, allowlist `{hostA:$2, hostB:$1}`), Manager ($0). The Buyer pays a real x402 call within budget; an **off-allowlist host** is refused (`host_not_allowlisted`); an **overspend** is refused. Prints a per-agent spend ledger from the `step_callback`. |

Both rely on the `crewai-floe` integration (`budget_enabled_agent`, `FloeBudget`, `Floe402Tool`, `FloeLLM`) from [agentkit-actions-py](https://github.com/Floe-Labs/agentkit-actions-py).

## Setup

```bash
cp .env.example .env
# Fill in the keys (see .env.example for what each one is)
pip install -r requirements.txt
```

Until `crewai-floe` is published to PyPI, `requirements.txt` installs it directly from the `feat/crewai-integration` branch (agentkit-actions-py PR #27). Once that PR merges and releases, swap the git line for `crewai-floe>=0.1.0`.

## What you need to run them live

Both demos talk to a **live Floe API + facilitator** and a **funded credit key** — nothing is mocked. The headline `loop_kill.py` additionally needs the **metered LLM proxy** (floe-monorepo PR #255, served at `<FLOE_API_BASE_URL>/v1/llm`).

| Variable | Used by | Purpose |
|---|---|---|
| `PRIVATE_KEY` | both | Wallet key (0x...) — the agent's Floe identity; funds delegation provisioning. |
| `FLOE_FACILITATOR_API_KEY` | both | Floe credit key (`floe_...`); auths the facilitator + proxy and is what gets debited. |
| `FLOE_API_BASE_URL` | both | Floe credit API base (default `https://credit-api.floelabs.xyz`). Proxy = `<base>/v1/llm`. |
| `CHAIN_ID` | both | Base mainnet (`8453`). |
| `OPENAI_API_KEY` | `loop_kill.py` | Upstream provider key, passed through to the proxy (`X-Floe-Provider-Key`). Floe stores none. |
| `FLOE_LLM_MODEL` | `loop_kill.py` | Optional model override (default `openai/gpt-4o`). |
| `FLOE_DEMO_HOST_A_URL` / `_B_URL` / `_OFFLIST_URL` | `procurement_crew.py` | Real x402-gated endpoints (A/B allowlisted; offlist not). |
| `RESEARCHER_PRIVATE_KEY` / `BUYER_PRIVATE_KEY` / `MANAGER_PRIVATE_KEY` | `procurement_crew.py` | Optional per-agent funded keys for true budget isolation (see below). |

## Run

```bash
python loop_kill.py
python procurement_crew.py
```

Without the required env vars set, each script prints exactly what it needs and exits cleanly — it will **not** fabricate output.

## Per-agent budget isolation (procurement demo)

Each `FloeBudget` is provisioned against a wallet. For three genuinely independent budgets, give each agent its own funded key (`RESEARCHER_PRIVATE_KEY`, etc.). If you only set `PRIVATE_KEY`, all three resolve to the **same** on-chain agent and the last `provision()` wins — the budgets collide. That is fine for eyeballing the API; it is not real isolation. The Buyer's allowlist/overspend behaviour (the point of the demo) is exercised on the Buyer's wallet either way.

## How enforcement works (the honest version)

The **hard cap is server-side**: the facilitator and the metered proxy refuse calls once the credit line / session cap / allowlist says no — regardless of what the agent decides to do. The `budget_aware` backstory and `floe_budget_status` tool are *soft* signals that help an agent finish on budget; they are not the protection. That's why `procurement_crew.py` includes deterministic enforcement probes (calling the same facilitator path directly) alongside the agentic crew run — the blocks are a property of the server, not of the LLM behaving.
