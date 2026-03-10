import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OneShot } from "@oneshot-agent/sdk";
import { emailTool, handleEmail } from "./email.js";
import { voiceTool, handleVoice } from "./voice.js";
import { smsTool, handleSms } from "./sms.js";
import { researchTool, handleResearch } from "./research.js";
import { peopleSearchTool, handlePeopleSearch } from "./people.js";
import { commerceSearchTool, commerceBuyTool, handleCommerceSearch, handleCommerceBuy } from "./commerce.js";
import { enrichProfileTool, findEmailTool, verifyEmailTool, handleEnrichProfile, handleFindEmail, handleVerifyEmail } from "./enrichment.js";
import { inboxListTool, inboxGetTool, handleInboxList, handleInboxGet } from "./inbox.js";
import { smsInboxListTool, smsInboxGetTool, handleSmsInboxList, handleSmsInboxGet } from "./sms-inbox.js";
import { notificationsTool, markReadTool, handleNotifications, handleMarkRead } from "./notifications.js";
import { getBalanceTool, handleGetBalance } from "./wallet.js";
import { buildTool, updateBuildTool, handleBuild, handleUpdateBuild } from "./build.js";
import { browserTool, handleBrowser } from "./browser.js";
import { webSearchTool, handleWebSearch } from "./search.js";
import { webReadTool, handleWebRead } from "./web-read.js";
import { deepResearchPersonTool, socialProfilesTool, articleSearchTool, personNewsfeedTool, personInterestsTool, personInteractionsTool, handleDeepResearchPerson, handleSocialProfiles, handleArticleSearch, handlePersonNewsfeed, handlePersonInterests, handlePersonInteractions } from "./nyne.js";

// All available tools
export const tools: Tool[] = [
  // Communication
  emailTool,
  voiceTool,
  smsTool,

  // Inbox
  inboxListTool,
  inboxGetTool,
  smsInboxListTool,
  smsInboxGetTool,

  // Research & Enrichment
  researchTool,
  peopleSearchTool,
  enrichProfileTool,
  findEmailTool,
  verifyEmailTool,
  webSearchTool,
  deepResearchPersonTool,
  socialProfilesTool,
  articleSearchTool,
  personNewsfeedTool,
  personInterestsTool,
  personInteractionsTool,

  // Commerce
  commerceSearchTool,
  commerceBuyTool,

  // Build
  buildTool,
  updateBuildTool,

  // Browser
  browserTool,

  // Web Read
  webReadTool,

  // Account
  notificationsTool,
  markReadTool,
  getBalanceTool,
];

// Tool handlers map
const handlers: Record<string, (agent: OneShot, args: Record<string, unknown>) => Promise<unknown>> = {
  // Communication
  "oneshot_email": handleEmail,
  "oneshot_voice": handleVoice,
  "oneshot_sms": handleSms,

  // Inbox
  "oneshot_inbox_list": handleInboxList,
  "oneshot_inbox_get": handleInboxGet,
  "oneshot_sms_inbox_list": handleSmsInboxList,
  "oneshot_sms_inbox_get": handleSmsInboxGet,

  // Research & Enrichment
  "oneshot_research": handleResearch,
  "oneshot_people_search": handlePeopleSearch,
  "oneshot_enrich_profile": handleEnrichProfile,
  "oneshot_find_email": handleFindEmail,
  "oneshot_verify_email": handleVerifyEmail,
  "oneshot_web_search": handleWebSearch,
  "oneshot_deep_research_person": handleDeepResearchPerson,
  "oneshot_social_profiles": handleSocialProfiles,
  "oneshot_article_search": handleArticleSearch,
  "oneshot_person_newsfeed": handlePersonNewsfeed,
  "oneshot_person_interests": handlePersonInterests,
  "oneshot_person_interactions": handlePersonInteractions,

  // Commerce
  "oneshot_commerce_search": handleCommerceSearch,
  "oneshot_commerce_buy": handleCommerceBuy,

  // Build
  "oneshot_build": handleBuild,
  "oneshot_update_build": handleUpdateBuild,

  // Browser
  "oneshot_browser": handleBrowser,

  // Web Read
  "oneshot_web_read": handleWebRead,

  // Account
  "oneshot_notifications": handleNotifications,
  "oneshot_mark_notification_read": handleMarkRead,
  "oneshot_get_balance": handleGetBalance,
};

export async function handleToolCall(
  agent: OneShot,
  toolName: string,
  args: Record<string, unknown>
) {
  const handler = handlers[toolName];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  try {
    const result = await handler(agent, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
