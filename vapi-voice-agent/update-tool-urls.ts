import "dotenv/config";

const TOOL_IDS = [
  "ee607123-9a5e-474f-9bae-4476ac413949", // search_web
  "11159562-1368-49ee-9c6b-e5cf7d20e7f6", // get_news
  "292d5ef1-c49c-4eec-adfd-0240278b5f10", // ask_expert
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
