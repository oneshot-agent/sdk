import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const inboxListTool: Tool = {
  name: "oneshot_inbox_list",
  description: "List emails in the agent's inbox. Free. Shows received emails with sender, subject, and timestamp.",
  inputSchema: {
    type: "object",
    properties: {
      since: {
        type: "string",
        description: "ISO timestamp to filter emails received after this time",
      },
      limit: {
        type: "number",
        description: "Maximum number of emails to return (default: 50)",
      },
      include_body: {
        type: "boolean",
        description: "Include email body in results (default: false)",
      },
    },
  },
};

export const inboxGetTool: Tool = {
  name: "oneshot_inbox_get",
  description: "Get a specific email by ID. Free. Returns full email including body and attachments.",
  inputSchema: {
    type: "object",
    properties: {
      email_id: {
        type: "string",
        description: "Email ID to retrieve",
      },
    },
    required: ["email_id"],
  },
};

export async function handleInboxList(agent: OneShot, args: Record<string, unknown>) {
  return agent.inboxList({
    since: args.since as string | undefined,
    limit: args.limit as number | undefined,
    include_body: args.include_body as boolean | undefined,
  });
}

export async function handleInboxGet(agent: OneShot, args: Record<string, unknown>) {
  return agent.inboxGet(args.email_id as string);
}
