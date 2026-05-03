# Flash Arb Bot

Monitors price differences between Aerodrome pools and executes flash arbitrage when profitable.

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

1. Checks flash loan fee via `get_flash_loan_fee`
2. Deploys a `FlashArbReceiver` contract (one-time) via `deploy_flash_arb_receiver`
3. Scans for arbitrage opportunities via `estimate_flash_arb_profit`
4. Executes profitable trades via `flash_arb`

## Key actions used

- `get_flash_loan_fee` — current protocol fee for flash loans
- `deploy_flash_arb_receiver` — deploy your arb receiver contract
- `estimate_flash_arb_profit` — simulate arb profitability
- `flash_arb` — execute the flash loan arbitrage
