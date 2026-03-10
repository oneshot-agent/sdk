import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const commerceSearchTool: Tool = {
  name: "oneshot_commerce_search",
  description: "Search for products to purchase. Free to search, pay only when buying.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Product search query",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 10)",
      },
    },
    required: ["query"],
  },
};

export const commerceBuyTool: Tool = {
  name: "oneshot_commerce_buy",
  description: "Purchase a product. Requires product URL and shipping address. Price + service fee.",
  inputSchema: {
    type: "object",
    properties: {
      product_url: {
        type: "string",
        description: "Product URL to purchase",
      },
      shipping_address: {
        type: "object",
        properties: {
          first_name: { type: "string" },
          last_name: { type: "string" },
          street: { type: "string" },
          street2: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip_code: { type: "string" },
          country: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["first_name", "last_name", "street", "city", "state", "zip_code", "phone"],
      },
      quantity: {
        type: "number",
        description: "Quantity to purchase (default: 1)",
      },
      variant_id: {
        type: "string",
        description: "Product variant ID (optional)",
      },
    },
    required: ["product_url", "shipping_address"],
  },
};

export async function handleCommerceSearch(agent: OneShot, args: Record<string, unknown>) {
  return agent.commerceSearch({
    query: args.query as string,
    limit: args.limit as number | undefined,
  });
}

export async function handleCommerceBuy(agent: OneShot, args: Record<string, unknown>) {
  const shippingAddress = args.shipping_address as Record<string, string>;
  return agent.commerceBuy({
    product_url: args.product_url as string,
    shipping_address: {
      first_name: shippingAddress.first_name,
      last_name: shippingAddress.last_name,
      street: shippingAddress.street,
      street2: shippingAddress.street2,
      city: shippingAddress.city,
      state: shippingAddress.state,
      zip_code: shippingAddress.zip_code,
      country: shippingAddress.country,
      email: shippingAddress.email,
      phone: shippingAddress.phone,
    },
    quantity: args.quantity as number | undefined,
    variant_id: args.variant_id as string | undefined,
  });
}
