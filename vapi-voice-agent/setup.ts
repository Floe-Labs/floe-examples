/**
 * Vapi Assistant Setup
 *
 * Creates a Vapi voice assistant with three tools that call paid x402 APIs
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

const SYSTEM_PROMPT = `You are a helpful research assistant on a phone call. You have three tools:

1. search_web — Search the web for current information. Use this when the caller asks about recent events, facts, or anything you need to look up.
2. get_news — Get the latest news on a topic. Use this when the caller asks about news or current events.
3. ask_expert — Ask an AI expert a detailed question. Use this when the caller needs in-depth analysis or a complex explanation.

Keep your responses concise and conversational — you're on a phone call, not writing an essay.
When you use a tool, briefly tell the caller what you're doing ("Let me search for that..." or "Checking the latest news...").
Summarize tool results in 2-3 sentences max.`;

async function main() {
  console.log("🎙️  Creating Vapi assistant...\n");

  const toolCallUrl = `${SERVER_URL}/vapi/tool-call`;

  const assistant = await vapi.assistants.create({
    name: "Floe Research Assistant",
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: [
        {
          type: "function",
          function: {
            name: "search_web",
            description:
              "Search the web for current information. Returns web results as text.",
            parameters: {
              type: "object" as const,
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
              },
              required: ["query"],
            },
          },
          server: { url: toolCallUrl },
        },
        {
          type: "function",
          function: {
            name: "get_news",
            description:
              "Get the latest news headlines and summaries on a topic.",
            parameters: {
              type: "object" as const,
              properties: {
                topic: {
                  type: "string",
                  description: "The news topic to search for",
                },
              },
              required: ["topic"],
            },
          },
          server: { url: toolCallUrl },
        },
        {
          type: "function",
          function: {
            name: "ask_expert",
            description:
              "Ask an AI expert a detailed question for in-depth analysis.",
            parameters: {
              type: "object" as const,
              properties: {
                question: {
                  type: "string",
                  description: "The detailed question to ask the expert",
                },
              },
              required: ["question"],
            },
          },
          server: { url: toolCallUrl },
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: "cgSgspJ2msm6clMCkdW9",
    },
    firstMessage:
      "Hi! I'm a research assistant. I can search the web, check the latest news, or ask an AI expert for detailed analysis. What would you like to know?",
  });

  console.log("✅ Assistant created!\n");
  console.log(`   Name:         ${assistant.name}`);
  console.log(`   ID:           ${assistant.id}`);
  console.log(`   Tool webhook: ${toolCallUrl}`);
  console.log(`\n📞 Next steps:`);
  console.log(`   1. Start the server: npx tsx server.ts`);
  console.log(`   2. In the Vapi dashboard, assign a phone number to this assistant`);
  console.log(`   3. Call the number and ask a question!`);
  console.log(`\n   Or test via Vapi's web widget / API call.`);
  console.log(`\n💰 After the call, check your Floe spending:`);
  console.log(
    `   curl -H "Authorization: Bearer $FLOE_API_KEY" https://credit-api.floelabs.xyz/v1/agents/transactions`
  );
}

main().catch((err) => {
  console.error("Failed to create assistant:", err.message || err);
  process.exit(1);
});
