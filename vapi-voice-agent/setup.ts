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
// Wired into each tool's server config so Vapi authenticates its webhook calls
// (sent as the x-vapi-secret header). Without this the server 401s every tool call.
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
// USDC base units (6 decimals): 30000 = $0.03 ≈ 6 Exa searches — low enough to
// hit the hard-stop in a short demo call.
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "30000";
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
if (!VAPI_SERVER_SECRET) {
  console.error("Set VAPI_SERVER_SECRET in .env (the same value server.ts checks; wired into the tool so Vapi authenticates its webhook calls)");
  process.exit(1);
}

// The cap must be a positive integer (USDC base units) or we'd silently misconfigure
// the demo — fail fast with a clear message.
if (!/^\d+$/.test(FLOE_SPEND_LIMIT_RAW) || Number(FLOE_SPEND_LIMIT_RAW) <= 0) {
  console.error(
    `FLOE_SPEND_LIMIT_RAW must be a positive integer in USDC base units (e.g. 30000 = $0.03). Got: "${FLOE_SPEND_LIMIT_RAW}"`
  );
  process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_API_KEY });
const toolCallUrl = `${SERVER_URL}/vapi/tool-call`;
const spendCapUsd = Number(FLOE_SPEND_LIMIT_RAW) / 1e6;

const SYSTEM_PROMPT = `You are a friendly voice concierge on a phone call. When the caller asks something you don't already know — weather, business hours, recommendations, current events, facts — use search_web to look it up and answer conversationally. You have a limited lookup budget; each search costs money. As you approach your budget, be concise and search less. If a search is blocked because you've reached your budget, tell the caller plainly that you've hit your lookup budget for this call and can't search more. Do not retry.

Keep your responses concise and conversational — you're on a phone call, not writing an essay.
When you use a tool, briefly tell the caller what you're doing ("Let me look that up...").
Summarize search results in 2-3 sentences max.

BUDGET — read this carefully:
- You have a strict, limited spending budget for this call. Each paid lookup (every tool call) costs real money.
- After each tool call, the result includes a "[Floe budget: ...]" line showing how much of your budget you've used. Read it every time and let it guide you.
- As you approach your budget, taper off: give shorter answers, batch what the caller wants, and make fewer and only the most necessary paid lookups. Do not make a paid call just to be thorough.
- If a tool result says the payment was blocked because you reached your spending limit, STOP making paid lookups. Clearly tell the caller, in plain language, that you've hit your spending limit and cannot make any more paid lookups on this call. Do not retry the tool.`;

async function main() {
  console.log("🎙️  Setting up Vapi assistant...\n");

  // Step 0: Set the Floe session spend-limit FIRST and FAIL CLOSED. This is the
  // hard cap the whole demo is about — if we can't set it, abort before creating
  // any Vapi resources so we never run an uncapped "spend-governed" agent.
  console.log(`💵 Setting Floe session spend-limit...`);
  try {
    const res = await fetch(`${FLOE_CREDIT_API}/v1/agents/spend-limit`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${FLOE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limitRaw: FLOE_SPEND_LIMIT_RAW }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`   ❌ Could not set spend-limit (${res.status}): ${body.slice(0, 200)}`);
      console.error(`      Aborting — refusing to create an uncapped agent. Check FLOE_API_KEY and that the agent is funded, then re-run.`);
      process.exit(1);
    }
    console.log(
      `   ✅ Spend-limit set: ${FLOE_SPEND_LIMIT_RAW} base units = $${spendCapUsd.toFixed(3)} for this session\n`
    );
  } catch (err) {
    console.error(`   ❌ Spend-limit request failed: ${(err as Error).message}`);
    console.error(`      Aborting — refusing to create an uncapped agent. Is credit-api reachable? Then re-run.`);
    process.exit(1);
  }

  // Step 1: Create the web-search tool
  console.log("📦 Creating tools...");

  const searchWebTool = await vapi.tools.create({
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live web for an answer (Exa, paid via Floe). Use for anything you don't already know — weather, business hours, recommendations, current events, facts. Pass the caller's question as the query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search the web for (the caller's question)." },
        },
        required: ["query"],
      },
    },
    server: { url: toolCallUrl, headers: { "x-vapi-secret": VAPI_SERVER_SECRET } },
  });
  console.log(`   ✅ search_web (${searchWebTool.id})`);

  // Step 2: Create assistant with the tool attached
  console.log("\n🤖 Creating assistant...");

  const assistant = await vapi.assistants.create({
    name: "Floe Web Concierge",
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      toolIds: [searchWebTool.id],
    },
    voice: {
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9", // ElevenLabs "Jessica" — swap for any voiceId from the ElevenLabs library
    },
    firstMessage:
      "Hi! I'm your concierge — ask me anything and I'll look it up for you. What can I help with?",
  });

  console.log(`   ✅ Assistant created: ${assistant.name} (${assistant.id})`);

  console.log(`\n📝 Add this to your .env so the outbound call and budget logic can use it:`);
  console.log(`   VAPI_ASSISTANT_ID=${assistant.id}`);

  console.log(`\n📞 Next steps:`);
  console.log(`   1. Start the server:  npx tsx server.ts   (keep ngrok pointed at it)`);
  console.log(`   2. Set VAPI_PHONE_NUMBER_ID and TARGET_PHONE_NUMBER (+1...) in .env`);
  console.log(`   3. Place the outbound call: npx tsx call.ts   (the agent calls TARGET_PHONE_NUMBER)`);
  console.log(`   (Optional) web widget: open http://localhost:${process.env.PORT || "3000"}/ — needs VAPI_PUBLIC_KEY.`);
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
