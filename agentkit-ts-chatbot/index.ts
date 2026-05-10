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

const { PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY } = process.env;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
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
