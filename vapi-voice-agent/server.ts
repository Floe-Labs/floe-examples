/**
 * Vapi + Floe Webhook Server
 *
 * Receives tool-call webhooks from Vapi and routes them through
 * Floe's x402 proxy. All paid API calls go through one credit line.
 *
 * Usage:
 *   cp .env.example .env   # fill in keys
 *   npm install
 *   npx tsx server.ts
 */
import Fastify from "fastify";
import "dotenv/config";

const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_PROXY = "https://credit-api.floelabs.xyz/v1/proxy/fetch";
const PORT = parseInt(process.env.PORT || "3000");

if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env");
  process.exit(1);
}

// ── Tool → x402 endpoint mapping ──────────────────────────────────────
// Each tool the voice agent can call maps to a paid x402 API.
// Floe's proxy handles payment automatically.

interface ToolEndpoint {
  url: string;
  method: string;
  buildBody: (args: Record<string, string>) => string;
}

const TOOL_ENDPOINTS: Record<string, ToolEndpoint> = {
  search_web: {
    url: "https://api.firecrawl.dev/v1/x402/search",
    method: "POST",
    buildBody: (args) => JSON.stringify({ query: args.query, limit: 3 }),
  },
  get_news: {
    url: "https://api.gloria.ai/v1/signals",
    method: "POST",
    buildBody: (args) => JSON.stringify({ topic: args.topic, limit: 5 }),
  },
  ask_expert: {
    url: "https://askclaude.shop/api/ask",
    method: "POST",
    buildBody: (args) => JSON.stringify({ question: args.question, model: "haiku" }),
  },
};

// ── Floe proxy helper ──────────────────────────────────────────────────

async function callViaFloe(endpoint: ToolEndpoint, args: Record<string, string>): Promise<string> {
  const response = await fetch(FLOE_PROXY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLOE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: endpoint.url,
      method: endpoint.method,
      headers: { "Content-Type": "application/json" },
      body: endpoint.buildBody(args),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return `Error (${response.status}): ${error.slice(0, 200)}`;
  }

  const text = await response.text();
  // Truncate for voice — the LLM will summarize
  return text.length > 2000 ? text.slice(0, 2000) + "..." : text;
}

// ── Fastify server ─────────────────────────────────────────────────────

const app = Fastify({ logger: true });

// Vapi sends tool calls here
app.post("/vapi/tool-call", async (request) => {
  const body = request.body as {
    message: {
      type: string;
      toolCallList: Array<{
        id: string;
        name: string;
        parameters: Record<string, string>;
      }>;
    };
  };

  if (body.message?.type !== "tool-calls") {
    return { results: [] };
  }

  const results = [];

  for (const call of body.message.toolCallList) {
    const endpoint = TOOL_ENDPOINTS[call.name];

    if (!endpoint) {
      results.push({
        name: call.name,
        toolCallId: call.id,
        result: `Unknown tool: ${call.name}`,
      });
      continue;
    }

    console.log(`🔧 Tool call: ${call.name}(${JSON.stringify(call.parameters)})`);
    const result = await callViaFloe(endpoint, call.parameters);
    console.log(`✅ Result: ${result.slice(0, 100)}...`);

    results.push({
      name: call.name,
      toolCallId: call.id,
      result,
    });
  }

  return { results };
});

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Start
app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`\n🎙️  Vapi webhook server running on port ${PORT}`);
  console.log(`   Tool-call endpoint: POST /vapi/tool-call`);
  console.log(`   Floe proxy: ${FLOE_PROXY}`);
  console.log(`\n   Tools available:`);
  for (const [name, ep] of Object.entries(TOOL_ENDPOINTS)) {
    console.log(`     ${name} → ${ep.url}`);
  }
  console.log(`\n   Make sure Vapi can reach this server (use ngrok for local dev)`);
});
