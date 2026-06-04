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
} from './errors';

export type { WalletProvider, TypedDataDomain, TypedDataField, TransactionRequest, TransactionResponse } from './wallet-provider';
export { EthersWalletProvider } from './providers/ethers';
export { CdpWalletProvider } from './providers/cdp';
export { getSwapQuote, executeSwap } from './swap';
export type { SwapQuote, SwapResult, UniswapAddresses } from './swap';
export * from './errors';

const SDK_VERSION = '0.16.2';

// ============================================================================
// Environment Configuration
// ============================================================================

const BASE_URL = 'https://win.oneshotagent.com';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

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
  BrowserResult, UpdateBuildOptions, SpendCategory, SpendBreakdown, RoCSResult,
  Receipt, ReceiptsListResult, UnifiedBalance, ComputeSchedule, ComputeOptions,
  ComputeQuote, ComputeGoalResult, ComputeGoalStatus, ComputeTask,
  ComputeBudgetStatus,
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

    const fromAddress = `${options.from_mailbox ?? 'agent'}@${options.from_domain ?? 'oneshotagent.com'}`;

    const quote = await this.tool<{ total_cost: string; quote_id: string }>('email/quote', {
      from_address: fromAddress,
      to_address: options.to,
      subject: options.subject,
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
    if (options.maxCost && parseFloat(quote.total_cost) > options.maxCost) {
      throw new OneShotError(`Quote $${quote.total_cost} exceeds maxCost $${options.maxCost}`);
    }

    const payload: Record<string, unknown> = {
      from_address: fromAddress,
      to_address: options.to,
      subject: options.subject,
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
    const quoteResp = await this.makeRequest('/v1/tools/commerce/buy', payload, undefined, undefined, options.signal, 120000, this.maxCostHeader(options.maxCost));
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
    const quoteResp = await this.makeRequest('/v1/tools/voice/call', payload, undefined, undefined, options.signal, undefined, this.maxCostHeader(options.maxCost));

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
    const quoteResp = await this.makeRequest('/v1/tools/sms/send', payload, undefined, undefined, options.signal, undefined, this.maxCostHeader(options.maxCost));

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
    const quoteResp = await this.makeRequest('/v1/tools/build', payload, undefined, undefined, options.signal, undefined, this.maxCostHeader(options.maxCost));

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
    const quoteResp = await this.makeRequest('/v1/tools/browser', payload, undefined, undefined, options.signal, undefined, this.maxCostHeader(options.maxCost));

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
    const quoteResp = await this.makeRequest('/v1/compute', payload, undefined, undefined, options.signal, undefined, this.maxCostHeader(options.maxCost));

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

    // First call: get quote (402)
    const quoteResp = await this.makeRequest(path, payload);
    if (quoteResp.status !== 402) {
      throw new ToolError('Expected 402 for compute fund quote', quoteResp.status, await quoteResp.text());
    }

    const quoteData = await quoteResp.json() as {
      context: { quote_id: string; topped_up: string; total_budget: string };
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    this.log(`Compute fund quote: $${quoteData.payment_request.amount} to top up ${goalId}`);

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
    const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const fundResp = await this.makeRequest(path, payload, auth, quoteData.context.quote_id);

    if (!fundResp.ok) {
      throw new ToolError('Failed to fund compute goal', fundResp.status, await fundResp.text());
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

  /**
   * Header that asks the API to reject the request when the computed quote
   * exceeds the caller-supplied cap (commit 8f328a7). The SDK still does its
   * own local `quote.total > maxCost` check after the 402 returns — this is
   * a server-side enforcement layer so non-SDK callers (MCP server, custom
   * integrations) can't ignore the cap.
   */
  private maxCostHeader(maxCost?: number): Record<string, string> | undefined {
    if (!maxCost || maxCost <= 0) return undefined;
    return { 'X-Max-Cost-USDC': maxCost.toString() };
  }

  private async executeToolRequest<T>(
    endpoint: string,
    options: ToolOptions & Record<string, unknown>,
    quoteId?: string
  ): Promise<T> {
    const { signal, onStatusUpdate, wait = true, waitForPhones, phoneTimeoutSec, maxCost, ...payload } = options;
    const extraHeaders = this.maxCostHeader(maxCost as number | undefined);

    // Validate memo
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

    // Validate decisionContext
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
        amount: data.payment_request?.amount ?? ethers.formatUnits(accepted.amount, 6),
        currency: 'USD',
        facilitator_url: this.baseUrl,
        token: { address: accepted.asset, symbol: 'USDC', decimals: 6 }
      };
      this.log(`Payment required: ${paymentInfo.amount} USDC`);

      this.checkAbortBeforePayment(signal);
      const auth = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
      response = await this.makeRequest(endpoint, payload, auth, quoteId, signal, undefined, extraHeaders);
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
      return this.pollJob(
        result.request_id as string,
        options.timeout,
        signal,
        onStatusUpdate,
        waitForPhones ? { waitForPhones, phoneTimeoutSec } : undefined,
      );
    }

    return (result.data ?? result) as T;
  }

  private async pollJob<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn,
    phoneOpts?: { waitForPhones?: boolean; phoneTimeoutSec?: number }
  ): Promise<T> {
    // Try WebSocket push first, fall back to HTTP polling
    let result: T;
    try {
      result = await this.waitViaWebSocket<T>(requestId, timeoutSec, signal, onStatusUpdate);
    } catch {
      this.log('WebSocket unavailable, falling back to HTTP polling');
      result = await this.pollJobHttp<T>(requestId, timeoutSec, signal, onStatusUpdate);
    }

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

  private waitViaWebSocket<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const maxWaitMs = (timeoutSec ?? 120) * 1000;
      // Cap WS timeout to 60% of caller timeout so HTTP fallback has real time to work.
      // Floor at 10s (below that, skip WS entirely). This prevents the WS timeout
      // from racing with Cloud Run / load balancer timeouts.
      const wsTimeoutMs = Math.max(Math.floor(maxWaitMs * 0.6), 10_000);
      if (wsTimeoutMs >= maxWaitMs) {
        // Timeout too short for WS + HTTP — reject immediately to force HTTP path
        return reject(new Error('Timeout too short for WebSocket path'));
      }
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') +
        `/v1/requests/subscribe?wallet=${encodeURIComponent(this.provider.address)}`;

      let ws: WebSocket;
      let settled = false;
      let receivedAnyMessage = false;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return reject(new Error('WebSocket not available'));
      }

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      // Overall WS timeout — bail to HTTP fallback with time to spare
      const timeout = setTimeout(() => {
        settle(() => {
          ws.close();
          reject(new Error('WebSocket timeout — falling back to HTTP'));
        });
      }, wsTimeoutMs);

      // First-message deadline: if no relevant message arrives within 15s of
      // subscribing, the WS connection is likely silent (load balancer proxying
      // without forwarding, scale-from-zero, etc). Bail fast to HTTP.
      let firstMessageTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        clearTimeout(timeout);
        if (firstMessageTimer) clearTimeout(firstMessageTimer);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      if (signal) {
        signal.addEventListener('abort', () => {
          settle(() => {
            cleanup();
            reject(new OneShotError('Operation cancelled'));
          });
        }, { once: true });
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: [requestId] }));
        // Start first-message deadline after subscribing
        firstMessageTimer = setTimeout(() => {
          if (!receivedAnyMessage) {
            settle(() => {
              this.log('WebSocket silent after subscribe — falling back to HTTP');
              cleanup();
              reject(new Error('WebSocket silent — no messages received'));
            });
          }
        }, 15_000);
      };

      ws.onmessage = (event) => {
        receivedAnyMessage = true;
        if (firstMessageTimer) { clearTimeout(firstMessageTimer); firstMessageTimer = null; }

        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());

          if (msg.request_id !== requestId) return;

          if (msg.status === 'completed') {
            this.log('Job completed (WebSocket)');
            settle(() => {
              cleanup();
              const result = (msg.result ?? msg) as Record<string, unknown>;
              if (msg.request_id && typeof result === 'object' && result !== null && !('request_id' in result)) {
                result.request_id = msg.request_id;
              }
              resolve(result as T);
            });
          } else if (msg.status === 'failed') {
            settle(() => {
              cleanup();
              reject(new JobError(`Job failed: ${msg.error ?? 'Unknown'}`, requestId, String(msg.error ?? 'Unknown')));
            });
          } else {
            onStatusUpdate?.(msg.status, requestId);
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
        // Any close before we got a result — reject so HTTP fallback kicks in.
        // Previously we only rejected on non-1000 codes, but a clean close
        // without a result is equally fatal for the poll loop.
        settle(() => {
          cleanup();
          reject(new Error('WebSocket closed before result'));
        });
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
          const result = (job.result ?? job) as Record<string, unknown>;
          // Propagate request_id into the result so callers always have it
          if (job.request_id && typeof result === 'object' && result !== null && !('request_id' in result)) {
            result.request_id = job.request_id;
          }
          return result as T;
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
    timeoutMs?: number,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers(),
      ...(extraHeaders ?? {})
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
  ): Promise<PaymentAuthorization | undefined> {
    // Credits may cover the full cost — send a zero-cost authorization so the server
    // always receives a payment-signature header (avoids 402 from x402 SDK).
    if (parseFloat(paymentInfo.amount) === 0) {
      this.log('Credits cover full cost — sending zero-cost authorization');
      return {
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
      };
    }

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
