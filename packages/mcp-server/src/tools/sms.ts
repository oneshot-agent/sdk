import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const smsTool: Tool = {
  name: "oneshot_sms",
  description: "Send an SMS message. Paid tool — quote provided before payment.",
  inputSchema: {
    type: "object",
    properties: {
      to_number: {
        type: "string",
        description: "Phone number (E.164 format, e.g., +14155551234)",
      },
      message: {
        type: "string",
        description: "SMS message content (max 1600 chars, 160 chars per segment)",
      },
    },
    required: ["to_number", "message"],
  },
};

export async function handleSms(agent: OneShot, args: Record<string, unknown>) {
  return agent.sms({
    to_number: args.to_number as string,
    message: args.message as string,
  });
}
