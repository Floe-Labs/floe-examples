# Yield Optimizer

Borrows USDC against WETH collateral, deploys to a yield strategy, and repays before maturity.

## Setup

```bash
cp .env.example .env
# Edit .env with your private key and RPC URL
npm install
```

## Run

```bash
npx tsx index.ts
```

## What it does

1. Checks available lending rates via `get_markets`
2. Borrows USDC via `instant_borrow` (auto-selects best lender)
3. Deploys USDC to your yield strategy (customize this)
4. Monitors loan health via `check_credit_status`
5. Repays via `repay_credit` — collateral returns automatically

## Key actions used

- `instant_borrow` — one-call borrow
- `check_credit_status` — health + accrued interest
- `repay_credit` — repay with auto-slippage
