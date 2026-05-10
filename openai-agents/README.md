# openai-agents (Preview)

Floe + the **OpenAI Agents SDK**.

> **Status: `Preview`.** A native `floe-agent` adapter for the OpenAI Agents SDK is on the way. Until it ships, the supported integration path is **MCP fallback** — the OpenAI Agents SDK speaks MCP and connects directly to [`@floelabs/mcp-server`](https://github.com/Floe-Labs/floe-mcp-server).

## How to use Floe with OpenAI Agents today

1. Get a Floe API key from [dev-dashboard.floelabs.xyz](https://dev-dashboard.floelabs.xyz).
2. Add the Floe MCP server to your OpenAI Agents config:

   ```json
   {
     "mcpServers": {
       "floe": {
         "url": "https://mcp.floelabs.xyz/mcp",
         "headers": {
           "Authorization": "Bearer floe_live_YOUR_API_KEY"
         }
       }
     }
   }
   ```

3. Your OpenAI agent now has access to all 36 Floe MCP tools — wallet, secured working capital, x402 preflight, credit thresholds.

A runnable script will land here once the native adapter is published. To get notified, email [hello@floelabs.xyz](mailto:hello@floelabs.xyz) or follow [@FloeLabs](https://x.com/FloeLabs).

## Components covered (via MCP today)

- 01 Agent Wallet (`GA`)
- 03 Secured working capital (`GA`)
- 05 x402 payment facilitator (`GA`, preflight)
- 06 Credit & trust bureau (`Beta`, thresholds)
