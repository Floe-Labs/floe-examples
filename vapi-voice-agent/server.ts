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
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
const PORT = parseInt(process.env.PORT || "3000", 10);
const FETCH_TIMEOUT_MS = 15_000;

if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env");
  process.exit(1);
}

// ── Tool → x402 endpoint mapping ──────────────────────────────────────

interface ToolEndpoint {
  url: string;
  method: string;
  requiredArgs: string[];
  buildBody: (args: Record<string, string>) => string;
}

const TOOL_ENDPOINTS: Record<string, ToolEndpoint> = {
  search_web: {
    url: "https://api.firecrawl.dev/v1/x402/search",
    method: "POST",
    requiredArgs: ["query"],
    buildBody: (args) => JSON.stringify({ query: args.query, limit: 3 }),
  },
  get_news: {
    url: "https://api.gloria.ai/v1/signals",
    method: "POST",
    requiredArgs: ["topic"],
    buildBody: (args) => JSON.stringify({ topic: args.topic, limit: 5 }),
  },
  ask_expert: {
    url: "https://askclaude.shop/api/ask",
    method: "POST",
    requiredArgs: ["question"],
    buildBody: (args) => JSON.stringify({ question: args.question, model: "haiku" }),
  },
};

// ── Floe proxy helper ──────────────────────────────────────────────────

async function callViaFloe(endpoint: ToolEndpoint, args: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      return `Error (${response.status}): ${error.slice(0, 200)}`;
    }

    const text = await response.text();
    return text.length > 2000 ? text.slice(0, 2000) + "..." : text;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Request validation ─────────────────────────────────────────────────

interface VapiToolCall {
  id: string;
  name: string;
  parameters: Record<string, string>;
}

interface VapiToolCallBody {
  message: {
    type: string;
    toolCallList: VapiToolCall[];
  };
}

function isValidBody(body: unknown): body is VapiToolCallBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!b.message || typeof b.message !== "object") return false;
  const msg = b.message as Record<string, unknown>;
  if (typeof msg.type !== "string" || !Array.isArray(msg.toolCallList)) return false;
  return true;
}

// ── Fastify server ─────────────────────────────────────────────────────

const app = Fastify({ logger: true });

// Vapi sends tool calls here
app.post("/vapi/tool-call", async (request, reply) => {
  // Authenticate — verify the request came from Vapi
  if (VAPI_SERVER_SECRET) {
    const authHeader = request.headers["x-vapi-secret"] || request.headers.authorization;
    const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    if (token !== VAPI_SERVER_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  }

  // Validate body structure
  if (!isValidBody(request.body)) {
    return { results: [] };
  }

  const { message } = request.body;
  if (message.type !== "tool-calls") {
    return { results: [] };
  }

  const results = [];

  for (const call of message.toolCallList) {
    const endpoint = TOOL_ENDPOINTS[call.name];

    if (!endpoint) {
      results.push({
        name: call.name,
        toolCallId: call.id,
        result: `Unknown tool: ${call.name}`,
      });
      continue;
    }

    // Validate required arguments
    const missing = endpoint.requiredArgs.filter((arg) => !call.parameters?.[arg]);
    if (missing.length > 0) {
      results.push({
        name: call.name,
        toolCallId: call.id,
        result: `Missing required arguments: ${missing.join(", ")}`,
      });
      continue;
    }

    // Call the x402 API through Floe (with error isolation)
    try {
      console.log(`🔧 Tool call: ${call.name}(${JSON.stringify(call.parameters)})`);
      const result = await callViaFloe(endpoint, call.parameters);
      console.log(`✅ Result: ${result.slice(0, 100)}...`);

      results.push({
        name: call.name,
        toolCallId: call.id,
        result,
      });
    } catch (err) {
      console.error(`❌ Tool ${call.name} failed:`, err);
      results.push({
        name: call.name,
        toolCallId: call.id,
        result: `Tool error: ${(err as Error).message || "unknown error"}`,
      });
    }
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
  console.log(`   Auth: ${VAPI_SERVER_SECRET ? "enabled (VAPI_SERVER_SECRET)" : "⚠️  disabled (set VAPI_SERVER_SECRET for production)"}`);
  console.log(`   Floe proxy: ${FLOE_PROXY}`);
  console.log(`\n   Tools available:`);
  for (const [name, ep] of Object.entries(TOOL_ENDPOINTS)) {
    console.log(`     ${name} → ${ep.url}`);
  }
});
