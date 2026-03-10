import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const smsInboxListTool: Tool = {
  name: "oneshot_sms_inbox_list",
  description: "List inbound SMS messages. Free. Shows received text messages with sender and content.",
  inputSchema: {
    type: "object",
    properties: {
      since: {
        type: "string",
        description: "ISO timestamp to filter messages received after this time",
      },
      limit: {
        type: "number",
        description: "Maximum number of messages to return (default: 50, max: 100)",
      },
      from: {
        type: "string",
        description: "Filter by sender phone number",
      },
    },
  },
};

export const smsInboxGetTool: Tool = {
  name: "oneshot_sms_inbox_get",
  description: "Get a specific SMS message by ID. Free. Returns full message details.",
  inputSchema: {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "SMS message ID to retrieve",
      },
    },
    required: ["message_id"],
  },
};

export async function handleSmsInboxList(agent: OneShot, args: Record<string, unknown>) {
  return agent.smsInboxList({
    since: args.since as string | undefined,
    limit: args.limit as number | undefined,
    from: args.from as string | undefined,
  });
}

export async function handleSmsInboxGet(agent: OneShot, args: Record<string, unknown>) {
  return agent.smsInboxGet(args.message_id as string);
}
