import os
from dotenv import load_dotenv
from coinbase_agentkit import AgentKit, AgentKitConfig
from coinbase_agentkit.wallet_providers import EvmWalletProvider
from floe_agentkit_actions import floe_action_provider

load_dotenv()

PRIVATE_KEY = os.environ["PRIVATE_KEY"]
BASE_RPC_URL = os.environ["BASE_RPC_URL"]
FLOE_API_KEY = os.environ["FLOE_API_KEY"]
X402_TARGET_URL = os.environ["X402_TARGET_URL"]


def main() -> None:
    # [1/6] Setup: wallet + agent identity
    wallet_provider = EvmWalletProvider.from_private_key(
        private_key=PRIVATE_KEY,
        rpc_url=BASE_RPC_URL,
        network_id="base-mainnet",
    )
    provider = floe_action_provider(facilitator_api_key=FLOE_API_KEY)
    agentkit = AgentKit(AgentKitConfig(
        wallet_provider=wallet_provider,
        action_providers=[provider],
    ))
    address = wallet_provider.get_address()
    print(f"[1/6] Registering agent + wallet ... {address}")

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

    # [4/6] Spend: preflight then x402_fetch
    preflight = provider.estimate_x402_cost(wallet_provider, {"url": X402_TARGET_URL})
    print(f"      estimate_x402_cost ... cost={preflight['cost']} "
          f"willExceed={preflight['will_exceed_available']}")

    fetched = provider.x402_fetch(wallet_provider, {
        "url": X402_TARGET_URL,
        "method": "GET",
    })
    print(f"[4/6] x402_fetch {X402_TARGET_URL} ... {fetched['status']}")

    # [5/6] Repay: collateral auto-returns
    provider.repay_loan(wallet_provider, {"loan_id": loan_id})
    print(f"[5/6] repay_loan {loan_id} ... repaid, collateral returned")

    # [6/6] Trust: register a credit utilization threshold
    threshold = provider.register_credit_threshold(wallet_provider, {
        "utilization_bps": "8000",         # 80%
        "webhook_url": "https://example.com/floe-webhook",
    })
    print(f"[6/6] register_credit_threshold at 80% ... thresholdId={threshold['threshold_id']}")

    print("\nFinancial OS loop complete.")


if __name__ == "__main__":
    main()
