/**
 * Place an OUTBOUND call — the agent calls the user.
 *
 * The webhook server (server.ts) must already be running and reachable at
 * SERVER_URL (e.g. via ngrok), because tool calls during the call still hit
 * SERVER_URL/vapi/tool-call. This script only STARTS the call.
 *
 * Usage:
 *   npx tsx call.ts
 *
 * Requires in .env:
 *   VAPI_API_KEY         private Vapi key
 *   VAPI_ASSISTANT_ID    printed by setup.ts
 *   VAPI_PHONE_NUMBER_ID the Vapi number to call FROM (optional — falls back to your first number)
 *   TARGET_PHONE_NUMBER  the user's cell to call, E.164 (e.g. +14155551234)
 */
import { VapiClient } from "@vapi-ai/server-sdk";
import "dotenv/config";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
let VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "";
const TARGET_PHONE_NUMBER = process.env.TARGET_PHONE_NUMBER;

if (!VAPI_API_KEY) {
  console.error("Set VAPI_API_KEY in .env");
  process.exit(1);
}
if (!VAPI_ASSISTANT_ID) {
  console.error("Set VAPI_ASSISTANT_ID in .env (run setup.ts first — it prints the id)");
  process.exit(1);
}
if (!TARGET_PHONE_NUMBER) {
  console.error("Set TARGET_PHONE_NUMBER in .env (the user's cell, E.164 like +14155551234)");
  process.exit(1);
}
if (!/^\+[1-9]\d{6,14}$/.test(TARGET_PHONE_NUMBER)) {
  console.error(`TARGET_PHONE_NUMBER must be E.164 (e.g. +14155551234). Got: "${TARGET_PHONE_NUMBER}"`);
  process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_API_KEY });

async function main() {
  // Resolve the FROM number. If none is configured, use the account's first one.
  if (!VAPI_PHONE_NUMBER_ID) {
    console.log("ℹ️  VAPI_PHONE_NUMBER_ID is empty — looking up your Vapi phone numbers...");
    const numbers = await vapi.phoneNumbers.list();
    if (!numbers || numbers.length === 0) {
      console.error("❌ No phone numbers on this Vapi account.");
      console.error("   Create or import one in the Vapi dashboard (Phone Numbers), then set");
      console.error("   VAPI_PHONE_NUMBER_ID in .env (or re-run and we'll pick the first one).");
      process.exit(1);
    }
    const first = numbers[0];
    VAPI_PHONE_NUMBER_ID = first.id;
    console.log(`   Using first number: ${first.number ?? first.name ?? "(unnamed)"} (${first.id})`);
  }

  console.log(`📞 Placing outbound call → ${TARGET_PHONE_NUMBER} ...`);
  const result = await vapi.calls.create({
    assistantId: VAPI_ASSISTANT_ID,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: { number: TARGET_PHONE_NUMBER },
  });

  // calls.create returns a single Call or a batch response — pull the id from either.
  const callId =
    "id" in result ? result.id : result.results?.[0]?.id;

  console.log(`   ✅ Call started. Call id: ${callId ?? "(unknown)"}`);
  console.log(`\n🎧 Fetch the recording/transcript afterward:`);
  console.log(`   curl -H "Authorization: Bearer $VAPI_API_KEY" https://api.vapi.ai/call/${callId ?? "<call-id>"}`);
  console.log(`\n💰 Then check Floe spending:`);
  console.log(`   curl -H "Authorization: Bearer $FLOE_API_KEY" https://credit-api.floelabs.xyz/v1/agents/transactions?limit=10`);
}

main().catch((err) => {
  console.error("❌ Outbound call failed:", err.message || err);
  process.exit(1);
});
