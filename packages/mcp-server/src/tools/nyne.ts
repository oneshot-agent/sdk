import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const deepResearchPersonTool: Tool = {
  name: "oneshot_deep_research_person",
  description: "Deep research on a person — returns career history, social presence, interests, and connections. Takes 2-5 minutes. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Person's email address" },
      social_media_url: { type: "string", description: "LinkedIn, Twitter, or other social profile URL" },
      name: { type: "string", description: "Person's full name" },
      company: { type: "string", description: "Company name (helps disambiguate)" },
    },
  },
};

export const socialProfilesTool: Tool = {
  name: "oneshot_social_profiles",
  description: "Discover all social media profiles for a person across platforms (LinkedIn, Twitter, GitHub, YouTube, etc). Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Person's email address" },
      social_media_url: { type: "string", description: "Known social profile URL to start from" },
    },
  },
};

export const articleSearchTool: Tool = {
  name: "oneshot_article_search",
  description: "Find articles, publications, and interviews about a person. Requires name and company. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Person's full name" },
      company: { type: "string", description: "Company name or domain" },
      sort: { type: "string", enum: ["recent", "popular"], description: "Sort order (default: recent)" },
      limit: { type: "number", description: "Max results 1-20 (default: 5)" },
    },
    required: ["name", "company"],
  },
};

export const personNewsfeedTool: Tool = {
  name: "oneshot_person_newsfeed",
  description: "Get a person's recent social media posts with likes, replies, and shares. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      social_media_url: { type: "string", description: "Social profile URL (Twitter, LinkedIn, etc)" },
    },
    required: ["social_media_url"],
  },
};

export const personInterestsTool: Tool = {
  name: "oneshot_person_interests",
  description: "Figure out what someone cares about — sports, politics, tech, entertainment, etc. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Person's email address" },
      phone: { type: "string", description: "Person's phone number" },
      social_media_url: { type: "string", description: "Social profile URL" },
    },
  },
};

export const personInteractionsTool: Tool = {
  name: "oneshot_person_interactions",
  description: "See who someone follows, who follows them, and who they reply to. Paid tool.",
  inputSchema: {
    type: "object",
    properties: {
      social_media_url: { type: "string", description: "Social profile or post URL (Twitter/X or Instagram)" },
      type: { type: "string", enum: ["replies", "followers", "following", "followers,following"], description: "Interaction type (default: followers,following)" },
      max_results: { type: "number", description: "Max results 1-1000 (default: 100)" },
    },
    required: ["social_media_url"],
  },
};

// Handlers
export async function handleDeepResearchPerson(agent: OneShot, args: Record<string, unknown>) {
  return agent.deepResearchPerson({
    email: args.email as string | undefined,
    social_media_url: args.social_media_url as string | undefined,
    name: args.name as string | undefined,
    company: args.company as string | undefined,
  });
}

export async function handleSocialProfiles(agent: OneShot, args: Record<string, unknown>) {
  return agent.socialProfiles({
    email: args.email as string | undefined,
    social_media_url: args.social_media_url as string | undefined,
  });
}

export async function handleArticleSearch(agent: OneShot, args: Record<string, unknown>) {
  return agent.articleSearch({
    name: args.name as string,
    company: args.company as string,
    sort: args.sort as 'recent' | 'popular' | undefined,
    limit: args.limit as number | undefined,
  });
}

export async function handlePersonNewsfeed(agent: OneShot, args: Record<string, unknown>) {
  return agent.personNewsfeed({
    social_media_url: args.social_media_url as string,
  });
}

export async function handlePersonInterests(agent: OneShot, args: Record<string, unknown>) {
  return agent.personInterests({
    email: args.email as string | undefined,
    phone: args.phone as string | undefined,
    social_media_url: args.social_media_url as string | undefined,
  });
}

export async function handlePersonInteractions(agent: OneShot, args: Record<string, unknown>) {
  return agent.personInteractions({
    social_media_url: args.social_media_url as string,
    type: args.type as 'replies' | 'followers' | 'following' | 'followers,following' | undefined,
    max_results: args.max_results as number | undefined,
  });
}
