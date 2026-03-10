#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";
import { tools, handleToolCall } from "./tools/index.js";

const CDP_KEY_ID = process.env.CDP_API_KEY_ID;
const PRIVATE_KEY = process.env.ONESHOT_WALLET_PRIVATE_KEY;

async function initAgent(): Promise<OneShot> {
  if (CDP_KEY_ID) {
    // Preferred: Coinbase CDP Server Wallet (no private key exposure)
    console.error("Using Coinbase CDP wallet");
    return OneShot.create({ cdp: true });
  }

  if (PRIVATE_KEY) {
    // Fallback: raw private key
    return new OneShot({ privateKey: PRIVATE_KEY });
  }

  console.error(
    "Error: Set CDP_API_KEY_ID + CDP_API_KEY_SECRET + CDP_WALLET_SECRET (recommended)\n" +
    "       or ONESHOT_WALLET_PRIVATE_KEY"
  );
  process.exit(1);
}

// Start server
async function main() {
  const agent = await initAgent();

  // Create MCP server
  const server = new Server(
    {
      name: "oneshot-mcp",
      version: "0.3.3",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(agent, name, args || {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`OneShot MCP server running (production)`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
