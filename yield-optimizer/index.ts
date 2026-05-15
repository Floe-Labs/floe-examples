/**
 * Yield Optimizer Example (self-custody variant)
 *
 * ⚠️  Signs from PRIVATE_KEY. For the managed-wallet path (no key in env),
 *     see https://floe-labs.gitbook.io/docs/getting-started/quickstart.
 *
 * Borrows USDC against WETH collateral, holds for yield strategy,
 * then repays before maturity. Demonstrates: instant_borrow,
 * check_credit_status, repay_credit.
 */
import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider } from "floe-agent";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, chain: base, transport: http(process.env.RPC_URL) });

async function main() {
  console.log("🚀 Yield Optimizer starting...");
  console.log(`   Wallet: ${account.address}`);

  // 1. Check available lending offers
  console.log("\n📊 Checking market rates...");
  // In a real agent, you'd call get_markets and request_credit here

  // 2. Borrow USDC
  console.log("\n💰 Borrowing 1,000 USDC against 0.5 WETH...");
  console.log("   → Call: instant_borrow({ borrowAmount: '1000000000', collateralAmount: '500000000000000000', maxInterestRateBps: '800', duration: '1209600' })");

  // 3. Deploy to yield strategy (your custom logic here)
  console.log("\n📈 Deploying USDC to yield strategy...");
  console.log("   → Your strategy logic goes here");

  // 4. Monitor loan health
  console.log("\n🏥 Checking loan health...");
  console.log("   → Call: check_credit_status({ loanId: '...' })");

  // 5. Repay before maturity
  console.log("\n💸 Repaying loan...");
  console.log("   → Call: repay_credit({ loanId: '...' })");

  console.log("\n✅ Done! Collateral returned automatically.");
}

main().catch(console.error);
