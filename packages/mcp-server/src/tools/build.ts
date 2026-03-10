import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const buildTool: Tool = {
  name: "oneshot_build",
  description: "Build and deploy production websites - SaaS landing pages, portfolios, agency sites, restaurant pages, event sites, and more. Creates fully-functional sites with real hosting. Paid tool — quote provided before payment.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["saas", "portfolio", "agency", "personal", "product", "funnel", "restaurant", "event", "app", "social"],
        description: "Build type (default: saas)",
      },
      product: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Product or business name",
          },
          description: {
            type: "string",
            description: "Description of the product/service (min 10 chars)",
          },
          industry: {
            type: "string",
            description: "Industry category",
          },
          pricing: {
            type: "string",
            description: "Pricing information to display",
          },
        },
        required: ["name", "description"],
      },
      source_url: {
        type: "string",
        description: "URL to analyze for content/inspiration (additional fee)",
      },
      sections: {
        type: "array",
        items: { type: "string" },
        description: "Specific sections to include (e.g., ['hero', 'features', 'pricing', 'testimonials'])",
      },
      lead_capture: {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
            description: "Enable lead capture form (additional fee)",
          },
          inbox_email: {
            type: "string",
            description: "Email to receive leads (defaults to agent inbox)",
          },
        },
      },
      brand: {
        type: "object",
        properties: {
          primary_color: {
            type: "string",
            description: "Primary brand color (hex format, e.g., #FF5733)",
          },
          font: {
            type: "string",
            description: "Font family preference",
          },
          tone: {
            type: "string",
            enum: ["professional", "playful", "bold", "minimal"],
            description: "Brand tone",
          },
        },
      },
      images: {
        type: "object",
        properties: {
          hero: {
            type: "string",
            description: "Hero image URL",
          },
          logo: {
            type: "string",
            description: "Logo image URL",
          },
        },
      },
      domain: {
        type: "string",
        description: "Custom domain (e.g., mysite.com) (additional fee)",
      },
      build_id: {
        type: "string",
        description: "Existing build ID to update (for iterations)",
      },
    },
    required: ["product"],
  },
};

export const updateBuildTool: Tool = {
  name: "oneshot_update_build",
  description: "Update an existing website with new content or configuration. Requires the build_id from a previous build. Updates reuse existing hosting infrastructure at a discounted rate.",
  inputSchema: {
    type: "object",
    properties: {
      build_id: {
        type: "string",
        description: "Existing build ID to update (from previous build result)",
      },
      product: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Product or business name",
          },
          description: {
            type: "string",
            description: "Description of the product/service (min 10 chars)",
          },
          industry: {
            type: "string",
            description: "Industry category",
          },
          pricing: {
            type: "string",
            description: "Pricing information to display",
          },
        },
        required: ["name", "description"],
      },
      type: {
        type: "string",
        enum: ["saas", "portfolio", "agency", "personal", "product", "funnel", "restaurant", "event", "app", "social"],
        description: "Build type (optional, keeps existing if not specified)",
      },
      source_url: {
        type: "string",
        description: "URL to analyze for content/inspiration",
      },
      sections: {
        type: "array",
        items: { type: "string" },
        description: "Specific sections to include",
      },
      lead_capture: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          inbox_email: { type: "string" },
        },
      },
      brand: {
        type: "object",
        properties: {
          primary_color: { type: "string" },
          font: { type: "string" },
          tone: { type: "string", enum: ["professional", "playful", "bold", "minimal"] },
        },
      },
      images: {
        type: "object",
        properties: {
          hero: { type: "string" },
          logo: { type: "string" },
        },
      },
      domain: {
        type: "string",
        description: "Custom domain",
      },
    },
    required: ["build_id", "product"],
  },
};

export async function handleBuild(agent: OneShot, args: Record<string, unknown>) {
  const product = args.product as { name: string; description: string; industry?: string; pricing?: string };

  return agent.build({
    type: args.type as "saas" | "portfolio" | "agency" | "personal" | "product" | "funnel" | "restaurant" | "event" | undefined,
    product: {
      name: product.name,
      description: product.description,
      industry: product.industry,
      pricing: product.pricing,
    },
    source_url: args.source_url as string | undefined,
    sections: args.sections as string[] | undefined,
    lead_capture: args.lead_capture as { enabled: boolean; inbox_email?: string } | undefined,
    brand: args.brand as { primary_color?: string; font?: string; tone?: "professional" | "playful" | "bold" | "minimal" } | undefined,
    images: args.images as { hero?: string; logo?: string } | undefined,
    domain: args.domain as string | undefined,
    build_id: args.build_id as string | undefined,
  });
}

export async function handleUpdateBuild(agent: OneShot, args: Record<string, unknown>) {
  const product = args.product as { name: string; description: string; industry?: string; pricing?: string };

  return agent.updateBuild({
    build_id: args.build_id as string,
    product: {
      name: product.name,
      description: product.description,
      industry: product.industry,
      pricing: product.pricing,
    },
    type: args.type as "saas" | "portfolio" | "agency" | "personal" | "product" | "funnel" | "restaurant" | "event" | undefined,
    source_url: args.source_url as string | undefined,
    sections: args.sections as string[] | undefined,
    lead_capture: args.lead_capture as { enabled: boolean; inbox_email?: string } | undefined,
    brand: args.brand as { primary_color?: string; font?: string; tone?: "professional" | "playful" | "bold" | "minimal" } | undefined,
    images: args.images as { hero?: string; logo?: string } | undefined,
    domain: args.domain as string | undefined,
  });
}
