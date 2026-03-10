import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const getBalanceTool: Tool = {
  name: "oneshot_get_balance",
  description: "Get the agent's USDC balance. Free. Returns balance in human-readable format.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export async function handleGetBalance(agent: OneShot, _args: Record<string, unknown>) {
  const balance = await agent.getBalance(agent.usdcAddress);
  return {
    balance,
    currency: "USDC",
    address: agent.address,
    testMode: agent.isTestMode,
  };
}
