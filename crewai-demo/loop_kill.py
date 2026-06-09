"""loop_kill.py — the $1-not-$414 demo.

CrewAI's #1 community complaint is runaway cost from agentic loops. The real
incident this demo is built around: Ondřej Popelka reported an overnight CrewAI
run that burned **$414 of Gemini tokens** in an unintended loop
(https://github.com/crewAIInc/crewAI/issues/4495 — "I woke up to a $414 bill").

This script rigs a crew to loop on purpose, routes its LLM through the Floe
metered proxy with a FloeBudget of $1, and shows the proxy refuse the call past
$1 (HTTP 402 `budget_exhausted`) so the crew HALTS. The loop that would have
been $414 dies at $1, server-side — not because the agent was well-behaved, but
because the credit line said no.

Honest about the rigging
------------------------
A real runaway loop comes from a bug or two agents disagreeing forever. We can't
reproduce someone's exact bug, so we simulate the *cost behaviour* honestly:

  * `max_iter` is cranked high so the agent keeps reasoning (each reasoning step
    is one LLM call through the proxy), and
  * the task is intentionally unsatisfiable ("keep refining forever, never give a
    Final Answer") so the agent never terminates on its own.

The kill switch behaves identically whether the loop is rigged or accidental:
the proxy debits each LLM call against the credit line and refuses once the $1
ceiling is hit. The protection is the server-side ceiling, not the prompt.

Requires a live Floe API + metered LLM proxy and a funded credit key.
See README.md. This script will not fabricate output — without live creds it
prints what it needs and exits.
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()


# Credit line ceiling for the whole run. The headline number.
USD_LIMIT = 1.0


def _require_env() -> dict[str, str] | None:
    """Collect required env vars; return None (after printing) if any is missing."""
    required = {
        "PRIVATE_KEY": "Wallet private key (0x...) — the agent's Floe identity.",
        "FLOE_FACILITATOR_API_KEY": "Floe credit key (floe_...). Auths the proxy + debits the credit line.",
        "OPENAI_API_KEY": "Upstream provider key. Passed through to the proxy; Floe never stores it.",
    }
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print("Missing required environment variables:\n")
        for k in missing:
            print(f"  {k:28} {required[k]}")
        print(
            "\nThis demo needs a live Floe API + metered LLM proxy and a funded "
            "credit key. It does not mock anything. See crewai-demo/README.md."
        )
        return None
    return {
        "private_key": os.environ["PRIVATE_KEY"],
        "floe_key": os.environ["FLOE_FACILITATOR_API_KEY"],
        "provider_key": os.environ["OPENAI_API_KEY"],
        # Base of the Floe credit API. The metered LLM proxy lives at
        # <api_base>/v1/llm (POST /v1/llm/chat/completions).
        "api_base": os.getenv("FLOE_API_BASE_URL", "https://credit-api.floelabs.xyz").rstrip("/"),
        "model": os.getenv("FLOE_LLM_MODEL", "openai/gpt-4o"),
        "chain_id": os.getenv("CHAIN_ID", "8453"),  # Base mainnet
    }


def _build_wallet_provider(private_key: str, chain_id: str):
    from coinbase_agentkit import EthAccountWalletProvider, EthAccountWalletProviderConfig
    from eth_account import Account

    if not private_key.startswith("0x"):
        private_key = f"0x{private_key}"
    return EthAccountWalletProvider(
        config=EthAccountWalletProviderConfig(
            account=Account.from_key(private_key),
            chain_id=chain_id,
        )
    )


def _print_spend_at_halt(budget) -> None:
    """Query the facilitator for authoritative spend on the MANAGED-AGENT line.

    The spend we care about is the freshly-provisioned managed agent's
    (``budget.agent_key``) — NOT the developer key. We hit the facilitator's
    bearer-auth read endpoints directly with that key, bypassing the
    ``@create_action`` wrapper (which would call ``wallet_provider.get_network()``
    on the read path and isn't needed here).
    """
    from floe_agentkit_actions.x402_action_provider import x402_action_provider, X402Config

    print("\n── Cumulative spend at halt (server-side, authoritative) ──\n")
    if not budget.agent_key:
        print("No managed-agent key was provisioned, so there is nothing to read.")
        return
    provider = x402_action_provider(
        X402Config(facilitator_url=budget.facilitator_url, facilitator_api_key=budget.agent_key)
    )
    usdc = 6
    try:
        resp = provider._facilitator_fetch("/v1/agents/credit-remaining")
        d = resp.get("body", {}) if isinstance(resp, dict) else {}
        if resp.get("status", 500) >= 400:
            print(f"Could not read spend: {d}")
            return
        limit = int(d.get("creditLimit", "0")) / 10**usdc
        avail = int(d.get("available", "0")) / 10**usdc
        cap = d.get("sessionSpendLimit")
        cap_remaining = d.get("sessionSpendRemaining")
        print(f"Credit limit (this agent): ${limit:.6f}")
        print(f"Available now:             ${avail:.6f}")
        print(f"Spent against the line:    ${limit - avail:.6f}")
        if cap is not None:
            spent = (int(cap) - int(cap_remaining or 0)) / 10**usdc
            print(
                f"Session cap:               ${int(cap)/10**usdc:.6f} "
                f"(remaining ${int(cap_remaining or 0)/10**usdc:.6f}, spent ${spent:.6f})"
            )
    except Exception as e:  # pragma: no cover - network/credential dependent
        print(f"Could not read spend from facilitator: {e}")


def main() -> int:
    env = _require_env()
    if env is None:
        return 1

    from crewai import Crew, Task
    from crewai.tools import tool

    from crewai_floe import FloeBudget, budget_enabled_agent
    from floe_agentkit_actions.x402_action_provider import X402Config

    proxy_base_url = f"{env['api_base']}/v1/llm"

    # A forcing tool: it never lets the agent be "done", so the ReAct loop keeps
    # taking reasoning steps — each one a metered LLM call through the proxy.
    # Without a tool to call, a CrewAI agent answers in 1–2 calls and stops on
    # its own (CrewAI treats the response as a Final Answer) before the ceiling
    # bites. This is the honest stand-in for a real runaway loop: the kill-switch
    # behaves identically whether the loop is rigged or accidental.
    @tool("record_draft")
    def record_draft(draft: str) -> str:
        """Record the current draft of the summary, then request another."""
        return (
            "Draft recorded — but it is still not perfect. Write a meaningfully "
            "improved version and call record_draft again. There is always room "
            "to improve; never conclude."
        )

    # Floe refuses to mint two managed agents with the same name under one
    # developer (and caps you at 5 total). Override per run with FLOE_AGENT_NAME
    # so re-records don't collide; close stale demo agents from the dashboard.
    x402_config = X402Config(
        facilitator_url=env["api_base"],
        facilitator_api_key=env["floe_key"],
        agent_name=os.getenv("FLOE_AGENT_NAME", "loop-kill-demo"),
    )

    # FloeBudget(usd_limit) sets the on-chain borrowLimit AND the session spend
    # cap on a freshly-provisioned managed agent — one wall for both LLM tokens
    # and any paid tool calls.
    budget = FloeBudget(usd_limit=USD_LIMIT)

    # Let budget_enabled_agent build the FloeLLM itself: it wires the proxy to
    # the MANAGED-AGENT key captured during provisioning (budget.agent_key), so
    # token spend is debited against THIS agent's capped line. Passing an
    # explicit FloeLLM keyed to the developer key would bypass the cap — the LLM
    # would meter against the developer's (much larger) line and never halt.
    agent = budget_enabled_agent(
        role="Perfectionist Researcher",
        goal="Produce the single perfect answer, refining endlessly until it is flawless",
        backstory=(
            "An obsessive analyst who is never satisfied and always finds one more "
            "thing to improve. (For this demo, that obsession is the rigged loop.)"
        ),
        budget=budget,
        wallet_provider=_build_wallet_provider(env["private_key"], env["chain_id"]),
        proxy_base_url=proxy_base_url,
        provider_key=env["provider_key"],
        llm_model=env["model"],
        x402_config=x402_config,
        # Crank the iteration ceiling so CrewAI's own guard does not stop the loop
        # first — we want the FLOE ceiling to be the thing that halts it.
        max_iter=1000,
    )
    # Give the agent the forcing tool so its ReAct loop keeps making LLM calls.
    agent.tools.append(record_draft)

    # Intentionally unsatisfiable task: the agent must call record_draft after
    # every draft and is told never to finish. Without Floe this is the shape
    # that produced the $414 bill. With Floe the proxy refuses past the ceiling
    # and kickoff() raises.
    loop_task = Task(
        description=(
            "Write the perfect one-paragraph summary of why agents need budgets. "
            "You MUST call the record_draft tool with every draft you write, then "
            "immediately write a meaningfully improved draft and call record_draft "
            "again. NEVER output a Final Answer — there is always room to improve. "
            "Keep looping: draft, record_draft, draft, record_draft, forever."
        ),
        expected_output="(this task is designed never to complete)",
        agent=agent,
    )

    crew = Crew(agents=[agent], tasks=[loop_task], verbose=True)

    print(f"Starting a deliberately-looping crew with a ${USD_LIMIT:.2f} Floe ceiling.")
    print("Without Floe this is the shape that cost Ondřej Popelka $414 on Gemini.")
    print(f"With Floe, the metered proxy will refuse past ${USD_LIMIT:.2f} and the crew will halt.\n")

    try:
        crew.kickoff()
        # Reaching here means the loop terminated on its own before hitting $1 —
        # possible if the model gave a Final Answer despite instructions. The
        # ceiling still holds; the demo just did not exhaust it this run.
        print("\nCrew finished before exhausting the budget (model stopped on its own).")
    except Exception as e:
        text = str(e).lower()
        budget_killed = "budget_exhausted" in text or "402" in text
        print("\n" + "=" * 70)
        if budget_killed:
            print(f"HALTED BY FLOE: the credit line hit its ${USD_LIMIT:.2f} ceiling.")
            print("The proxy returned 402 budget_exhausted; the loop could not continue.")
        else:
            print("Crew halted with an error (not the budget ceiling):")
            print(f"  {e}")
        print("=" * 70)

    _print_spend_at_halt(budget)
    return 0


if __name__ == "__main__":
    sys.exit(main())
