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


def _print_spend_at_halt(x402_config) -> None:
    """Query the facilitator for authoritative spend after the loop halts."""
    from floe_agentkit_actions.x402_action_provider import x402_action_provider

    provider = x402_action_provider(x402_config)
    # get_credit_remaining / get_spend_limit read the facilitator with the credit
    # key only; the wallet_provider arg is unused on these read paths but the
    # signature requires it, so pass None.
    print("\n── Cumulative spend at halt (server-side, authoritative) ──\n")
    try:
        print(provider.get_credit_remaining(None, {}))
        print()
        print(provider.get_spend_limit(None, {}))
    except Exception as e:  # pragma: no cover - network/credential dependent
        print(f"Could not read spend from facilitator: {e}")


def main() -> int:
    env = _require_env()
    if env is None:
        return 1

    from crewai import Crew, Task

    from crewai_floe import FloeBudget, FloeLLM, budget_enabled_agent
    from floe_agentkit_actions.x402_action_provider import X402Config

    proxy_base_url = f"{env['api_base']}/v1/llm"

    x402_config = X402Config(
        facilitator_url=env["api_base"],
        facilitator_api_key=env["floe_key"],
        agent_name="loop-kill-demo",
    )

    # The LLM is a FloeLLM routed through the metered proxy. Every reasoning step
    # the agent takes is a chat-completion call that the proxy prices and debits
    # against the credit line; once $1 is spent, the next call gets 402.
    floe_llm = FloeLLM(
        model=env["model"],
        proxy_base_url=proxy_base_url,
        credit_key=env["floe_key"],
        provider_key=env["provider_key"],
    )

    # FloeBudget(usd_limit=1) sets the on-chain borrowLimit AND the session spend
    # cap to $1 — one wall for both LLM tokens and any paid tool calls.
    budget = FloeBudget(usd_limit=USD_LIMIT)

    agent = budget_enabled_agent(
        role="Perfectionist Researcher",
        goal="Produce the single perfect answer, refining endlessly until it is flawless",
        backstory=(
            "An obsessive analyst who is never satisfied and always finds one more "
            "thing to improve. (For this demo, that obsession is the rigged loop.)"
        ),
        budget=budget,
        wallet_provider=_build_wallet_provider(env["private_key"], env["chain_id"]),
        llm=floe_llm,
        x402_config=x402_config,
        # Crank the iteration ceiling so CrewAI's own guard does not stop the loop
        # first — we want the FLOE ceiling to be the thing that halts it.
        max_iter=1000,
    )

    # Intentionally unsatisfiable task: the agent is told never to finish. Without
    # Floe this is exactly the shape that produced the $414 bill. With Floe the
    # proxy refuses past $1 and kickoff() raises.
    loop_task = Task(
        description=(
            "Write the perfect one-paragraph summary of why agents need budgets. "
            "After each draft, critique it harshly and rewrite it. NEVER output a "
            "Final Answer — there is always room to improve. Keep iterating."
        ),
        expected_output="(this task is designed never to complete)",
        agent=agent,
    )

    crew = Crew(agents=[agent], tasks=[loop_task], verbose=True)

    print(f"Starting a deliberately-looping crew with a ${USD_LIMIT:.0f} Floe ceiling.")
    print("Without Floe this is the shape that cost Ondřej Popelka $414 on Gemini.")
    print("With Floe, the metered proxy will refuse past $1 and the crew will halt.\n")

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
            print("HALTED BY FLOE: the credit line hit its $1 ceiling.")
            print("The proxy returned 402 budget_exhausted; the loop could not continue.")
        else:
            print("Crew halted with an error (not the budget ceiling):")
            print(f"  {e}")
        print("=" * 70)

    _print_spend_at_halt(x402_config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
