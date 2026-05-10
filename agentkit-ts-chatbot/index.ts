import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { floeActionProvider } from "floe-agent";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const REQUIRED_ENV = ["PRIVATE_KEY", "BASE_RPC_URL", "FLOE_API_KEY", "OPENAI_API_KEY"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `Missing required env: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`,
  );
  process.exit(1);
}

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
  console.error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  process.exit(1);
}
const BASE_RPC_URL = process.env.BASE_RPC_URL as string;
const FLOE_API_KEY = process.env.FLOE_API_KEY as string;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });
  const walletProvider = new ViemWalletProvider(walletClient);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [floeActionProvider({ facilitatorApiKey: FLOE_API_KEY })],
  });
  const tools = await getVercelAITools(agentkit);

  const rl = readline.createInterface({ input, output });
  console.log(`Floe chatbot ready as ${account.address}. Ask me to borrow, pay an x402 API, or repay.`);

  const history: { role: "user" | "assistant"; content: string }[] = [];
  while (true) {
    const user = (await rl.question("You: ")).trim();
    if (!user || user === "exit") break;
    history.push({ role: "user", content: user });
    const { text } = await generateText({
      model: openai("gpt-4o"),
      tools,
      maxSteps: 10,
      messages: history,
    });
    history.push({ role: "assistant", content: text });
    console.log(`Agent: ${text}\n`);
  }
  rl.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
