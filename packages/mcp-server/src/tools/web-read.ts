import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const webReadTool: Tool = {
  name: "oneshot_web_read",
  description: "Read a web page and extract its content as markdown with a screenshot. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL of the web page to read",
      },
    },
    required: ["url"],
  },
};

export async function handleWebRead(agent: OneShot, args: Record<string, unknown>) {
  return agent.webRead({
    url: args.url as string,
  });
}
