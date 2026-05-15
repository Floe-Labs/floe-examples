"""financial-os-loop (self-custody variant)

⚠️ Self-custody example — signs every transaction from PRIVATE_KEY. Most
   agents should use the managed-wallet flow instead (no key in env, no
   gas to manage): https://floe-labs.gitbook.io/docs/getting-started/quickstart
   Pick this path only if you hold signing keys in your own HSM/KMS or are
   integrating with an existing wallet stack.
"""

import os
import sys
from dotenv import load_dotenv
from coinbase_agentkit.wallet_providers import EvmWalletProvider
from floe_agentkit_actions import floe_action_provider

load_dotenv()

REQUIRED_ENV = ("PRIVATE_KEY", "BASE_RPC_URL", "FLOE_API_KEY", "X402_TARGET_URL")


def _load_env() -> dict[str, str]:
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        sys.stderr.write(
            f"Missing required env: {', '.join(missing)}. "
            "Copy .env.example to .env and fill it in.\n"
        )
        sys.exit(1)
    return {k: os.environ[k] for k in REQUIRED_ENV}


def main() -> None:
    env = _load_env()
    network_id = "base-sepolia" if os.environ.get("BASE_NETWORK", "mainnet").lower() == "sepolia" else "base-mainnet"

    # [1/6] Setup: wallet + agent identity
    wallet_provider = EvmWalletProvider.from_private_key(
        private_key=env["PRIVATE_KEY"],
        rpc_url=env["BASE_RPC_URL"],
        network_id=network_id,
    )
    provider = floe_action_provider(facilitator_api_key=env["FLOE_API_KEY"])
    address = wallet_provider.get_address()
    print(f"[1/6] Registering agent + wallet ... {address} (network={network_id})")

    # [2/6] Fund: surface a fiat on-ramp deep link
    onramp = f"https://dev-dashboard.floelabs.xyz/onramp?agent={address}"
    print(f"[2/6] On-ramp link: {onramp}")

    # [3/6] Borrow: instant_borrow against on-chain collateral
    borrow = provider.instant_borrow(wallet_provider, {
        "borrow_amount": "5000000",        # 5 USDC (6 decimals)
        "collateral_amount": "6000000",    # 6 USDC collateral
        "max_interest_rate_bps": "1200",  # 12% APR ceiling
        "duration": "604800",              # 7 days
    })
    loan_id = borrow["loan_id"]
    print(f"[3/6] instant_borrow ... loanId={loan_id}")

    # Any failure after this point must still attempt repayment, otherwise we strand an open loan.
    try:
        # [4/6] Spend: preflight then x402_fetch (skip fetch if preflight says we'd exceed available credit)
        preflight = provider.estimate_x402_cost(wallet_provider, {"url": env["X402_TARGET_URL"]})
        will_exceed = preflight["will_exceed_available"]
        print(f"      estimate_x402_cost ... cost={preflight['cost']} willExceed={will_exceed}")

        if will_exceed:
            print("      preflight indicates insufficient credit — skipping x402_fetch.")
        else:
            fetched = provider.x402_fetch(wallet_provider, {
                "url": env["X402_TARGET_URL"],
                "method": "GET",
            })
            print(f"[4/6] x402_fetch {env['X402_TARGET_URL']} ... {fetched['status']}")
    finally:
        # [5/6] Repay: collateral auto-returns. Always attempt, even if the spend step threw.
        try:
            provider.repay_loan(wallet_provider, {"loan_id": loan_id})
            print(f"[5/6] repay_loan {loan_id} ... repaid, collateral returned")
        except Exception as repay_err:
            sys.stderr.write(f"[5/6] repay_loan {loan_id} FAILED — investigate immediately: {repay_err}\n")
            raise

    # [6/6] Trust: register a credit utilization threshold
    threshold = provider.register_credit_threshold(wallet_provider, {
        "utilization_bps": "8000",         # 80%
        "webhook_url": "https://example.com/floe-webhook",
    })
    print(f"[6/6] register_credit_threshold at 80% ... thresholdId={threshold['threshold_id']}")

    print("\nFinancial OS loop complete.")


if __name__ == "__main__":
    main()
