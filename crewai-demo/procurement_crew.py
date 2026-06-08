"""procurement_crew.py — allowlist + overspend, both hard-stopped server-side.

A three-agent procurement crew, each agent provisioned with its own Floe budget
via `budget_enabled_agent`:

  * Researcher  — FloeBudget($1), no allowlist (may pay any vendor up to $1)
  * Buyer       — FloeBudget($5, allow={hostA: $2, hostB: $1}) → default-deny on
                  both host (pre-fetch) and payee (pre-sign)
  * Manager     — FloeBudget($0) — a coordinator that cannot spend at all

What this proves (all enforced server-side, not by the agent behaving):

  1. The Buyer pays a real x402 call to an ALLOWLISTED host within budget.
  2. An OFF-allowlist host is refused before the first fetch  → `host_not_allowlisted`.
  3. An overspend past the $5 ceiling (or a per-host cap) is refused → blocked.

A per-agent spend ledger is printed from the crew's `step_callback`.

One wallet, three isolated budgets
----------------------------------
All three agents share a single `PRIVATE_KEY` wallet. `budget_enabled_agent`
provisions a DISTINCT Floe managed agent (its own credit line) per call, so the
$1 / $5 / $0 budgets are isolated even under one wallet — no per-role keys
needed. (Floe caps managed agents at 5 per developer, so a crew can have up to
5 budgeted agents.)

Requires a live Floe API and a funded credit key, plus real x402-gated endpoints
for hostA / hostB / the off-allowlist host. This script does not mock anything;
without live creds it prints what it needs and exits.
"""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()


# Per-agent spend ledger, populated by the step_callback. role -> list of events.
LEDGER: dict[str, list[dict]] = defaultdict(list)

# Matches the "*Paid via x402 — $0.001234 USDC*" note that Floe402Tool prepends.
_COST_RE = re.compile(r"\$([0-9]+\.[0-9]+)\s*USDC")


def _require_env() -> dict[str, str] | None:
    required = {
        "PRIVATE_KEY": "Wallet private key (0x...) — the crew's funded wallet; one managed agent is provisioned per role under it.",
        "FLOE_FACILITATOR_API_KEY": "Floe credit key (floe_...). Auths the facilitator + debits the credit line.",
    }
    missing = [k for k in required if not os.getenv(k)]
    # Demo endpoints must be real x402-gated URLs. Defaults are obvious placeholders.
    host_a = os.getenv("FLOE_DEMO_HOST_A_URL")
    host_b = os.getenv("FLOE_DEMO_HOST_B_URL")
    off = os.getenv("FLOE_DEMO_OFFLIST_URL")
    if not (host_a and host_b and off):
        missing += [
            k
            for k, v in (
                ("FLOE_DEMO_HOST_A_URL", host_a),
                ("FLOE_DEMO_HOST_B_URL", host_b),
                ("FLOE_DEMO_OFFLIST_URL", off),
            )
            if not v
        ]
    if missing:
        print("Missing required environment variables:\n")
        hints = {
            **required,
            "FLOE_DEMO_HOST_A_URL": "A real x402-gated URL on allowlisted host A (capped at $2).",
            "FLOE_DEMO_HOST_B_URL": "A real x402-gated URL on allowlisted host B (capped at $1).",
            "FLOE_DEMO_OFFLIST_URL": "A real x402-gated URL on a host that is NOT allowlisted.",
        }
        for k in dict.fromkeys(missing):  # dedupe, keep order
            print(f"  {k:24} {hints.get(k, '')}")
        print(
            "\nThis demo needs a live Floe API, a funded credit key, and real "
            "x402 endpoints. It does not mock anything. See crewai-demo/README.md."
        )
        return None
    return {
        "private_key": os.environ["PRIVATE_KEY"],
        "floe_key": os.environ["FLOE_FACILITATOR_API_KEY"],
        "api_base": os.getenv("FLOE_API_BASE_URL", "https://credit-api.floelabs.xyz").rstrip("/"),
        "chain_id": os.getenv("CHAIN_ID", "8453"),  # Base mainnet
        "host_a_url": host_a,
        "host_b_url": host_b,
        "offlist_url": off,
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


def _make_step_callback(role: str):
    """A step_callback that records spend into LEDGER[role].

    Step objects differ across CrewAI versions, so we stringify the step and
    extract any "$x.xxxxxx USDC" note that Floe402Tool prepends to paid results.
    This avoids coupling to CrewAI's internal step types.
    """

    def _cb(step: object) -> None:
        text = str(step)
        cost = 0.0
        m = _COST_RE.search(text)
        if m:
            cost = float(m.group(1))
        LEDGER[role].append({"cost": cost, "note": text[:120]})

    return _cb


def _print_ledger() -> None:
    print("\n" + "=" * 70)
    print("PER-AGENT SPEND LEDGER (from step_callback)")
    print("=" * 70)
    for role, events in LEDGER.items():
        spent = sum(e["cost"] for e in events)
        print(f"\n{role}: ${spent:.6f} across {len(events)} step(s)")
        for e in events:
            if e["cost"]:
                print(f"  - ${e['cost']:.6f}  {e['note']}")
    if not LEDGER:
        print("\n(no steps recorded)")


def _enforcement_probes(env: dict[str, str]) -> None:
    """Deterministic, server-side enforcement checks.

    The crew triggers the in-budget call agentically, but whether an LLM agent
    chooses to attempt the off-allowlist host or the overspend is non-deterministic.
    These probes call the SAME facilitator path (FloeAgent.fetch, which is what
    Floe402Tool uses under the hood) directly, so the server-side blocks are shown
    reliably and labelled honestly as enforcement checks rather than agent output.
    """
    from floe_agentkit_actions.floe_agent import FloeAgent, FloeAgentError

    agent = FloeAgent(api_key=env["floe_key"], base_url=env["api_base"])

    print("\n" + "=" * 70)
    print("SERVER-SIDE ENFORCEMENT PROBES (deterministic, not agent-dependent)")
    print("=" * 70)

    # (a) OFF-allowlist host → expect host_not_allowlisted (blocked pre-fetch).
    print(f"\n(a) Fetch OFF-allowlist host: {env['offlist_url']}")
    try:
        agent.fetch(url=env["offlist_url"])
        print("    UNEXPECTED: the off-allowlist fetch succeeded (allowlist not enforced?).")
    except FloeAgentError as e:
        ok = e.code == "host_not_allowlisted"
        flag = "EXPECTED" if ok else "got a different block"
        print(f"    BLOCKED [{flag}]: status={e.status} code={e.code!r}")

    # (b) Overspend → keep paying an allowlisted host until the ceiling refuses.
    print(f"\n(b) Overspend probe against allowlisted host: {env['host_a_url']}")
    blocked = False
    for i in range(1, 51):  # bounded; the ceiling should stop us well before 50
        try:
            res = agent.fetch(url=env["host_a_url"])
            print(f"    call {i}: paid ${res.cost:.6f}")
        except FloeAgentError as e:
            blocked = True
            print(f"    BLOCKED on call {i}: status={e.status} code={e.code!r}")
            break
    if not blocked:
        print("    NOTE: ceiling not reached in 50 calls — raise call cost or lower the cap.")


def main() -> int:
    env = _require_env()
    if env is None:
        return 1

    from crewai import Crew, Task

    from crewai_floe import Floe402Tool, FloeBudget, budget_enabled_agent
    from floe_agentkit_actions.x402_action_provider import X402Config

    floe_key = env["floe_key"]
    api_base = env["api_base"]
    host_a = urlparse(env["host_a_url"]).hostname or env["host_a_url"]
    host_b = urlparse(env["host_b_url"]).hostname or env["host_b_url"]

    def x402_cfg(name: str) -> X402Config:
        return X402Config(facilitator_url=api_base, facilitator_api_key=floe_key, agent_name=name)

    # One funded wallet for the whole crew. budget_enabled_agent provisions a
    # DISTINCT managed agent (its own credit line) per call, so the three budgets
    # below are isolated even though they share this wallet.
    wallet_provider = _build_wallet_provider(env["private_key"], env["chain_id"])

    # ── Researcher: $1, allow-any vendor ──────────────────────────────────────
    researcher = budget_enabled_agent(
        role="Researcher",
        goal="Identify which dataset vendor the Buyer should purchase from",
        backstory="A frugal analyst on a tight $1 budget.",
        budget=FloeBudget(usd_limit=1.0),
        wallet_provider=wallet_provider,
        x402_config=x402_cfg("procurement-researcher"),
        step_callback=_make_step_callback("Researcher"),
    )

    # ── Buyer: $5, allowlist host A ($2) + host B ($1) ────────────────────────
    buyer = budget_enabled_agent(
        role="Buyer",
        goal="Purchase the approved dataset from an allowlisted vendor, within budget",
        backstory="A procurement agent that may only pay vendors on the approved allowlist.",
        budget=FloeBudget(usd_limit=5.0, allow={host_a: "2", host_b: "1"}),
        wallet_provider=wallet_provider,
        x402_config=x402_cfg("procurement-buyer"),
        step_callback=_make_step_callback("Buyer"),
    )
    # Give the Buyer an explicit paid tool pointed at the allowlisted host A.
    buyer.tools.append(
        Floe402Tool(url=env["host_a_url"], api_key=floe_key, base_url=api_base)
    )

    # ── Manager: $0, cannot spend ─────────────────────────────────────────────
    # A hard zero-spend role: FloeBudget(usd_limit=0) creates no credit line and no
    # managed agent, so any paid call fails closed server-side. A pure coordinator.
    manager = budget_enabled_agent(
        role="Manager",
        goal="Review the purchase and confirm it stayed within policy",
        backstory="A coordinator with a $0 budget — reviews, never spends.",
        budget=FloeBudget(usd_limit=0),
        wallet_provider=wallet_provider,
        x402_config=x402_cfg("procurement-manager"),
        step_callback=_make_step_callback("Manager"),
    )

    tasks = [
        Task(
            description="Recommend the dataset vendor to buy from (host A is approved).",
            expected_output="A one-line vendor recommendation.",
            agent=researcher,
        ),
        Task(
            description=(
                "Purchase the approved dataset by calling the floe_paid_fetch tool "
                "ONCE against the approved host A endpoint. Report the amount paid."
            ),
            expected_output="Confirmation of the purchase and the USDC amount paid.",
            agent=buyer,
        ),
        Task(
            description="Confirm the purchase stayed within the approved allowlist and budget.",
            expected_output="A one-line policy confirmation.",
            agent=manager,
        ),
    ]

    crew = Crew(agents=[researcher, buyer, manager], tasks=tasks, verbose=True)

    print("Running the procurement crew (Buyer pays an allowlisted host within budget)...\n")
    try:
        crew.kickoff()
    except Exception as e:  # pragma: no cover - network/credential dependent
        print(f"\nCrew run ended with an error: {e}")

    # Deterministic proof of the two hard-stops, independent of agent whim.
    _enforcement_probes(env)
    _print_ledger()
    return 0


if __name__ == "__main__":
    sys.exit(main())
