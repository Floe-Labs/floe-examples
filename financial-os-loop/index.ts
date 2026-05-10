import "dotenv/config";
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const { PRIVATE_KEY, BASE_RPC_URL, FLOE_API_KEY, X402_TARGET_URL } = process.env;

if (!PRIVATE_KEY || !BASE_RPC_URL || !FLOE_API_KEY || !X402_TARGET_URL) {
  console.error("Missing env. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

async function main() {
  // [1/6] Setup: wallet + agent identity
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });
  const walletProvider = new ViemWalletProvider(walletClient);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [floeActionProvider({ facilitatorApiKey: FLOE_API_KEY })],
  });

  console.log(`[1/6] Registering agent + wallet ... ${account.address}`);

  // [2/6] Fund: surface a fiat on-ramp deep link the operator can hand off
  const onramp = `https://dev-dashboard.floelabs.xyz/onramp?agent=${account.address}`;
  console.log(`[2/6] On-ramp link: ${onramp}`);

  // [3/6] Borrow: instant_borrow against on-chain collateral
  const borrow = await agentkit.run("instant_borrow", {
    borrowAmount: "5000000",        // 5 USDC (6 decimals)
    collateralAmount: "6000000",    // 6 USDC collateral
    maxInterestRateBps: "1200",     // 12% APR ceiling
    duration: "604800",             // 7 days
  });
  console.log(`[3/6] instant_borrow ... loanId=${(borrow as any).loanId}`);

  // [4/6] Spend: preflight then x402_fetch
  const preflight = await agentkit.run("estimate_x402_cost", { url: X402_TARGET_URL });
  console.log(`      estimate_x402_cost ... cost=${(preflight as any).cost} willExceed=${(preflight as any).willExceedAvailable}`);

  const fetched = await agentkit.run("x402_fetch", {
    url: X402_TARGET_URL,
    method: "GET",
  });
  console.log(`[4/6] x402_fetch ${X402_TARGET_URL} ... ${(fetched as any).status}`);

  // [5/6] Repay: collateral auto-returns
  await agentkit.run("repay_loan", { loanId: (borrow as any).loanId });
  console.log(`[5/6] repay_loan ${(borrow as any).loanId} ... repaid, collateral returned`);

  // [6/6] Trust: register a credit utilization threshold for future loans
  const threshold = await agentkit.run("register_credit_threshold", {
    utilizationBps: "8000",         // 80% utilization
    webhookUrl: "https://example.com/floe-webhook",
  });
  console.log(`[6/6] register_credit_threshold at 80% ... thresholdId=${(threshold as any).thresholdId}`);

  console.log("\nFinancial OS loop complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
