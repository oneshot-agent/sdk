// Public option + result types for every paid tool the SDK exposes.
// Kept in a separate file so the OneShot class file (index.ts) stays
// scannable. Consumers should keep importing from '@oneshot-agent/sdk'
// (the package barrel re-exports everything from here).

import type { WalletProvider } from './wallet-provider';

// ============================================================================
// Types
// ============================================================================

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export interface PaymentInfo {
  protocol: 'x402';
  network: string;
  payTo: string;
  amount: string;
  currency: string;
  facilitator_url: string;
  token: TokenInfo;
  context?: Record<string, unknown>;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentAuthorization {
  x402Version: 2;
  resource?: { url: string; description?: string; mimeType?: string };
  extensions?: Record<string, unknown>;
  accepted: PaymentRequirements;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

export type LoggerFn = (message: string) => void;
export type StatusUpdateFn = (status: string, requestId: string) => void;

export interface OneShotConfig {
  /** Option A: Raw private key (existing behavior) */
  privateKey?: string;
  /** Option B: Use Coinbase CDP Server Wallet (reads CDP_* env vars). Pass true or { address } to reuse existing. */
  cdp?: boolean | { address?: string };
  /** Option C: Bring your own WalletProvider implementation */
  walletProvider?: WalletProvider;
  /** Override API URL */
  baseUrl?: string;
  /** Override RPC URL */
  rpcUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger function */
  logger?: LoggerFn;
  /** Payment currency: "USDC" (default, no swap) or "ETH" (auto-swap via Uniswap V3) */
  currency?: 'USDC' | 'ETH';
  /** Slippage tolerance for ETH→USDC swaps (default: 0.01 = 1%). Only used when currency is "ETH". */
  slippage?: number;
}

/**
 * Structured decision context for a tool call. Machine-readable metadata
 * that explains WHY this tool was called — consumed by auditor agents
 * and programmatic oversight. Open schema: known fields are typed,
 * extra keys are allowed.
 */
export interface DecisionContext {
  /** Goal or objective this tool call serves */
  goal?: string;
  /** Compute goal ID if linked to an orchestrated goal */
  goalId?: string;
  /** Alternative tools/approaches that were considered */
  alternatives?: string[];
  /** Confidence in this being the right tool choice (0-1) */
  confidence?: number;
  /** Any additional context */
  [key: string]: unknown;
}

export interface ToolOptions {
  maxCost?: number;
  timeout?: number;
  signal?: AbortSignal;
  onStatusUpdate?: StatusUpdateFn;
  wait?: boolean;
  /** Optional value tag for RoCS tracking — stored in the receipt at creation time */
  valueTag?: { type: string; amount?: number; label?: string };
  /**
   * Short human-readable reason for this tool call. Stored on the receipt
   * for debugging and audit. Max 1000 chars. The SDK warns (does not error)
   * if a paid tool is called without a memo.
   */
  memo?: string;
  /**
   * Structured decision context — goal linkage, alternatives considered,
   * confidence score. Machine-readable counterpart to memo. Stored alongside
   * the receipt for programmatic auditing by supervisor agents.
   */
  decisionContext?: DecisionContext;
  /**
   * Async phone-reveal opt-in. For person-intelligence tools, phone numbers
   * sometimes arrive via an asynchronous webhook minutes AFTER the initial
   * enrichment completes. By default the SDK returns as soon as the worker
   * writes status=completed (phones=null, phones_pending=true). Set
   * `waitForPhones: true` to keep polling at a slower cadence (every 5s)
   * until phones land or `phoneTimeoutSec` expires (default 360s = 6 min).
   * Only meaningful for tools whose upstream enrichment supports async
   * phone reveals (research/person, enrich/profile, …). For other tools
   * the flag is a no-op.
   */
  waitForPhones?: boolean;
  phoneTimeoutSec?: number;
}

export interface EmailToolOptions extends ToolOptions {
  to: string | string[];
  subject: string;
  body: string;
  from_domain?: string;
  /** Sender mailbox / local-part. Defaults to `agent` (i.e. agent@from_domain). */
  from_mailbox?: string;
  /** Display name shown to the recipient, e.g. "Jane Doe" → "Jane Doe <jane@domain>". */
  from_name?: string;
  attachments?: Array<{
    filename?: string;
    content?: string;
    url?: string;
    content_type?: string;
  }>;
}

export interface ResearchToolOptions extends ToolOptions {
  topic: string;
  depth?: 'deep' | 'quick';
}

export interface PeopleSearchOptions extends ToolOptions {
  job_titles?: string[];
  keywords?: string[];
  companies?: string[];
  company_domains?: string[];
  location?: string[];
  skills?: string[];
  seniority?: string[];
  industry?: string[];
  company_size?: string;
  limit?: number;
}

export interface EnrichProfileOptions extends ToolOptions {
  linkedin_url?: string;
  email?: string;
  name?: string;
  company_domain?: string;
}

export interface FindEmailOptions extends ToolOptions {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company_domain: string;
}

export interface VerifyEmailOptions extends ToolOptions {
  email: string;
}

export interface DeepResearchPersonOptions extends ToolOptions {
  email?: string;
  social_media_url?: string;
  name?: string;
  company?: string;
}

export interface SocialProfilesOptions extends ToolOptions {
  email?: string;
  social_media_url?: string;
}

export interface ArticleSearchOptions extends ToolOptions {
  name: string;
  company: string;
  sort?: 'recent' | 'popular';
  limit?: number;
}

export interface PersonNewsfeedOptions extends ToolOptions {
  social_media_url: string;
}

export interface PersonInterestsOptions extends ToolOptions {
  email?: string;
  phone?: string;
  social_media_url?: string;
}

export interface PersonInteractionsOptions extends ToolOptions {
  social_media_url: string;
  type?: 'replies' | 'followers' | 'following' | 'followers,following';
  max_results?: number;
}

export interface InboxListOptions {
  since?: string;
  limit?: number;
  include_body?: boolean;
}

export interface ShippingAddress {
  first_name: string;
  last_name: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip_code: string;
  country?: string;
  email?: string;
  phone: string;
}

export interface CommerceBuyOptions extends ToolOptions {
  product_url: string;
  shipping_address: ShippingAddress;
  quantity?: number;
  variant_id?: string;
}

export interface CommerceSearchOptions extends ToolOptions {
  query: string;
  limit?: number;
}

export interface WebSearchOptions extends ToolOptions {
  query: string;
  max_results?: number;
}

export interface WebSearchResult {
  query: string;
  results: Array<{ url: string; title: string; description: string }>;
  result_count: number;
  memo?: string;
  cost?: number;
}

export interface WebReadOptions extends ToolOptions {
  /** URL of the web page to read */
  url: string;
}

export interface WebReadResult {
  request_id?: string;
  url: string;
  markdown: string;
  screenshot_url?: string;
  metadata?: { title: string; description: string; statusCode?: number };
  truncated?: boolean;
  memo?: string;
  cost?: number;
}

export interface VoiceCallOptions extends ToolOptions {
  /** The objective of the call - what should the OneShot Agent accomplish */
  objective: string;
  /** Target phone number(s) in E.164 format. Array triggers conference mode analysis. */
  target_number: string | string[];
  /** Optional persona for the OneShot Agent caller */
  caller_persona?: string;
  /** Additional context about the call */
  context?: string;
  /** Maximum call duration in minutes (1-30) */
  max_duration_minutes?: number;
}

export interface SmsOptions extends ToolOptions {
  /** The SMS message body (max 1600 characters) */
  message: string;
  /** Target phone number(s) in E.164 format (max 10 recipients) */
  to_number: string | string[];
}

export interface SmsInboxOptions {
  /** Filter messages received after this ISO timestamp */
  since?: string;
  /** Maximum number of messages to return (default: 50, max: 100) */
  limit?: number;
  /** Filter by sender phone number */
  from?: string;
}

// Result types
export interface Experience {
  company?: { name?: string; website?: string };
  title?: { name?: string };
  start_date?: string;
  end_date?: string;
  is_primary?: boolean;
}

export interface Education {
  school?: { name?: string };
  degrees?: string[];
  majors?: string[];
  start_date?: string;
  end_date?: string;
}

export interface PersonResult {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  linkedin_url?: string;
  location?: string;
  email?: string;
  phone?: string;
  summary?: string;
  skills?: string[];
  experience?: Experience[];
  education?: Education[];
  // Normalized fields (present regardless of which provider answered)
  fullphone?: Array<{ fullphone: string }>;
  altemails?: string[];
  best_work_email?: string | null;
  best_personal_email?: string | null;
}

export interface PeopleSearchResult {
  status: string;
  results: PersonResult[];
  total_found: number;
  request_id?: string;
  completed_at?: string;
  filters?: Record<string, unknown>;
  memo?: string;
  cost?: number;
}

export interface ResearchResult {
  request_id?: string;
  report_content: string;
  sources: Array<{ url: string; title?: string }>;
  sources_count: number;
  topic: string;
  depth: string;
  workspace: string;
  report_path: string;
  completed_at: string;
  report_gcs_uri: string;
  memo?: string;
  cost?: number;
}

export interface EmailResult {
  request_id?: string;
  status: string;
  timeline?: Array<Record<string, unknown>>;
  error?: string;
  email?: {
    id: string;
    provider_message_id: string;
    status: string;
  };
  domain?: {
    domain: string;
    status: string;
    was_provisioned: boolean;
  };
  memo?: string;
  cost?: number;
}

export interface EnrichProfileResult {
  status: string;
  profile: PersonResult;
  request_id?: string;
  completed_at?: string;
  memo?: string;
  cost?: number;
}

export interface FindEmailResult {
  status: string;
  email: string | null;
  found: boolean;
  full_name?: string;
  company_domain?: string;
  request_id?: string;
  completed_at?: string;
  memo?: string;
  cost?: number;
}

export interface AsyncJobResult {
  request_id: string;
  status: string;
}

// Person Intelligence result types

/** Enrichment data nested inside deep research and enrichment responses. */
export interface PersonEnrichment {
  displayname?: string;
  firstname?: string;
  lastname?: string;
  bio?: string;
  location?: string;
  altemails?: string[];
  best_work_email?: string;
  best_personal_email?: string;
  fullphone?: Array<{ fullphone: string; type: string }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    endDate_formatted?: { is_current: boolean };
  }>;
  schools_info?: Array<{ name?: string; degree?: string; title?: string }>;
  social_profiles?: Record<string, {
    url?: string;
    username?: string;
    followers?: number;
  }>;
  newsfeed?: Array<{
    source?: string;
    type?: string;
    content?: string;
    date_posted?: string;
    engagement?: { likes?: number; replies?: number; shares?: number };
  }>;
}

export interface DeepResearchPersonResult {
  status: string;
  result: {
    enrichment: PersonEnrichment;
    following?: Record<string, unknown>[];
    articles?: Array<{
      title?: string;
      url?: string;
      source?: string;
      published_date?: string;
      snippet?: string;
    }>;
    dossier?: Record<string, unknown>;
  };
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface SocialProfilesResult {
  status: string;
  result: Record<string, {
    url?: string;
    username?: string;
    followers?: number;
    bio?: string;
  }>;
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface ArticleSearchResult {
  status: string;
  result: Array<{
    title?: string;
    url?: string;
    source?: string;
    published_date?: string;
    snippet?: string;
  }>;
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface PersonNewsfeedResult {
  status: string;
  result: Array<{
    platform?: string;
    content?: string;
    url?: string;
    posted_at?: string;
    likes?: number;
    replies?: number;
    shares?: number;
  }>;
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface PersonInterestsResult {
  status: string;
  result: Record<string, unknown>;
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface PersonInteractionsResult {
  status: string;
  result: {
    followers?: Array<Record<string, unknown>>;
    following?: Array<Record<string, unknown>>;
    replies?: Array<Record<string, unknown>>;
  };
  request_id: string;
  completed_at: string;
  memo?: string;
  cost?: number;
}

export interface VerifyEmailResult {
  status: string;
  email: string;
  valid: boolean;
  deliverable: boolean;
  catch_all: boolean;
  disposable: boolean;
  request_id?: string;
  completed_at?: string;
  memo?: string;
  cost?: number;
}

export interface InboxEmail {
  id: string;
  from: string;
  subject: string;
  received_at: string;
  thread_id?: string;
  body?: string;
  body_html?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
    content?: string;
  }>;
}

export interface InboxListResult {
  emails: InboxEmail[];
  count: number;
  has_more: boolean;
  agent_id: string;
}

export interface CommerceQuote {
  quote_id: string;
  product_title: string;
  subtotal: string;
  shipping: string;
  tax: string;
  fee: string;
  total: string;
}

export interface CommerceBuyResult {
  request_id?: string;
  status: string;
  order_id: string;
  order_status: string;
  tracking_url?: string;
  memo?: string;
  cost?: number;
}

export interface CommerceSearchProduct {
  product_url: string;
  title: string;
  price: number;
  currency: string;
  image_url?: string;
  vendor?: string;
  rating?: number;
  review_count?: number;
  in_stock?: boolean;
  description?: string;
}

export interface CommerceSearchResult {
  request_id?: string;
  status: string;
  query: string;
  products: CommerceSearchProduct[];
  count: number;
  memo?: string;
  cost?: number;
}

export interface VoiceQuote {
  quote_id: string;
  target_numbers: string[];
  conference_mode: boolean;
  objective_summary: string;
  talking_points: string[];
  success_criteria: string[];
  estimated_duration_minutes: number;
  complexity_score: number;
  pipeline_fee: string;
  phone_registration_fee: string;
  estimated_call_cost: string;
  total: string;
  needs_phone_registration: boolean;
  expires_at: string;
}

export interface VoiceCallResult {
  request_id?: string;
  status: string;
  ended_reason?: string;
  duration_seconds?: number;
  transcript?: string;
  summary?: string;
  success_evaluation?: string;
  structured_data?: Record<string, unknown>;
  memo?: string;
  cost?: number;
  credit_issued?: number;
}

export interface SmsQuote {
  quote_id: string;
  recipient_count: number;
  message_length: number;
  segment_count: number;
  per_message_rate: string;
  messaging_fee: string;
  phone_registration_fee: string;
  total: string;
  needs_phone_registration: boolean;
  expires_at: string;
}

export interface SmsSendResult {
  request_id?: string;
  status: string;
  sent: number;
  failed: number;
  total: number;
  details: Array<{
    to: string;
    from?: string;
    status: string;
    message_sid?: string;
    error?: string;
  }>;
  memo?: string;
  cost?: number;
}

export interface SmsInboxMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  num_media: number;
  media_urls?: string[];
  thread_id?: string;
  related_outbound_id?: string;
  received_at: string;
  created_at: string;
}

export interface SmsInboxResult {
  messages: SmsInboxMessage[];
  count: number;
}

export interface Notification {
  id: string;
  agentId: string;
  type: 'job_completed' | 'job_failed' | 'voice_completed' | 'sms_completed' | 'credit_issued' | 'domain_expiring' | 'phone_expiring';
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationsListOptions {
  /** Only return unread notifications */
  unread?: boolean;
  /** Maximum number of notifications to return (default: 50, max: 100) */
  limit?: number;
}

export interface NotificationsResult {
  notifications: Notification[];
  count: number;
}

// Build types
export interface BuildProduct {
  /** Product or business name */
  name: string;
  /** Description of the product/service (min 10 chars) */
  description: string;
  /** Industry category */
  industry?: string;
  /** Pricing information to display */
  pricing?: string;
}

export interface BuildLeadCapture {
  /** Enable lead capture form */
  enabled: boolean;
  /** Email to receive leads (defaults to agent inbox) */
  inbox_email?: string;
}

export interface BuildBrand {
  /** Primary brand color (hex format, e.g., #FF5733) */
  primary_color?: string;
  /** Font family preference */
  font?: string;
  /** Brand tone */
  tone?: 'professional' | 'playful' | 'bold' | 'minimal';
}

export interface BuildImages {
  /** Hero image URL */
  hero?: string;
  /** Logo image URL */
  logo?: string;
}

export interface BuildOptions extends ToolOptions {
  /** Website type */
  type?: 'saas' | 'portfolio' | 'agency' | 'personal' | 'product' | 'funnel' | 'restaurant' | 'event';
  /** Product/business information */
  product: BuildProduct;
  /** URL to analyze for content/inspiration */
  source_url?: string;
  /** Specific sections to include */
  sections?: string[];
  /** Lead capture configuration */
  lead_capture?: BuildLeadCapture;
  /** Brand customization */
  brand?: BuildBrand;
  /** Image URLs to use */
  images?: BuildImages;
  /** Custom domain (e.g., mysite.com) */
  domain?: string;
  /** Existing build ID to update */
  build_id?: string;
}

export interface BuildQuote {
  quote_id: string;
  type: string;
  product_name: string;
  analysis: {
    inferred_type: string;
    estimated_sections: number;
    estimated_ai_images: number;
    needs_lead_capture: boolean;
    needs_video: boolean;
    video_type?: string;
    complexity_score: number;
    reasoning: string;
  };
  pricing: {
    base_price: string;
    extra_sections_fee: string;
    ai_images_fee: string;
    video_embed_fee: string;
    lead_capture_fee: string;
    source_analysis_fee: string;
    custom_domain_fee: string;
    total: string;
  };
  expires_at: string;
}

export interface BuildResult {
  request_id?: string;
  status: string;
  success: boolean;
  production_url?: string;
  preview_url?: string;
  design_score?: number;
  iterations?: number;
  v0_chat_id?: string;
  vercel_deployment_id?: string;
  vercel_project_id?: string;
  github_repo?: string;
  error?: string;
  memo?: string;
  cost?: number;
}

// Browser types
export interface BrowserTaskOptions extends ToolOptions {
  /** Natural language instruction for what to do in the browser (min 10 chars) */
  task: string;
  /** JSON schema for structured output extraction */
  output_schema?: Record<string, unknown>;
  /** Initial URL to navigate to */
  start_url?: string;
  /** Restrict browsing to specific domains */
  allowed_domains?: string[];
  /** Reuse an existing browser session */
  session_id?: string;
  /** Persistent browser profile ID for reusing cookies/localStorage across sessions */
  profile_id?: string;
  /** Domain-scoped credentials for auto-login, e.g. { "github.com": "user:token" } */
  secrets?: Record<string, string>;
  /** Maximum browser steps (default: 50, max: 100) */
  max_steps?: number;
}

export interface BrowserProfile {
  id: string;
  name: string;
}

export interface BrowserQuote {
  quote_id: string;
  task_preview: string;
  estimated_steps: number;
  max_steps: number;
  estimated_cost: string;
  has_output_schema: boolean;
  start_url: string | null;
  expires_at: string;
}

export interface BrowserResult {
  request_id?: string;
  output?: string | Record<string, unknown>;
  steps?: Array<{ number: number; goal: string; url: string }>;
  memo?: string;
  cost?: number;
  output_files?: string[];
  browser_task_id?: string;
  session_id?: string;
}

export interface UpdateBuildOptions extends ToolOptions {
  /** Existing build ID to update (required) */
  build_id: string;
  /** Updated product/business information */
  product: BuildProduct;
  /** Website type (optional, defaults to existing) */
  type?: 'saas' | 'portfolio' | 'agency' | 'personal' | 'product' | 'funnel' | 'restaurant' | 'event';
  /** URL to analyze for content/inspiration */
  source_url?: string;
  /** Specific sections to include */
  sections?: string[];
  /** Lead capture configuration */
  lead_capture?: BuildLeadCapture;
  /** Brand customization */
  brand?: BuildBrand;
  /** Image URLs to use */
  images?: BuildImages;
  /** Custom domain */
  domain?: string;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface SpendCategory {
  category: string;
  total: string;
  count: number;
  pct: number;
}

export interface SpendBreakdown {
  categories: SpendCategory[];
  total: string;
  period_days: number;
}

export interface RoCSResult {
  rocs: number;
  total_spend: string;
  total_value: string;
  period_days: number;
}

export interface Receipt {
  id: string;
  receipt_id: string;
  category: string;
  subcategory: string;
  amount_usdc: string;
  service_fee: string;
  status: string;
  settlement_tx: string | null;
  value_tag: { type: string; amount?: number; label?: string } | null;
  job_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  settled_at: string | null;
}

export interface ReceiptsListResult {
  receipts: Receipt[];
  count: number;
  has_more: boolean;
}

export interface UnifiedBalance {
  on_chain_balance: string;
  credits_balance: string;
  currency: string;
  address: string;
  chain_id: number;
}

// Compute types

export interface ComputeSchedule {
  /** Cron expression (UTC). Minimum interval: 15 minutes. */
  cron: string;
  /** USDC budget per run */
  budget_per_run: number;
  /** Maximum number of runs (optional — runs indefinitely if omitted) */
  max_runs?: number;
}

export interface ComputeOptions extends ToolOptions {
  /** Natural language objective for the orchestrator */
  objective: string;
  /** Additional parameters / constraints */
  params?: Record<string, unknown>;
  /** Suggested budget in USDC (server will estimate if omitted) */
  budget_usdc?: number;
  /** ISO deadline for completion */
  deadline?: string;
  /** Route to a specific Soul agent */
  soul_slug?: string;
  /** Route to a specific Soul service */
  soul_service_slug?: string;
  /** Make this a recurring goal */
  schedule?: ComputeSchedule;
}

export interface ComputeQuote {
  quote_id: string;
  objective_summary: string;
  estimated_phases: number;
  estimated_tasks: number;
  estimated_duration_days: number;
  budget_breakdown: Record<string, string>;
  total_budget: string;
  expires_at: string;
  schedule_cron?: string;
  budget_per_run?: number;
  max_runs?: number;
  projected_runs?: number;
}

export interface ComputeGoalResult {
  goal_id: string;
  request_id: string;
  receipt_id?: string;
  status: string;
  message: string;
  memo?: string;
  cost?: number;
  goal: {
    objective: string;
    budget_usdc: string;
    deadline?: string;
    schedule_cron?: string;
    budget_per_run?: number;
    max_runs?: number;
    next_run_at?: string;
  };
}

export interface ComputeGoalStatus {
  id: string;
  status: string;
  name: string;
  objective: string;
  current_phase: number | null;
  plan: unknown;
  budget: {
    total: string;
    spent: string;
    reserved: string;
    remaining: string;
  } | null;
  soul_agent_id: string | null;
  deadline: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_wake_at: string | null;
  next_wake_at: string | null;
  created_at: string;
  schedule?: {
    cron: string;
    budget_per_run: string;
    max_runs: number | null;
    run_count: number;
    last_run_at: string | null;
    next_run_at: string | null;
  };
}

export interface ComputeTask {
  id: string;
  task_type: string;
  tool: string | null;
  description: string;
  status: string;
  phase: number | null;
  sequence: number | null;
  progress_pct: number | null;
  progress_message: string | null;
  result: unknown;
  quoted_usdc: string | null;
  actual_usdc: string | null;
  run_number: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ComputeBudgetStatus {
  budgetId: string;
  goalId: string;
  totalBudgetUsdc: string;
  spentUsdc: string;
  reservedUsdc: string;
  remainingUsdc: string;
  spend_entries: Array<{
    category: string;
    amount_usdc: string;
    description: string;
    created_at: string;
  }>;
}
