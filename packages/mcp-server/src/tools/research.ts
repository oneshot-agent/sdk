import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const researchTool: Tool = {
  name: "oneshot_research",
  description: "Perform deep web research on a topic. Returns comprehensive report with sources. Paid tool — quote provided before payment.",
  inputSchema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Research topic or question",
      },
      depth: {
        type: "string",
        enum: ["quick", "deep"],
        description: "Research depth (default: deep). Quick: ~30s, Deep: ~2-5min",
      },
      max_sources: {
        type: "number",
        description: "Maximum number of sources to include (optional)",
      },
      output_format: {
        type: "string",
        enum: ["report_markdown", "structured_json"],
        description: "Output format (default: report_markdown)",
      },
    },
    required: ["topic"],
  },
};

export async function handleResearch(agent: OneShot, args: Record<string, unknown>) {
  return agent.research({
    topic: args.topic as string,
    depth: args.depth as "quick" | "deep" | undefined,
    max_sources: args.max_sources as number | undefined,
    output_format: args.output_format as "report_markdown" | "structured_json" | undefined,
  });
}
