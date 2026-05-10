# financial-os-loop

**The canonical end-to-end Floe example.**

Wires every GA component of the Financial OS in a single runnable script:

1. **Setup** — register an agent identity and a non-custodial wallet
2. **Fund** — print a fiat on-ramp deep link (dashboard) for the operator
3. **Borrow** — `instant_borrow` against on-chain collateral
4. **Spend** — `x402_fetch` an x402-gated API through the Floe facilitator
5. **Repay** — `repay_loan` (collateral auto-returns in the same tx)
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

Unsecured working capital (04) and the ERC-8004 portable credit reader are `Preview` — see the [waitlist](https://floelabs.xyz/unsecured).

---

## Prerequisites

- Node.js 18+ (for TS) or Python 3.10+ (for Python)
- A Floe API key from [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz)
- A funded wallet on Base (or run the on-ramp link printed at step 2)

---

## Setup

```bash
cp .env.example .env
# Edit .env with PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY, X402_TARGET_URL
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

```
[1/6] Registering agent + wallet ... 0xAgent...
[2/6] On-ramp link: https://dev-dashboard.floelabs.xyz/onramp?agent=0xAgent...
[3/6] instant_borrow 5.00 USDC ... loanId=42
[4/6] x402_fetch https://api.example.com/premium ... 200 OK
[5/6] repay_loan 42 ... repaid, collateral returned
[6/6] register_credit_threshold at 80% utilization ... thresholdId=t_abc

Financial OS loop complete.
```

---

## Notes

- The example uses small amounts (5 USDC borrow) so it is safe to run on mainnet.
- All write calls auto-approve the necessary tokens; no separate approval step.
- The `x402_fetch` step will fail if `X402_TARGET_URL` is not actually x402-gated — pick any endpoint from the [x402 directory](https://floelabs.xyz/x402).
- For testnet, point `BASE_RPC_URL` at a Base Sepolia RPC and ask for a Sepolia-scoped API key in the dashboard.

## Links

- [TypeScript SDK (`floe-agent`)](https://github.com/Floe-Labs/agentkit-actions)
- [Python SDK (`floe-agentkit-actions`)](https://github.com/Floe-Labs/agentkit-actions-py)
- [Docs](https://floe-labs.gitbook.io/docs)
