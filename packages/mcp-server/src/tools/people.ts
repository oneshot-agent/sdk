import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";

export const peopleSearchTool: Tool = {
  name: "oneshot_people_search",
  description: "Search for people by job title, company, location, skills, etc. Returns professional profiles. Costs ~$0.10 per result.",
  inputSchema: {
    type: "object",
    properties: {
      job_titles: {
        type: "array",
        items: { type: "string" },
        description: "Job titles to search for (e.g., ['CEO', 'CTO'])",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to match in profiles",
      },
      companies: {
        type: "array",
        items: { type: "string" },
        description: "Company names to filter by",
      },
      location: {
        type: "array",
        items: { type: "string" },
        description: "Locations to filter by (e.g., ['San Francisco', 'New York'])",
      },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Skills to match",
      },
      seniority: {
        type: "array",
        items: { type: "string" },
        description: "Seniority levels (e.g., ['senior', 'executive'])",
      },
      industry: {
        type: "array",
        items: { type: "string" },
        description: "Industries to filter by",
      },
      company_size: {
        type: "string",
        description: "Company size filter (e.g., '1-10', '11-50', '51-200', '201-500', '501-1000', '1001+')",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 100)",
      },
    },
  },
};

export async function handlePeopleSearch(agent: OneShot, args: Record<string, unknown>) {
  return agent.peopleSearch({
    job_titles: args.job_titles as string[] | undefined,
    keywords: args.keywords as string[] | undefined,
    companies: args.companies as string[] | undefined,
    location: args.location as string[] | undefined,
    skills: args.skills as string[] | undefined,
    seniority: args.seniority as string[] | undefined,
    industry: args.industry as string[] | undefined,
    company_size: args.company_size as string | undefined,
    limit: args.limit as number | undefined,
  });
}
