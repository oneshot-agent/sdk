import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const emailTool: Tool = {
  name: "oneshot_email",
  description: "Send an email. Supports HTML body and attachments. Paid tool — quote provided before payment.",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient email address (or comma-separated list)",
      },
      subject: {
        type: "string",
        description: "Email subject line",
      },
      body: {
        type: "string",
        description: "Email body (plain text or HTML)",
      },
      from_domain: {
        type: "string",
        description: "Custom sender domain (optional, defaults to oneshotagent.com)",
      },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            filename: { type: "string" },
            content: { type: "string", description: "Base64 encoded content" },
            url: { type: "string", description: "URL to fetch attachment from" },
            content_type: { type: "string" },
          },
        },
        description: "File attachments (optional)",
      },
    },
    required: ["to", "subject", "body"],
  },
};

export async function handleEmail(agent: OneShot, args: Record<string, unknown>) {
  return agent.email({
    to: args.to as string,
    subject: args.subject as string,
    body: args.body as string,
    from_domain: args.from_domain as string | undefined,
    attachments: args.attachments as Array<{
      filename?: string;
      content?: string;
      url?: string;
      content_type?: string;
    }> | undefined,
  });
}
