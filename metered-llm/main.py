"""
Floe metered LLM — drop-in OpenAI-compatible endpoint (Python).

Point any OpenAI-compatible client at the Floe proxy and your agent's LLM calls
are billed per token to your Floe credit line and capped server-side. No model
lock — pass any model OpenAI or Anthropic ships; Floe never stores your provider
key (passed through per request).

Run:  pip install -r requirements.txt && python main.py
Env:  FLOE_API_KEY, PROVIDER_API_KEY  (optional: FLOE_MODEL)
"""
import os
import sys

from dotenv import load_dotenv
from openai import APIStatusError, OpenAI

load_dotenv()  # load .env so `cp .env.example .env` just works


def require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"Missing {name}. Copy .env.example to .env and fill it in.")
    return v


client = OpenAI(
    base_url="https://credit-api.floelabs.xyz/v1/llm",  # Floe metered LLM endpoint
    api_key=require_env("FLOE_API_KEY"),                 # floe_<hex> — Floe auth + billing
    default_headers={
        # Pass-through upstream key — used only to call the provider, never stored.
        "X-Floe-Provider-Key": require_env("PROVIDER_API_KEY"),
    },
)

model = os.environ.get("FLOE_MODEL", "gpt-5.5")  # or claude-opus-4-8, claude-sonnet-4-6 — any priced model

try:
    resp = client.chat.completions.with_raw_response.create(
        model=model,
        messages=[{"role": "user", "content": "In one sentence: what is an AI agent?"}],
    )
    completion = resp.parse()
    print(f"\n{model} → {completion.choices[0].message.content}")
    print(f"metered cost (USDC): {resp.headers.get('x-floe-cost-usdc')}")
    print(
        "\nTip: set a session spend cap (set_spend_limit) — calls past your budget "
        "are refused server-side, not billed."
    )
except APIStatusError as err:
    # A 402 means Floe refused the call server-side — budget/credit line exhausted,
    # nothing billed. That's the spend cap doing its job.
    if err.status_code == 402:
        sys.exit(
            "\n402 — budget cap reached. Floe refused this call server-side "
            "(not billed). Raise your spend limit or credit line."
        )
    sys.exit(f"\nLLM call failed ({err.status_code}): {err}")
