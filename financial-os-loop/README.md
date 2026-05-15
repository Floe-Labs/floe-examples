# financial-os-loop

**The canonical end-to-end Floe example — self-custody variant.**

> ⚠️ **For most agents you do not want to start here.** Floe's default flow is
> a managed wallet provisioned per agent and a `floe_…` runtime API key — no
> private key in your environment, no gas, no chain or RPC config. See the
> [Quickstart](https://floe-labs.gitbook.io/docs/getting-started/quickstart)
> for the no-crypto path. This example demonstrates the **self-custody**
> variant: useful if you're holding signing keys in your own HSM/KMS or
> integrating with an existing wallet stack. The bulk of Floe's API works
> identically across both paths.

Wires every GA component of the Financial OS in a single runnable script:

1. **Setup** — register an agent identity and a non-custodial wallet
2. **Fund** — print a fiat on-ramp deep link (dashboard) for the operator
3. **Borrow** — `instant_borrow` against on-chain collateral
4. **Spend** — `x402_fetch` an x402-gated API through the Floe facilitator (gated on `estimate_x402_cost` preflight)
5. **Repay** — `repay_loan` (collateral auto-returns in the same tx; always attempted via `finally`)
6. **Trust** — `register_credit_threshold` so future loans can react to utilization

Shipping in TypeScript (`index.ts`) and Python (`main.py`) with identical behavior.

---

## Components covered

| # | Component | Action(s) used |
|---|---|---|
| 01 | Agent Wallet | wallet provider init |
| 02 | Fiat on-ramp | dashboard deep link printed |
| 03 | Secured working capital | `instant_borrow`, `check_credit_status`, `repay_loan` |
| 05 | x402 payment facilitator | `x402_fetch`, `estimate_x402_cost` |
| 06 | Credit & trust bureau | `register_credit_threshold` |

Unsecured working capital (04) and the ERC-8004 portable credit reader are `Preview` — email [hello@floelabs.xyz](mailto:hello@floelabs.xyz) for the design partner program.

---

## Prerequisites

- Node.js 18+ (for TS) or Python 3.10+ (for Python)
- A Floe API key from [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz)
- A funded self-custody wallet on Base (the example signs from `PRIVATE_KEY`).
  If you don't want to manage a key, use the [managed-wallet quickstart](https://floe-labs.gitbook.io/docs/getting-started/quickstart)
  instead — the agent's wallet is custodied by Floe and funded with a card.

---

## Setup

```bash
cp .env.example .env
# Edit .env with PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY, X402_TARGET_URL
# Optional: BASE_NETWORK=sepolia to target Base Sepolia
```

### Run (TypeScript)

```bash
npm install
npx tsx index.ts
```

### Run (Python)

```bash
pip install -r requirements.txt
python main.py
```

---

## What you should see

```text
[1/6] Registering agent + wallet ... 0xAgent... (chain=base)
[2/6] On-ramp link: https://dev-dashboard.floelabs.xyz/onramp?agent=0xAgent...
[3/6] instant_borrow ... loanId=42
      estimate_x402_cost ... cost=0.03 willExceed=false
[4/6] x402_fetch https://api.example.com/premium ... 200 OK
[5/6] repay_loan 42 ... repaid, collateral returned
[6/6] register_credit_threshold at 80% utilization ... thresholdId=t_abc

Financial OS loop complete.
```

---

## Notes

- The example uses small amounts (5 USDC borrow) so it is safe to run on mainnet.
- The spend step is wrapped in `try`/`finally` so a failing x402 fetch never strands an open loan.
- The x402 step is **preflighted** — if `estimate_x402_cost.willExceedAvailable` is true, the script skips the fetch and proceeds to repay.
- All write calls auto-approve the necessary tokens; no separate approval step.
- Set `BASE_NETWORK=sepolia` in `.env` (and point `BASE_RPC_URL` at a Sepolia RPC) to run on testnet. Mainnet is the default.
- The `x402_fetch` step will fail if `X402_TARGET_URL` is not actually x402-gated — supply any endpoint that returns HTTP 402.

## Links

- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
- [Python SDK (`floe-agentkit-actions`)](https://github.com/Floe-Labs/agentkit-actions-py)
- [Docs](https://floe-labs.gitbook.io/docs)
