import { ethers } from 'ethers';
import type { WalletProvider, TypedDataDomain, TypedDataField } from './wallet-provider';
import { EthersWalletProvider } from './providers/ethers';

export type { WalletProvider, TypedDataDomain, TypedDataField, TransactionRequest, TransactionResponse } from './wallet-provider';
export { EthersWalletProvider } from './providers/ethers';
export { CdpWalletProvider } from './providers/cdp';
export { getSwapQuote, executeSwap } from './swap';
export type { SwapQuote, SwapResult, UniswapAddresses } from './swap';

const SDK_VERSION = '0.13.1';

// ============================================================================
// Environment Configuration
// ============================================================================

const BASE_URL = 'https://win.oneshotagent.com';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ============================================================================
// Error Classes
// ============================================================================

export class OneShotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OneShotError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ToolError extends OneShotError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export class JobError extends OneShotError {
  constructor(
    message: string,
    public readonly jobId: string,
    public readonly jobError: string
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export class JobTimeoutError extends OneShotError {
  constructor(
    public readonly jobId: string,
    public readonly elapsedMs: number
  ) {
    super(`Job ${jobId} timed out after ${elapsedMs / 1000}s`);
    this.name = 'JobTimeoutError';
  }
}

export class ValidationError extends OneShotError {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ContentBlockedError extends OneShotError {
  constructor(
    message: string,
    public readonly categories: string[]
  ) {
    super(message);
    this.name = 'ContentBlockedError';
  }
}

export class EmergencyNumberError extends OneShotError {
  constructor(
    message: string,
    public readonly blockedNumber: string
  ) {
    super(message);
    this.name = 'EmergencyNumberError';
  }
}

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

export interface ToolOptions {
  maxCost?: number;
  timeout?: number;
  signal?: AbortSignal;
  onStatusUpdate?: StatusUpdateFn;
  wait?: boolean;
  /** Optional value tag for RoCS tracking — stored in the receipt at creation time */
  valueTag?: { type: string; amount?: number; label?: string };
}

export interface EmailToolOptions extends ToolOptions {
  to: string | string[];
  subject: string;
  body: string;
  from_domain?: string;
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
}

export interface WebReadOptions extends ToolOptions {
  /** URL of the web page to read */
  url: string;
}

export interface WebReadResult {
  url: string;
  markdown: string;
  screenshot_url?: string;
  metadata?: { title: string; description: string; statusCode?: number };
  truncated?: boolean;
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
}

export interface PeopleSearchResult {
  status: string;
  results: PersonResult[];
  total_found: number;
  request_id?: string;
  completed_at?: string;
  filters?: Record<string, unknown>;
}

export interface ResearchResult {
  report_content: string;
  sources: Array<{ url: string; title?: string }>;
  sources_count: number;
  topic: string;
  depth: string;
  workspace: string;
  report_path: string;
  completed_at: string;
  report_gcs_uri: string;
}

export interface EmailResult {
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
}

export interface EnrichProfileResult {
  status: string;
  profile: PersonResult;
  request_id?: string;
  completed_at?: string;
}

export interface FindEmailResult {
  status: string;
  email: string | null;
  found: boolean;
  full_name?: string;
  company_domain?: string;
  request_id?: string;
  completed_at?: string;
}

export interface AsyncJobResult {
  request_id: string;
  status: string;
}

// Person Intelligence result types (Nyne-powered endpoints)

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
}

export interface PersonInterestsResult {
  status: string;
  result: Record<string, unknown>;
  request_id: string;
  completed_at: string;
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
  status: string;
  order_id: string;
  order_status: string;
  tracking_url?: string;
  provider: string;
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
  status: string;
  query: string;
  provider: string;
  products: CommerceSearchProduct[];
  count: number;
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
  status: string;
  ended_reason?: string;
  duration_seconds?: number;
  transcript?: string;
  summary?: string;
  success_evaluation?: string;
  structured_data?: Record<string, unknown>;
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
  output?: string | Record<string, unknown>;
  steps?: Array<{ number: number; goal: string; url: string }>;
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
  provider_cost: string;
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

// ============================================================================
// OneShot SDK
// ============================================================================

/**
 * OneShot Agent SDK - Execute commercial transactions with automatic x402 payments.
 *
 * @example
 * ```typescript
 * const agent = new OneShot({ privateKey: process.env.AGENT_PRIVATE_KEY });
 * await agent.email({ to: 'user@example.com', subject: 'Hi', body: 'Hello' });
 * ```
 */
export class OneShot {
  private readonly provider: WalletProvider;
  private readonly rpcProvider: ethers.JsonRpcProvider;
  private readonly baseUrl: string;
  private readonly debug: boolean;
  private readonly logger: LoggerFn;
  private readonly _currency: 'USDC' | 'ETH';
  private readonly _slippage: number;

  /**
   * Async factory — required for CDP wallets (account creation is async).
   * Also works with privateKey and custom walletProvider.
   *
   * @example
   * ```typescript
   * // CDP wallet (no private keys)
   * const agent = await OneShot.create({ cdp: true });
   *
   * // Raw private key (still works)
   * const agent = await OneShot.create({ privateKey: '0x...' });
   * ```
   */
  static async create(config: OneShotConfig): Promise<OneShot> {
    if (config.walletProvider) {
      return new OneShot(config, config.walletProvider);
    }

    if (config.cdp) {
      const { CdpWalletProvider } = await import('./providers/cdp');
      const cdpOpts = typeof config.cdp === 'object' ? config.cdp : undefined;
      const walletProvider = await CdpWalletProvider.create(cdpOpts);
      return new OneShot(config, walletProvider);
    }

    if (config.privateKey) {
      const rpcProvider = new ethers.JsonRpcProvider(config.rpcUrl ?? RPC_URL);
      const walletProvider = new EthersWalletProvider(config.privateKey, rpcProvider);
      return new OneShot(config, walletProvider);
    }

    throw new ValidationError(
      'Provide one of: privateKey, cdp, or walletProvider',
      'config'
    );
  }

  /**
   * Sync constructor — works with privateKey (backwards compatible).
   * For CDP wallets, use OneShot.create() instead.
   */
  constructor(config: OneShotConfig, walletProvider?: WalletProvider) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? console.log;
    this._currency = config.currency ?? 'USDC';
    this._slippage = config.slippage ?? 0.01;
    this.rpcProvider = new ethers.JsonRpcProvider(config.rpcUrl ?? RPC_URL);

    if (walletProvider) {
      this.provider = walletProvider;
    } else if (config.privateKey) {
      this.provider = new EthersWalletProvider(config.privateKey, this.rpcProvider);
    } else {
      throw new ValidationError(
        'Provide privateKey or use OneShot.create() for CDP/custom wallets',
        'config'
      );
    }

    // Validate ETH mode requirements
    if (this._currency === 'ETH' && !this.provider.sendTransaction) {
      throw new ValidationError(
        'ETH currency mode requires a wallet provider that supports sendTransaction',
        'currency'
      );
    }

    if (this.debug) {
      this.log(`SDK initialized — chain=${CHAIN_ID} currency=${this._currency}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  get address(): string {
    return this.provider.address;
  }

  get usdcAddress(): string {
    return USDC_ADDRESS;
  }

  get chainId(): number {
    return CHAIN_ID;
  }

  get currency(): 'USDC' | 'ETH' {
    return this._currency;
  }

  get slippage(): number {
    return this._slippage;
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  async tool<T = unknown>(toolName: string, options: ToolOptions & Record<string, unknown>): Promise<T> {
    return this.executeToolRequest<T>(`/v1/tools/${toolName}`, options);
  }

  async email(options: EmailToolOptions): Promise<EmailResult> {
    this.validate(options.to, 'to');
    this.validate(options.subject, 'subject');
    this.validate(options.body, 'body');

    const fromAddress = `agent@${options.from_domain ?? 'oneshotagent.com'}`;

    const quote = await this.tool<{ total_cost: string; quote_id: string }>('email/quote', {
      from_address: fromAddress,
      to_address: options.to,
      subject: options.subject,
      body: options.body
    });

    this.log(`Email quote: $${quote.total_cost}`);

    const payload: Record<string, unknown> = {
      from_address: fromAddress,
      to_address: options.to,
      subject: options.subject,
      body: options.body,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    if (options.attachments?.length) {
      payload.attachments = options.attachments;
    }

    return this.executeToolRequest<EmailResult>('/v1/tools/email/send', payload, quote.quote_id);
  }

  async research(options: ResearchToolOptions): Promise<ResearchResult> {
    this.validate(options.topic, 'topic');
    return this.tool('research', { ...options });
  }

  async peopleSearch(options: PeopleSearchOptions): Promise<PeopleSearchResult> {
    return this.tool('research/people', { ...options, limit: options.limit ?? 100 });
  }

  async enrichProfile(options: EnrichProfileOptions): Promise<EnrichProfileResult> {
    if (!options.linkedin_url && !options.email && !options.name) {
      throw new ValidationError('At least one of linkedin_url, email, or name is required', 'identifier');
    }
    return this.tool('enrich/profile', { ...options });
  }

  async findEmail(options: FindEmailOptions): Promise<FindEmailResult> {
    this.validate(options.company_domain, 'company_domain');
    if (!options.full_name && !(options.first_name && options.last_name)) {
      throw new ValidationError('Either full_name or both first_name and last_name required', 'name');
    }
    return this.tool('enrich/email', { ...options });
  }

  async verifyEmail(options: VerifyEmailOptions): Promise<VerifyEmailResult> {
    this.validate(options.email, 'email');
    return this.tool('verify/email', { ...options });
  }

  async deepResearchPerson(options: DeepResearchPersonOptions): Promise<DeepResearchPersonResult> {
    if (!options.email && !options.social_media_url && !options.name) {
      throw new ValidationError('At least one of email, social_media_url, or name is required', 'identifier');
    }
    return this.tool('research/person', { ...options });
  }

  async socialProfiles(options: SocialProfilesOptions): Promise<SocialProfilesResult> {
    if (!options.email && !options.social_media_url) {
      throw new ValidationError('At least one of email or social_media_url is required', 'identifier');
    }
    return this.tool('research/social', { ...options });
  }

  async articleSearch(options: ArticleSearchOptions): Promise<ArticleSearchResult> {
    this.validate(options.name, 'name');
    this.validate(options.company, 'company');
    return this.tool('research/articles', { ...options });
  }

  async personNewsfeed(options: PersonNewsfeedOptions): Promise<PersonNewsfeedResult> {
    this.validate(options.social_media_url, 'social_media_url');
    return this.tool('research/newsfeed', { ...options });
  }

  async personInterests(options: PersonInterestsOptions): Promise<PersonInterestsResult> {
    if (!options.email && !options.phone && !options.social_media_url) {
      throw new ValidationError('At least one of email, phone, or social_media_url is required', 'identifier');
    }
    return this.tool('research/interests', { ...options });
  }

  async personInteractions(options: PersonInteractionsOptions): Promise<PersonInteractionsResult> {
    this.validate(options.social_media_url, 'social_media_url');
    return this.tool('research/interactions', { ...options });
  }

  async inboxList(options: InboxListOptions = {}): Promise<InboxListResult> {
    const params = new URLSearchParams();
    if (options.since) params.set('since', options.since);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.include_body) params.set('include_body', 'true');

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/tools/inbox${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list inbox', response.status, await response.text());
    }
    return response.json() as Promise<InboxListResult>;
  }

  async inboxGet(emailId: string): Promise<InboxEmail> {
    this.validate(emailId, 'emailId');

    const response = await fetch(`${this.baseUrl}/v1/tools/inbox/${emailId}`, {
      headers: this.headers()
    });

    if (response.status === 404) {
      throw new ToolError('Email not found', 404, 'Email not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get email', response.status, await response.text());
    }
    return response.json() as Promise<InboxEmail>;
  }

  async commerceBuy(options: CommerceBuyOptions): Promise<CommerceBuyResult> {
    this.validate(options.product_url, 'product_url');
    this.validate(options.shipping_address, 'shipping_address');
    this.validate(options.shipping_address?.phone, 'shipping_address.phone');

    const payload = {
      product_url: options.product_url,
      shipping_address: options.shipping_address,
      quantity: options.quantity ?? 1,
      variant_id: options.variant_id
    };

    // Commerce quotes can take up to 90s due to Rye API polling
    const quoteResp = await this.makeRequest('/v1/tools/commerce/buy', payload, undefined, undefined, options.signal, 120000);
    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: CommerceQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Commerce quote: $${quoteData.context.total} for "${quoteData.context.product_title}"`);

    if (options.maxCost && parseFloat(quoteData.context.total) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.total} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/tools/commerce/buy', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const buyResp = await this.makeRequest('/v1/tools/commerce/buy', payload, auth, quoteData.context.quote_id, options.signal, 60000);

    if (buyResp.status !== 202) {
      throw new ToolError('Commerce buy failed', buyResp.status, await buyResp.text());
    }

    const result = await buyResp.json() as { request_id: string; status: string };
    this.log(`Order submitted: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout ?? 180, options.signal, options.onStatusUpdate);
    }
    return result as unknown as CommerceBuyResult;
  }

  async commerceSearch(options: CommerceSearchOptions): Promise<CommerceSearchResult> {
    this.validate(options.query, 'query');
    return this.tool('commerce/search', { ...options, limit: options.limit ?? 10 });
  }

  async webSearch(options: WebSearchOptions): Promise<WebSearchResult> {
    this.validate(options.query, 'query');
    return this.tool('search', { ...options, max_results: options.max_results ?? 5 });
  }

  async webRead(options: WebReadOptions): Promise<WebReadResult> {
    this.validate(options.url, 'url');
    return this.tool('web-read', { ...options });
  }

  /**
   * Make an autonomous voice call
   *
   * @example
   * ```typescript
   * const result = await agent.voice({
   *   objective: 'Call the restaurant to make a reservation for 2 at 7pm',
   *   target_number: '+14155551234',
   *   caller_persona: 'A polite assistant making a reservation'
   * });
   * console.log(result.transcript);
   * ```
   */
  async voice(options: VoiceCallOptions): Promise<VoiceCallResult> {
    this.validate(options.objective, 'objective');
    this.validate(options.target_number, 'target_number');

    // Check for empty arrays
    if (Array.isArray(options.target_number) && options.target_number.length === 0) {
      throw new ValidationError('target_number array cannot be empty', 'target_number');
    }

    if (options.objective.length < 10) {
      throw new ValidationError('Objective must be at least 10 characters', 'objective');
    }

    if (options.max_duration_minutes !== undefined && (options.max_duration_minutes < 1 || options.max_duration_minutes > 30)) {
      throw new ValidationError('max_duration_minutes must be between 1 and 30', 'max_duration_minutes');
    }

    const payload: Record<string, unknown> = {
      objective: options.objective,
      target_number: options.target_number,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    if (options.caller_persona) payload.caller_persona = options.caller_persona;
    if (options.context) payload.context = options.context;
    if (options.max_duration_minutes) payload.max_duration_minutes = options.max_duration_minutes;

    // Voice uses quote-to-pay flow (402 -> payment -> 202)
    const quoteResp = await this.makeRequest('/v1/tools/voice/call', payload, undefined, undefined, options.signal);

    // Handle error responses before expecting 402
    if (quoteResp.status === 400) {
      const errorData = await quoteResp.json() as { error: string; message: string; categories?: string[]; blocked_number?: string };
      if (errorData.error === 'content_blocked') {
        throw new ContentBlockedError(errorData.message, errorData.categories || []);
      }
      if (errorData.error === 'emergency_number_blocked') {
        throw new EmergencyNumberError(errorData.message, errorData.blocked_number || '');
      }
      throw new ValidationError(errorData.message || 'Invalid request', 'request');
    }

    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: VoiceQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Voice quote: $${quoteData.context.total} for ${quoteData.context.estimated_duration_minutes}min call`);
    this.log(`Objective summary: ${quoteData.context.objective_summary}`);

    if (options.maxCost && parseFloat(quoteData.context.total) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.total} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/tools/voice/call', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const callResp = await this.makeRequest('/v1/tools/voice/call', payload, auth, quoteData.context.quote_id, options.signal);

    if (callResp.status !== 202) {
      throw new ToolError('Voice call initiation failed', callResp.status, await callResp.text());
    }

    const result = await callResp.json() as { request_id: string; status: string };
    this.log(`Call initiated: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout ?? 300, options.signal, options.onStatusUpdate);
    }
    return result as VoiceCallResult;
  }

  /**
   * Send an SMS message
   *
   * @example
   * ```typescript
   * const result = await agent.sms({
   *   message: 'Your order has shipped!',
   *   to_number: '+14155551234'
   * });
   * console.log(result.status);
   * ```
   */
  async sms(options: SmsOptions): Promise<SmsSendResult> {
    this.validate(options.message, 'message');
    this.validate(options.to_number, 'to_number');

    // Check for empty arrays
    if (Array.isArray(options.to_number) && options.to_number.length === 0) {
      throw new ValidationError('to_number array cannot be empty', 'to_number');
    }

    if (options.message.length < 1) {
      throw new ValidationError('Message is required', 'message');
    }

    if (options.message.length > 1600) {
      throw new ValidationError('Message must be 1600 characters or less', 'message');
    }

    const recipientCount = Array.isArray(options.to_number) ? options.to_number.length : 1;
    if (recipientCount > 10) {
      throw new ValidationError('Maximum 10 recipients allowed', 'to_number');
    }

    const payload: Record<string, unknown> = {
      message: options.message,
      to_number: options.to_number,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    // SMS uses quote-to-pay flow (402 -> payment -> 202)
    const quoteResp = await this.makeRequest('/v1/tools/sms/send', payload, undefined, undefined, options.signal);

    // Handle error responses before expecting 402
    if (quoteResp.status === 400) {
      const errorData = await quoteResp.json() as { error: string; message: string; categories?: string[]; blocked_number?: string };
      if (errorData.error === 'content_blocked') {
        throw new ContentBlockedError(errorData.message, errorData.categories || []);
      }
      if (errorData.error === 'emergency_number_blocked') {
        throw new EmergencyNumberError(errorData.message, errorData.blocked_number || '');
      }
      throw new ValidationError(errorData.message || 'Invalid request', 'request');
    }

    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: SmsQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`SMS quote: $${quoteData.context.total} for ${quoteData.context.segment_count} segment(s) to ${recipientCount} recipient(s)`);

    if (options.maxCost && parseFloat(quoteData.context.total) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.total} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/tools/sms/send', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const sendResp = await this.makeRequest('/v1/tools/sms/send', payload, auth, quoteData.context.quote_id, options.signal);

    if (sendResp.status !== 202) {
      throw new ToolError('SMS send failed', sendResp.status, await sendResp.text());
    }

    const result = await sendResp.json() as { request_id: string; status: string };
    this.log(`SMS queued: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout ?? 60, options.signal, options.onStatusUpdate);
    }
    return result as unknown as SmsSendResult;
  }

  /**
   * Build a website
   *
   * @example
   * ```typescript
   * const result = await agent.build({
   *   type: 'saas',
   *   product: {
   *     name: 'Acme Analytics',
   *     description: 'Real-time analytics for modern teams'
   *   },
   *   lead_capture: { enabled: true }
   * });
   * console.log(result.url);
   * ```
   */
  async build(options: BuildOptions): Promise<BuildResult> {
    this.validate(options.product, 'product');
    this.validate(options.product?.name, 'product.name');
    this.validate(options.product?.description, 'product.description');

    if (options.product.description.length < 10) {
      throw new ValidationError('Product description must be at least 10 characters', 'product.description');
    }

    const payload: Record<string, unknown> = {
      type: options.type ?? 'saas',
      product: options.product,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    if (options.source_url) payload.source_url = options.source_url;
    if (options.sections) payload.sections = options.sections;
    if (options.lead_capture) payload.lead_capture = options.lead_capture;
    if (options.brand) payload.brand = options.brand;
    if (options.images) payload.images = options.images;
    if (options.domain) payload.domain = options.domain;
    if (options.build_id) payload.build_id = options.build_id;

    // Build uses quote-to-pay flow (402 -> payment -> 202)
    const quoteResp = await this.makeRequest('/v1/tools/build', payload, undefined, undefined, options.signal);

    if (quoteResp.status === 400) {
      const errorData = await quoteResp.json() as { error: string; message: string; details?: unknown };
      throw new ValidationError(errorData.message || 'Invalid request', 'request');
    }

    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: BuildQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Build quote: $${quoteData.context.pricing.total} for "${quoteData.context.product_name}"`);
    this.log(`Type: ${quoteData.context.analysis.inferred_type}, Sections: ${quoteData.context.analysis.estimated_sections}`);

    if (options.maxCost && parseFloat(quoteData.context.pricing.total) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.pricing.total} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/tools/build', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const buildResp = await this.makeRequest('/v1/tools/build', payload, auth, quoteData.context.quote_id, options.signal);

    if (buildResp.status !== 202) {
      throw new ToolError('Build initiation failed', buildResp.status, await buildResp.text());
    }

    const result = await buildResp.json() as { request_id: string; status: string; build?: { lead_capture_email?: string } };
    this.log(`Build initiated: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout ?? 600, options.signal, options.onStatusUpdate);
    }
    return result as unknown as BuildResult;
  }

  /**
   * Automate a browser task using natural language
   *
   * @example
   * ```typescript
   * const result = await agent.browser({
   *   task: 'Go to CoinGecko and find the current price of Bitcoin',
   *   start_url: 'https://www.coingecko.com',
   * });
   * console.log(result.output);
   * ```
   */
  async browser(options: BrowserTaskOptions): Promise<BrowserResult> {
    this.validate(options.task, 'task');

    if (options.task.length < 10) {
      throw new ValidationError('Task must be at least 10 characters', 'task');
    }

    if (options.max_steps !== undefined && (options.max_steps < 1 || options.max_steps > 100)) {
      throw new ValidationError('max_steps must be between 1 and 100', 'max_steps');
    }

    const payload: Record<string, unknown> = {
      task: options.task,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    if (options.output_schema) payload.output_schema = options.output_schema;
    if (options.start_url) payload.start_url = options.start_url;
    if (options.allowed_domains) payload.allowed_domains = options.allowed_domains;
    if (options.session_id) payload.session_id = options.session_id;
    if (options.profile_id) payload.profile_id = options.profile_id;
    if (options.secrets) payload.secrets = options.secrets;
    if (options.max_steps) payload.max_steps = options.max_steps;

    // Browser uses quote-to-pay flow (402 -> payment -> 202)
    const quoteResp = await this.makeRequest('/v1/tools/browser', payload, undefined, undefined, options.signal);

    if (quoteResp.status === 400) {
      const errorData = await quoteResp.json() as { error: string; message: string };
      throw new ValidationError(errorData.message || 'Invalid request', 'request');
    }

    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: BrowserQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Browser quote: $${quoteData.context.estimated_cost} for ~${quoteData.context.estimated_steps} steps`);

    if (options.maxCost && parseFloat(quoteData.context.estimated_cost) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.estimated_cost} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/tools/browser', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const execResp = await this.makeRequest('/v1/tools/browser', payload, auth, quoteData.context.quote_id, options.signal);

    if (execResp.status !== 202) {
      throw new ToolError('Browser task initiation failed', execResp.status, await execResp.text());
    }

    const result = await execResp.json() as { request_id: string; status: string };
    this.log(`Browser task initiated: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout ?? 300, options.signal, options.onStatusUpdate);
    }
    return result as BrowserResult;
  }

  /**
   * Create a persistent browser profile for reusing cookies/localStorage across sessions
   *
   * @example
   * ```typescript
   * const profile = await agent.createBrowserProfile('linkedin-session');
   * console.log(profile.id); // Use this in browser({ profile_id: ... })
   * ```
   */
  async createBrowserProfile(name: string): Promise<BrowserProfile> {
    this.validate(name, 'name');

    const response = await fetch(`${this.baseUrl}/v1/tools/browser/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new ToolError('Failed to create browser profile', response.status, await response.text());
    }
    return response.json() as Promise<BrowserProfile>;
  }

  /**
   * List all browser profiles
   *
   * @example
   * ```typescript
   * const profiles = await agent.listBrowserProfiles();
   * for (const p of profiles) {
   *   console.log(`${p.name} (${p.id})`);
   * }
   * ```
   */
  async listBrowserProfiles(): Promise<BrowserProfile[]> {
    const response = await fetch(`${this.baseUrl}/v1/tools/browser/profiles`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new ToolError('Failed to list browser profiles', response.status, await response.text());
    }
    const data = await response.json() as { profiles: BrowserProfile[] };
    return data.profiles;
  }

  /**
   * Delete a browser profile
   *
   * @example
   * ```typescript
   * await agent.deleteBrowserProfile('profile-id-here');
   * ```
   */
  async deleteBrowserProfile(profileId: string): Promise<void> {
    this.validate(profileId, 'profileId');

    const response = await fetch(`${this.baseUrl}/v1/tools/browser/profiles/${profileId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new ToolError('Failed to delete browser profile', response.status, await response.text());
    }
  }

  /**
   * Update an existing website build
   *
   * @example
   * ```typescript
   * const result = await agent.updateBuild({
   *   build_id: 'existing-build-uuid',
   *   product: {
   *     name: 'Acme Analytics v2',
   *     description: 'Updated: Real-time analytics with new AI features'
   *   }
   * });
   * console.log(result.url);
   * ```
   */
  async updateBuild(options: UpdateBuildOptions): Promise<BuildResult> {
    this.validate(options.build_id, 'build_id');
    return this.build({
      ...options,
      build_id: options.build_id
    });
  }

  /**
   * List inbound SMS messages
   *
   * @example
   * ```typescript
   * const inbox = await agent.smsInboxList({ limit: 10 });
   * for (const msg of inbox.messages) {
   *   console.log(`From ${msg.from}: ${msg.body}`);
   * }
   * ```
   */
  async smsInboxList(options: SmsInboxOptions = {}): Promise<SmsInboxResult> {
    const params = new URLSearchParams();
    if (options.since) params.set('since', options.since);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.from) params.set('from', options.from);

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/tools/sms/inbox${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list SMS inbox', response.status, await response.text());
    }
    return response.json() as Promise<SmsInboxResult>;
  }

  /**
   * Get a specific inbound SMS message
   *
   * @example
   * ```typescript
   * const msg = await agent.smsInboxGet('msg_abc123');
   * console.log(msg.body);
   * ```
   */
  async smsInboxGet(messageId: string): Promise<SmsInboxMessage> {
    this.validate(messageId, 'messageId');

    const response = await fetch(`${this.baseUrl}/v1/tools/sms/inbox/${messageId}`, {
      headers: this.headers()
    });

    if (response.status === 404) {
      throw new ToolError('SMS message not found', 404, 'Message not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get SMS message', response.status, await response.text());
    }
    return response.json() as Promise<SmsInboxMessage>;
  }

  /**
   * List notifications for the agent
   *
   * @example
   * ```typescript
   * // Get all notifications
   * const all = await agent.notifications();
   *
   * // Get only unread notifications
   * const unread = await agent.notifications({ unread: true });
   * ```
   */
  async notifications(options: NotificationsListOptions = {}): Promise<NotificationsResult> {
    const params = new URLSearchParams();
    if (options.unread) params.set('unread', 'true');
    if (options.limit) params.set('limit', String(options.limit));

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/tools/notifications${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list notifications', response.status, await response.text());
    }
    return response.json() as Promise<NotificationsResult>;
  }

  /**
   * Mark a notification as read
   *
   * @example
   * ```typescript
   * await agent.markNotificationRead('notification-uuid');
   * ```
   */
  async markNotificationRead(notificationId: string): Promise<void> {
    this.validate(notificationId, 'notificationId');

    const response = await fetch(`${this.baseUrl}/v1/tools/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: this.headers()
    });

    if (response.status === 404) {
      throw new ToolError('Notification not found', 404, 'Notification not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to mark notification as read', response.status, await response.text());
    }
  }

  async getUnifiedBalance(): Promise<UnifiedBalance> {
    const response = await fetch(`${this.baseUrl}/v1/tools/balance`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to fetch balance', response.status, await response.text());
    }

    return response.json() as Promise<UnifiedBalance>;
  }

  async getBalance(tokenAddress?: string): Promise<string> {
    // Use unified API endpoint for USDC (default) balance
    if (!tokenAddress || tokenAddress === this.usdcAddress) {
      const unified = await this.getUnifiedBalance();
      return unified.on_chain_balance;
    }

    // Custom token: keep existing RPC logic
    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
      this.rpcProvider
    );

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(this.provider.address),
      contract.decimals()
    ]);

    return ethers.formatUnits(balance, decimals);
  }

  // ---------------------------------------------------------------------------
  // Compute methods
  // ---------------------------------------------------------------------------

  /**
   * Create a compute goal — the orchestrator will plan, execute, and iterate autonomously.
   *
   * Uses the quote-then-pay flow: first call gets a 402 with a budget estimate,
   * second call (with payment) creates the goal.
   *
   * @example
   * ```typescript
   * const goal = await agent.compute({
   *   objective: 'Research the top 10 AI startups and build a comparison website',
   *   budget_usdc: 5.00
   * });
   * console.log(goal.goal_id);
   *
   * // Check progress
   * const status = await agent.getComputeGoal(goal.goal_id);
   * console.log(status.status, status.budget);
   * ```
   */
  async compute(options: ComputeOptions): Promise<ComputeGoalResult> {
    this.validate(options.objective, 'objective');

    const payload: Record<string, unknown> = {
      objective: options.objective,
    };

    if (options.params) payload.params = options.params;
    if (options.budget_usdc) payload.budget_usdc = options.budget_usdc;
    if (options.deadline) payload.deadline = options.deadline;
    if (options.soul_slug) payload.soul_slug = options.soul_slug;
    if (options.soul_service_slug) payload.soul_service_slug = options.soul_service_slug;
    if (options.schedule) payload.schedule = options.schedule;

    // First call: get quote (402)
    const quoteResp = await this.makeRequest('/v1/compute', payload, undefined, undefined, options.signal);

    if (quoteResp.status === 400) {
      const errorData = await quoteResp.json() as { error: string; message: string };
      if (errorData.error === 'content_blocked') {
        throw new ContentBlockedError(errorData.message, []);
      }
      throw new ValidationError(errorData.message || 'Invalid request', 'request');
    }

    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for compute quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: ComputeQuote;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Compute quote: $${quoteData.context.total_budget} — ${quoteData.context.objective_summary}`);

    if (options.maxCost && parseFloat(quoteData.context.total_budget) > options.maxCost) {
      throw new OneShotError(`Quote $${quoteData.context.total_budget} exceeds maxCost $${options.maxCost}`);
    }

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(options.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, '/v1/compute', payload, quoteData.context.quote_id, options.signal);
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const createResp = await this.makeRequest('/v1/compute', payload, auth, quoteData.context.quote_id, options.signal);

    if (createResp.status !== 202) {
      throw new ToolError('Compute goal creation failed', createResp.status, await createResp.text());
    }

    return createResp.json() as Promise<ComputeGoalResult>;
  }

  /**
   * Get the status of a compute goal
   *
   * @example
   * ```typescript
   * const status = await agent.getComputeGoal('goal_01HX...');
   * console.log(status.status, status.budget?.remaining);
   * ```
   */
  async getComputeGoal(goalId: string): Promise<ComputeGoalStatus> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}`, {
      headers: this.headers()
    });

    if (response.status === 404) {
      throw new ToolError('Goal not found', 404, 'Goal not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: ComputeGoalStatus };
    return json.data;
  }

  /**
   * List tasks under a compute goal
   *
   * @example
   * ```typescript
   * const tasks = await agent.getComputeTasks('goal_01HX...');
   * for (const t of tasks) {
   *   console.log(`${t.tool}: ${t.status} (${t.progress_pct ?? 0}%)`);
   * }
   * ```
   */
  async getComputeTasks(goalId: string): Promise<ComputeTask[]> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/tasks`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get compute tasks', response.status, await response.text());
    }

    const json = await response.json() as { data: ComputeTask[] };
    return json.data;
  }

  /**
   * Get budget status for a compute goal
   *
   * @example
   * ```typescript
   * const budget = await agent.getComputeBudget('goal_01HX...');
   * console.log(`Spent: $${budget.spentUsdc} / $${budget.totalBudgetUsdc}`);
   * ```
   */
  async getComputeBudget(goalId: string): Promise<ComputeBudgetStatus> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/budget`, {
      headers: this.headers()
    });

    if (response.status === 404) {
      throw new ToolError('Budget not found', 404, 'Budget not found for this goal');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get compute budget', response.status, await response.text());
    }

    const json = await response.json() as { data: ComputeBudgetStatus };
    return json.data;
  }

  /**
   * Cancel a compute goal. Remaining budget will be credited.
   *
   * @example
   * ```typescript
   * const result = await agent.cancelComputeGoal('goal_01HX...');
   * console.log(`Cancelled. Remaining: $${result.remaining_budget}`);
   * ```
   */
  async cancelComputeGoal(goalId: string, reason?: string): Promise<{ goal_id: string; status: string; remaining_budget: string }> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({ reason })
    });

    if (response.status === 404) {
      throw new ToolError('Goal not found', 404, 'Goal not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to cancel compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: { goal_id: string; status: string; remaining_budget: string } };
    return json.data;
  }

  /**
   * Respond to a human-in-the-loop approval task
   *
   * @example
   * ```typescript
   * await agent.respondToComputeTask('goal_01HX...', {
   *   task_id: 'task_01HX...',
   *   approved: true,
   *   response: 'Looks good, proceed'
   * });
   * ```
   */
  async respondToComputeTask(goalId: string, input: { task_id: string; response?: string; approved?: boolean }): Promise<{ task_id: string; goal_id: string; task_status: string; orchestrator_action: string }> {
    this.validate(goalId, 'goalId');
    this.validate(input.task_id, 'task_id');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify(input)
    });

    if (response.status === 404) {
      throw new ToolError('Goal or task not found', 404, await response.text());
    }
    if (!response.ok) {
      throw new ToolError('Failed to respond to compute task', response.status, await response.text());
    }

    const json = await response.json() as { data: { task_id: string; goal_id: string; task_status: string; orchestrator_action: string } };
    return json.data;
  }

  /**
   * Pause a recurring compute goal
   *
   * @example
   * ```typescript
   * await agent.pauseComputeGoal('goal_01HX...');
   * ```
   */
  async pauseComputeGoal(goalId: string, reason?: string): Promise<{ goal_id: string; status: string; run_count: number }> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      throw new ToolError('Failed to pause compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: { goal_id: string; status: string; run_count: number } };
    return json.data;
  }

  /**
   * Resume a paused recurring compute goal
   *
   * @example
   * ```typescript
   * const result = await agent.resumeComputeGoal('goal_01HX...');
   * console.log(`Resumed. Next run: ${result.next_run_at}`);
   * ```
   */
  async resumeComputeGoal(goalId: string): Promise<{ goal_id: string; status: string; next_run_at: string; run_count: number }> {
    this.validate(goalId, 'goalId');

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new ToolError('Failed to resume compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: { goal_id: string; status: string; next_run_at: string; run_count: number } };
    return json.data;
  }

  /**
   * Top up budget for a recurring compute goal
   *
   * @example
   * ```typescript
   * const result = await agent.fundComputeGoal('goal_01HX...', 10.00);
   * console.log(`New total: $${result.total_budget}`);
   * ```
   */
  async fundComputeGoal(goalId: string, amount: number): Promise<{ goal_id: string; topped_up: number; total_budget: string; remaining: string }> {
    this.validate(goalId, 'goalId');
    if (!amount || amount <= 0) {
      throw new ValidationError('amount must be a positive number', 'amount');
    }

    const response = await fetch(`${this.baseUrl}/v1/compute/${goalId}/fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({ amount })
    });

    if (!response.ok) {
      throw new ToolError('Failed to fund compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: { goal_id: string; topped_up: number; total_budget: string; remaining: string } };
    return json.data;
  }

  // ---------------------------------------------------------------------------
  // Analytics methods
  // ---------------------------------------------------------------------------

  /**
   * Get spend breakdown by category
   *
   * @example
   * ```typescript
   * const breakdown = await agent.spendBreakdown({ period: 30 });
   * console.log(`Total: $${breakdown.total}`);
   * for (const cat of breakdown.categories) {
   *   console.log(`${cat.category}: $${cat.total} (${cat.pct}%)`);
   * }
   * ```
   */
  async spendBreakdown(options?: { period?: number }): Promise<SpendBreakdown> {
    const params = new URLSearchParams();
    if (options?.period) params.set('period', String(options.period));

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/analytics/spend/breakdown${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get spend breakdown', response.status, await response.text());
    }
    return response.json() as Promise<SpendBreakdown>;
  }

  /**
   * Get Return on Cognitive Spend (RoCS)
   *
   * @example
   * ```typescript
   * const result = await agent.rocs({ period: 30 });
   * console.log(`RoCS: ${result.rocs}x (spent $${result.total_spend}, generated $${result.total_value})`);
   * ```
   */
  async rocs(options?: { period?: number }): Promise<RoCSResult> {
    const params = new URLSearchParams();
    if (options?.period) params.set('period', String(options.period));

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/analytics/rocs${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get RoCS', response.status, await response.text());
    }
    return response.json() as Promise<RoCSResult>;
  }

  /**
   * List receipts with optional filtering
   *
   * @example
   * ```typescript
   * const result = await agent.receiptsList({ period: 7, category: 'communication' });
   * for (const r of result.receipts) {
   *   console.log(`${r.subcategory}: $${r.amount_usdc}`);
   * }
   * ```
   */
  async receiptsList(options?: { period?: number; category?: string; limit?: number }): Promise<ReceiptsListResult> {
    const params = new URLSearchParams();
    if (options?.period) params.set('period', String(options.period));
    if (options?.category) params.set('category', options.category);
    if (options?.limit) params.set('limit', String(options.limit));

    const qs = params.toString();
    const response = await fetch(`${this.baseUrl}/v1/analytics/receipts${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list receipts', response.status, await response.text());
    }
    return response.json() as Promise<ReceiptsListResult>;
  }

  /**
   * Tag a receipt with a value for RoCS computation
   *
   * @example
   * ```typescript
   * await agent.tagReceiptValue('rcpt_01HX...', { type: 'revenue', amount: 5.00, label: 'Sale from lead' });
   * ```
   */
  async tagReceiptValue(receiptId: string, valueTag: { type: string; amount?: number; label?: string }): Promise<void> {
    this.validate(receiptId, 'receiptId');
    this.validate(valueTag.type, 'valueTag.type');

    const response = await fetch(`${this.baseUrl}/v1/analytics/receipts/${receiptId}/value`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers()
      },
      body: JSON.stringify(valueTag)
    });

    if (response.status === 404) {
      throw new ToolError('Receipt not found', 404, 'Receipt not found or not owned by this agent');
    }
    if (!response.ok) {
      throw new ToolError('Failed to tag receipt value', response.status, await response.text());
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private log(msg: string): void {
    if (this.debug) this.logger(`[OneShot] ${msg}`);
  }

  private validate(value: unknown, field: string): void {
    if (!value) throw new ValidationError(`${field} is required`, field);
  }

  private headers(): Record<string, string> {
    return {
      'X-Agent-ID': this.provider.address,
      'X-OneShot-SDK-Version': SDK_VERSION
    };
  }

  private async executeToolRequest<T>(
    endpoint: string,
    options: ToolOptions & Record<string, unknown>,
    quoteId?: string
  ): Promise<T> {
    const { signal, onStatusUpdate, wait = true, ...payload } = options;

    if (signal?.aborted) {
      throw new OneShotError('Operation cancelled');
    }

    let response = await this.makeRequest(endpoint, payload, undefined, quoteId, signal);

    // Handle 402 Payment Required
    if (response.status === 402) {
      // Parse x402 v2 PaymentRequired from PAYMENT-REQUIRED header
      const paymentRequiredHeader = response.headers.get('payment-required');
      const { accepted, resource, extensions } = this.parsePaymentRequired(paymentRequiredHeader);

      // Fallback: parse legacy body format for amount display
      const data = await response.json() as {
        payment_request?: { chain_id: number; token_address: string; amount: string; recipient: string };
      };
      const paymentInfo: PaymentInfo = {
        protocol: 'x402',
        network: accepted.network,
        payTo: accepted.payTo,
        amount: data.payment_request?.amount ?? ethers.formatUnits(accepted.amount, 6),
        currency: 'USD',
        facilitator_url: this.baseUrl,
        token: { address: accepted.asset, symbol: 'USDC', decimals: 6 }
      };
      this.log(`Payment required: ${paymentInfo.amount} USDC`);

      this.checkAbortBeforePayment(signal);
      const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
      response = await this.makeRequest(endpoint, payload, auth, quoteId, signal);
    }

    if (!response.ok) {
      throw new ToolError('Tool request failed', response.status, await response.text());
    }

    const result = await response.json() as Record<string, unknown>;

    // Handle async jobs
    if ((result.status === 'pending' || result.status === 'processing') && result.request_id) {
      this.log(`Job queued: ${result.request_id}`);
      if (!wait) {
        return { request_id: result.request_id, status: result.status } as T;
      }
      return this.pollJob(result.request_id as string, options.timeout, signal, onStatusUpdate);
    }

    return (result.data ?? result) as T;
  }

  private async pollJob<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn
  ): Promise<T> {
    // Try WebSocket push first, fall back to HTTP polling
    try {
      return await this.waitViaWebSocket<T>(requestId, timeoutSec, signal, onStatusUpdate);
    } catch {
      this.log('WebSocket unavailable, falling back to HTTP polling');
      return this.pollJobHttp<T>(requestId, timeoutSec, signal, onStatusUpdate);
    }
  }

  private waitViaWebSocket<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const maxWaitMs = (timeoutSec ?? 120) * 1000;
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') +
        `/v1/requests/subscribe?wallet=${encodeURIComponent(this.provider.address)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return reject(new Error('WebSocket not available'));
      }

      const timeout = setTimeout(() => {
        ws.close();
        reject(new JobTimeoutError(requestId, maxWaitMs));
      }, maxWaitMs);

      const cleanup = () => {
        clearTimeout(timeout);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          reject(new OneShotError('Operation cancelled'));
        }, { once: true });
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: [requestId] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());

          if (msg.request_id !== requestId) return;

          if (msg.status === 'completed') {
            this.log('Job completed (WebSocket)');
            cleanup();
            resolve((msg.result ?? msg) as T);
          } else if (msg.status === 'failed') {
            cleanup();
            reject(new JobError(`Job failed: ${msg.error ?? 'Unknown'}`, requestId, String(msg.error ?? 'Unknown')));
          } else {
            onStatusUpdate?.(msg.status, requestId);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        cleanup();
        reject(new Error('WebSocket error'));
      };

      ws.onclose = (event) => {
        // If closed before we got a result, reject so HTTP fallback kicks in
        if (event.code !== 1000) {
          cleanup();
          reject(new Error('WebSocket closed unexpectedly'));
        }
      };
    });
  }

  private async pollJobHttp<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn
  ): Promise<T> {
    const maxWaitMs = (timeoutSec ?? 120) * 1000;
    const startTime = Date.now();
    const pollInterval = 2000;
    let retries = 0;
    const maxRetries = 3;

    while (Date.now() - startTime < maxWaitMs) {
      if (signal?.aborted) throw new OneShotError('Operation cancelled');

      try {
        const resp = await fetch(`${this.baseUrl}/v1/requests/${requestId}`, {
          headers: this.headers(),
          signal
        });

        if (!resp.ok) {
          throw new ToolError('Failed to check job status', resp.status, await resp.text());
        }

        const job = await resp.json() as Record<string, unknown>;

        if (job.status === 'completed') {
          this.log('Job completed');
          return (job.result ?? job) as T;
        }

        if (job.status === 'failed') {
          throw new JobError(`Job failed: ${job.error ?? 'Unknown'}`, requestId, String(job.error ?? 'Unknown'));
        }

        onStatusUpdate?.(job.status as string, requestId);
        retries = 0;
        await this.sleep(pollInterval, signal);

      } catch (err) {
        if (err instanceof OneShotError) throw err;

        if (++retries > maxRetries) {
          throw new OneShotError(`Polling failed after ${maxRetries} retries: ${err}`);
        }

        const backoff = pollInterval * Math.pow(2, retries - 1);
        this.log(`Retry ${retries}/${maxRetries} in ${backoff}ms`);
        await this.sleep(backoff, signal);
      }
    }

    throw new JobTimeoutError(requestId, Date.now() - startTime);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new OneShotError('Operation cancelled'));
      }

      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new OneShotError('Operation cancelled'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async makeRequest(
    endpoint: string,
    data: Record<string, unknown>,
    payment?: PaymentAuthorization,
    quoteId?: string,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers()
    };

    if (payment) {
      const paymentJson = JSON.stringify(payment);
      const encoded = typeof Buffer !== 'undefined'
        ? Buffer.from(paymentJson).toString('base64')
        : btoa(paymentJson);
      headers['payment-signature'] = encoded;
    }
    if (quoteId) headers['x-quote-id'] = quoteId;

    // Create timeout signal if specified
    let fetchSignal = signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs && !signal) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      fetchSignal = controller.signal;
    }

    try {
      return await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: fetchSignal
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private checkAbortBeforePayment(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new OneShotError('Operation cancelled before payment');
    }
  }

  /**
   * If currency is ETH, swap ETH→USDC to ensure the wallet has enough USDC for payment.
   * This is called before signing the x402 payment authorization.
   */
  private async ensureUsdcBalance(paymentInfo: PaymentInfo): Promise<void> {
    if (this._currency !== 'ETH') return;

    const { executeSwap } = await import('./swap');

    this.log(`Swapping ETH→USDC for ${paymentInfo.amount} USDC (slippage: ${this._slippage * 100}%)`);

    const result = await executeSwap(
      this.provider,
      this.rpcProvider,
      paymentInfo.amount,
      CHAIN_ID,
      this._slippage,
    );

    this.log(`Swap complete: tx=${result.txHash}, USDC received=${ethers.formatUnits(result.usdcReceived, 6)}`);
  }

  /** Parse the PAYMENT-REQUIRED header from a 402 response into the accepted requirements and Bazaar metadata. */
  private parsePaymentRequired(header: string | null): {
    accepted: PaymentRequirements;
    resource?: { url: string; description?: string; mimeType?: string };
    extensions?: Record<string, unknown>;
  } {
    if (header) {
      try {
        const decoded = typeof Buffer !== 'undefined'
          ? Buffer.from(header, 'base64').toString()
          : atob(header);
        const parsed = JSON.parse(decoded);
        // x402 v2: { x402Version: 2, accepts: [...], resource: {...}, extensions: {...} }
        if (parsed.accepts?.length > 0) {
          return {
            accepted: parsed.accepts[0] as PaymentRequirements,
            resource: parsed.resource,
            extensions: parsed.extensions,
          };
        }
      } catch {
        this.log('Failed to parse PAYMENT-REQUIRED header, using defaults');
      }
    }
    // Fallback: construct from known production values
    return {
      accepted: {
        scheme: 'exact',
        network: `eip155:${CHAIN_ID}`,
        amount: '0',
        asset: USDC_ADDRESS,
        payTo: '',
        maxTimeoutSeconds: 300,
        extra: { name: 'USD Coin', version: '2' },
      },
    };
  }

  /**
   * Get payment requirements for a quote-based endpoint.
   * Quote-based routes don't include payment-required header on the initial 402.
   * If missing, probe with quote ID (no payment) to trigger the x402 middleware's 402.
   */
  private async getAcceptedRequirements(
    initialResp: Response,
    endpoint: string,
    payload: Record<string, unknown>,
    quoteId: string,
    signal?: AbortSignal
  ): Promise<{
    accepted: PaymentRequirements;
    resource?: { url: string; description?: string; mimeType?: string };
    extensions?: Record<string, unknown>;
  }> {
    const header = initialResp.headers.get('payment-required');
    if (header) {
      return this.parsePaymentRequired(header);
    }
    // Probe: send quote ID without payment to get x402 middleware's 402
    const probeResp = await this.makeRequest(endpoint, payload, undefined, quoteId, signal);
    return this.parsePaymentRequired(probeResp.headers.get('payment-required'));
  }

  private async signPaymentAuthorization(
    paymentInfo: PaymentInfo,
    accepted: PaymentRequirements,
    resource?: { url: string; description?: string; mimeType?: string },
    extensions?: Record<string, unknown>,
  ): Promise<PaymentAuthorization> {
    // If paying with ETH, swap to USDC first
    await this.ensureUsdcBalance(paymentInfo);

    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.randomBytes(32);
    const value = ethers.parseUnits(paymentInfo.amount, paymentInfo.token.decimals);
    const validAfter = now - 300; // Buffer for clock skew
    const validBefore = now + 3600;
    const nonceHex = ethers.hexlify(nonce);

    // Use EIP-712 domain from the server's payment requirements
    const domainName = (accepted.extra?.name as string) || 'USD Coin';
    const domainVersion = (accepted.extra?.version as string) || '2';

    // Sign EIP-3009 TransferWithAuthorization
    const signature = await this.provider.signTypedData(
      {
        name: domainName,
        version: domainVersion,
        chainId: CHAIN_ID,
        verifyingContract: paymentInfo.token.address
      },
      {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      },
      {
        from: this.provider.address,
        to: paymentInfo.payTo,
        value,
        validAfter,
        validBefore,
        nonce: nonceHex
      }
    );

    // Return x402 PaymentPayload v2 format (including resource + extensions for Bazaar discovery)
    return {
      x402Version: 2,
      ...(resource ? { resource } : {}),
      ...(extensions ? { extensions } : {}),
      accepted,
      payload: {
        signature,
        authorization: {
          from: this.provider.address,
          to: paymentInfo.payTo,
          value: value.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonceHex,
        },
      },
    };
  }
}
