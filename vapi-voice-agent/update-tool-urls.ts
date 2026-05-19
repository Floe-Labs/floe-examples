/**
 * Patch the `server.url` of existing Vapi tools when your tunnel URL
 * (ngrok / production hostname) changes — without re-creating the
 * tools. Paste the IDs printed by `setup.ts` into TOOL_IDS below the
 * first time you provision the assistant, and re-run this script
 * whenever SERVER_URL changes.
 */
import "dotenv/config";

// Replace with the IDs printed by `npx tsx setup.ts`.
const TOOL_IDS = [
  "REPLACE_WITH_get_crypto_news_TOOL_ID",
  "REPLACE_WITH_get_market_price_TOOL_ID",
  "REPLACE_WITH_get_block_number_TOOL_ID",
];

const newUrl = `${process.env.SERVER_URL}/vapi/tool-call`;
const apiKey = process.env.VAPI_API_KEY!;

for (const id of TOOL_IDS) {
  const res = await fetch(`https://api.vapi.ai/tool/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ server: { url: newUrl } }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ ${id}: ${res.status} ${text}`);
  } else {
    console.log(`✅ ${id} → ${newUrl}`);
  }
}
