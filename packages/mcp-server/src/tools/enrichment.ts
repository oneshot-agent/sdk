import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const enrichProfileTool: Tool = {
  name: "oneshot_enrich_profile",
  description: "Enrich a person's profile from LinkedIn URL, email, or name. Returns job title, company, social links, etc. Costs ~$0.10.",
  inputSchema: {
    type: "object",
    properties: {
      linkedin_url: {
        type: "string",
        description: "LinkedIn profile URL",
      },
      email: {
        type: "string",
        description: "Email address to enrich",
      },
      name: {
        type: "string",
        description: "Person's full name",
      },
      company_domain: {
        type: "string",
        description: "Company domain for additional context",
      },
    },
  },
};

export const findEmailTool: Tool = {
  name: "oneshot_find_email",
  description: "Find email address for a person at a company. Costs ~$0.10.",
  inputSchema: {
    type: "object",
    properties: {
      full_name: {
        type: "string",
        description: "Person's full name",
      },
      first_name: {
        type: "string",
        description: "Person's first name (use with last_name)",
      },
      last_name: {
        type: "string",
        description: "Person's last name (use with first_name)",
      },
      company_domain: {
        type: "string",
        description: "Company domain (e.g., example.com)",
      },
    },
    required: ["company_domain"],
  },
};

export const verifyEmailTool: Tool = {
  name: "oneshot_verify_email",
  description: "Verify if an email address is valid and deliverable. Costs ~$0.01.",
  inputSchema: {
    type: "object",
    properties: {
      email: {
        type: "string",
        description: "Email address to verify",
      },
    },
    required: ["email"],
  },
};

export async function handleEnrichProfile(agent: OneShot, args: Record<string, unknown>) {
  return agent.enrichProfile({
    linkedin_url: args.linkedin_url as string | undefined,
    email: args.email as string | undefined,
    name: args.name as string | undefined,
    company_domain: args.company_domain as string | undefined,
  });
}

export async function handleFindEmail(agent: OneShot, args: Record<string, unknown>) {
  return agent.findEmail({
    full_name: args.full_name as string | undefined,
    first_name: args.first_name as string | undefined,
    last_name: args.last_name as string | undefined,
    company_domain: args.company_domain as string,
  });
}

export async function handleVerifyEmail(agent: OneShot, args: Record<string, unknown>) {
  return agent.verifyEmail({
    email: args.email as string,
  });
}
