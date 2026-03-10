import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const voiceTool: Tool = {
  name: "oneshot_voice",
  description: "Make a phone call. Costs ~$0.25/minute. The call will follow the provided objective.",
  inputSchema: {
    type: "object",
    properties: {
      target_number: {
        type: "string",
        description: "Phone number to call (E.164 format, e.g., +14155551234)",
      },
      objective: {
        type: "string",
        description: "What the AI should accomplish on the call (min 10 characters)",
      },
      context: {
        type: "string",
        description: "Additional context about the call (optional)",
      },
      caller_persona: {
        type: "string",
        description: "Persona for the AI caller (optional)",
      },
      max_duration_minutes: {
        type: "number",
        description: "Maximum call duration in minutes (1-30, optional)",
      },
    },
    required: ["target_number", "objective"],
  },
};

export async function handleVoice(agent: OneShot, args: Record<string, unknown>) {
  return agent.voice({
    target_number: args.target_number as string,
    objective: args.objective as string,
    context: args.context as string | undefined,
    caller_persona: args.caller_persona as string | undefined,
    max_duration_minutes: args.max_duration_minutes as number | undefined,
  });
}
