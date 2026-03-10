import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const browserTool: Tool = {
  name: "oneshot_browser",
  description: "Automate web browsing tasks using AI. Navigate websites, extract data, fill forms, and perform multi-step workflows using natural language instructions. Paid tool — quote provided before payment.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Natural language instruction for what to do in the browser (min 10 characters)",
      },
      output_schema: {
        type: "object",
        description: "JSON schema for structured output extraction (optional)",
      },
      start_url: {
        type: "string",
        description: "Initial URL to navigate to (optional)",
      },
      allowed_domains: {
        type: "array",
        items: { type: "string" },
        description: "Restrict browsing to these domains (optional)",
      },
      max_steps: {
        type: "number",
        description: "Maximum browser steps (1-100, default: 50)",
      },
    },
    required: ["task"],
  },
};

export async function handleBrowser(agent: OneShot, args: Record<string, unknown>) {
  return agent.browser({
    task: args.task as string,
    output_schema: args.output_schema as Record<string, unknown> | undefined,
    start_url: args.start_url as string | undefined,
    allowed_domains: args.allowed_domains as string[] | undefined,
    max_steps: args.max_steps as number | undefined,
  });
}
