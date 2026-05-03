# CrewAI Demo

A CrewAI crew with Floe DeFi lending capabilities via MCP.

## Setup

```bash
cp .env.example .env
# Edit .env with your keys
pip install -r requirements.txt
```

## Run

```bash
python crew.py
```

## What it does

Creates a crew with two AI agents:
1. **Market Analyst** — monitors Floe lending rates
2. **Portfolio Manager** — borrows and manages positions

Uses Floe's MCP server for tool access — no SDK installation needed.
