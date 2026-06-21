/**
 * Patch the `server.url` of existing Vapi tools when your tunnel URL
 * (ngrok / production hostname) changes — without re-creating the
 * tools. Paste the IDs printed by `setup.ts` into TOOL_IDS below the
 * first time you provision the assistant, and re-run this script
 * whenever SERVER_URL changes.
 *
 * See README.md → "When your ngrok URL changes" for the full workflow.
 */
import "dotenv/config";

// Replace with the ID printed by `npx tsx setup.ts`.
const TOOL_IDS = [
  "REPLACE_WITH_search_web_TOOL_ID",
];

const serverUrl = process.env.SERVER_URL?.replace(/\/+$/, "");
const apiKey = process.env.VAPI_API_KEY;
const serverSecret = process.env.VAPI_SERVER_SECRET;

if (!serverUrl) {
  console.error("Set SERVER_URL in .env");
  process.exit(1);
}
if (!apiKey) {
  console.error("Set VAPI_API_KEY in .env");
  process.exit(1);
}
if (!serverSecret) {
  console.error("Set VAPI_SERVER_SECRET in .env (re-sent with the URL so the webhook stays authenticated)");
  process.exit(1);
}
if (TOOL_IDS.some((id) => id.startsWith("REPLACE_WITH_"))) {
  console.error("Replace TOOL_IDS placeholders with real Vapi tool IDs from `npx tsx setup.ts` output.");
  process.exit(1);
}

const newUrl = `${serverUrl}/vapi/tool-call`;

for (const id of TOOL_IDS) {
  const res = await fetch(`https://api.vapi.ai/tool/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Re-send the secret header too — PATCHing `server` replaces it wholesale,
    // so omitting headers here would drop auth and 401 every webhook.
    body: JSON.stringify({ server: { url: newUrl, headers: { "x-vapi-secret": serverSecret } } }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ ${id}: ${res.status} ${text}`);
  } else {
    console.log(`✅ ${id} → ${newUrl}`);
  }
}
