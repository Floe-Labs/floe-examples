/**
 * x402 Client Example
 *
 * Delegates credit to the Floe facilitator, then calls x402 APIs
 * without managing payments. Gas-free.
 * Demonstrates: grant_credit_delegation, x402_fetch, x402_get_balance.
 */
import { AgentKit } from "@coinbase/agentkit";
import { floeActionProvider, x402ActionProvider } from "floe-agent";

async function main() {
  console.log("🔐 x402 Client starting...");

  // 1. One-time setup: delegate credit to facilitator
  console.log("\n🤝 Delegating credit...");
  console.log("   → Call: grant_credit_delegation({");
  console.log("       facilitator_url: 'https://credit-api.floelabs.xyz',");
  console.log("       facilitator_address: '0x58EDdE022FFDAD3Fb0Fb0E7D51eb05AaF66a31f1',");
  console.log("       borrow_limit: '10000',");
  console.log("       max_rate_bps: 1500,");
  console.log("       expiry_days: 90");
  console.log("     })");

  // 2. Call any x402 API — payment is automatic
  console.log("\n🌐 Fetching from x402 API...");
  console.log("   → Call: x402_fetch({ url: 'https://api.example.com/premium/data' })");

  // 3. Check balance
  console.log("\n💰 Checking credit balance...");
  console.log("   → Call: x402_get_balance()");

  console.log("\n✅ Agent never touched USDC directly. Floe handled everything.");
}

main().catch(console.error);
