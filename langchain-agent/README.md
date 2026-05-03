# LangChain Agent

A LangChain agent with Floe lending tools. Ask it to check markets, borrow, or manage loans in natural language.

## Setup

```bash
cp .env.example .env
# Edit .env with your keys
pip install -r requirements.txt
```

## Run

```bash
python agent.py
```

## What it does

1. Creates a LangChain agent with Floe's 36 actions as tools
2. You chat with it in natural language
3. It calls Floe actions to execute your requests

## Key actions

- `get_markets` — see available lending markets
- `instant_borrow` — borrow USDC in one call
- `check_credit_status` — monitor loan health
- `repay_credit` — repay and get collateral back
