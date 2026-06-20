/**
 * Vapi Assistant Setup
 *
 * Creates custom tools and a Vapi voice assistant that calls paid x402 APIs
 * through Floe's proxy. Run once, then start the server.
 *
 * Usage:
 *   cp .env.example .env   # fill in keys
 *   npm install
 *   npx tsx setup.ts
 */
import { VapiClient } from "@vapi-ai/server-sdk";
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const FLOE_API_KEY = process.env.FLOE_API_KEY;
// USDC base units (6 decimals): 50000 = $0.05 — low enough to hit in a short demo call.
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "50000";
const FLOE_CREDIT_API = process.env.FLOE_CREDIT_API_URL || "https://credit-api.floelabs.xyz";

if (!VAPI_API_KEY) {
  console.error("Set VAPI_API_KEY in .env");
  process.exit(1);
}
if (!SERVER_URL) {
  console.error("Set SERVER_URL in .env (your public webhook URL, e.g. ngrok)");
  process.exit(1);
}
if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env (needed to set the session spend-limit)");
  process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_API_KEY });
const toolCallUrl = `${SERVER_URL}/vapi/tool-call`;
const spendCapUsd = Number(FLOE_SPEND_LIMIT_RAW) / 1e6;

const SYSTEM_PROMPT = `You are a crypto market assistant on a phone call. You have three tools:

1. get_crypto_news — Real-time crypto market news with sentiment and top headlines (Otto AI). Use when the caller asks "what's happening in crypto", market mood, or wants a news rundown.
2. get_market_price — Live mark price, funding rate, and open interest for a tradable asset (Hyperliquid market data via Otto AI). Use when the caller asks for the price or funding rate of an asset like BTC, ETH, SOL, etc. The required argument is the asset ticker.
3. get_block_number — Current Base mainnet block height. Use when the caller asks about Base chain activity or wants a sanity check that on-chain queries are live.

Keep your responses concise and conversational — you're on a phone call, not writing an essay.
When you use a tool, briefly tell the caller what you're doing ("Let me check the latest news..." or "Pulling BTC's price now...").
Summarize tool results in 2-3 sentences max.

BUDGET — read this carefully:
- You have a strict, limited spending budget for this call. Each paid lookup (every tool call) costs real money.
- After each tool call, the result includes a "[Floe budget: ...]" line showing how much of your budget you've used. Read it every time and let it guide you.
- As you approach your budget, taper off: give shorter answers, batch what the caller wants, and make fewer and only the most necessary paid lookups. Do not make a paid call just to be thorough.
- If a tool result says the payment was blocked because you reached your spending limit, STOP making paid lookups. Clearly tell the caller, in plain language, that you've hit your spending limit and cannot make any more paid lookups on this call. Do not retry the tool.`;

async function main() {
  console.log("🎙️  Setting up Vapi assistant...\n");

  // Step 1: Create custom tools
  console.log("📦 Creating tools...");

  const cryptoNewsTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "get_crypto_news",
      description: "Get real-time crypto market news with sentiment analysis and top headlines (Otto AI). No arguments needed.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    server: { url: toolCallUrl },
  });
  console.log(`   ✅ get_crypto_news (${cryptoNewsTool.id})`);

  const marketPriceTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "get_market_price",
      description: "Get live mark/oracle price, funding rate, open interest, and size specs for a Hyperliquid tradable asset. Pass the asset ticker (e.g. BTC, ETH, SOL).",
      parameters: {
        type: "object",
        properties: {
          asset: { type: "string", description: "Asset ticker (BTC, ETH, SOL, etc.)" },
        },
        required: ["asset"],
      },
    },
    server: { url: toolCallUrl },
  });
  console.log(`   ✅ get_market_price (${marketPriceTool.id})`);

  const blockNumberTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "get_block_number",
      description: "Get the current Base mainnet block height via eth_blockNumber. No arguments needed.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    server: { url: toolCallUrl },
  });
  console.log(`   ✅ get_block_number (${blockNumberTool.id})`);

  // Step 2: Create assistant with tools attached
  console.log("\n🤖 Creating assistant...");

  const assistant = await vapi.assistants.create({
    name: "Floe Crypto Market Assistant",
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      toolIds: [cryptoNewsTool.id, marketPriceTool.id, blockNumberTool.id],
    },
    voice: {
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9", // ElevenLabs "Jessica" — swap for any voiceId from the ElevenLabs library
    },
    firstMessage:
      "Hi! I can pull live crypto news, give you the latest price and funding for an asset like BTC or ETH, or check what block Base is on. What do you want to know?",
  });

  console.log(`   ✅ Assistant created: ${assistant.name} (${assistant.id})`);

  // Step 3: Set a LOW session spend-limit so the cap is reachable in a short demo call.
  // This is the hard cap enforced by Floe — when exceeded, the proxy denies the paid call.
  console.log(`\n💵 Setting Floe session spend-limit...`);
  try {
    const res = await fetch(`${FLOE_CREDIT_API}/v1/agents/spend-limit`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${FLOE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limitRaw: FLOE_SPEND_LIMIT_RAW }),
    });
    if (res.ok) {
      console.log(
        `   ✅ Spend-limit set: ${FLOE_SPEND_LIMIT_RAW} base units = $${spendCapUsd.toFixed(3)} for this session`
      );
    } else {
      const body = await res.text();
      console.warn(
        `   ⚠️  Could not set spend-limit (${res.status}): ${body.slice(0, 200)}`
      );
      console.warn(`      The assistant was still created. Set the cap manually before the demo:`);
      console.warn(
        `      curl -X PUT -H "Authorization: Bearer $FLOE_API_KEY" -H "Content-Type: application/json" \\`
      );
      console.warn(
        `        -d '{"limitRaw":"${FLOE_SPEND_LIMIT_RAW}"}' ${FLOE_CREDIT_API}/v1/agents/spend-limit`
      );
    }
  } catch (err) {
    console.warn(`   ⚠️  Spend-limit request failed: ${(err as Error).message}`);
    console.warn(`      The assistant was still created. Set the cap manually before the demo.`);
  }

  console.log(`\n📝 Add this to your .env so the web widget and budget logic can use it:`);
  console.log(`   VAPI_ASSISTANT_ID=${assistant.id}`);

  console.log(`\n📞 Next steps:`);
  console.log(`   1. Start the server:  npx tsx server.ts`);
  console.log(`   2. Phone: in the Vapi dashboard, assign a phone number to assistant ${assistant.id}, then call it.`);
  console.log(`   3. Web:   open http://localhost:${process.env.PORT || "3000"}/ and click "Talk to the agent".`);
  console.log(`            (the web widget needs VAPI_PUBLIC_KEY + VAPI_ASSISTANT_ID in .env)`);
  console.log(`\n💰 After the call, check your Floe spending:`);
  console.log(
    `   curl -H "Authorization: Bearer $FLOE_API_KEY" \\`
  );
  console.log(
    `     https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10`
  );
}

main().catch((err) => {
  console.error("❌ Setup failed:", err.message || err);
  process.exit(1);
});
