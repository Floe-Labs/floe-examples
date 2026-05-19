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

if (!VAPI_API_KEY) {
  console.error("Set VAPI_API_KEY in .env");
  process.exit(1);
}
if (!SERVER_URL) {
  console.error("Set SERVER_URL in .env (your public webhook URL, e.g. ngrok)");
  process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_API_KEY });
const toolCallUrl = `${SERVER_URL}/vapi/tool-call`;

const SYSTEM_PROMPT = `You are a crypto market assistant on a phone call. You have three tools:

1. get_crypto_news — Real-time crypto market news with sentiment and top headlines (Otto AI). Use when the caller asks "what's happening in crypto", market mood, or wants a news rundown.
2. get_market_price — Live mark price, funding rate, and open interest for a tradable asset (Hyperliquid market data via Otto AI). Use when the caller asks for the price or funding rate of an asset like BTC, ETH, SOL, etc. The required argument is the asset ticker.
3. get_block_number — Current Base mainnet block height. Use when the caller asks about Base chain activity or wants a sanity check that on-chain queries are live.

Keep your responses concise and conversational — you're on a phone call, not writing an essay.
When you use a tool, briefly tell the caller what you're doing ("Let me check the latest news..." or "Pulling BTC's price now...").
Summarize tool results in 2-3 sentences max.`;

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
      voiceId: "cgSgspJ2msm6clMCkdW9",
    },
    firstMessage:
      "Hi! I can pull live crypto news, give you the latest price and funding for an asset like BTC or ETH, or check what block Base is on. What do you want to know?",
  });

  console.log(`   ✅ Assistant created: ${assistant.name} (${assistant.id})`);

  console.log(`\n📞 Next steps:`);
  console.log(`   1. Start the server:  npx tsx server.ts`);
  console.log(`   2. In the Vapi dashboard, assign a phone number to assistant ${assistant.id}`);
  console.log(`   3. Call the number and ask a question!`);
  console.log(`\n   Or test via the Vapi web widget.`);
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
