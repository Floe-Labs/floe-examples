# MCP Demo

Connect Claude Desktop (or Cursor) to Floe in one line. Zero install.

## Setup

Copy `claude-config.json` into your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Then restart Claude Desktop.

## Try it

Ask Claude:
- "What lending markets does Floe have?"
- "What's the current flash loan fee?"
- "Show me open lend intents for USDC/WETH"

## What's happening

Claude connects to Floe's hosted MCP server at `mcp.floelabs.xyz`. The server exposes 27 tools for reading markets, creating intents, managing loans, and building transactions. No API key needed for read-only tools.
