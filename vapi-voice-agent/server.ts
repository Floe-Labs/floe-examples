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
import { readFileSync } from "node:fs";
import "dotenv/config";

const FLOE_API_KEY = process.env.FLOE_API_KEY;
const FLOE_PROXY = process.env.FLOE_PROXY_URL || "https://credit-api.floelabs.xyz/v1/proxy/fetch";
const VAPI_SERVER_SECRET = process.env.VAPI_SERVER_SECRET;
// Public Vapi key + assistant id are served to the browser widget via GET /config.
// The public key is designed to live in client code; the private VAPI_API_KEY never leaves setup.ts.
const VAPI_PUBLIC_KEY = process.env.VAPI_PUBLIC_KEY || "";
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "";
// Session spend cap, mirrored from setup.ts so the budget line the model reads matches the real cap.
const FLOE_SPEND_LIMIT_RAW = process.env.FLOE_SPEND_LIMIT_RAW || "50000";
const SPEND_CAP_USD = Number(FLOE_SPEND_LIMIT_RAW) / 1e6;
const PORT = parseInt(process.env.PORT || "3000", 10);
const FETCH_TIMEOUT_MS = 15_000;
const DEBUG = process.env.DEBUG === "1";

// In-process cumulative spend for THIS server run. This is not the enforcer (Floe's
// session spend-limit is) — it just lets us show the model how much budget it has used
// so it can taper. Resets when the server restarts.
let cumulativeSpendUsd = 0;

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

// Budget advisory header is a JSON string, flag-gated server-side (may be absent).
// Shape is not guaranteed — read fields defensively.
interface BudgetAdvisory {
  near_limit?: boolean;
  usedBps?: number;
  remaining?: string | number;
  [key: string]: unknown;
}

interface FloeCallResult {
  blocked: boolean; // proxy denied the paid call (e.g. spend-limit reached)
  status: number;
  text: string; // upstream body (truncated) on success, or error snippet
  costUsd: number | null; // from X-Floe-Cost-USDC, if present
  advisory: BudgetAdvisory | null; // from X-Floe-Budget-Advisory, if present
}

async function callViaFloe(
  endpoint: ToolEndpoint,
  args: Record<string, string>
): Promise<FloeCallResult> {
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

    // Cost is returned on every settled call. Budget advisory is flag-gated (may be absent).
    const costHeader = response.headers.get("X-Floe-Cost-USDC");
    const costUsd = costHeader !== null && costHeader !== "" ? Number(costHeader) : null;

    let advisory: BudgetAdvisory | null = null;
    const advisoryHeader = response.headers.get("X-Floe-Budget-Advisory");
    if (advisoryHeader) {
      try {
        advisory = JSON.parse(advisoryHeader) as BudgetAdvisory;
      } catch {
        advisory = null; // malformed advisory — ignore, fall back to cumulative tracking
      }
    }

    // Any non-OK proxy response = the paid call was denied (spend-limit reached,
    // policy block, etc.). Treat it uniformly as "payment blocked".
    if (!response.ok) {
      const error = await response.text();
      return {
        blocked: true,
        status: response.status,
        text: error.slice(0, 200),
        costUsd: null, // a blocked call is not charged
        advisory,
      };
    }

    const body = await response.text();
    return {
      blocked: false,
      status: response.status,
      text: body.length > 2000 ? body.slice(0, 2000) + "..." : body,
      costUsd: Number.isFinite(costUsd as number) ? costUsd : null,
      advisory,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Build the short budget line appended to each successful tool result so the model
// "sees" its remaining budget and can taper. Prefers the proxy's near-limit advisory
// signal when present; otherwise derives proximity from cumulative spend vs the cap.
function budgetLine(advisory: BudgetAdvisory | null): string {
  const used = cumulativeSpendUsd.toFixed(3);
  const cap = SPEND_CAP_USD.toFixed(3);

  let nearLimit = SPEND_CAP_USD > 0 && cumulativeSpendUsd >= SPEND_CAP_USD * 0.8;
  if (advisory) {
    if (typeof advisory.near_limit === "boolean") {
      nearLimit = advisory.near_limit;
    } else if (typeof advisory.usedBps === "number") {
      nearLimit = advisory.usedBps >= 8000; // >= 80%
    }
  }

  const note = nearLimit
    ? "approaching limit — keep answers short and make fewer paid lookups"
    : "on track";
  return `\n\n[Floe budget: $${used} of $${cap} used — ${note}]`;
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
    const parsedArgs =
      typeof call.function?.arguments === "string"
        ? (() => {
            try { return JSON.parse(call.function.arguments as string); } catch { return {}; }
          })()
        : call.function?.arguments;
    // Normalize: JSON.parse can yield null/primitives/arrays — coerce anything
    // that isn't a plain object back to {} so the validation loop never throws.
    const args: Record<string, string> =
      parsedArgs && typeof parsedArgs === "object" && !Array.isArray(parsedArgs)
        ? (parsedArgs as Record<string, string>)
        : {};

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
      console.log(`🔧 Tool: ${name} (${call.id})`);
      const call_ = await callViaFloe(endpoint, args);

      // Blocked = the paid call was denied (spend-limit reached / policy block).
      // Return a hard-stop instruction so the model audibly tells the caller.
      if (call_.blocked) {
        console.log(
          `🛑 Tool: ${name} (${call.id}) BLOCKED status=${call_.status} (spend-limit reached?)`
        );
        results.push({
          name,
          toolCallId: call.id,
          result:
            `Payment blocked — the agent has reached its Floe spending limit ` +
            `($${SPEND_CAP_USD.toFixed(3)}). Tell the caller you've hit your budget ` +
            `and cannot make any more paid lookups on this call.`,
        });
        continue;
      }

      // Settled call: add its cost to the running total, then append the budget line
      // so the model sees how much it has spent and can taper.
      if (call_.costUsd !== null) {
        cumulativeSpendUsd += call_.costUsd;
      }
      const result = call_.text + budgetLine(call_.advisory);

      console.log(
        `✅ Tool: ${name} (${call.id}) chars=${call_.text.length} ` +
          `cost=${call_.costUsd ?? "?"} cumulative=$${cumulativeSpendUsd.toFixed(3)}/$${SPEND_CAP_USD.toFixed(3)}`
      );
      if (DEBUG) {
        console.log(`   args=${JSON.stringify(args)}`);
        console.log(`   advisory=${JSON.stringify(call_.advisory)}`);
        console.log(`   Result preview: ${result.slice(0, 400)}`);
      }

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

// ── Web widget ───────────────────────────────────────────────────────────
// Serves the browser surface (alongside the phone path). The page calls the
// Vapi web SDK with the PUBLIC key and assistant id, both fetched from /config.

// Config for the browser widget — only the PUBLIC key + assistant id (both safe
// in client code). The private VAPI_API_KEY is never exposed here.
app.get("/config", async () => ({
  publicKey: VAPI_PUBLIC_KEY,
  assistantId: VAPI_ASSISTANT_ID,
}));

// Serve the widget page. Read lazily so a missing file doesn't crash the server.
app.get("/", async (_request, reply) => {
  try {
    const html = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
    return reply.type("text/html").send(html);
  } catch {
    return reply.status(404).send("Web widget not found (public/index.html missing).");
  }
});

// Start
app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`\n🎙️  Vapi webhook server running on port ${PORT}`);
  console.log(`   Tool-call endpoint: POST /vapi/tool-call`);
  console.log(`   Web widget:         GET  /  (config at GET /config)`);
  console.log(`   Auth: enabled (VAPI_SERVER_SECRET)`);
  console.log(`   Floe proxy: ${FLOE_PROXY}`);
  console.log(`   Spend cap (budget line): $${SPEND_CAP_USD.toFixed(3)} (${FLOE_SPEND_LIMIT_RAW} base units)`);
  if (!VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID) {
    console.log(`   ⚠️  Web widget needs VAPI_PUBLIC_KEY + VAPI_ASSISTANT_ID in .env to connect.`);
  }
  console.log(`\n   Tools available:`);
  for (const [name, ep] of Object.entries(TOOL_ENDPOINTS)) {
    const sampleArgs = Object.fromEntries(ep.requiredArgs.map((a) => [a, "<arg>"]));
    console.log(`     ${name} → ${ep.method} ${ep.buildUrl(sampleArgs)}`);
  }
});
