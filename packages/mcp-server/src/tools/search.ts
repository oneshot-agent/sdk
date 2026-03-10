import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const webSearchTool: Tool = {
  name: "oneshot_web_search",
  description: "Search the web and get URLs, titles, and descriptions. Fast and synchronous. Costs $0.01 per search.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query string",
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (1-20, default: 5)",
      },
    },
    required: ["query"],
  },
};

export async function handleWebSearch(agent: OneShot, args: Record<string, unknown>) {
  return agent.webSearch({
    query: args.query as string,
    max_results: args.max_results as number | undefined,
  });
}
