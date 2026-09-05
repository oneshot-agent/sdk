import { deadlineScope, abortable } from './deadline';
import { RequestTimeoutError } from './errors';
import { ethers } from 'ethers';
import type { WalletProvider } from './wallet-provider';
import { EthersWalletProvider } from './providers/ethers';
import {
  OneShotError,
  ToolError,
  JobError,
  JobTimeoutError,
  ValidationError,
  ContentBlockedError,
  EmergencyNumberError,
  PaymentError,
  BudgetExceededError,
  BudgetSyncError,
} from './errors';

export type { WalletProvider, TypedDataDomain, TypedDataField, TransactionRequest, TransactionResponse } from './wallet-provider';
export { EthersWalletProvider } from './providers/ethers';
export { CdpWalletProvider } from './providers/cdp';
export { getSwapQuote, executeSwap } from './swap';
export type { SwapQuote, SwapResult, UniswapAddresses } from './swap';
export * from './errors';

// Keep in sync with package.json `version`. Guarded by version.test.ts.
const SDK_VERSION = '0.31.0';

/** Shared state between the WebSocket and HTTP branches of one job wait. */
interface JobWaitState {
  /** A request-scoped message arrived over the socket: push works for this job. */
  pushConfirmed: boolean;
  /** Last status surfaced to `onStatusUpdate`, for de-duplication across branches. */
  lastStatus: string | undefined;
  /** Which branch delivered the terminal outcome (debug log only). */
  via: 'ws' | 'http' | undefined;
}

/** HTTP poll cadence while push is unconfirmed: fast first checks, settling at 2s. */
const HTTP_POLL_BACKOFF_MS = [300, 600, 1000, 2000] as const;
/** HTTP poll cadence once the WebSocket has delivered for this request. */
const HTTP_POLL_RELAXED_MS = 5000;

// ============================================================================
// Environment Configuration
// ============================================================================

const BASE_URL = 'https://win.oneshotagent.com';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

/** Chain id from an x402 network id such as `eip155:84532`; undefined when absent or malformed. */
function chainIdFromNetwork(network: string | undefined): number | undefined {
  const m = /^eip155:(\d+)$/.exec(network ?? '');
  return m ? Number(m[1]) : undefined;
}
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ETH-currency mode. A payment is an EIP-3009 authorization that the
// facilitator settles AFTER the API has responded, so for seconds after a
// successful call `balanceOf` still shows pre-payment funds. The SDK therefore
// keeps a ledger of signed-but-unsettled authorizations and works from
// `balanceOf − pending`, over-reserving (one early buffered swap) rather than
// under-reserving (a failed settlement).
/** One balanceOf read per paid call, deduped within roughly one Base block. */
const USDC_BALANCE_CACHE_MS = 2_000;
/** How long a signed authorization stays subtracted from the on-chain balance (settlement lands well within this). */
const USDC_RESERVATION_TTL_MS = 90_000;
const DEFAULT_SWAP_BUFFER_MULTIPLIER = 10;
const MAX_SWAP_BUFFER_MULTIPLIER = 1000;
/** Fixed-point scale for the multiplier (6 decimals, matching USDC). */
const SWAP_MULTIPLIER_SCALE = 1_000_000;
const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

/** A signed payment whose settlement has not yet been observed on-chain. */
interface UsdcReservation { id: number; amount: bigint; createdAt: number }

/** A signed payment authorization plus the ETH-mode reservation backing it (if any). */
interface SignedPayment { auth: PaymentAuthorization; reservation?: UsdcReservation }

function validateSwapBufferMultiplier(m: number | undefined): number {
  if (m === undefined) return DEFAULT_SWAP_BUFFER_MULTIPLIER;
  if (typeof m !== 'number' || !Number.isFinite(m) || m < 1 || m > MAX_SWAP_BUFFER_MULTIPLIER) {
    throw new ValidationError(
      `swapBufferMultiplier must be a finite number between 1 and ${MAX_SWAP_BUFFER_MULTIPLIER}`,
      'swapBufferMultiplier',
    );
  }
  return m;
}

// ============================================================================
// Public types — defined in ./types.ts. Re-exported below so existing
// consumer imports (`import { EmailToolOptions, ... } from '@oneshot-agent/sdk'`)
// keep resolving unchanged. The OneShot class below pulls the names it needs
// for internal use via the import block.
// ============================================================================

export * from './types';

import type {
  TokenInfo, PaymentInfo, PaymentRequirements, PaymentAuthorization,
  LoggerFn, StatusUpdateFn, OneShotConfig, DecisionContext, ToolOptions,
  EmailToolOptions, ResearchToolOptions, PeopleSearchOptions,
  EnrichProfileOptions, FindEmailOptions, VerifyEmailOptions,
  CompanySearchOptions, CompanySearchResult, EnrichCompanyOptions, EnrichCompanyResult,
  LocalSearchOptions, LocalSearchResult, LocalResolveOptions, LocalResolveResult,
  GovSolicitationsOptions, GovSolicitationsResult,
  DeepResearchPersonOptions, SocialProfilesOptions, ArticleSearchOptions,
  PersonNewsfeedOptions, PersonInterestsOptions, PersonInteractionsOptions,
  InboxListOptions, ShippingAddress, CommerceBuyOptions, CommerceSearchOptions,
  WebSearchOptions, WebSearchResult, WebReadOptions, WebReadResult,
  VoiceCallOptions, SmsOptions, SmsInboxOptions,
  Experience, Education, PersonResult, PeopleSearchResult, ResearchResult,
  EmailResult, EnrichProfileResult, FindEmailResult, AsyncJobResult,
  PersonEnrichment, DeepResearchPersonResult, SocialProfilesResult,
  ArticleSearchResult, PersonNewsfeedResult, PersonInterestsResult,
  PersonInteractionsResult, VerifyEmailResult, InboxEmail, InboxListResult,
  CommerceQuote, CommerceBuyResult, CommerceSearchProduct, CommerceSearchResult,
  VoiceQuote, VoiceCallResult, SmsQuote, SmsSendResult, SmsInboxMessage,
  SmsInboxResult, Notification, NotificationsListOptions, NotificationsResult,
  BuildProduct, BuildLeadCapture, BuildBrand, BuildImages, BuildOptions,
  BuildQuote, BuildResult, BrowserTaskOptions, BrowserProfile, BrowserQuote,
  BrowserResult, UpdateBuildOptions, SpendCategory, SpendBreakdown, RoCSResult, RoCSByGoalResult,
  Receipt, ReceiptsListResult, UnifiedBalance, ComputeSchedule, ComputeOptions,
  ComputeQuote, ComputeGoalResult, ComputeGoalStatus, ComputeTask,
  ComputeBudgetStatus,
  DomainPoolEntry, DomainPoolListResult, DomainPoolStatusResult,
  AgentBudgetConfig, AgentBudgetStatus,
} from './types';


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
/**
 * Reject a budget config the server would reject, at construction rather than
 * on the first paid call — a typo'd cap must not become "no cap".
 */
function validateBudgetConfig(budgets: AgentBudgetConfig | undefined): AgentBudgetConfig | undefined {
  if (!budgets) return undefined;
  // A typo'd key (`daliy`) from an untyped caller must not silently mean "no cap".
  for (const key of Object.keys(budgets)) {
    if (!['daily', 'perTransaction', 'alertAt', 'pauseAt'].includes(key)) {
      throw new ValidationError(`budgets.${key} is not a recognized field`, `budgets.${key}`);
    }
  }
  const positive = (v: number | undefined, field: string) => {
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new ValidationError(`budgets.${field} must be a positive number`, `budgets.${field}`);
    }
  };
  const fraction = (v: number | undefined, field: string) => {
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1) {
      throw new ValidationError(`budgets.${field} must be a fraction in (0, 1]`, `budgets.${field}`);
    }
  };
  positive(budgets.daily, 'daily');
  positive(budgets.perTransaction, 'perTransaction');
  fraction(budgets.alertAt, 'alertAt');
  fraction(budgets.pauseAt, 'pauseAt');
  return budgets;
}

export class OneShot {
  private readonly provider: WalletProvider;
  private readonly rpcProvider: ethers.JsonRpcProvider;
  private readonly baseUrl: string;
  private readonly debug: boolean;
  private readonly logger: LoggerFn;
  private readonly _currency: 'USDC' | 'ETH';
  private readonly _slippage: number;
  private readonly _budgets?: AgentBudgetConfig;
  private readonly _alertEmail?: string;
  /**
   * In-flight/settled budget sync. One PUT per instance: kept as a promise (not
   * a boolean) so concurrent first calls await the same request instead of
   * racing four PUTs on startup.
   */
  private _budgetSync?: Promise<void>;
  private readonly _swapBufferMultiplier: number;
  /** ETH mode: signed payments not yet observed as settled, keyed by reservation id. */
  private _usdcPending = new Map<number, UsdcReservation>();
  private _usdcReservationSeq = 0;
  /** ETH mode: serializes read → decide → swap → reserve per instance (also prevents concurrent swap nonce races). */
  private _usdcLock: Promise<void> = Promise.resolve();
  /** ETH mode: last balanceOf read. Read dedupe only — correctness lives in the ledger. */
  private _usdcBalanceCache?: { balance: bigint; at: number };

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
    this._swapBufferMultiplier = validateSwapBufferMultiplier(config.swapBufferMultiplier);
    this._budgets = validateBudgetConfig(config.budgets);
    this._alertEmail = config.alerts?.email;
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

  /** ETH mode: how many payments' worth of USDC a swap buys (default 10). */
  get swapBufferMultiplier(): number {
    return this._swapBufferMultiplier;
  }

  /** The budget config this instance was constructed with, if any. */
  get budgetConfig(): AgentBudgetConfig | undefined {
    return this._budgets;
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  async tool<T = unknown>(toolName: string, options: ToolOptions & Record<string, unknown>): Promise<T> {
    return this.executeToolRequest<T>(`/v1/tools/${toolName}`, options);
  }

  async email(options: EmailToolOptions): Promise<EmailResult> {
    // to/subject are server-derived when replying to an inbound email.
    if (!options.reply_to_email_id) {
      this.validate(options.to, 'to');
      this.validate(options.subject, 'subject');
    }
    this.validate(options.body, 'body');

    // Rotation mode: when the caller passes neither from_domain nor
    // from_mailbox, omit from_address entirely so the server picks from
    // the agent's domain pool. The chosen address comes back on the
    // quote response (`quote.from_address`) and we replay it on /send.
    // When the caller pins either knob, we keep legacy behavior: build
    // `${mailbox ?? 'agent'}@${domain ?? 'oneshotagent.com'}`.
    const useRotation = !options.from_domain && !options.from_mailbox;
    const fromAddress = useRotation
      ? undefined
      : `${options.from_mailbox ?? 'agent'}@${options.from_domain ?? 'oneshotagent.com'}`;

    // `mailbox_provisioning_fee` (>0) means `from_address` is a new address that
    // provisions a mailbox on first send — a one-time fee folded into `total_cost`.
    const quote = await this.tool<{ total_cost: string; quote_id: string; from_address?: string; mailbox_provisioning_fee?: number }>('email/quote', {
      ...(fromAddress ? { from_address: fromAddress } : {}),
      ...(options.to !== undefined ? { to_address: options.to } : {}),
      ...(options.subject !== undefined ? { subject: options.subject } : {}),
      ...(options.reply_to_email_id ? { reply_to_email_id: options.reply_to_email_id } : {}),
      ...(options.mailbox_mode ? { mailbox_mode: options.mailbox_mode } : {}),
      body: options.body,
      // Forward maxCost so the server-side X-Max-Cost-USDC header is set on
      // the quote fetch (executeToolRequest destructures + threads it).
      maxCost: options.maxCost,
    });

    this.log(`Email quote: $${quote.total_cost}`);

    // Local fast-fail — matches the per-tool check on commerce/voice/sms/build/
    // browser/compute. If the server-side header guard fired we'd never reach
    // here; this catches the case where the server's enforcement is bypassed
    // (e.g. a future API revision without the header check) or skipped (cap
    // un-set so the server returned a 200 with the quote and the caller still
    // wants the local guard to apply).
    this.assertWithinMaxCost(quote.total_cost, options.maxCost);

    const resolvedFromAddress = fromAddress ?? quote.from_address;

    const payload: Record<string, unknown> = {
      // Server replays the locked address from the quote when from_address
      // is absent, but sending it anyway is harmless and forward-compatible
      // with future SDK versions that talk directly to /send without quoting.
      ...(resolvedFromAddress ? { from_address: resolvedFromAddress } : {}),
      ...(options.to !== undefined ? { to_address: options.to } : {}),
      ...(options.subject !== undefined ? { subject: options.subject } : {}),
      ...(options.reply_to_email_id ? { reply_to_email_id: options.reply_to_email_id } : {}),
      // Re-passed on /send so a new-domain mailbox quote still provisions a real
      // mailbox even though the domain row doesn't exist yet (server also falls back
      // to 'mailbox' when a provisioning fee was paid on the quote).
      ...(options.mailbox_mode ? { mailbox_mode: options.mailbox_mode } : {}),
      body: options.body,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate,
      wait: options.wait
    };

    if (options.from_name) {
      payload.from_name = options.from_name;
    }

    if (options.attachments?.length) {
      payload.attachments = options.attachments;
    }

    if (options.idempotencyKey) {
      // Only the send call carries the key — the quote call has no side effects.
      payload.idempotencyKey = options.idempotencyKey;
    }

    return this.executeToolRequest<EmailResult>('/v1/tools/email/send', payload, quote.quote_id);
  }

  /** List the caller's domain pool with warmup and rotation metadata. */
  async listDomains(): Promise<DomainPoolListResult> {
    const response = await fetch(`${this.baseUrl}/v1/tools/email/domains`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to list domains', response.status, await response.text());
    }
    return response.json() as Promise<DomainPoolListResult>;
  }

  /** Take a domain out of rotation without releasing it. */
  async pauseDomain(domain: string): Promise<DomainPoolStatusResult> {
    this.validate(domain, 'domain');
    const response = await fetch(`${this.baseUrl}/v1/tools/email/domains/${encodeURIComponent(domain)}/pause`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to pause domain', response.status, await response.text());
    }
    return response.json() as Promise<DomainPoolStatusResult>;
  }

  /** Put a paused domain back into rotation. */
  async resumeDomain(domain: string): Promise<DomainPoolStatusResult> {
    this.validate(domain, 'domain');
    const response = await fetch(`${this.baseUrl}/v1/tools/email/domains/${encodeURIComponent(domain)}/resume`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to resume domain', response.status, await response.text());
    }
    return response.json() as Promise<DomainPoolStatusResult>;
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

  async companySearch(options: CompanySearchOptions = {}): Promise<CompanySearchResult> {
    return this.tool('research/company', { ...options, limit: options.limit ?? 10 });
  }

  async enrichCompany(options: EnrichCompanyOptions): Promise<EnrichCompanyResult> {
    if (!options.domain && !options.name && !options.linkedin_url && !options.ticker) {
      throw new ValidationError('At least one of domain, name, linkedin_url, or ticker is required', 'identifier');
    }
    return this.tool('enrich/company', { ...options });
  }

  /**
   * Discover local businesses (restaurants, contractors, practices) by
   * category/keywords × location. Flat price per search, not per row.
   */
  async localSearch(options: LocalSearchOptions): Promise<LocalSearchResult> {
    if (!options.location || options.location.length === 0) {
      throw new ValidationError('location is required (e.g. ["Austin, TX"])', 'location');
    }
    if (!(options.category && options.category.length) && !(options.keywords && options.keywords.length)) {
      throw new ValidationError('At least one of category or keywords is required', 'category');
    }
    return this.tool('local/search', { ...options, limit: options.limit ?? 100 });
  }

  /**
   * Resolve a business name + one locating field to its domain, phone,
   * category and operating status. A miss resolves with `found: false`
   * (a completed job), never a rejection.
   */
  async localResolve(options: LocalResolveOptions): Promise<LocalResolveResult> {
    this.validate(options.name, 'name');
    if (!options.address && !options.city && !options.postal_code && !options.phone) {
      throw new ValidationError('name plus at least one of address, city, postal_code, or phone is required', 'address');
    }
    return this.tool('local/resolve', { ...options });
  }

  /**
   * Federal contract opportunities (SAM.gov) by NAICS code — Sources Sought
   * and Presolicitation notices with the contracting officer's published
   * contact. Flat price per search; zero notices is a completed result.
   */
  async govSolicitations(options: GovSolicitationsOptions): Promise<GovSolicitationsResult> {
    if (!options.naics || options.naics.length === 0) {
      throw new ValidationError('naics is required (one or more 6-digit codes, e.g. ["541511"])', 'naics');
    }
    const bad = options.naics.find(c => !/^\d{6}$/.test(String(c)));
    if (bad !== undefined) {
      throw new ValidationError(`NAICS codes are 6 digits (got ${JSON.stringify(bad)})`, 'naics');
    }
    return this.tool('gov/solicitations', {
      ...options,
      notice_types: options.notice_types ?? ['r', 'p'],
      limit: options.limit ?? 100,
    });
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
    const qs = this.buildQuery({
      since: options.since || undefined,
      limit: options.limit || undefined,
      include_body: options.include_body ? 'true' : undefined,
    });
    const response = await fetch(`${this.baseUrl}/v1/tools/inbox${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list inbox', response.status, await response.text());
    }
    return response.json() as Promise<InboxListResult>;
  }

  async inboxGet(emailId: string): Promise<InboxEmail> {
    this.validate(emailId, 'emailId');

    const response = await fetch(`${this.baseUrl}/v1/tools/inbox/${emailId}`, {
      headers: await this.signedReadHeaders()
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
    const { execResp: buyResp } = await this.runQuoteToPay<CommerceQuote>({
      endpoint: '/v1/tools/commerce/buy',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      quoteTimeoutMs: 120000,
      execTimeoutMs: 60000,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.total,
      onQuote: (ctx) => this.log(`Commerce quote: $${ctx.total} for "${ctx.product_title}"`),
    });

    if (buyResp.status !== 202) {
      await this.failFromResponse('Commerce buy failed', buyResp);
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
    };

    if (options.caller_persona) payload.caller_persona = options.caller_persona;
    if (options.context) payload.context = options.context;
    if (options.max_duration_minutes) payload.max_duration_minutes = options.max_duration_minutes;

    const { execResp: callResp } = await this.runQuoteToPay<VoiceQuote>({
      endpoint: '/v1/tools/voice/call',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.total,
      onQuote: (ctx) => this.log(`Voice quote: $${ctx.total} for ${ctx.estimated_duration_minutes}min call`),
      on400: async (resp) => {
        const errorData = await resp.json() as { error: string; message: string; categories?: string[]; blocked_number?: string };
        if (errorData.error === 'content_blocked') {
          throw new ContentBlockedError(errorData.message, errorData.categories || []);
        }
        if (errorData.error === 'emergency_number_blocked') {
          throw new EmergencyNumberError(errorData.message, errorData.blocked_number || '');
        }
        throw new ValidationError(errorData.message || 'Invalid request', 'request');
      },
    });

    if (callResp.status !== 202) {
      await this.failFromResponse('Voice call initiation failed', callResp);
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
    };

    // SMS uses quote-to-pay flow (402 -> payment -> 202)
    const { execResp: sendResp } = await this.runQuoteToPay<SmsQuote>({
      endpoint: '/v1/tools/sms/send',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.total,
      onQuote: (ctx) => this.log(`SMS quote: $${ctx.total} for ${ctx.segment_count} segment(s) to ${recipientCount} recipient(s)`),
      on400: async (resp) => {
        const errorData = await resp.json() as { error: string; message: string; categories?: string[]; blocked_number?: string };
        if (errorData.error === 'content_blocked') {
          throw new ContentBlockedError(errorData.message, errorData.categories || []);
        }
        if (errorData.error === 'emergency_number_blocked') {
          throw new EmergencyNumberError(errorData.message, errorData.blocked_number || '');
        }
        throw new ValidationError(errorData.message || 'Invalid request', 'request');
      },
    });

    if (sendResp.status !== 202) {
      await this.failFromResponse('SMS send failed', sendResp);
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
    };

    if (options.source_url) payload.source_url = options.source_url;
    if (options.sections) payload.sections = options.sections;
    if (options.lead_capture) payload.lead_capture = options.lead_capture;
    if (options.brand) payload.brand = options.brand;
    if (options.images) payload.images = options.images;
    if (options.domain) payload.domain = options.domain;
    if (options.build_id) payload.build_id = options.build_id;

    const { execResp: buildResp } = await this.runQuoteToPay<BuildQuote>({
      endpoint: '/v1/tools/build',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      // Build analysis can be slow server-side; bound the quote leg client-side.
      quoteTimeoutMs: 120000,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.pricing.total,
      onQuote: (ctx) => {
        this.log(`Build quote: $${ctx.pricing.total} for "${ctx.product_name}"`);
        this.log(`Type: ${ctx.analysis.inferred_type}, Sections: ${ctx.analysis.estimated_sections}`);
      },
      on400: async (resp) => {
        const errorData = await resp.json() as { error: string; message: string; details?: unknown };
        throw new ValidationError(errorData.message || 'Invalid request', 'request');
      },
    });

    if (buildResp.status !== 202) {
      await this.failFromResponse('Build initiation failed', buildResp);
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
    };

    if (options.output_schema) payload.output_schema = options.output_schema;
    if (options.start_url) payload.start_url = options.start_url;
    if (options.allowed_domains) payload.allowed_domains = options.allowed_domains;
    if (options.session_id) payload.session_id = options.session_id;
    if (options.profile_id) payload.profile_id = options.profile_id;
    if (options.secrets) payload.secrets = options.secrets;
    if (options.max_steps) payload.max_steps = options.max_steps;

    const { execResp } = await this.runQuoteToPay<BrowserQuote>({
      endpoint: '/v1/tools/browser',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      // Browser analysis can be slow server-side; bound the quote leg client-side.
      quoteTimeoutMs: 120000,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.estimated_cost,
      onQuote: (ctx) => this.log(`Browser quote: $${ctx.estimated_cost} for ~${ctx.estimated_steps} steps`),
      on400: async (resp) => {
        const errorData = await resp.json() as { error: string; message: string };
        throw new ValidationError(errorData.message || 'Invalid request', 'request');
      },
    });

    if (execResp.status !== 202) {
      await this.failFromResponse('Browser task initiation failed', execResp);
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
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders()) },
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
      headers: await this.signedReadHeaders(),
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
      headers: await this.signedReadHeaders(),
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
    const qs = this.buildQuery({
      since: options.since || undefined,
      limit: options.limit || undefined,
      from: options.from || undefined,
    });
    const response = await fetch(`${this.baseUrl}/v1/tools/sms/inbox${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
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
      headers: await this.signedReadHeaders()
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
    const qs = this.buildQuery({
      unread: options.unread ? 'true' : undefined,
      limit: options.limit || undefined,
    });
    const response = await fetch(`${this.baseUrl}/v1/tools/notifications${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
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
      headers: await this.signedReadHeaders()
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
      headers: await this.signedReadHeaders()
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

    // Compute returns the goal directly on 202 — no job polling, unlike the
    // other paid tools.
    const { execResp: createResp } = await this.runQuoteToPay<ComputeQuote>({
      endpoint: '/v1/compute',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      expectMsg: 'Expected 402 for compute quote',
      totalOf: (ctx) => ctx.total_budget,
      onQuote: (ctx) => this.log(`Compute quote: $${ctx.total_budget} — ${ctx.objective_summary}`),
      on400: async (resp) => {
        const errorData = await resp.json() as { error: string; message: string };
        if (errorData.error === 'content_blocked') {
          throw new ContentBlockedError(errorData.message, []);
        }
        throw new ValidationError(errorData.message || 'Invalid request', 'request');
      },
    });

    if (createResp.status !== 202) {
      await this.failFromResponse('Compute goal creation failed', createResp);
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
      headers: this.jsonHeaders(),
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
      headers: this.jsonHeaders(),
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
      headers: this.jsonHeaders(),
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
      headers: this.jsonHeaders(),
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new ToolError('Failed to resume compute goal', response.status, await response.text());
    }

    const json = await response.json() as { data: { goal_id: string; status: string; next_run_at: string; run_count: number } };
    return json.data;
  }

  /**
   * Top up budget for a recurring compute goal.
   *
   * Uses the quote-then-pay flow: the first call gets a 402 with the top-up price,
   * the second call (with payment) credits the budget. The amount IS the price.
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

    const path = `/v1/compute/${goalId}/fund`;
    const payload = { amount };

    await this.ensureBudgetsSynced();

    const quoteResp = await this.makeRequest(path, payload);
    if (quoteResp.status !== 402) {
      // A 403 here is the budget gate on the quote leg → BudgetExceededError.
      await this.failFromResponse('Expected 402 for compute fund quote', quoteResp);
    }

    const quoteData = await quoteResp.json() as {
      context: { quote_id: string; topped_up: string; total_budget: string };
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Compute fund quote: $${quoteData.payment_request.amount} to top up ${goalId}`);
    this.assertWithinBudget(quoteData.payment_request.amount);

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    const { accepted, resource, extensions } = await this.getAcceptedRequirements(quoteResp, path, payload, quoteData.context.quote_id);
    paymentInfo.amount = this.chargeAmount(accepted, quoteData.payment_request.amount);
    const signed = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const fundResp = await this.makePaidRequest(signed, path, payload, quoteData.context.quote_id);

    if (!fundResp.ok) {
      await this.failFromResponse('Failed to fund compute goal', fundResp);
    }

    const json = await fundResp.json() as { data: { goal_id: string; topped_up: number; total_budget: string; remaining: string } };
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
    const qs = this.buildQuery({ period: options?.period || undefined });
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
    const qs = this.buildQuery({ period: options?.period || undefined });
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
   * Paginate with `limit`/`offset`, or page through an explicit time window with
   * `since`/`until` (ISO string or Date) — useful for reaching receipts older than
   * the server's 100-row cap when tagging value weeks after the originating call.
   *
   * @example
   * ```typescript
   * const result = await agent.receiptsList({ period: 7, category: 'communication' });
   * for (const r of result.receipts) {
   *   console.log(`${r.subcategory}: $${r.amount_usdc}`);
   * }
   *
   * // Reach an older receipt by time window:
   * const old = await agent.receiptsList({ since: '2026-05-01', until: '2026-05-31', limit: 100 });
   * ```
   */
  async receiptsList(options?: {
    period?: number;
    category?: string;
    limit?: number;
    offset?: number;
    since?: string | Date;
    until?: string | Date;
  }): Promise<ReceiptsListResult> {
    const toIso = (d?: string | Date) => (d instanceof Date ? d.toISOString() : d) || undefined;
    const qs = this.buildQuery({
      period: options?.period || undefined,
      category: options?.category || undefined,
      limit: options?.limit || undefined,
      offset: options?.offset || undefined,
      since: toIso(options?.since),
      until: toIso(options?.until),
    });
    const response = await fetch(`${this.baseUrl}/v1/analytics/receipts${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list receipts', response.status, await response.text());
    }
    return response.json() as Promise<ReceiptsListResult>;
  }

  /**
   * Tag value for RoCS computation.
   *
   * Three ways to address the value:
   * - `rcpt_…` receipt id (from `result.receipt_id` or `receiptsList`), or
   * - the `request_id` returned by the originating tool call (`result.request_id`,
   *   resolved server-side via `Receipt.job_id`) — annotate without a list lookup, or
   * - a `goalId` correlation key — attributes a whole *cadence* outcome (the email,
   *   the follow-ups, the find/verify/enrich calls that share `decisionContext.goalId`)
   *   in one call. The value is recorded once in the outcome ledger, so it can't
   *   double-count across the cadence's receipts. Read it back with `rocsByGoal()`.
   *
   * @example
   * ```typescript
   * // By receipt id:
   * await agent.tagReceiptValue('rcpt_01HX...', { type: 'revenue', amount: 5.00, label: 'Sale from lead' });
   *
   * // By the request_id you already kept from the call:
   * const r = await agent.verifyEmail({ email: 'x@y.com' });
   * await agent.tagReceiptValue({ requestId: r.request_id }, { type: 'lead', amount: 1 });
   *
   * // By cadence correlation key — one call attributes a closed deal to the whole sequence:
   * await agent.tagReceiptValue({ goalId: 'goal_q2_acme' }, { type: 'revenue', amount: 5000, label: 'Closed deal' });
   * ```
   */
  async tagReceiptValue(
    ref: string | { receiptId?: string; requestId?: string; goalId?: string },
    valueTag: { type: string; amount?: number; label?: string },
  ): Promise<void> {
    this.validate(valueTag.type, 'valueTag.type');

    // Cadence-level: route to the outcome ledger by correlation key.
    if (typeof ref === 'object' && ref.goalId && !ref.receiptId && !ref.requestId) {
      const response = await fetch(`${this.baseUrl}/v1/analytics/outcomes`, {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify({ goal_id: ref.goalId, ...valueTag }),
      });
      if (!response.ok) {
        throw new ToolError('Failed to record outcome value', response.status, await response.text());
      }
      return;
    }

    const id = typeof ref === 'string' ? ref : (ref.receiptId ?? ref.requestId);
    this.validate(id, 'receiptId/requestId/goalId');

    const response = await fetch(`${this.baseUrl}/v1/analytics/receipts/${id}/value`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify(valueTag)
    });

    if (response.status === 404) {
      throw new ToolError('Receipt not found', 404, 'Receipt not found or not owned by this agent');
    }
    if (!response.ok) {
      throw new ToolError('Failed to tag receipt value', response.status, await response.text());
    }
  }

  /**
   * Per-cadence RoCS rollup — spend (from receipts) vs. value (from outcomes)
   * grouped by `decisionContext.goalId`. Answers "what did this cadence cost vs.
   * earn" in one query. `value` counts judge-confirmed outcomes; `pending_value`
   * surfaces self-reported outcomes not yet confirmed.
   *
   * @example
   * ```typescript
   * const { goals } = await agent.rocsByGoal({ period: 30 });
   * for (const g of goals) {
   *   console.log(`${g.goal_id}: spent $${g.spend}, earned $${g.value} (RoCS ${g.rocs}x)`);
   * }
   *
   * // Just this cadence:
   * const { goals: [deal] } = await agent.rocsByGoal({ goalId: 'goal_q2_acme' });
   * ```
   */
  async rocsByGoal(options?: { period?: number; goalId?: string }): Promise<RoCSByGoalResult> {
    const qs = this.buildQuery({ period: options?.period || undefined, goal_id: options?.goalId || undefined });
    const response = await fetch(`${this.baseUrl}/v1/analytics/rocs/by-goal${qs ? `?${qs}` : ''}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get RoCS by goal', response.status, await response.text());
    }
    return response.json() as Promise<RoCSByGoalResult>;
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

  /** Auth headers plus Content-Type for JSON-body requests. */
  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...this.headers() };
  }

  /**
   * Auth headers plus a signed EIP-712 proof (`x-agent-proof`) for the read
   * routes (inbox, sms inbox, notifications, balance). These identify the caller
   * by wallet, and wallet addresses are public, so without a proof anyone could
   * read another agent's data by supplying its address. The proof binds this
   * request to the wallet the SDK controls; the server verifies the signature
   * locally. A fresh nonce per call prevents replay. Signing failure falls back
   * to plain headers (the server runs log-only until enforcement is enabled).
   */
  private async signedReadHeaders(scope: string = 'read'): Promise<Record<string, string>> {
    const base = this.headers();
    try {
      const agent = this.provider.address;
      const issuedAt = Math.floor(Date.now() / 1000);
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await this.provider.signTypedData(
        { name: 'OneShot Agent Auth', version: '1' },
        {
          AgentReadAuth: [
            { name: 'agent', type: 'address' },
            { name: 'scope', type: 'string' },
            { name: 'issuedAt', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        { agent, scope, issuedAt, nonce },
      );
      const json = JSON.stringify({ agent, scope, issuedAt, nonce, signature });
      const proof = typeof Buffer !== 'undefined' ? Buffer.from(json).toString('base64') : btoa(json);
      return { ...base, 'x-agent-proof': proof };
    } catch (err) {
      this.log(`Failed to sign read proof (continuing without): ${err}`);
      return base;
    }
  }

  /** Build a query string, skipping null/undefined values. Pass falsy-but-valid
   *  values (0, '') as undefined at the call site to match prior `if (x)` guards. */
  private buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v));
    }
    return qs.toString();
  }

  /**
   * Push `config.budgets` to the server once, before the first paid call.
   *
   * Lazy rather than in the constructor because the PUT is signed (async) and
   * the constructor is sync. Idempotent per instance via the cached promise,
   * which is only kept once the sync SUCCEEDS.
   *
   * FAILS CLOSED. If the server can't confirm the budget — network error,
   * 5xx, 429, or a rejected config — this throws BudgetSyncError and the paid
   * call is not made. Proceeding would silently drop the guardrail the
   * developer configured, which is exactly the "empty wallet at 3am" the
   * budget exists to prevent. The marker is cleared so the next paid call
   * retries.
   */
  private async ensureBudgetsSynced(): Promise<void> {
    if (!this._budgets && !this._alertEmail) return;
    if (this._budgetSync) return this._budgetSync;

    const attempt = (async () => {
      const body: Record<string, unknown> = {};
      if (this._budgets?.daily !== undefined) body.daily = this._budgets.daily;
      if (this._budgets?.perTransaction !== undefined) body.per_transaction = this._budgets.perTransaction;
      if (this._budgets?.alertAt !== undefined) body.alert_at = this._budgets.alertAt;
      if (this._budgets?.pauseAt !== undefined) body.pause_at = this._budgets.pauseAt;
      if (this._alertEmail !== undefined) body.alert_email = this._alertEmail;

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/v1/agents/me/budgets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new BudgetSyncError(`Could not sync spend budget (network): ${err}`);
      }
      if (!response.ok) {
        const text = await response.text();
        throw new BudgetSyncError(`Could not sync spend budget (${response.status}): ${text}`, response.status, text);
      }
      this.log('Budget synced');
    })();

    this._budgetSync = attempt;
    try {
      await attempt;
    } catch (err) {
      // Not synced: clear the marker so the next paid call retries, then
      // refuse this one rather than run it unguarded.
      this._budgetSync = undefined;
      this.log(`${(err as Error).message} — paid call refused until the budget is confirmed`);
      throw err;
    }
  }

  /**
   * Local fast-fail on the per-transaction cap, so an oversized call fails
   * without a network round-trip. The server enforces the same cap (and the
   * daily one, which needs the ledger) regardless of which client calls —
   * this is the same SDK-checks/server-enforces split as maxCost.
   */
  private assertWithinBudget(total: string): void {
    const cap = this._budgets?.perTransaction;
    if (!cap || cap <= 0) return;
    const amount = parseFloat(total);
    if (Number.isFinite(amount) && amount > cap) {
      throw new BudgetExceededError(
        `Quote $${total} exceeds this agent's per-transaction budget of $${cap}`,
        'per_transaction',
        cap,
        undefined,
        amount,
      );
    }
  }

  /**
   * Current spend budget and today's utilization.
   *
   * @example
   * ```typescript
   * const b = await agent.budgets();
   * console.log(`${b.spent_today_usdc} of ${b.daily_usdc} spent, resets ${b.resets_at}`);
   * ```
   */
  async budgets(): Promise<AgentBudgetStatus> {
    const response = await fetch(`${this.baseUrl}/v1/agents/me/budgets`, {
      headers: await this.signedReadHeaders(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to fetch budgets', response.status, await response.text());
    }
    const body = await response.json() as { data?: AgentBudgetStatus };
    return (body.data ?? body) as AgentBudgetStatus;
  }

  /** Local fast-fail guard: throw when a quote total exceeds the caller's cap. */
  private assertWithinMaxCost(total: string, maxCost?: number): void {
    if (maxCost && parseFloat(total) > maxCost) {
      throw new OneShotError(`Quote $${total} exceeds maxCost $${maxCost}`);
    }
  }

  /**
   * Header that asks the API to reject the request when the computed quote
   * exceeds the caller-supplied cap (commit 8f328a7). The SDK still does its
   * own local `quote.total > maxCost` check after the 402 returns — this is
   * a server-side enforcement layer so non-SDK callers (MCP server, custom
   * integrations) can't ignore the cap.
   */
  /**
   * The amount to sign, in decimal USDC.
   *
   * A 402 advertises its price twice: the x402 v2 `PAYMENT-REQUIRED` header
   * (`accepts[0].amount`, atomic units) and the legacy JSON body
   * (`payment_request.amount`, decimal). The header is authoritative — it is
   * what the server rebuilds its requirement from and what
   * `findMatchingRequirements` compares the signature against.
   *
   * Preferring the body is how quote-based routes (email/send, sms, voice,
   * build, commerce/buy, compute) silently failed: the body carried a
   * hardcoded "0.00", so the SDK signed a zero-cost authorization against a
   * real charge and the server answered with a bodiless 402. It stayed hidden
   * for as long as credits covered those calls, since the credit path returns
   * 202 without any payment handshake.
   *
   * Falls back to the body when the header is missing or unparseable.
   */
  /**
   * Throw the most specific error a failed response supports.
   *
   * A 402 arriving on the PAID retry means the facilitator refused the
   * signature — not the ordinary "here is your quote" 402. The API names the
   * cause in that body (`payment_verification_failed` + reason + expected vs
   * received amount); surface it as a `PaymentError` so callers can branch on
   * `err.reason` instead of string-matching. Anything else keeps the existing
   * `ToolError` shape.
   */
  private async failFromResponse(message: string, response: Response): Promise<never> {
    const text = await response.text();
    const rejection = response.status === 402 ? this.parsePaymentRejection(text) : undefined;
    if (rejection) throw rejection;
    const budget = response.status === 403 ? this.parseBudgetRejection(text) : undefined;
    if (budget) throw budget;
    throw new ToolError(message, response.status, text);
  }

  /**
   * Map a 403 `budget_exceeded` body onto a typed error, so callers can catch
   * "my own budget stopped this" separately from an auth failure or a payment
   * rejection. Any other 403 falls through to ToolError.
   */
  private parseBudgetRejection(text: string): BudgetExceededError | undefined {
    try {
      const body = JSON.parse(text) as {
        error?: string;
        message?: string;
        budget?: { reason?: string; cap?: string; spent?: string; charge?: string; resets_at?: string };
      };
      if (body.error !== 'budget_exceeded') return undefined;
      const b = body.budget ?? {};
      return new BudgetExceededError(
        body.message ?? 'Agent spend budget exceeded',
        b.reason === 'per_transaction' ? 'per_transaction' : 'daily',
        b.cap !== undefined ? parseFloat(b.cap) : undefined,
        b.spent !== undefined ? parseFloat(b.spent) : undefined,
        b.charge !== undefined ? parseFloat(b.charge) : undefined,
        b.resets_at,
      );
    } catch {
      return undefined;
    }
  }

  private parsePaymentRejection(text: string): PaymentError | undefined {
    let data: {
      error?: string;
      reason?: string;
      message?: string;
      expected?: { amount?: string; asset?: string; network?: string; pay_to?: string };
      received?: { amount?: string };
      quote_id?: string;
    };
    try {
      data = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (data?.error !== 'payment_verification_failed') return undefined;

    const reason = data.reason || 'unknown';
    const expectedAmount = data.expected?.amount;
    const receivedAmount = data.received?.amount;
    const detail = [
      expectedAmount ? `expected $${expectedAmount}` : null,
      receivedAmount ? `signed $${receivedAmount}` : null,
    ].filter(Boolean).join(', ');

    return new PaymentError(
      `payment rejected: ${reason}${detail ? ` — ${detail}` : ''}${data.message ? ` (${data.message})` : ''}`,
      reason,
      {
        amount: expectedAmount,
        asset: data.expected?.asset,
        network: data.expected?.network,
        payTo: data.expected?.pay_to,
      },
      { amount: receivedAmount },
      data.quote_id,
    );
  }

  private chargeAmount(accepted: { amount?: string }, bodyAmount?: string): string {
    if (accepted?.amount == null || !/^\d+$/.test(String(accepted.amount))) {
      return bodyAmount ?? '0';
    }
    const fromHeader = ethers.formatUnits(accepted.amount, 6);
    // When the two agree (every fixed-price route), keep the body's string
    // verbatim — downstream consumers such as the ETH auto-swap pass this
    // value along, and there is no reason to reformat it. Only a genuine
    // disagreement flips to the header.
    if (bodyAmount != null && parseFloat(bodyAmount) === parseFloat(fromHeader)) {
      return bodyAmount;
    }
    return fromHeader;
  }

  private maxCostHeader(maxCost?: number): Record<string, string> | undefined {
    if (!maxCost || maxCost <= 0) return undefined;
    return { 'X-Max-Cost-USDC': maxCost.toString() };
  }

  /**
   * Idempotency-Key header, sent on both legs (pre-402 and paid retry) so
   * the server can replay a cached result instead of double-charging and
   * double-executing on a client retry.
   */
  private idempotencyHeader(idempotencyKey?: string): Record<string, string> | undefined {
    if (!idempotencyKey) return undefined;
    return { 'Idempotency-Key': idempotencyKey };
  }

  private async readReliabilityJson<T>(path: string, signed: boolean, allowDegraded = false): Promise<T> {
    const scope = deadlineScope(undefined, signed ? 10_000 : 5_000);
    try {
      return await abortable((async () => {
        const headers = signed ? await this.signedReadHeaders() : undefined;
        if (scope.signal.aborted) throw new OneShotError('Read deadline exceeded');
        const response = await fetch(`${this.baseUrl}${path}`, { headers, signal: scope.signal });
        if (!response.ok && !(allowDegraded && response.status === 503)) await this.failFromResponse('Reliability read failed', response);
        return await response.json() as T;
      })(), scope.signal);
    } finally { scope.close(); }
  }

  async recoverRequest(options: { endpoint: 'enrich/profile' | 'enrich/email' | 'verify/email'; idempotencyKey: string }): Promise<{ request_id: string; receipt_id: string; status: string; settlement_status: string }> {
    const query = new URLSearchParams({ endpoint: options.endpoint, key: options.idempotencyKey });
    return this.readReliabilityJson(`/v1/submissions/recover?${query}`, true);
  }

  async getServiceStatus(): Promise<{ status: 'healthy' | 'degraded'; observed_at: string; dependencies: Record<string, unknown> }> {
    return this.readReliabilityJson('/v1/status', false, true);
  }

  private async executeToolRequest<T>(endpoint: string, options: ToolOptions & Record<string, unknown>, quoteId?: string): Promise<T> {
    const reliable = /(?:^|\/)(enrich\/(profile|email)|verify\/email)$/.test(endpoint);
    const key = options.idempotencyKey ?? (reliable ? ethers.hexlify(ethers.randomBytes(16)) : undefined);
    if (options.totalTimeoutMs !== undefined && (!Number.isFinite(options.totalTimeoutMs) || options.totalTimeoutMs <= 0)) {
      throw new ValidationError('totalTimeoutMs must be positive', 'totalTimeoutMs');
    }
    const scope = deadlineScope(options.signal, options.totalTimeoutMs);
    const context: { phase: string; requestId?: string; receiptId?: string } = { phase: 'initialization' };
    const started = Date.now();
    try {
      if (scope.signal.aborted) throw new OneShotError('Operation cancelled');
      if (key) options.onRequestCreated?.({ idempotencyKey: key });
      return await abortable(this.executeToolRequestImpl<T>(endpoint, { ...options, idempotencyKey: key, signal: scope.signal }, quoteId, context), scope.signal);
    } catch (error) {
      if (scope.timedOut()) throw new RequestTimeoutError(Date.now() - started, context.phase, key, context.requestId, context.receiptId);
      if (error instanceof Error) Object.assign(error, { idempotencyKey: key, requestId: context.requestId, receiptId: context.receiptId, phase: context.phase });
      throw error;
    } finally { scope.close(); }
  }

  private async executeToolRequestImpl<T>(
    endpoint: string,
    options: ToolOptions & Record<string, unknown>,
    quoteId?: string,
    context: { phase: string; requestId?: string; receiptId?: string } = { phase: "initialization" },
  ): Promise<T> {
    const { totalTimeoutMs, onRequestCreated, onAccepted, signal, onStatusUpdate, wait = true, waitForPhones, phoneTimeoutSec, idempotencyKey, maxCost, ...payload } = options;
    const extraHeaders = {
      ...this.maxCostHeader(maxCost as number | undefined),
      ...this.idempotencyHeader(idempotencyKey as string | undefined),
    };

    if (payload.memo !== undefined) {
      if (typeof payload.memo !== 'string' || payload.memo.trim().length === 0) {
        delete payload.memo; // Drop invalid memo silently
      } else if (payload.memo.length > 1000) {
        payload.memo = payload.memo.slice(0, 1000);
        this.log('Memo truncated to 1000 chars');
      }
    } else if (!endpoint.includes('/inbox') && !endpoint.includes('/notifications') && !endpoint.includes('/balance')) {
      this.log('No memo provided — consider adding a reason for audit trail');
    }

    if (payload.decisionContext !== undefined) {
      if (typeof payload.decisionContext !== 'object' || payload.decisionContext === null) {
        delete payload.decisionContext;
      } else {
        const dc = payload.decisionContext as DecisionContext;
        if (dc.confidence !== undefined && (typeof dc.confidence !== 'number' || dc.confidence < 0 || dc.confidence > 1)) {
          delete dc.confidence;
        }
      }
    }

    if (signal?.aborted) {
      throw new OneShotError('Operation cancelled');
    }

    // One-time push of config.budgets before the first paid call, so the
    // server-side gate knows about them on this very request.
    await this.ensureBudgetsSynced();

    if (signal?.aborted) throw new OneShotError('Operation cancelled');
    if (idempotencyKey) Object.assign(extraHeaders, { 'x-agent-proof': 'required' });
    if (signal?.aborted) throw new OneShotError('Operation cancelled');
    context.phase = 'submission';
    let response = await this.makeRequest(endpoint, payload, undefined, quoteId, signal, undefined, extraHeaders);

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
        amount: this.chargeAmount(accepted, data.payment_request?.amount),
        currency: 'USD',
        facilitator_url: this.baseUrl,
        token: { address: accepted.asset, symbol: 'USDC', decimals: 6 }
      };
      this.log(`Payment required: ${paymentInfo.amount} USDC`);

      this.assertWithinBudget(paymentInfo.amount);
      this.checkAbortBeforePayment(signal);
      context.phase = 'payment';
      const signed = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
      this.checkAbortBeforePayment(signal);
      context.phase = 'submission';
      response = await this.makePaidRequest(signed, endpoint, payload, quoteId, signal, undefined, extraHeaders);
    }

    if (!response.ok) {
      await this.failFromResponse('Tool request failed', response);
    }

    const result = await response.json() as Record<string, unknown>;

    // Handle async jobs
    if ((result.status === 'pending' || result.status === 'processing') && result.request_id) {
      context.requestId = String(result.request_id);
      context.receiptId = typeof result.receipt_id === 'string' ? result.receipt_id : undefined;
      onAccepted?.({ request_id: context.requestId, receipt_id: context.receiptId, idempotencyKey });
      context.phase = 'polling';
      this.log(`Job queued: ${result.request_id}`);
      if (!wait) {
        return { ...result, idempotencyKey } as T;
      }
      const completed = await this.pollJob<Record<string, unknown>>(
        result.request_id as string,
        options.timeout,
        signal,
        onStatusUpdate,
        waitForPhones ? { waitForPhones, phoneTimeoutSec } : undefined,
      );
      if (completed && typeof completed === 'object' && !Array.isArray(completed)) {
        return { ...completed, request_id: context.requestId, receipt_id: completed.receipt_id ?? context.receiptId, idempotencyKey } as T;
      }
      return completed as T;
    }

    return (result.data ?? result) as T;
  }

  /**
   * Shared x402 quote-to-pay flow for paid tools. Fetches the 402 quote, runs
   * any per-tool 400 handling, enforces maxCost, signs the payment auth, and
   * POSTs the paid request. Returns the parsed quote context plus the raw paid
   * Response — the caller owns the post-202 handling (poll a job vs. return the
   * body directly), since that differs per tool.
   */
  private async runQuoteToPay<Q extends { quote_id: string }>(cfg: {
    endpoint: string;
    payload: Record<string, unknown>;
    signal?: AbortSignal;
    maxCost?: number;
    quoteTimeoutMs?: number;
    execTimeoutMs?: number;
    expectMsg: string;
    totalOf: (ctx: Q) => string;
    onQuote: (ctx: Q) => void;
    on400?: (resp: Response) => Promise<void>;
  }): Promise<{ context: Q; execResp: Response }> {
    await this.ensureBudgetsSynced();

    const quoteResp = await this.makeRequest(
      cfg.endpoint, cfg.payload, undefined, undefined,
      cfg.signal, cfg.quoteTimeoutMs, this.maxCostHeader(cfg.maxCost),
    );

    if (quoteResp.status === 400 && cfg.on400) {
      await cfg.on400(quoteResp);
    }

    if (quoteResp.status !== 402) {
      // Routes the budget gate on the quote leg (fixed-price ones) surface a
      // 403 here; failFromResponse maps it to BudgetExceededError.
      await this.failFromResponse(cfg.expectMsg, quoteResp);
    }

    const quoteData = await quoteResp.json() as {
      context: Q;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    cfg.onQuote(quoteData.context);
    this.assertWithinMaxCost(cfg.totalOf(quoteData.context), cfg.maxCost);
    this.assertWithinBudget(cfg.totalOf(quoteData.context));

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 }
    };

    this.checkAbortBeforePayment(cfg.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(
      quoteResp, cfg.endpoint, cfg.payload, quoteData.context.quote_id, cfg.signal,
    );
    paymentInfo.amount = this.chargeAmount(accepted, quoteData.payment_request.amount);
    const signed = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const execResp = await this.makePaidRequest(
      signed, cfg.endpoint, cfg.payload, quoteData.context.quote_id, cfg.signal, cfg.execTimeoutMs,
    );

    return { context: quoteData.context, execResp };
  }

  /**
   * Wait for a previously dispatched job and return its result.
   *
   * Use this to resolve the `request_id` returned by a call made with
   * `wait: false`, or to resume waiting after a client restart. Delivery is the
   * same as for blocking calls: WebSocket push when the server offers it, HTTP
   * polling of `GET /v1/requests/:id` as the source of truth.
   */
  async waitForResult<T = Record<string, unknown>>(
    requestId: string,
    options: {
      timeout?: number;
      signal?: AbortSignal;
      onStatusUpdate?: StatusUpdateFn;
      waitForPhones?: boolean;
      phoneTimeoutSec?: number;
    } = {}
  ): Promise<T> {
    this.validate(requestId, 'requestId');
    return this.pollJob<T>(
      requestId,
      options.timeout,
      options.signal,
      options.onStatusUpdate,
      options.waitForPhones ? { waitForPhones: true, phoneTimeoutSec: options.phoneTimeoutSec } : undefined,
    );
  }

  private async pollJob<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn,
    phoneOpts?: { waitForPhones?: boolean; phoneTimeoutSec?: number }
  ): Promise<T> {
    // HTTP polling is the source of truth; the WebSocket is an accelerator.
    // Both run concurrently from the start and the first terminal outcome wins,
    // so a broken push channel (Redis down, worker unconfigured, proxy that
    // swallows frames) costs nothing beyond the poll cadence. Previously the
    // client waited 60% of its timeout on the socket before polling at all —
    // in prod that was ~72s of dead air on every call while the push never came.
    const inner = new AbortController();
    const onOuterAbort = () => inner.abort();
    if (signal?.aborted) inner.abort();
    else signal?.addEventListener('abort', onOuterAbort, { once: true });

    const wait: JobWaitState = { pushConfirmed: false, lastStatus: undefined, via: undefined };
    // Two sources now report status; only surface changes to the caller.
    const emit = (status: string) => {
      if (status === wait.lastStatus) return;
      wait.lastStatus = status;
      onStatusUpdate?.(status, requestId);
    };
    const startedAt = Date.now();

    const wsBranch = this.waitViaWebSocket<T>(requestId, inner.signal, emit, wait).catch((err: unknown) => {
      // A failed job or a cancellation is a real outcome. Anything else is a
      // transport problem: never settle the race on it, HTTP carries on.
      if (err instanceof OneShotError) throw err;
      this.log(`WebSocket unavailable (${err instanceof Error ? err.message : String(err)}) — relying on HTTP polling`);
      return new Promise<T>(() => { /* released when the race settles */ });
    });
    const httpBranch = this.pollJobHttp<T>(requestId, timeoutSec, inner.signal, emit, wait);
    // The losing branch rejects on abort; mark both handled so it never
    // surfaces as an unhandled rejection.
    wsBranch.catch(() => {});
    httpBranch.catch(() => {});

    let result: T;
    try {
      result = await Promise.race([wsBranch, httpBranch]);
    } finally {
      inner.abort();
      signal?.removeEventListener('abort', onOuterAbort);
    }
    this.log(`Job ${requestId} ready after ${Date.now() - startedAt}ms via ${wait.via ?? 'unknown'}`);

    // Optional second phase: keep polling for the async phone-reveal webhook.
    // Only kicks in when the caller explicitly opts in AND the result still
    // has phones_pending=true (set by the worker when the upstream enrichment
    // has a pending async phone callback). This is opt-in so existing callers
    // see no behavior change — the WebSocket/HTTP polls return as soon as the
    // worker sets status=completed, with phones=null.
    //
    // Pass the existing result as the initial fallback: if the polling GETs
    // hit a transient error before any successful refresh, we return what we
    // already have (with phones_pending=true still set so consumers know).
    if (phoneOpts?.waitForPhones && this._isPhonesPending(result)) {
      return this._pollForPhones<T>(
        requestId,
        phoneOpts.phoneTimeoutSec ?? 360,
        signal,
        result,
      );
    }
    return result;
  }

  /**
   * Detects whether a job result is still waiting for an async phone reveal.
   * The worker sets `result.phones_pending=true` when the upstream enrichment
   * has a pending async webhook and the webhook URL is configured; the webhook
   * handler flips it to false (or removes it) once phones arrive.
   *
   * Tolerates two shapes: the unwrapped result `{phones_pending}` and the
   * deep_research_person wrapper `{result: {phones_pending}}`.
   */
  private _isPhonesPending(result: unknown): boolean {
    if (!result || typeof result !== 'object') return false;
    const r = result as Record<string, unknown>;
    if (r.phones_pending === true) return true;
    const inner = r.result as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object' && inner.phones_pending === true) return true;
    return false;
  }

  /**
   * Slow poll loop that waits for async phone-reveal callbacks to arrive via
   * the webhook handler (which UPDATEs jobs.result_data.result.phones). Polls
   * GET /v1/requests/{id} every 5s — the upstream provider can take several
   * minutes to deliver, so a tight loop just wastes API calls. Returns the
   * latest snapshot whether or not phones arrived (consumer can re-check
   * `phones_pending`).
   */
  private async _pollForPhones<T>(
    requestId: string,
    timeoutSec: number,
    signal?: AbortSignal,
    initialResult?: T
  ): Promise<T> {
    const deadline = Date.now() + timeoutSec * 1000;
    const interval = 5000;
    // Seed with the snapshot the caller already has so a transient first-poll
    // failure can still return the sync data (with phones_pending=true).
    let lastResult: T | undefined = initialResult;

    while (Date.now() < deadline) {
      if (signal?.aborted) throw new OneShotError('Operation cancelled');
      try {
        const resp = await fetch(`${this.baseUrl}/v1/requests/${requestId}`, {
          headers: this.headers(),
          signal,
        });
        if (!resp.ok) {
          // Soft-fail on transient errors during the phone wait — return
          // whatever we last had so consumers don't lose the sync result.
          if (lastResult !== undefined) return lastResult;
          throw new ToolError('Failed to check job status', resp.status, await resp.text());
        }
        const job = await resp.json() as Record<string, unknown>;
        lastResult = (job.result ?? job) as T;
        if (!this._isPhonesPending(lastResult)) {
          return lastResult;
        }
      } catch (err) {
        if (err instanceof OneShotError) throw err;
        if (lastResult !== undefined) return lastResult;
        throw err;
      }
      await this.sleep(interval, signal);
    }

    // Timeout — return the last snapshot. phones_pending will still be true
    // so the consumer knows phones never arrived.
    return lastResult as T;
  }

  /**
   * WebSocket branch of a job wait. Resolves on a `completed` push for this
   * request, rejects with `JobError` on `failed` and with `OneShotError` on
   * abort. Every other failure (no WebSocket global, handshake refused, socket
   * closed early) rejects with a plain `Error`, which `pollJob` treats as
   * "no push available" rather than as an outcome. There is no timeout here:
   * the HTTP branch owns the deadline and aborts this one when it settles.
   */
  private waitViaWebSocket<T>(
    requestId: string,
    signal: AbortSignal,
    emit: (status: string) => void,
    wait: JobWaitState
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') {
        return reject(new Error('WebSocket not available'));
      }
      if (signal.aborted) {
        return reject(new OneShotError('Operation cancelled'));
      }
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') +
        `/v1/requests/subscribe?wallet=${encodeURIComponent(this.provider.address)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return reject(new Error('WebSocket not available'));
      }

      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        // 0 = CONNECTING, 1 = OPEN (avoid relying on static props of a fake global)
        if (ws.readyState === 0 || ws.readyState === 1) {
          ws.close();
        }
      };

      const onAbort = () => {
        settle(() => {
          cleanup();
          reject(new OneShotError('Operation cancelled'));
        });
      };
      signal.addEventListener('abort', onAbort, { once: true });

      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: [requestId] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());

          // The subscribe ack and other jobs' pushes are not request-scoped.
          if (msg.request_id !== requestId) return;

          if (!wait.pushConfirmed) {
            wait.pushConfirmed = true;
            this.log('WebSocket push confirmed — relaxing HTTP polling');
          }

          if (msg.status === 'completed') {
            this.log('Job completed (WebSocket)');
            settle(() => {
              cleanup();
              wait.via = 'ws';
              const result = (msg.result ?? msg) as Record<string, unknown>;
              if (msg.request_id && typeof result === 'object' && result !== null && !('request_id' in result)) {
                result.request_id = msg.request_id;
              }
              resolve(result as T);
            });
          } else if (msg.status === 'failed') {
            settle(() => {
              cleanup();
              wait.via = 'ws';
              reject(new JobError(`Job failed: ${msg.error ?? 'Unknown'}`, requestId, String(msg.error ?? 'Unknown'), msg.error_code as string | undefined));
            });
          } else {
            emit(String(msg.status));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        settle(() => {
          cleanup();
          reject(new Error('WebSocket error'));
        });
      };

      ws.onclose = () => {
        // Any close before we got a result means no push is coming.
        settle(() => {
          cleanup();
          reject(new Error('WebSocket closed before result'));
        });
      };
    });
  }

  /**
   * HTTP branch of a job wait: polls `GET /v1/requests/:id` immediately, then
   * on a short backoff (300ms → 2s). Once the WebSocket has proven it delivers
   * for this request, polling relaxes to 5s and acts as a safety net only.
   * Owns the caller's deadline (`JobTimeoutError`).
   */
  private async pollJobHttp<T>(requestId: string, timeoutSec?: number, signal?: AbortSignal, emit?: (status: string) => void, wait?: JobWaitState): Promise<T> {
    const scope = deadlineScope(signal, (timeoutSec ?? 120) * 1000);
    const started = Date.now();
    try { return await abortable(this.pollJobHttpImpl<T>(requestId, timeoutSec, scope.signal, emit, wait), scope.signal); }
    catch (error) {
      if (scope.timedOut()) throw new JobTimeoutError(requestId, Date.now() - started);
      throw error;
    } finally { scope.close(); }
  }

  private async pollJobHttpImpl<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    emit?: (status: string) => void,
    wait?: JobWaitState
  ): Promise<T> {
    const maxWaitMs = (timeoutSec ?? 120) * 1000;
    const startTime = Date.now();
    let retries = 0;
    const maxRetries = 3;
    let polls = 0;

    while (Date.now() - startTime < maxWaitMs) {
      if (signal?.aborted) throw new OneShotError('Operation cancelled');

      try {
        const resp = await fetch(`${this.baseUrl}/v1/requests/${requestId}`, {
          headers: this.headers(),
          signal
        });

        if (!resp.ok) {
          const body = await resp.text();
          // 5xx / 429 from the poll endpoint are transient — keep polling.
          // Any other non-2xx (401/403/404) is a real answer about this job.
          if (resp.status >= 500 || resp.status === 429) {
            throw new Error(`Poll returned ${resp.status}: ${body.slice(0, 200)}`);
          }
          throw new ToolError('Failed to check job status', resp.status, body);
        }

        const job = await resp.json() as Record<string, unknown>;

        if (job.status === 'completed') {
          this.log('Job completed');
          if (wait) wait.via = 'http';
          const result = (job.result ?? job) as Record<string, unknown>;
          // Propagate request_id into the result so callers always have it
          if (job.request_id && typeof result === 'object' && result !== null && !('request_id' in result)) {
            result.request_id = job.request_id;
          }
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            if (job.receipt_id && !result.receipt_id) result.receipt_id = job.receipt_id;
            if (job.settlement_status && !result.settlement_status) result.settlement_status = job.settlement_status;
          }
          return result as T;
        }

        if (job.status === 'failed') {
          if (wait) wait.via = 'http';
          throw new JobError(`Job failed: ${job.error ?? 'Unknown'}`, requestId, String(job.error ?? 'Unknown'), job.error_code as string | undefined);
        }

        emit?.(String(job.status));
        retries = 0;
        const interval = wait?.pushConfirmed
          ? HTTP_POLL_RELAXED_MS
          : HTTP_POLL_BACKOFF_MS[Math.min(polls, HTTP_POLL_BACKOFF_MS.length - 1)];
        polls++;
        const remaining = maxWaitMs - (Date.now() - startTime);
        if (remaining <= 0) break;
        await this.sleep(Math.min(interval, remaining), signal);

      } catch (err) {
        if (err instanceof OneShotError) throw err;

        if (++retries > maxRetries) {
          throw new OneShotError(`Polling failed after ${maxRetries} retries: ${err}`);
        }

        const backoff = 2000 * Math.pow(2, retries - 1);
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

      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);

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
    timeoutMs?: number,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers(),
      ...(extraHeaders ?? {}),
      ...(extraHeaders?.['x-agent-proof'] ? await this.signedReadHeaders(/(enrich\/(profile|email)|verify\/email)$/.test(endpoint) ? 'submit' : 'read') : {})
    };

    if (payment) {
      const paymentJson = JSON.stringify(payment);
      const encoded = typeof Buffer !== 'undefined'
        ? Buffer.from(paymentJson).toString('base64')
        : btoa(paymentJson);
      headers['payment-signature'] = encoded;
    }
    if (quoteId) headers['x-quote-id'] = quoteId;

    const transportDeadline = timeoutMs === undefined ? undefined : deadlineScope(signal, timeoutMs);
    const fetchSignal = transportDeadline?.signal ?? signal;
    // Node 18 compatibility: do not require AbortSignal.any. Retain the deadline
    // through response-body consumption; cleanup occurs when it expires/aborts.
    transportDeadline?.signal.addEventListener('abort', () => transportDeadline.close(), { once: true });
    if (fetchSignal?.aborted) throw new OneShotError('Operation cancelled');
    const work = fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST', headers, body: JSON.stringify(data), signal: fetchSignal,
    });
    try { return await (fetchSignal ? abortable(work, fetchSignal) : work); }
    catch (error) { transportDeadline?.close(); throw error; }
  }

  private checkAbortBeforePayment(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new OneShotError('Operation cancelled before payment');
    }
  }

  // ---------------------------------------------------------------------------
  // ETH-currency mode: USDC ledger + buffered swaps
  // ---------------------------------------------------------------------------

  /**
   * ETH mode only. Make sure the wallet's *effective* USDC (on-chain balance
   * minus payments signed but not yet settled) covers this charge, swapping
   * ETH→USDC for a buffer of `swapBufferMultiplier` payments when it does not,
   * then reserve the charge. Returns the reservation so the caller can release
   * it if the payment never settles (request failed). Runs under a per-instance
   * lock so concurrent calls never double-swap or race the wallet nonce.
   */
  private async ensureUsdcBalance(paymentInfo: PaymentInfo): Promise<UsdcReservation | undefined> {
    if (this._currency !== 'ETH') return undefined;

    const { chainId, usdcAddress } = this.assertEthModeSupported(paymentInfo);
    const charge = ethers.parseUnits(paymentInfo.amount, paymentInfo.token.decimals);

    return this.withUsdcLock(async () => {
      let balance = await this.readUsdcBalance(usdcAddress);
      const effective = this.effectiveUsdcBalance(balance);

      if (effective >= charge) {
        this.log(`USDC balance covers payment (${ethers.formatUnits(effective, 6)} available for ${paymentInfo.amount}); skipping ETH swap`);
      } else {
        const swapAmount = await this.sizeSwap(charge, effective, chainId);
        const swapAmountStr = ethers.formatUnits(swapAmount, 6);
        this.log(`USDC ${ethers.formatUnits(effective, 6)} is below ${paymentInfo.amount}; swapping ETH→USDC for ${swapAmountStr} USDC (${this._swapBufferMultiplier}x buffer, slippage: ${this._slippage * 100}%)`);
        try {
          const result = await this.executeUsdcSwap(swapAmountStr, chainId);
          balance += result.usdcReceived;
          // exactOutput delivers exactly amountOut and tx.wait() has confirmed it.
          this._usdcBalanceCache = { balance, at: Date.now() };
          this.log(`Swap complete: tx=${result.txHash}, USDC received=${ethers.formatUnits(result.usdcReceived, 6)}`);
        } catch (err) {
          this._usdcBalanceCache = undefined;
          throw err;
        }
      }

      return this.reserveUsdc(charge);
    });
  }

  /** ETH mode is Base-mainnet-only (that is where the Uniswap route lives); fail clearly before any RPC. */
  private assertEthModeSupported(paymentInfo: PaymentInfo): { chainId: number; usdcAddress: string } {
    const chainId = chainIdFromNetwork(paymentInfo.network) ?? CHAIN_ID;
    if (chainId !== CHAIN_ID) {
      throw new ValidationError(
        `ETH currency mode is only supported on Base mainnet (eip155:${CHAIN_ID}); this payment is on ${paymentInfo.network}. Fund the wallet with USDC or use currency: 'USDC'.`,
        'currency',
      );
    }
    const usdcAddress = paymentInfo.token.address;
    if (usdcAddress.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
      throw new ValidationError(
        `ETH→USDC swap buys ${USDC_ADDRESS} but this payment requires ${usdcAddress}`,
        'currency',
      );
    }
    return { chainId, usdcAddress };
  }

  private withUsdcLock<T>(fn: () => Promise<T>): Promise<T> {
    // A failed predecessor must not poison the chain: the waiter runs its own attempt.
    const run = this._usdcLock.then(fn, fn);
    this._usdcLock = run.then(() => undefined, () => undefined);
    return run;
  }

  /** On-chain USDC balance (atomic units), deduped within one block. Overridable in tests. */
  private async readUsdcBalance(usdcAddress: string): Promise<bigint> {
    const cached = this._usdcBalanceCache;
    if (cached && Date.now() - cached.at < USDC_BALANCE_CACHE_MS) return cached.balance;
    const usdc = new ethers.Contract(usdcAddress, ERC20_BALANCE_ABI, this.rpcProvider);
    const balance = BigInt(await usdc.balanceOf(this.provider.address));
    this._usdcBalanceCache = { balance, at: Date.now() };
    return balance;
  }

  /** `balanceOf − Σ pending` (never negative); drops reservations older than the TTL. */
  private effectiveUsdcBalance(balance: bigint): bigint {
    const cutoff = Date.now() - USDC_RESERVATION_TTL_MS;
    let pending = 0n;
    for (const [id, r] of this._usdcPending) {
      if (r.createdAt < cutoff) this._usdcPending.delete(id);
      else pending += r.amount;
    }
    return balance > pending ? balance - pending : 0n;
  }

  private reserveUsdc(amount: bigint): UsdcReservation {
    const reservation = { id: ++this._usdcReservationSeq, amount, createdAt: Date.now() };
    this._usdcPending.set(reservation.id, reservation);
    return reservation;
  }

  /** Forget a reservation whose payment will never settle (signing or request failed). */
  private releaseUsdcReservation(reservation: UsdcReservation | undefined): void {
    if (reservation) this._usdcPending.delete(reservation.id);
  }

  /**
   * How much USDC to buy: top up to `charge × swapBufferMultiplier`, counting
   * whatever effective balance is already there. When the wallet provider
   * exposes `getBalance` and its ETH cannot cover the buffered quote, fall
   * back to the bare shortfall so an ETH-poor wallet can still make the one
   * payment in front of it (a send-only provider always gets the buffer).
   */
  private async sizeSwap(charge: bigint, effective: bigint, chainId: number): Promise<bigint> {
    const shortfall = charge - effective;
    // Integer math on a 10^6 scale (multiplier ≤ 1000, so ≤ 10^9 — always a
    // finite, exact integer): keeps the multiplier's precision, no float→BigInt
    // on an unbounded value.
    const mScaled = BigInt(Math.round(this._swapBufferMultiplier * SWAP_MULTIPLIER_SCALE));
    const target = (charge * mScaled + BigInt(SWAP_MULTIPLIER_SCALE) - 1n) / BigInt(SWAP_MULTIPLIER_SCALE);
    let amount = target > effective ? target - effective : shortfall;
    if (amount > shortfall && this.provider.getBalance) {
      try {
        const amountInMax = await this.quoteSwapAmountInMax(ethers.formatUnits(amount, 6), chainId);
        const eth = await this.provider.getBalance();
        if (amountInMax !== undefined && eth < amountInMax) {
          this.log(`ETH balance cannot cover a ${ethers.formatUnits(amount, 6)} USDC buffer; swapping only the ${ethers.formatUnits(shortfall, 6)} USDC shortfall`);
          amount = shortfall;
        }
      } catch {
        // Quoting failed — let executeSwap quote again and report properly.
      }
    }
    return amount;
  }

  /** Max ETH the buffered swap could cost (quote), or undefined if unavailable. Overridable in tests. */
  private async quoteSwapAmountInMax(usdcAmount: string, chainId: number): Promise<bigint | undefined> {
    const { getSwapQuote } = await import('./swap');
    const quote = await getSwapQuote(this.rpcProvider, usdcAmount, chainId, this._slippage);
    return quote?.amountInMax;
  }

  /** Perform the on-chain swap. Overridable in tests. */
  private async executeUsdcSwap(usdcAmount: string, chainId: number) {
    const { executeSwap } = await import('./swap');
    return executeSwap(this.provider, this.rpcProvider, usdcAmount, chainId, this._slippage);
  }

  /**
   * Send the paid leg of a request. The server settles the authorization only
   * on acceptance. A transport failure on a durable endpoint is ambiguous;
   * retain its short-lived ETH-mode reservation until recovery or expiry.
   */
  private async makePaidRequest(
    signed: SignedPayment,
    endpoint: string,
    data: Record<string, unknown>,
    quoteId?: string,
    signal?: AbortSignal,
    timeoutMs?: number,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    let resp: Response;
    try {
      resp = await this.makeRequest(endpoint, data, signed.auth, quoteId, signal, timeoutMs, extraHeaders);
    } catch (err) {
      if (!/(enrich\/(profile|email)|verify\/email)$/.test(endpoint)) this.releaseUsdcReservation(signed.reservation);
      throw err;
    }
    if (!resp.ok && !(extraHeaders?.['Idempotency-Key'] && resp.status >= 500)) this.releaseUsdcReservation(signed.reservation);
    return resp;
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
  ): Promise<SignedPayment> {
    // Credits may cover the full cost — send a zero-cost authorization so the server
    // always receives a payment-signature header (avoids 402 from x402 SDK).
    if (parseFloat(paymentInfo.amount) === 0) {
      this.log('Credits cover full cost — sending zero-cost authorization');
      return { auth: {
        x402Version: 2,
        ...(resource ? { resource } : {}),
        ...(extensions ? { extensions } : {}),
        accepted,
        payload: {
          signature: '0x',
          authorization: {
            from: this.provider.address,
            to: paymentInfo.payTo,
            value: '0',
            validAfter: '0',
            validBefore: '0',
            nonce: '0x' + '00'.repeat(32),
          },
        },
      } };
    }

    // If paying with ETH, make sure USDC covers the charge (swapping a buffer if not) and reserve it
    const reservation = await this.ensureUsdcBalance(paymentInfo);

    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.randomBytes(32);
    const value = ethers.parseUnits(paymentInfo.amount, paymentInfo.token.decimals);
    const validAfter = now - 300; // Buffer for clock skew
    const validBefore = now + 3600;
    const nonceHex = ethers.hexlify(nonce);

    // Use the EIP-712 domain from the server's payment requirements — name,
    // version AND chain. The chain used to be the mainnet constant, which made
    // every signature invalid against Base Sepolia (the domain separator
    // includes chainId), so the SDK could never pay on staging.
    const domainName = (accepted.extra?.name as string) || 'USD Coin';
    const domainVersion = (accepted.extra?.version as string) || '2';
    const chainId = chainIdFromNetwork(accepted.network ?? paymentInfo.network) ?? CHAIN_ID;

    // Sign EIP-3009 TransferWithAuthorization
    let signature: string;
    try {
      signature = await this.provider.signTypedData(
      {
        name: domainName,
        version: domainVersion,
        chainId,
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
    } catch (err) {
      this.releaseUsdcReservation(reservation);
      throw err;
    }

    // Return x402 PaymentPayload v2 format (including resource + extensions for Bazaar discovery)
    return { reservation, auth: {
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
    } };
  }
}
