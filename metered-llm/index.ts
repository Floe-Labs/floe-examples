/**
 * Floe metered LLM — drop-in OpenAI-compatible endpoint.
 *
 * Point ANY OpenAI-compatible client at the Floe proxy and your agent's LLM
 * calls are billed per token to your Floe credit line and capped server-side.
 * No model lock — pass any model OpenAI or Anthropic ships in the request body;
 * Floe never holds your provider key (it's passed through per request).
 *
 * Run:  npm install && npm start
 * Env:  FLOE_API_KEY, PROVIDER_API_KEY  (optional: FLOE_MODEL)
 */
import "dotenv/config"; // load .env so `cp .env.example .env` just works
import OpenAI from "openai";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

const client = new OpenAI({
  // The Floe metered LLM endpoint (OpenAI-compatible).
  baseURL: "https://credit-api.floelabs.xyz/v1/llm",
  // Your Floe agent key (floe_<hex>) — Floe auth + billing identity.
  apiKey: requireEnv("FLOE_API_KEY"),
  defaultHeaders: {
    // Your upstream OpenAI/Anthropic key — passed through to the provider,
    // used only to make the call, never stored by Floe.
    "X-Floe-Provider-Key": requireEnv("PROVIDER_API_KEY"),
  },
});

// Any priced model works — swap freely (and swap PROVIDER_API_KEY to match).
const model = process.env.FLOE_MODEL ?? "gpt-5.5"; // e.g. "claude-opus-4-8", "claude-sonnet-4-6"

try {
  const { data, response } = await client.chat.completions
    .create({
      model,
      messages: [{ role: "user", content: "In one sentence: what is an AI agent?" }],
    })
    .withResponse();

  console.log(`\n${model} → ${data.choices[0]?.message?.content ?? ""}`);
  // Floe stamps the metered cost on every response.
  console.log(`metered cost (USDC): ${response.headers.get("x-floe-cost-usdc")}`);
  console.log(
    "\nTip: set a session spend cap (set_spend_limit) — calls past your budget are refused server-side, not billed.",
  );
} catch (err) {
  // The server-side cap is the point of the demo: a 402 means Floe refused the
  // call before paying — your budget/credit line is exhausted, nothing was billed.
  if (err instanceof OpenAI.APIError && err.status === 402) {
    console.error("\n402 — budget cap reached. Floe refused this call server-side (not billed). Raise your spend limit or credit line.");
  } else {
    console.error("\nLLM call failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
}
