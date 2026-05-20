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
const FLOE_PROXY = process.env.FLOE_PROXY_URL || "https://credit-api.floelabs.xyz/v1/proxy/fetch";
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
const PORT = parseInt(process.env.PORT || "3000", 10);
const FETCH_TIMEOUT_MS = 15_000;
const DEBUG = process.env.DEBUG === "1";

if (!FLOE_API_KEY) {
  console.error("Set FLOE_API_KEY in .env");
  process.exit(1);
}
if (!VAPI_SERVER_SECRET) {
  console.error("Set VAPI_SERVER_SECRET in .env (required to authenticate Vapi webhooks)");
  process.exit(1);
}

// ── Tool → x402 endpoint mapping ──────────────────────────────────────

interface ToolEndpoint {
  buildUrl: (args: Record<string, string>) => string;
  method: string;
  requiredArgs: string[];
  buildBody: (args: Record<string, string>) => string;
}

// All endpoints are listed on the x402 Bazaar (Coinbase CDP facilitator)
// and settle reliably through Floe's proxy. $0.001–$0.003 per call on Base mainnet.
const TOOL_ENDPOINTS: Record<string, ToolEndpoint> = {
  get_crypto_news: {
    buildUrl: () => "https://x402.ottoai.services/crypto-news",
    method: "GET",
    requiredArgs: [],
    buildBody: () => "",
  },
  get_market_price: {
    // Live mark/oracle price, funding rate, OI for any Hyperliquid asset
    // (BTC, ETH, SOL, etc.). $0.001 per call.
    buildUrl: (args) =>
      `https://x402.ottoai.services/hyperliquid-market?asset=${encodeURIComponent(args.asset)}`,
    method: "GET",
    requiredArgs: ["asset"],
    buildBody: () => "",
  },
  get_block_number: {
    // Current Base mainnet block height via eth_blockNumber. $0.001 per call.
    buildUrl: () => "https://skills.onesource.io/api/chain/block-number",
    method: "GET",
    requiredArgs: [],
    buildBody: () => "",
  },
};

// ── Floe proxy helper ──────────────────────────────────────────────────

async function callViaFloe(endpoint: ToolEndpoint, args: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const proxyPayload: Record<string, unknown> = {
      url: endpoint.buildUrl(args),
      method: endpoint.method,
      headers: { "Content-Type": "application/json" },
    };
    if (endpoint.method !== "GET" && endpoint.method !== "HEAD") {
      proxyPayload.body = endpoint.buildBody(args);
    }

    const response = await fetch(FLOE_PROXY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLOE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(proxyPayload),
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
  function: {
    name: string;
    arguments: Record<string, string> | string;
  };
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
  const authHeader = request.headers["x-vapi-secret"] || request.headers.authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (token !== VAPI_SERVER_SECRET) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Log incoming Vapi payload shape — gated behind DEBUG=1 (loud per request)
  if (DEBUG) {
    const body = request.body as any;
    const msgType = body?.message?.type ?? "<no message.type>";
    const hasToolCallList = Array.isArray(body?.message?.toolCallList);
    const hasToolCalls = Array.isArray(body?.message?.toolCalls);
    console.log(`📨 Incoming Vapi webhook: message.type="${msgType}" toolCallList=${hasToolCallList} toolCalls=${hasToolCalls}`);
    if (msgType === "tool-calls" || hasToolCalls || hasToolCallList) {
      console.log("   Full message:", JSON.stringify(body.message, null, 2).slice(0, 1500));
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
    const name = call.function?.name;
    const args =
      typeof call.function?.arguments === "string"
        ? (() => {
            try { return JSON.parse(call.function.arguments as string); } catch { return {}; }
          })()
        : (call.function?.arguments as Record<string, string>) || {};

    const endpoint = TOOL_ENDPOINTS[name];

    if (!endpoint) {
      results.push({
        name,
        toolCallId: call.id,
        result: `Unknown tool: ${name}`,
      });
      continue;
    }

    // Validate required arguments
    const missing = endpoint.requiredArgs.filter((arg) => !args[arg]);
    if (missing.length > 0) {
      results.push({
        name,
        toolCallId: call.id,
        result: `Missing required arguments: ${missing.join(", ")}`,
      });
      continue;
    }

    // Call the x402 API through Floe (with error isolation)
    try {
      console.log(`🔧 Tool call: name=${name} id=${call.id} args=${JSON.stringify(args)}`);
      const result = await callViaFloe(endpoint, args);
      console.log(`✅ Tool success: name=${name} id=${call.id} chars=${result.length}`);
      console.log(`   Result preview: ${result.slice(0, 400)}`);

      results.push({
        name,
        toolCallId: call.id,
        result,
      });
    } catch (err) {
      console.error(`❌ Tool failed: name=${name} id=${call.id}`, (err as Error).message);
      results.push({
        name,
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
  console.log(`   Auth: enabled (VAPI_SERVER_SECRET)`);
  console.log(`   Floe proxy: ${FLOE_PROXY}`);
  console.log(`\n   Tools available:`);
  for (const [name, ep] of Object.entries(TOOL_ENDPOINTS)) {
    const sampleArgs = Object.fromEntries(ep.requiredArgs.map((a) => [a, "<arg>"]));
    console.log(`     ${name} → ${ep.method} ${ep.buildUrl(sampleArgs)}`);
  }
});
