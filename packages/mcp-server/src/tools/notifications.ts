import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const notificationsTool: Tool = {
  name: "oneshot_notifications",
  description: "List notifications for the agent. Free. Shows job completions, failures, and lifecycle warnings.",
  inputSchema: {
    type: "object",
    properties: {
      unread: {
        type: "boolean",
        description: "Only return unread notifications (default: false)",
      },
      limit: {
        type: "number",
        description: "Maximum notifications to return (default: 50, max: 100)",
      },
    },
  },
};

export const markReadTool: Tool = {
  name: "oneshot_mark_notification_read",
  description: "Mark a notification as read. Free.",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "Notification UUID to mark as read",
      },
    },
    required: ["notificationId"],
  },
};

export async function handleNotifications(agent: OneShot, args: Record<string, unknown>) {
  return agent.notifications({
    unread: args.unread as boolean | undefined,
    limit: args.limit as number | undefined,
  });
}

export async function handleMarkRead(agent: OneShot, args: Record<string, unknown>) {
  await agent.markNotificationRead(args.notificationId as string);
  return { success: true };
}
