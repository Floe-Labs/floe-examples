// financial-os-loop (self-custody variant)
//
// ⚠️  Self-custody example — signs every transaction from PRIVATE_KEY. Most
//     agents should use the managed-wallet flow instead (no key in env, no
//     gas to manage): https://floe-labs.gitbook.io/docs/getting-started/quickstart
//     Pick this path if you hold signing keys in your own HSM/KMS or are
//     integrating with an existing wallet stack.

import "dotenv/config";
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const REQUIRED_ENV = ["PRIVATE_KEY", "BASE_RPC_URL", "FLOE_API_KEY", "X402_TARGET_URL"] as const;
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
const X402_TARGET_URL = process.env.X402_TARGET_URL as string;

const chain = (process.env.BASE_NETWORK ?? "mainnet").toLowerCase() === "sepolia" ? baseSepolia : base;

async function main() {
  // [1/6] Setup: wallet + agent identity
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({ account, chain, transport: http(BASE_RPC_URL) });
  const walletProvider = new ViemWalletProvider(walletClient);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [floeActionProvider({ facilitatorApiKey: FLOE_API_KEY })],
  });

  console.log(`[1/6] Registering agent + wallet ... ${account.address} (chain=${chain.name})`);

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
  const loanId = (borrow as any).loanId;
  console.log(`[3/6] instant_borrow ... loanId=${loanId}`);

  // Any failure after this point must still attempt repayment, otherwise we strand an open loan.
  try {
    // [4/6] Spend: preflight then x402_fetch (skip fetch if preflight says we'd exceed available credit)
    const preflight = await agentkit.run("estimate_x402_cost", { url: X402_TARGET_URL });
    const cost = (preflight as any).cost;
    const willExceed = (preflight as any).willExceedAvailable;
    console.log(`      estimate_x402_cost ... cost=${cost} willExceed=${willExceed}`);

    if (willExceed) {
      console.warn("      preflight indicates insufficient credit — skipping x402_fetch.");
    } else {
      const fetched = await agentkit.run("x402_fetch", { url: X402_TARGET_URL, method: "GET" });
      console.log(`[4/6] x402_fetch ${X402_TARGET_URL} ... ${(fetched as any).status}`);
    }
  } finally {
    // [5/6] Repay: collateral auto-returns. Always attempt, even if the spend step threw.
    try {
      await agentkit.run("repay_loan", { loanId });
      console.log(`[5/6] repay_loan ${loanId} ... repaid, collateral returned`);
    } catch (err) {
      console.error(`[5/6] repay_loan ${loanId} FAILED — investigate immediately:`, err);
      throw err;
    }
  }

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
