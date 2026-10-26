import { markUntrusted } from './untrusted-content';
import { TOOL_TIMEOUTS } from './tool-timeouts.generated';
export type { UntrustedContent } from './untrusted-content';
import { Hunts } from './hunts';
import type { DurableRecoveryEndpoint, RecoveryEndpoint, RecoveryResponse } from './recovery';
export type { RecoveryEndpoint, RecoveryResponse } from './recovery';
import type { SolveOptions, SolveResultFor } from './solve';
export * from './solve';
import type { PredictOptions, PredictPendingResult, PredictResultFor } from './predict';
export * from './predict';
export * from './hunts';
import { PhysicalMail } from './physical-mail';
export * from './physical-mail';
export * from './approvals';
import { deadlineScope, abortable } from './deadline';
import { RequestTimeoutError, InsufficientCreditsError, LinkedInConnectRequiredError } from './errors';
import { ReadOnlyWalletProvider } from './providers/read-only';
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
  ApprovalRequiredError,
  ActionDeniedError,
} from './errors';

export type { WalletProvider, TypedDataDomain, TypedDataField, TransactionRequest, TransactionResponse } from './wallet-provider';
export { EthersWalletProvider } from './providers/ethers';
export { CdpWalletProvider } from './providers/cdp';
export { ReadOnlyWalletProvider } from './providers/read-only';
export { getSwapQuote, executeSwap } from './swap';
export type { SwapQuote, SwapResult, UniswapAddresses } from './swap';
export * from './errors';
import { Approvals, ActionPolicies } from './approvals';
// Keep receipt on its subpath: node:crypto breaks browser bundles, and providerCost is not public.

// Keep in sync with package.json `version`. Guarded by version.test.ts.
const SDK_VERSION = '0.61.0';

/** Shared state between the WebSocket and HTTP branches of one job wait. */
interface JobWaitState {
  /** A request-scoped message arrived over the socket: push works for this job. */
  pushConfirmed: boolean;
  resultTool?: string;
  /** Last observed status, for de-duplication across branches (completion may be deferred). */
  lastStatus: string | undefined;
  /** Which branch delivered the terminal outcome (debug log only). */
  via: 'ws' | 'http' | undefined;
}

/** HTTP poll cadence while push is unconfirmed: fast first checks, settling at 2s. */
const HTTP_POLL_BACKOFF_MS = [300, 600, 1000, 2000] as const;
/** HTTP poll cadence once the WebSocket has delivered for this request. */
const HTTP_POLL_RELAXED_MS = 5000;

function isTransientComputeReadError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return error.statusCode === 429 || (error.statusCode >= 500 && error.statusCode < 600);
  }
  // Fetch network failures differ across browsers, Node and Bun. Do not swallow
  // arbitrary TypeErrors (bad URLs/configuration), JSON errors or signing errors.
  if (!(error instanceof Error)) return false;
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const { code, cause } = current as { code?: string; cause?: unknown };
    if ((code !== undefined && [
      'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT',
      'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
      'ConnectionRefused', 'ConnectionClosed', 'Timeout',
      'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
    ].includes(code)) || (current instanceof TypeError &&
      /^(fetch failed|Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.)$/i.test(current.message))) return true;
    current = cause;
  }
  return false;
}


const BASE_URL = 'https://win.oneshotagent.com';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

/** Chain id from an x402 network id such as `eip155:84532`; undefined when absent or malformed. */
function chainIdFromNetwork(network: string | undefined): number | undefined {
  const m = /^eip155:(\d+)$/.exec(network ?? '');
  return m ? Number(m[1]) : undefined;
}
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Reserve signed-but-unsettled payments against balanceOf so delayed settlement cannot overspend USDC.
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


export * from './types';

import type {
  TokenInfo, PaymentInfo, PaymentRequirements, PaymentAuthorization,
  LoggerFn, StatusUpdateFn, OneShotConfig, DecisionContext, ToolOptions, RouteMethod, RouteOptions,
  EmailToolOptions, ResearchToolOptions, PersonFindOptions,
  PersonIdentity, PersonProfileOptions, PersonEmailOptions, PersonEmailStatusOptions,
  CompanyFindOptions, CompanyFindResult, CompanyProfileOptions, CompanyProfileResult,
  BusinessFindOptions, BusinessFindResult, BusinessResolveOptions, BusinessResolveResult,
  RecordSolicitationsFindOptions, RecordSolicitationsFindResult,
  PersonDossierOptions, PersonSocialAccountsOptions, PersonArticlesOptions,
  PersonPostsOptions, PersonInterestsOptions, PersonFollowersOptions,
  InboxListOptions, ShippingAddress, CommerceBuyOptions, ProductFindOptions,
  WebSearchOptions, WebSearchResult, WebReadOptions, WebReadResult,
  VoiceCallOptions, SmsOptions, SmsInboxOptions,
  Experience, Education, PersonResult, PersonFindResult, ResearchResult,
  EmailResult, PersonProfileResult, PersonEmailResult, AsyncJobResult,
  PersonEnrichment, PersonDossierResult, PersonDossierPost, PersonSocialAccountsResult, SocialAccount, DossierSection,
  PersonArticlesResult, PersonPostsResult, PersonInterestsResult,
  PersonFollowersResult, PersonEmailStatusResult, InboxEmail, InboxListResult,
  CommerceQuote, CommerceBuyResult, ProductFindProduct, ProductFindResult,
  VoiceQuote, VoiceCallResult, SmsQuote, SmsSendResult, SmsInboxMessage,
  SmsInboxResult, Notification, NotificationsListOptions, NotificationsResult,
  VoiceNumber, ProvisionedVoiceNumber, InboundVoiceConfig, InboundVoiceConfigResult, InboundCall, InboundCallsOptions,
  BuildProduct, BuildLeadCapture, BuildBrand, BuildImages, BuildOptions,
  BuildQuote, BuildResult, BrowserTaskOptions, BrowserProfile, BrowserProfileCreateOptions, BrowserProfileSetup, BrowserQuote,
  BrowserResult, UpdateBuildOptions, RefineBuildOptions, SpendCategory, SpendBreakdown, RoCSResult, RoCSByGoalResult,
  Receipt, ReceiptsListResult, UnifiedBalance, CreditsTopUpResult, ComputeSchedule, ComputeOptions,
  ComputeQuote, ComputeGoalResult, ComputeGoalStatus, ComputeStatusUpdateFn, ComputeTask, ComputeOutput, ComputeOutputContent,
  ComputeBudgetStatus,
  DomainPoolEntry, DomainPoolListResult, DomainPoolStatusResult,
  AgentBudgetConfig, AgentBudgetStatus, AccessTokenCreated, AccessTokenInfo,
  LinkedInConnectOptions,
  LinkedInReconnectOptions,
  LinkedInConnectIntentIssued,
  LinkedInConnectIntent,
  LinkedInAccount,
  LinkedInRevokeResult,
  LinkedInSyncStatus,
  LinkedInSyncOptions,
  LinkedInSyncRunResult,
  LinkedInConversationsOptions,
  LinkedInConversationsPage,
  LinkedInMessagesOptions,
  LinkedInMessagesPage,
  LinkedInReplyOptions,
  LinkedInMessageOptions,
  LinkedInMessageResult,
  LinkedInInvitation,
  LinkedInInvitationOptions,
  LinkedInInvitationsOptions,
  LinkedInInviteOptions, LinkedInInviteResult, LinkedInWithdrawInvitationOptions, LinkedInWithdrawInvitationResult,
  LinkedInViewProfileOptions,
  LinkedInReactOptions,
  LinkedInWriteResult,
  LinkedInProfileViewResult,
} from './types';



/**
 * OneShot Agent SDK - Execute commercial transactions with automatic x402 payments.
 *
 * @example
 * ```typescript
 * const agent = new OneShot({ privateKey: process.env.AGENT_PRIVATE_KEY });
 * await agent.email({ to: 'user@example.com', subject: 'Hi', body: 'Hello' });
 * ```
 */
/** Reject invalid budgets at construction so a typo cannot silently remove the cap. */
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

/** The keys executeToolRequestImpl takes out of a request as SDK options, so they never reach the API body. */
const PAID_ROUTE_OPTION_KEYS = ['timeout', 'totalTimeoutMs', 'onRequestCreated', 'onAccepted', 'signal', 'onStatusUpdate', 'wait', 'waitForPhones', 'phoneTimeoutSec', 'idempotencyKey', 'approvalId', 'maxCost'] as const;

/** ETH mode is unsupported on CDP wallets: the swap path needs a confirmed receipt CDP never returns. */
function cdpEthModeError(): ValidationError {
  return new ValidationError(
    "ETH currency mode is not supported with CDP wallets; fund the CDP wallet with USDC or use currency: 'USDC' (or a privateKey / custom walletProvider for ETH mode)",
    'currency',
  );
}

export class OneShot {
  readonly hunts = new Hunts(this);
  readonly physicalMail = new PhysicalMail(async <T>(path: string, method: string, body?: unknown, mime?: string): Promise<T> => {
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/physical-mail${path}`, {
      method, headers: { ...await this.signedReadHeaders(method === 'GET' ? 'read' : 'write'), 'Content-Type': mime ?? 'application/json' },
      ...(body === undefined ? {} : { body: mime ? body as Uint8Array<ArrayBuffer> : JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) await this.failFromResponse('Physical mail request failed', response);
    return await response.json() as T;
  }, input => this.executeToolRequest('/v1/tools/physical-mail/send', { ...input, wait: false }));

  /** Ask a named human to decide, and read decisions. See ./approvals.ts. */
  readonly approvals = new Approvals((path, method, body, scope) => this.agentJson(path, method, body, scope));
  /** Which paid calls run, are denied, or wait for approval. Wallet sessions write it. */
  readonly policy = new ActionPolicies((path, method, body, scope) => this.agentJson(path, method, body, scope));

  private readonly provider: WalletProvider;
  private readonly rpcProvider: ethers.JsonRpcProvider;
  private readonly baseUrl: string;
  /** Override for the Soul Hunt API origin (default: https://api.soulhunt.ai). */
  readonly huntUrl?: string;
  private readonly debug: boolean;
  private readonly logger: LoggerFn;
  private readProofWarned = false;
  private proofClockOffsetSec = 0;
  private readonly _currency: 'USDC' | 'ETH';
  private readonly _slippage: number;
  private readonly _budgets?: AgentBudgetConfig;
  private readonly _alertEmail?: string;
  /** Set in access-token mode; the session pays from credits and never signs. */
  private readonly _accessToken?: string;
  private readonly _defaultHeaders: Record<string, string>;
  private _stagingKey?: string;
  /** Cache the budget-sync promise so concurrent first calls await the same PUT. */
  private _budgetSync?: Promise<void>;
  private readonly _swapBufferMultiplier: number;
  /** ETH mode: signed payments not yet observed as settled, keyed by reservation id. */
  private _usdcPending = new Map<number, UsdcReservation>();
  private _usdcReservationSeq = 0;
  /** ETH mode: serializes read → decide → swap → reserve per instance (also prevents concurrent swap nonce races). */
  private _usdcLock: Promise<void> = Promise.resolve();
  /** ETH mode: last balanceOf read. Read dedupe only - correctness lives in the ledger. */
  private _usdcBalanceCache?: { balance: bigint; at: number };

  /**
   * Async factory, required for CDP wallets (account creation is async).
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
    if (config.accessToken) {
      if (config.address) return new OneShot(config);
      // Job status and WebSocket requests need the wallet address even when the session never signs.
      const address = await OneShot.resolveTokenAddress(config);
      return new OneShot({ ...config, address });
    }

    if (config.walletProvider) {
      return new OneShot(config, config.walletProvider);
    }

    if (config.cdp) {
      // Reject before importing the CDP SDK or creating an account.
      if ((config.currency ?? 'USDC') === 'ETH') throw cdpEthModeError();
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
   * Sync constructor; works with privateKey.
   * For CDP wallets, use OneShot.create() instead.
   */
  constructor(config: OneShotConfig, walletProvider?: WalletProvider) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.huntUrl = config.huntUrl;
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? console.log;
    this._currency = config.currency ?? 'USDC';
    this._slippage = config.slippage ?? 0.01;
    this._swapBufferMultiplier = validateSwapBufferMultiplier(config.swapBufferMultiplier);
    this._budgets = validateBudgetConfig(config.budgets);
    this._alertEmail = config.alerts?.email;
    this._defaultHeaders = { ...(config.defaultHeaders ?? {}) };
    this._stagingKey = config.stagingKey;
    this.rpcProvider = new ethers.JsonRpcProvider(config.rpcUrl ?? RPC_URL);

    if (config.accessToken) {
      // Delegated tokens cannot change their own budgets; caps must be set from a wallet session.
      if (!/^oneshot_[0-9a-f]{64}$/.test(config.accessToken)) {
        throw new ValidationError('accessToken must be oneshot_<64 lowercase hex characters>', 'accessToken');
      }
      if (config.privateKey || config.cdp || config.walletProvider || walletProvider) {
        throw new ValidationError('accessToken cannot be combined with privateKey, cdp, or walletProvider', 'accessToken');
      }
      if (config.budgets || config.alerts) {
        throw new ValidationError(
          'budgets and alerts are read-only for access-token sessions; set them from a wallet session or the API',
          'budgets',
        );
      }
      if (this._currency === 'ETH') {
        throw new ValidationError('ETH currency mode is not available to access-token sessions (they pay from credits)', 'currency');
      }
      if (!config.address) {
        throw new ValidationError('address is required with accessToken in the constructor; use OneShot.create() to resolve it', 'address');
      }
      let address: string;
      try { address = ethers.getAddress(config.address); }
      catch { throw new ValidationError('address must be a valid Ethereum address', 'address'); }
      this._accessToken = config.accessToken;
      this.provider = new ReadOnlyWalletProvider(address);
    } else if (walletProvider) {
      this.provider = walletProvider;
    } else if (config.privateKey) {
      this.provider = new EthersWalletProvider(config.privateKey, this.rpcProvider);
    } else {
      throw new ValidationError(
        'Provide privateKey or use OneShot.create() for CDP/custom wallets',
        'config'
      );
    }

    // CDP wait() never confirms a receipt, so ETH mode cannot confirm the swap.
    if (config.cdp && this._currency === 'ETH') throw cdpEthModeError();

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

    // Without a pinned sender, the quote locks an address from the agent's domain pool.
    // A mailbox alone has no owned domain to send from.
    if (options.from_mailbox && !options.from_domain) {
      throw new ValidationError(
        'from_mailbox was pinned without from_domain. Pass from_domain (a domain you own) as well, or omit both to rotate across your warmed domains.',
        'from_domain'
      );
    }
    const useRotation = !options.from_domain && !options.from_mailbox;
    const fromAddress = useRotation
      ? undefined
      : `${options.from_mailbox ?? 'agent'}@${options.from_domain}`;

    // Reuse the confirmed quote so the charge matches the amount shown; true alone confirms no amount.
    const confirmedQuote = typeof options.confirmNewDomain === 'string' && options.confirmNewDomain.trim()
      ? options.confirmNewDomain.trim() : undefined;
    if (confirmedQuote) {
      this.log(`Email: sending against confirmed quote ${confirmedQuote}`);
      return this.executeToolRequest<EmailResult>('/v1/tools/email/send',
        this.emailSendPayload(options, fromAddress), confirmedQuote);
    }

    // Mailbox provisioning and domain registration are distinct fees; only a new domain needs confirmation.
    const quote = await this.tool<{
      total_cost: string; quote_id: string; from_address?: string; mailbox_provisioning_fee?: number;
      is_new?: boolean; domain?: string; registration_fee?: number; service_fee?: number;
    }>('email/quote', {
      ...(fromAddress ? { from_address: fromAddress } : {}),
      ...(options.to !== undefined ? { to_address: options.to } : {}),
      ...(options.subject !== undefined ? { subject: options.subject } : {}),
      ...(options.reply_to_email_id ? { reply_to_email_id: options.reply_to_email_id } : {}),
      ...(options.mailbox_mode ? { mailbox_mode: options.mailbox_mode } : {}),
      body: options.body,
      maxCost: options.maxCost,
    });

    this.log(`Email quote: $${quote.total_cost}`);

    // Enforce the cap locally even if the server did not check the header.
    this.assertWithinMaxCost(quote.total_cost, options.maxCost);

    // A new domain must be explicitly authorized against its exact quote before any charge or send.
    if (quote.is_new) {
      const domainName = quote.domain ?? options.from_domain ?? '';
      const breakdown = quote.registration_fee !== undefined && quote.service_fee !== undefined
        ? ` (registration $${quote.registration_fee} + service fee $${quote.service_fee}` +
          `${quote.mailbox_provisioning_fee ? ` + mailbox fee $${quote.mailbox_provisioning_fee}` : ''})`
        : '';
      return {
        status: 'confirmation_required',
        cost: parseFloat(quote.total_cost),
        quote_id: quote.quote_id,
        domain: { domain: domainName, status: 'quote_only', was_provisioned: false },
        message: `Registering ${domainName} costs $${quote.total_cost} total${breakdown}. ` +
          `Nothing has been charged yet. Show the user this exact amount; once they agree, call this again with the same ` +
          `arguments and confirm_new_domain: '${quote.quote_id}' (SDK: confirmNewDomain) to register the domain, ` +
          `charge exactly $${quote.total_cost}, and send this email. true only re-quotes; a wrong or expired quote id is refused without charge.`,
      } as EmailResult;
    }

    return this.executeToolRequest<EmailResult>('/v1/tools/email/send',
      this.emailSendPayload(options, fromAddress ?? quote.from_address), quote.quote_id);
  }

  /** The /email/send body for `email()`: the same whether it follows a fresh quote or a confirmed one. */
  private emailSendPayload(options: EmailToolOptions, resolvedFromAddress: string | undefined): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      ...(resolvedFromAddress ? { from_address: resolvedFromAddress } : {}),
      ...(options.to !== undefined ? { to_address: options.to } : {}),
      ...(options.subject !== undefined ? { subject: options.subject } : {}),
      ...(options.reply_to_email_id ? { reply_to_email_id: options.reply_to_email_id } : {}),
      // Preserve mailbox provisioning when the new domain does not yet have a stored mode.
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
      // Only sends need idempotency; quoting has no side effects.
      payload.idempotencyKey = options.idempotencyKey;
    }

    if (options.approvalId) {
      // Releases a send the action policy held (see ApprovalRequiredError).
      payload.approvalId = options.approvalId;
    }

    // Confirmed sends skip quoting, so the send must also carry the cap.
    if (options.maxCost !== undefined) payload.maxCost = options.maxCost;
    return payload;
  }

  /** List the caller's domain pool with warmup and rotation metadata. */
  async listDomains(): Promise<DomainPoolListResult> {
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/email/domains`, {
      headers: await this.signedReadHeaders(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to list domains', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<DomainPoolListResult>;
  }

  /** Take a domain out of rotation without releasing it. */
  async pauseDomain(domain: string): Promise<DomainPoolStatusResult> {
    this.validate(domain, 'domain');
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/email/domains/${encodeURIComponent(domain)}/pause`, {
      method: 'POST',
      headers: await this.signedReadHeaders('write'),
    });
    if (!response.ok) {
      throw new ToolError('Failed to pause domain', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<DomainPoolStatusResult>;
  }

  /** Put a paused domain back into rotation. */
  async resumeDomain(domain: string): Promise<DomainPoolStatusResult> {
    this.validate(domain, 'domain');
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/email/domains/${encodeURIComponent(domain)}/resume`, {
      method: 'POST',
      headers: await this.signedReadHeaders('write'),
    });
    if (!response.ok) {
      throw new ToolError('Failed to resume domain', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<DomainPoolStatusResult>;
  }

  async research(options: ResearchToolOptions): Promise<ResearchResult> {
    this.validate(options.topic, 'topic');
    return this.tool('research', { ...options });
  }

  /** Simulate or forecast. Quotes and pays; wait: false returns a job handle instead of polling. */
  async predict<I extends PredictOptions>(input: I & { wait: false }): Promise<PredictPendingResult>;
  async predict<I extends PredictOptions>(input: I & { wait?: true }): Promise<PredictResultFor<I['model']>>;
  async predict<I extends PredictOptions>(input: I): Promise<PredictResultFor<I['model']> | PredictPendingResult>;
  async predict<I extends PredictOptions>(input: I): Promise<PredictResultFor<I['model']> | PredictPendingResult> {
    const { memo, valueTag, decisionContext, ...options } = input as PredictOptions & ToolOptions;
    return this.tool('predict', { ...options, timeout: options.timeout ?? 240 });
  }

  /**
   * Solve a routing or packing problem with constraint checks and conflicts. Quotes, pays and waits for
   * the job. The result's `solution` is typed by the request's `problem`.
   */
  async solve<I extends SolveOptions>(input: I): Promise<SolveResultFor<I['problem']>> {
    // Shared option objects and JavaScript callers may still supply receipt metadata.
    // Solve's strict request schema does not accept it, on either quote or paid requests.
    const { memo, valueTag, decisionContext, ...options } = input as SolveOptions & ToolOptions;
    return this.tool('solve', { ...options, timeout: options.timeout ?? 420 });
  }

  async personFind(options: PersonFindOptions): Promise<PersonFindResult> {
    const { includePhone, ...payload } = options;
    return this.tool('find/person', { ...payload, include_phone: includePhone, limit: options.limit ?? 100 });
  }

  /** At least one identity: name, email, phone or a profile URL under any of its names. */
  private requirePersonIdentity(options: PersonIdentity & { full_name?: string; first_name?: string; last_name?: string }): void {
    const hasName = options.name || options.full_name || (options.first_name && options.last_name);
    if (!hasName && !options.email && !options.phone && !options.profile_url && !options.linkedin_url && !options.social_media_url) {
      throw new ValidationError('At least one of name, email, phone, or profile_url is required', 'identifier');
    }
  }

  async personProfile(options: PersonProfileOptions): Promise<PersonProfileResult> {
    this.requirePersonIdentity(options);
    const { includePhone, ...payload } = options;
    return this.tool('lookup/person-profile', { ...payload, include_phone: includePhone });
  }

  async companyFind(options: CompanyFindOptions = {}): Promise<CompanyFindResult> {
    return this.tool('find/company', { ...options, limit: options.limit ?? 10 });
  }

  async companyProfile(options: CompanyProfileOptions): Promise<CompanyProfileResult> {
    if (!options.domain && !options.name && !options.linkedin_url && !options.ticker) {
      throw new ValidationError('At least one of domain, name, linkedin_url, or ticker is required', 'identifier');
    }
    return this.tool('lookup/company-profile', { ...options });
  }

  /**
   * Discover local businesses (restaurants, contractors, practices) by
   * category/keywords × location. Flat price per search, not per row.
   */
  async businessFind(options: BusinessFindOptions): Promise<BusinessFindResult> {
    if (!options.location || options.location.length === 0) {
      throw new ValidationError('location is required (e.g. ["Austin, TX"])', 'location');
    }
    if (!(options.category && options.category.length) && !(options.keywords && options.keywords.length)) {
      throw new ValidationError('At least one of category or keywords is required', 'category');
    }
    return this.tool('find/business', { ...options, limit: options.limit ?? 100 });
  }

  /**
   * Resolve a business name + one locating field to its domain, phone,
   * category and operating status. A miss resolves with `found: false`
   * (a completed job), never a rejection.
   */
  async businessResolve(options: BusinessResolveOptions): Promise<BusinessResolveResult> {
    this.validate(options.name, 'name');
    if (!options.address && !options.city && !options.postal_code && !options.phone) {
      throw new ValidationError('name plus at least one of address, city, postal_code, or phone is required', 'address');
    }
    return this.tool('resolve/business', { ...options });
  }

  /**
   * Federal contract opportunities (SAM.gov) by NAICS code - Sources Sought
   * and Presolicitation notices with the contracting officer's published
   * contact. Flat price per search; zero notices is a completed result.
   * `data_as_of` on the result is the snapshot behind the rows (SAM.gov's
   * daily extract publish time, or "now" when the live API served).
   */
  async recordSolicitationsFind(options: RecordSolicitationsFindOptions): Promise<RecordSolicitationsFindResult> {
    if (!options.naics || options.naics.length === 0) {
      throw new ValidationError('naics is required (one or more 6-digit codes, e.g. ["541511"])', 'naics');
    }
    const bad = options.naics.find(c => !/^\d{6}$/.test(String(c)));
    if (bad !== undefined) {
      throw new ValidationError(`NAICS codes are 6 digits (got ${JSON.stringify(bad)})`, 'naics');
    }
    return this.tool('find/record-solicitations', {
      ...options,
      notice_types: options.notice_types ?? ['r', 'p'],
      limit: options.limit ?? 100,
    });
  }

  async personEmail(options: PersonEmailOptions): Promise<PersonEmailResult> {
    this.requirePersonIdentity(options);
    return this.tool('lookup/person-email', { ...options });
  }

  async personEmailStatus(options: PersonEmailStatusOptions): Promise<PersonEmailStatusResult> {
    this.validate(options.email, 'email');
    return this.tool('lookup/person-email-status', { ...options });
  }

  async personDossier(options: PersonDossierOptions): Promise<PersonDossierResult> {
    this.requirePersonIdentity(options);
    const { includePhone, ...payload } = options;
    // The dossier takes 2 to 5 minutes; the generic 120 second poll gives up on a normal run.
    return this.tool('lookup/person-dossier', { ...payload, include_phone: includePhone, timeout: options.timeout ?? 300 });
  }

  async personSocialAccounts(options: PersonSocialAccountsOptions): Promise<PersonSocialAccountsResult> {
    this.requirePersonIdentity(options);
    return this.tool('lookup/person-social-accounts', { ...options });
  }

  async personArticles(options: PersonArticlesOptions): Promise<PersonArticlesResult> {
    this.validate(options.name, 'name');
    this.validate(options.company, 'company');
    return this.tool('lookup/person-articles', { ...options });
  }

  async personPosts(options: PersonPostsOptions): Promise<PersonPostsResult> {
    this.requirePersonIdentity(options);
    return this.tool('lookup/person-posts', { ...options });
  }

  async personInterests(options: PersonInterestsOptions): Promise<PersonInterestsResult> {
    this.requirePersonIdentity(options);
    return this.tool('lookup/person-interests', { ...options });
  }

  async personFollowers(options: PersonFollowersOptions): Promise<PersonFollowersResult> {
    this.requirePersonIdentity(options);
    return this.tool('lookup/person-followers', { ...options });
  }

  async inboxList(options: InboxListOptions = {}): Promise<InboxListResult> {
    const qs = this.buildQuery({
      since: options.since || undefined,
      limit: options.limit || undefined,
      include_body: options.include_body ? 'true' : undefined,
    });
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/inbox${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list inbox', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return markUntrusted(await response.json(), 'inbox_list') as InboxListResult;
  }

  async inboxGet(emailId: string): Promise<InboxEmail> {
    this.validate(emailId, 'emailId');

    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/inbox/${emailId}`, {
      headers: await this.signedReadHeaders()
    });

    if (response.status === 404) {
      throw new ToolError('Email not found', 404, 'Email not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get email', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return markUntrusted(await response.json(), 'inbox_get') as InboxEmail;
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
      approvalId: options.approvalId,
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

  async productFind(options: ProductFindOptions): Promise<ProductFindResult> {
    this.validate(options.query, 'query');
    return this.tool('find/product', { ...options, limit: options.limit ?? 10 });
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
    if (options.caller_name) payload.caller_name = options.caller_name;
    if (options.context) payload.context = options.context;
    if (options.max_duration_minutes) payload.max_duration_minutes = options.max_duration_minutes;

    const { execResp: callResp } = await this.runQuoteToPay<VoiceQuote>({
      endpoint: '/v1/tools/voice/call',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      approvalId: options.approvalId,
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
      // Wait for the longest the call may run, plus two minutes to dial and settle.
      const timeout = options.timeout ?? (options.max_duration_minutes ?? 10) * 60 + 120;
      return this.pollJob(result.request_id, timeout, options.signal, options.onStatusUpdate, undefined, 'voice');
    }
    return markUntrusted(result, 'voice') as VoiceCallResult;
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
      approvalId: options.approvalId,
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
    if (options.pages?.length) payload.pages = options.pages;
    if (options.lead_capture) payload.lead_capture = options.lead_capture;
    if (options.brand) payload.brand = options.brand;
    if (options.images) payload.images = options.images;
    if (options.domain) payload.domain = options.domain;
    if (options.build_id) payload.build_id = options.build_id;

    return this.submitBuild(payload, options);
  }

  /**
   * Apply natural-language changes to one of your builds. The site's existing
   * code is edited (not regenerated) and redeployed to the same URL.
   *
   * @example
   * ```typescript
   * const result = await agent.refineBuild({
   *   build_id: previous.request_id,
   *   changes: 'Make the hero darker and add an FAQ page at /faq',
   * });
   * ```
   */
  async refineBuild(options: RefineBuildOptions): Promise<BuildResult> {
    this.validate(options.build_id, 'build_id');
    this.validate(options.changes, 'changes');
    return this.submitBuild({ build_id: options.build_id, changes: options.changes }, options);
  }

  private async submitBuild(payload: Record<string, unknown>, options: ToolOptions): Promise<BuildResult> {
    const { execResp: buildResp } = await this.runQuoteToPay<BuildQuote>({
      endpoint: '/v1/tools/build',
      payload,
      signal: options.signal,
      maxCost: options.maxCost,
      approvalId: options.approvalId,
      // Build analysis can be slow server-side; bound the quote leg client-side.
      quoteTimeoutMs: 120000,
      expectMsg: 'Expected 402 for quote',
      totalOf: (ctx) => ctx.pricing.total,
      onQuote: (ctx) => {
        this.log(`Build quote: $${ctx.pricing.total} for "${ctx.product_name}"`);
        if (!ctx.is_refine) this.log(`Type: ${ctx.analysis.inferred_type}, Sections: ${ctx.analysis.estimated_sections}`);
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

    if (options.max_steps !== undefined && (!Number.isInteger(options.max_steps) || options.max_steps < 25 || options.max_steps > 100)) {
      throw new ValidationError('max_steps must be between 25 and 100', 'max_steps');
    }

    const payload: Record<string, unknown> = {
      task: options.task,
    };

    if (options.output_schema) payload.output_schema = options.output_schema;
    if (options.start_url) payload.start_url = options.start_url;
    if (options.allowed_domains) payload.allowed_domains = options.allowed_domains;
    if (options.session_id) payload.session_id = options.session_id;
    if (options.profile_id) payload.profile_id = options.profile_id;
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
      return this.pollJob(result.request_id, options.timeout ?? 300, options.signal, options.onStatusUpdate, undefined, 'browser');
    }
    return markUntrusted(result, 'browser') as BrowserResult;
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
  async createBrowserProfile(name: string, options: BrowserProfileCreateOptions = {}): Promise<BrowserProfile> {
    this.validate(name, 'name');
    if (options.cookies !== undefined && options.storage_state !== undefined) throw new ValidationError('Provide cookies or storage_state, not both', 'options');

    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/browser/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders()) },
      body: JSON.stringify({ name, ...options }),
      signal: AbortSignal.timeout(150_000),
    });

    if (!response.ok) {
      throw new ToolError('Failed to create browser profile', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<BrowserProfile>;
  }

  /**
   * Open a profile login session. Hand the returned `setup_url` to the person whose account it is: it opens
   * once and expires after 10 minutes. They sign in and press Done on the page; poll `getBrowserProfileSetup`
   * until `completed_at` is set. `live_url` is deprecated and removed in the next release.
   */
  async startBrowserProfileSetup(profileId: string, startUrl: string): Promise<BrowserProfileSetup> {
    return this.browserProfileSetup(profileId, 'start', { start_url: startUrl });
  }

  /**
   * Mint a fresh single-use `setup_url` for the profile's open setup; the earlier link stops working. With no
   * open setup, pass `startUrl` to start one; without it the call fails with 409 `no_setup`.
   */
  async createBrowserProfileSetupLink(profileId: string, startUrl?: string): Promise<BrowserProfileSetup> {
    return this.browserProfileSetup(profileId, 'link', startUrl ? { start_url: startUrl } : {});
  }

  /** Setup status. `completed_at` is set once the person pressed Done on the page; it mints no link. */
  async getBrowserProfileSetup(profileId: string): Promise<BrowserProfileSetup> {
    return this.browserProfileSetup(profileId, 'status');
  }

  /** Call after login and 2FA. Saves state and inspects cookies before site navigation. */
  async finishBrowserProfileSetup(profileId: string): Promise<BrowserProfileSetup> {
    return this.browserProfileSetup(profileId, 'finish');
  }

  private async browserProfileSetup(profileId: string, action: string, body: Record<string, unknown> = {}): Promise<BrowserProfileSetup> {
    this.validate(profileId, 'profileId');
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/browser/profiles/${encodeURIComponent(profileId)}/setup/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders()) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(150_000),
    });
    if (!response.ok) throw new ToolError('Browser profile setup failed', response.status, '', response.headers.get('retry-after'));
    return response.json() as Promise<BrowserProfileSetup>;
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/browser/profiles`, {
      headers: await this.signedReadHeaders(),
    });

    if (!response.ok) {
      throw new ToolError('Failed to list browser profiles', response.status, await response.text(), response.headers.get('retry-after'));
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/browser/profiles/${profileId}`, {
      method: 'DELETE',
      headers: await this.signedReadHeaders(),
    });

    if (!response.ok) {
      throw new ToolError('Failed to delete browser profile', response.status, await response.text(), response.headers.get('retry-after'));
    }
  }


  private async linkedinFree<T>(method: 'GET' | 'POST' | 'DELETE', path: string, opts: { body?: unknown; query?: Record<string, string | undefined>; scope?: string; what: string }): Promise<T> {
    const url = new URL(`${this.baseUrl}/v1/tools/linkedin${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const response = await this.fetchApi(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders(opts.scope ?? 'read')) },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const body = await response.text();
      let code: unknown;
      try { code = JSON.parse(body)?.error; } catch { /* Non-JSON upstream error. */ }
      if (response.status === 409 && code === 'connect_required') throw new LinkedInConnectRequiredError(body);
      throw new ToolError(`LinkedIn ${opts.what} failed`, response.status, body, response.headers.get('retry-after'));
    }
    return markUntrusted(await response.json(), `/v1/tools/linkedin${path}`, method) as T;
  }

  /**
   * Create a hosted LinkedIn login link. Show `url` to the human once; it
   * expires in 30 minutes and must be opened top-level (never in an iframe).
   * Poll `getLinkedInConnection(intent_id)` until `completed`.
   */
  async linkedinConnect(options: LinkedInConnectOptions): Promise<LinkedInConnectIntentIssued> {
    if (!Array.isArray(options.requestedActions) || options.requestedActions.length === 0) {
      throw new ValidationError('requestedActions must list at least one action (read, reply, view_profile, react)', 'requestedActions');
    }
    return this.linkedinFree('POST', '/connect', {
      scope: 'write', what: 'connect',
      body: { requested_actions: options.requestedActions, success_redirect_url: options.successRedirectUrl, failure_redirect_url: options.failureRedirectUrl },
    });
  }

  async getLinkedInConnection(intentId: string): Promise<LinkedInConnectIntent> {
    this.validate(intentId, 'intentId');
    return this.linkedinFree('GET', `/connect/${encodeURIComponent(intentId)}`, { what: 'connection status' });
  }

  async listLinkedInAccounts(options: { includeRevoked?: boolean } = {}): Promise<{ accounts: LinkedInAccount[] }> {
    return this.linkedinFree('GET', '/accounts', { what: 'accounts', query: { include_revoked: options.includeRevoked ? 'true' : undefined } });
  }

  async getLinkedInAccount(accountId: string): Promise<LinkedInAccount> {
    this.validate(accountId, 'accountId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(accountId)}`, { what: 'account' });
  }

  /** Reconnect an existing account (preserves ownership and history; replaces the grant after fresh hosted authentication). */
  async reconnectLinkedInAccount(accountId: string, options: LinkedInReconnectOptions = {}): Promise<LinkedInConnectIntentIssued> {
    this.validate(accountId, 'accountId');
    return this.linkedinFree('POST', `/accounts/${encodeURIComponent(accountId)}/reconnect`, {
      scope: 'write', what: 'reconnect',
      body: { requested_actions: options.requestedActions, success_redirect_url: options.successRedirectUrl, failure_redirect_url: options.failureRedirectUrl },
    });
  }

  /** End the grant, cancel queued writes, delete the upstream connection. */
  async revokeLinkedInAccount(accountId: string): Promise<LinkedInRevokeResult> {
    this.validate(accountId, 'accountId');
    return this.linkedinFree('DELETE', `/accounts/${encodeURIComponent(accountId)}`, { scope: 'write', what: 'revoke' });
  }

  async getLinkedInSync(accountId: string): Promise<LinkedInSyncStatus> {
    this.validate(accountId, 'accountId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(accountId)}/sync`, { what: 'sync status' });
  }

  async linkedinConversations(options: LinkedInConversationsOptions): Promise<LinkedInConversationsPage> {
    this.validate(options.accountId, 'accountId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(options.accountId)}/conversations`, {
      what: 'conversations',
      query: { cursor: options.cursor, limit: options.limit?.toString(), since: options.since, unread: options.unread ? 'true' : undefined, archived: options.archived ? 'true' : undefined },
    });
  }

  async linkedinMessages(options: LinkedInMessagesOptions): Promise<LinkedInMessagesPage> {
    this.validate(options.accountId, 'accountId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(options.accountId)}/messages`, {
      what: 'messages',
      query: {
        conversation_id: options.conversationId, direction: options.direction, since: options.since, changed_since: options.changedSince,
        cursor: options.cursor, limit: options.limit?.toString(), include_deleted: options.includeDeleted ? 'true' : undefined,
      },
    });
  }

  /**
   * One bounded, paid history-sync run (up to maxPages × 250 messages). A
   * run that hits the bound is paused with a cursor; the next `continue`
   * call resumes it. Check `coverage.complete` before buying another run.
   */
  async linkedinSync(options: LinkedInSyncOptions): Promise<LinkedInSyncRunResult> {
    this.validate(options.accountId, 'accountId');
    const { accountId, mode, maxPages, ...rest } = options;
    return this.tool('linkedin/sync', { ...rest, account_id: accountId, ...(mode ? { mode } : {}), ...(maxPages ? { max_pages: maxPages } : {}), timeout: options.timeout ?? 600 });
  }

  /** Send an invitation through the connected account (default cap: 25/day). */
  async linkedinInvite(options: LinkedInInviteOptions): Promise<LinkedInInviteResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.profile, 'profile');
    const { accountId, profile, note, ...rest } = options;
    return this.tool('linkedin/invite', { ...rest, account_id: accountId, profile, ...(note !== undefined ? { note } : {}), timeout: options.timeout ?? 180 });
  }

  /** Withdraw a tracked invitation; does not remove an established connection. */
  async linkedinWithdrawInvitation(options: LinkedInWithdrawInvitationOptions): Promise<LinkedInWithdrawInvitationResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.invitationId, 'invitationId');
    const { accountId, invitationId, ...rest } = options;
    return this.tool('linkedin/invite/withdraw', { ...rest, account_id: accountId, invitation_id: invitationId, timeout: options.timeout ?? 180 });
  }

  /** Send a reply in an existing conversation through the connected account. Paced; per-account daily cap. */
  async linkedinReply(options: LinkedInReplyOptions): Promise<LinkedInWriteResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.conversationId, 'conversationId');
    this.validate(options.text, 'text');
    const { accountId, conversationId, text, ...rest } = options;
    return this.tool('linkedin/reply', { ...rest, account_id: accountId, conversation_id: conversationId, text, timeout: options.timeout ?? 180 });
  }

  /**
   * Message a first-degree connection: into the 1:1 conversation the account
   * already has with them, or a new one. Use it once an invitation is accepted,
   * or for a connection the account has never messaged. Needs the `reply`
   * grant; shares the reply daily cap and pacing. A failed send carries an
   * error code: `not_connected` (invite them first) and `rate_limited` mean
   * "defer", not "give up".
   */
  async linkedinMessage(options: LinkedInMessageOptions): Promise<LinkedInMessageResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.profile, 'profile');
    this.validate(options.text, 'text');
    const { accountId, profile, text, ...rest } = options;
    return this.tool('linkedin/message', { ...rest, account_id: accountId, profile, text, timeout: options.timeout ?? 180 });
  }

  /** One invitation sent through linkedinInvite: `accepted` (with `accepted_at`) as soon as the person is a connection. Free. */
  async linkedinInvitation(options: LinkedInInvitationOptions): Promise<LinkedInInvitation> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.invitationId, 'invitationId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(options.accountId)}/invitations/${encodeURIComponent(options.invitationId)}`, { what: 'invitation' });
  }

  /** Invitations sent through linkedinInvite, most recently changed first. Poll with `changedSince`. Free. */
  async linkedinInvitations(options: LinkedInInvitationsOptions): Promise<{ invitations: LinkedInInvitation[] }> {
    this.validate(options.accountId, 'accountId');
    return this.linkedinFree('GET', `/accounts/${encodeURIComponent(options.accountId)}/invitations`, {
      what: 'invitations',
      query: { status: options.status, changed_since: options.changedSince, limit: options.limit?.toString() },
    });
  }

  /** View a profile through the connected account. `notify: true` is visible to the target and cannot be undone. */
  async linkedinViewProfile(options: LinkedInViewProfileOptions): Promise<LinkedInProfileViewResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.identifier, 'identifier');
    const { accountId, identifier, notify, sections, ...rest } = options;
    const body: Record<string, unknown> = { ...rest, account_id: accountId, identifier, notify: !!notify, timeout: options.timeout ?? 180 };
    if (sections?.length) body.sections = sections;
    const result = await this.tool('linkedin/profile-view', body) as LinkedInProfileViewResult;
    // The server leaves both fields out when the section was not requested; surface that as null.
    if (result?.profile) {
      result.profile.experience = result.profile.experience ?? null;
      result.profile.experience_complete = result.profile.experience_complete ?? null;
    }
    return result;
  }

  /** React to a post through the connected account. */
  async linkedinReact(options: LinkedInReactOptions): Promise<LinkedInWriteResult> {
    this.validate(options.accountId, 'accountId');
    this.validate(options.postId, 'postId');
    const { accountId, postId, reactionType, ...rest } = options;
    return this.tool('linkedin/react', { ...rest, account_id: accountId, post_id: postId, reaction_type: reactionType ?? 'like', timeout: options.timeout ?? 180 });
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/sms/inbox${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list SMS inbox', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return markUntrusted(await response.json(), 'sms_inbox_list') as SmsInboxResult;
  }


  /**
   * Get this agent a voice number without placing a call. Returns the existing
   * active number for free; otherwise buys one and charges the one-time phone
   * registration fee from prepaid credits (see `topUpCredits`). Too little
   * credit throws a 402 and buys nothing. Then configure it with
   * `setInboundVoice`.
   *
   * @example
   * ```typescript
   * const number = await agent.provisionVoiceNumber();
   * await agent.setInboundVoice(number.id, { prompt: 'You answer for Acme Dental.' });
   * ```
   */
  async provisionVoiceNumber(): Promise<ProvisionedVoiceNumber> {
    return this.signedJson('POST', '/v1/tools/voice/numbers', {}, 'write', 'Failed to provision a phone number');
  }

  /**
   * List this agent's phone numbers. A number comes from `provisionVoiceNumber`
   * or the agent's first outbound voice call.
   *
   * @example
   * ```typescript
   * const { numbers } = await agent.voiceNumbers();
   * ```
   */
  async voiceNumbers(): Promise<{ numbers: VoiceNumber[] }> {
    return this.signedJson('GET', '/v1/tools/voice/numbers', undefined, 'read', 'Failed to list phone numbers');
  }

  /**
   * Answer calls to one of the agent's numbers. Replaces the whole config.
   * Inbound calls are paid from prepaid credits (see `topUpCredits`), per
   * started minute; a call is declined when credits cannot cover the minimum
   * fee. Keep the returned `webhook_secret` if you set `webhook_url`.
   *
   * @example
   * ```typescript
   * await agent.setInboundVoice(numberId, {
   *   prompt: 'You answer for Acme Dental. Book cleanings; take a message for anything else.',
   *   business_hours: { timezone: 'America/New_York', windows: [{ days: ['mon','tue','wed','thu','fri'], start: '09:00', end: '17:00' }] },
   *   after_hours: 'take_message',
   * });
   * ```
   */
  async setInboundVoice(phoneNumberId: string, config: InboundVoiceConfig): Promise<InboundVoiceConfigResult> {
    this.validate(phoneNumberId, 'phoneNumberId');
    return this.signedJson('PUT', `/v1/tools/voice/numbers/${encodeURIComponent(phoneNumberId)}/inbound`, config, 'write', 'Failed to set inbound voice config');
  }

  /** Current inbound config for a number (throws 404 when none is set). */
  async getInboundVoice(phoneNumberId: string): Promise<InboundVoiceConfigResult> {
    this.validate(phoneNumberId, 'phoneNumberId');
    return this.signedJson('GET', `/v1/tools/voice/numbers/${encodeURIComponent(phoneNumberId)}/inbound`, undefined, 'read', 'Failed to get inbound voice config');
  }

  /** Stop answering calls to a number. The settings are kept, disabled. */
  async disableInboundVoice(phoneNumberId: string): Promise<InboundVoiceConfigResult> {
    this.validate(phoneNumberId, 'phoneNumberId');
    return this.signedJson('DELETE', `/v1/tools/voice/numbers/${encodeURIComponent(phoneNumberId)}/inbound`, undefined, 'write', 'Failed to disable inbound voice');
  }

  /**
   * List inbound calls, newest first.
   *
   * @example
   * ```typescript
   * const { calls } = await agent.inboundCalls({ limit: 20 });
   * for (const c of calls) console.log(c.from, c.summary);
   * ```
   */
  async inboundCalls(options: InboundCallsOptions = {}): Promise<{ calls: InboundCall[] }> {
    const qs = this.buildQuery({
      limit: options.limit || undefined,
      before: options.before || undefined,
      phone_number_id: options.phone_number_id || undefined,
      include_transcript: options.include_transcript ? 'true' : undefined,
    });
    return this.signedJson('GET', `/v1/tools/voice/inbound${qs ? `?${qs}` : ''}`, undefined, 'read', 'Failed to list inbound calls');
  }

  /** One inbound call, with transcript. */
  async inboundCall(callId: string): Promise<InboundCall> {
    this.validate(callId, 'callId');
    return this.signedJson('GET', `/v1/tools/voice/inbound/${encodeURIComponent(callId)}`, undefined, 'read', 'Failed to get inbound call');
  }

  /**
   * Call a declared route of the API by method and path, the one generic call for a route that has no
   * typed method. Follows the Python client's `call_free_get/post/patch/put/delete`:
   *
   * - `path` is the route, with `{name}` (or `:name`) for a path parameter, filled from `params` and URL-encoded
   *   (`/v1/compute/{goal_id}/budget`). It must start with `/v1/` and hold no `..` or `?`.
   * - `query` is the query string (null/undefined left out; booleans `true`/`false`; objects and arrays as JSON).
   * - `body` is the JSON body of a `POST`, `PUT` or `PATCH` (an object field is sent as it is); a `GET` or
   *   `DELETE` sends none.
   * - A free route is authorised like the other free calls: a signed proof (read scope for `GET`, write scope for
   *   any other method) or, in an access-token session, the bearer token. Returns the `data` field of
   *   `{ success, data }`, or the whole body when there is none; an empty answer is `{ success: true }`.
   * - `paid: true` sends the route through the quote-to-pay flow of {@link OneShot.tool} (a `POST` only), with the
   *   {@link ToolOptions} (`maxCost`, `idempotencyKey`, `wait`, `signal`, ...) given in `options`.
   *
   * @example
   * ```typescript
   * const budget = await agent.route('GET', '/v1/compute/{goal_id}/budget', { params: { goal_id: 'goal_01HX' } });
   * const changes = await agent.route('POST', '/v1/tools/changes', { paid: true, body: { attribute: 'vehicle_identification', key: '1HGCM82633A004352', since: '2026-01-01' } });
   * ```
   */
  async route<T = unknown>(method: RouteMethod, path: string, options: RouteOptions = {}): Promise<T> {
    const { params = {}, query = {}, body, paid = false, ...toolOptions } = options;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new ValidationError(`Not an HTTP method of the API: ${method}`, 'method');
    if (!path.startsWith('/v1/') || path.includes('..') || path.includes('?') || path.includes('#')) {
      throw new ValidationError(`Not a route of the API: ${path}`, 'path');
    }
    const filled = path.replace(/\{([A-Za-z0-9_]+)\}|:([A-Za-z0-9_]+)/g, (_match, braced?: string, colon?: string) => {
      const name = braced ?? colon!;
      const value = params[name];
      if ((typeof value !== 'string' && typeof value !== 'number') || String(value) === '') {
        throw new ValidationError(`${name} is required to call ${method} ${path}`, name);
      }
      return encodeURIComponent(String(value));
    });
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      qs.set(key, typeof value === 'boolean' ? (value ? 'true' : 'false') : typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const target = qs.size ? `${filled}?${qs.toString()}` : filled;

    if (paid) {
      if (method !== 'POST') throw new ValidationError(`A paid route is called with POST, not ${method}`, 'method');
      // executeToolRequestImpl strips these keys out of the payload as SDK options, so a body field of the same
      // name would be dropped silently: refuse it, and tell the caller to send it as an option or rename it.
      for (const name of PAID_ROUTE_OPTION_KEYS) {
        if (body && name in body) throw new ValidationError(`The body field "${name}" of ${path} is an option of the SDK call and would not reach the API`, name);
      }
      return this.executeToolRequest<T>(target, { ...(body ?? {}), ...toolOptions } as ToolOptions & Record<string, unknown>);
    }

    const sendsBody = method !== 'GET' && method !== 'DELETE';
    const scope = deadlineScope(toolOptions.signal, filled.startsWith('/v1/tools/browser/profiles') ? 150_000 : 30_000);
    try {
      const request = (async () => {
        const response = await this.fetchApi(`${this.baseUrl}${target}`, {
          method,
          headers: { ...(sendsBody ? { 'Content-Type': 'application/json' } : {}), ...(await this.signedReadHeaders(method === 'GET' ? 'read' : 'write')) },
          ...(sendsBody ? { body: JSON.stringify(body ?? {}) } : {}),
          signal: scope.signal,
        });
        if (!response.ok) {
          if (response.status === 409 && filled.startsWith('/v1/tools/linkedin/')) {
            const text = await response.clone().text();
            let code: unknown;
            try { code = JSON.parse(text)?.error; } catch { /* Not JSON. */ }
            if (code === 'connect_required') throw new LinkedInConnectRequiredError(text);
          }
          await this.failFromResponse(`${method} ${filled} failed`, response);
        }
        const text = await response.text();
        if (response.status === 204 || !text) return { success: true } as T;
        const json = JSON.parse(text) as { data?: T };
        return markUntrusted(json && typeof json === 'object' && 'data' in json ? json.data : json, target, method) as T;
      })();
      return await abortable(request, scope.signal);
    } finally { scope.close(); }
  }

  /** Signed free request returning the `data` field of `{ success, data }`. */
  private async signedJson<T>(method: string, path: string, body: unknown, scope: 'read' | 'write', failure: string): Promise<T> {
    const response = await this.fetchApi(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await this.signedReadHeaders(scope)),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new ToolError(failure, response.status, await response.text(), response.headers.get('retry-after'));
    }
    const json = await response.json() as { data?: T };
    return markUntrusted(json.data ?? json, path, method) as T;
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/sms/inbox/${messageId}`, {
      headers: await this.signedReadHeaders()
    });

    if (response.status === 404) {
      throw new ToolError('SMS message not found', 404, 'Message not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get SMS message', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return markUntrusted(await response.json(), 'sms_inbox_get') as SmsInboxMessage;
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/notifications${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list notifications', response.status, await response.text(), response.headers.get('retry-after'));
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: await this.signedReadHeaders('write')
    });

    if (response.status === 404) {
      throw new ToolError('Notification not found', 404, 'Notification not found');
    }
    if (!response.ok) {
      throw new ToolError('Failed to mark notification as read', response.status, await response.text(), response.headers.get('retry-after'));
    }
  }

  /**
   * The agent's connections: GitHub and business systems, each with `id`, `system`, `account_label` and
   * `status`. Free. A connected-system read (ledger, CRM, shipping, tax, procurement, meetings) takes the `id` of an active
   * one as `connection_id`; pick it by `system` and `account_label`, then call the read with the generic
   * {@link OneShot.route}.
   *
   * @example
   * ```typescript
   * const books = (await agent.listConnections()).find((c) => c.system === 'quickbooks' && c.status === 'active');
   * const invoices = await agent.route('POST', '/v1/tools/ledger/invoices', { paid: true, body: { connection_id: books!.id, status: 'open' } });
   * ```
   */
  async listConnections(): Promise<import('./types').AgentConnection[]> {
    const data = await this.route<{ connections: import('./types').AgentConnection[] }>('GET', '/v1/connections');
    return data.connections;
  }

  /** Free, grant-filtered search over the public tool catalog. */
  async discoverTools(options: import('./types').DiscoverToolsOptions = {}): Promise<import('./types').DiscoverToolsResult> {
    return this.route('GET', '/v1/tools/discover', { query: { ...options }, paid: false });
  }

  async getUnifiedBalance(): Promise<UnifiedBalance> {
    const response = await this.fetchApi(`${this.baseUrl}/v1/tools/balance`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to fetch balance', response.status, await response.text(), response.headers.get('retry-after'));
    }

    return response.json() as Promise<UnifiedBalance>;
  }

  async getBalance(tokenAddress?: string): Promise<string> {
    if (!tokenAddress || tokenAddress === this.usdcAddress) {
      const unified = await this.getUnifiedBalance();
      return unified.on_chain_balance;
    }

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


  /**
   * Create a compute goal - the orchestrator will plan, execute, and iterate autonomously.
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
    if (options.approvals) payload.approvals = options.approvals;
    if (options.done_check) payload.done_check = options.done_check;
    if (options.egress_allowlist) payload.egress_allowlist = options.egress_allowlist;

    // Compute returns the goal directly on 202 - no job polling, unlike the
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
  async getComputeGoal(goalId: string, options: { signal?: AbortSignal } = {}): Promise<ComputeGoalStatus> {
    this.validate(goalId, 'goalId');

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}`, {
      headers: await this.signedReadHeaders(),
      signal: options.signal,
    });

    if (response.status === 404) {
      throw new ToolError('Goal not found', 404, 'Goal not found');
    }
    if (!response.ok) {
      // Keep the HTTP classification even if the error body is interrupted.
      const body = await response.text().catch(() => {
        options.signal?.throwIfAborted();
        return 'Response body unavailable';
      });
      throw new ToolError('Failed to get compute goal', response.status, body, response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: ComputeGoalStatus };
    return json.data;
  }

  /**
   * Poll a compute goal using its goal_id, not its creation request_id.
   * Returns the complete goal snapshot on completed; failed/cancelled reject
   * with JobError (goal ID, end_reason code, snapshot in partialResult).
   * Budget exhaustion ends this wait; after fundComputeGoal revives the goal,
   * call waitForComputeGoal again with the same ID to observe the new run.
   * Paused/awaiting_confirmation/awaiting_connection and recurring goals keep waiting until the
   * goal ends or the timeout (seconds, default 120) expires with JobTimeoutError.
   * Infinity disables the local deadline.
   * onStatusUpdate receives each distinct observed status before settlement.
   * Callback throws/rejections are ignored and promises are not awaited.
   * Transient reads (5xx, 429, network failures) retry on the polling cadence.
   */
  async waitForComputeGoal(
    goalId: string,
    options: { timeout?: number; signal?: AbortSignal; onStatusUpdate?: ComputeStatusUpdateFn } = {},
  ): Promise<ComputeGoalStatus> {
    this.validate(goalId, 'goalId');
    const started = Date.now();
    const scope = deadlineScope(options.signal, (options.timeout ?? 120) * 1000);
    const poll = async () => {
      let lastStatus: string | undefined;
      let polls = 0;
      while (true) {
        scope.signal.throwIfAborted();
        let goal: ComputeGoalStatus;
        try {
          goal = await this.getComputeGoal(goalId, { signal: scope.signal });
        } catch (error) {
          scope.signal.throwIfAborted();
          if (!isTransientComputeReadError(error)) throw error;
          await this.sleep(HTTP_POLL_BACKOFF_MS[Math.min(polls++, HTTP_POLL_BACKOFF_MS.length - 1)], scope.signal);
          continue;
        }
        // A late response from a transport ignoring abort must not emit progress.
        scope.signal.throwIfAborted();
        if (goal.status !== lastStatus) {
          lastStatus = goal.status;
          try {
            Promise.resolve(options.onStatusUpdate?.(goal.status, goalId)).catch(() => {});
          } catch { /* Observers cannot change the goal outcome. */ }
        }
        if (goal.status === 'completed') return goal;
        if (goal.status === 'failed' || goal.status === 'cancelled') {
          const reason = goal.end_reason ?? goal.status;
          throw new JobError(`Compute goal ${goal.status}: ${reason}`, goalId, reason, reason, { ...goal });
        }
        await this.sleep(HTTP_POLL_BACKOFF_MS[Math.min(polls++, HTTP_POLL_BACKOFF_MS.length - 1)], scope.signal);
      }
    };
    try {
      return await abortable(poll(), scope.signal);
    } catch (error) {
      if (scope.timedOut()) throw new JobTimeoutError(goalId, Date.now() - started);
      throw error;
    } finally {
      scope.close();
    }
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/tasks`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get compute tasks', response.status, await response.text(), response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: ComputeTask[] };
    return json.data;
  }

  /**
   * List what a compute goal produced: the files its sandbox tasks left and
   * the tool results too large for a task row. The goal's short answer is
   * `result` on `getComputeGoal`.
   *
   * @example
   * ```typescript
   * for (const out of await agent.getComputeOutputs(goalId)) {
   *   if (out.readable) console.log(out.key, (await agent.getComputeOutput(goalId, out.key)).content);
   * }
   * ```
   */
  async getComputeOutputs(goalId: string): Promise<ComputeOutput[]> {
    this.validate(goalId, 'goalId');

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/outputs`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list compute outputs', response.status, await response.text(), response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: ComputeOutput[] };
    return json.data;
  }

  /** Read one output of a compute goal by the `key` from `getComputeOutputs` (or a task's `outputs`). */
  async getComputeOutput(goalId: string, key: string): Promise<ComputeOutputContent> {
    this.validate(goalId, 'goalId');
    this.validate(key, 'key');

    // The key is a path: keep its slashes, escape everything else.
    const path = key.split('/').map(encodeURIComponent).join('/');
    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/outputs/${path}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to read compute output', response.status, await response.text(), response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: ComputeOutputContent };
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/budget`, {
      headers: await this.signedReadHeaders()
    });

    if (response.status === 404) {
      throw new ToolError('Budget not found', 404, 'Budget not found for this goal');
    }
    if (!response.ok) {
      throw new ToolError('Failed to get compute budget', response.status, await response.text(), response.headers.get('retry-after'));
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
  async cancelComputeGoal(goalId: string, reason?: string): Promise<{ goal_id?: string; status: string; remaining_budget?: string; message?: string }> {
    this.validate(goalId, 'goalId');

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({ reason })
    });

    if (response.status === 404) {
      throw new ToolError('Goal not found', 404, 'Goal not found');
    }
    // 202: cancellation is recorded, the refund waits for reservations to settle. A result, not an error.
    if (response.status === 202) {
      const pending = await response.json() as { status?: string; message?: string };
      return { goal_id: goalId, status: pending.status ?? 'pending_settlement', message: pending.message };
    }
    if (!response.ok) {
      throw new ToolError('Failed to cancel compute goal', response.status, await response.text(), response.headers.get('retry-after'));
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify(input)
    });

    if (response.status === 404) {
      throw new ToolError('Goal or task not found', 404, await response.text(), response.headers.get('retry-after'));
    }
    if (!response.ok) {
      throw new ToolError('Failed to respond to compute task', response.status, await response.text(), response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: { task_id: string; goal_id: string; task_status: string; orchestrator_action: string } };
    return json.data;
  }

  /**
   * Answer whether a goal in `awaiting_confirmation` is done. A goal with no
   * done-check completes only when its owner confirms: the agent that ran it
   * cannot. `approved: false` sends it back with `response` as what is missing.
   *
   * @example
   * ```typescript
   * const goal = await agent.getComputeGoal(goalId);
   * if (goal.status === 'awaiting_confirmation') {
   *   await agent.confirmComputeGoal(goalId, { approved: true });
   * }
   * ```
   */
  async confirmComputeGoal(goalId: string, input: { approved: boolean; response?: string }): Promise<{ goal_id: string; status: 'completed' | 'active'; end_reason: string | null; orchestrator_action: string }> {
    this.validate(goalId, 'goalId');
    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({ confirm_done: input.approved, ...(input.response ? { response: input.response } : {}) }),
    });
    if (response.status === 404) throw new ToolError('Goal not found', 404, await response.text(), response.headers.get('retry-after'));
    if (!response.ok) throw new ToolError('Failed to confirm compute goal', response.status, await response.text(), response.headers.get('retry-after'));
    const json = await response.json() as { data: { goal_id: string; status: 'completed' | 'active'; end_reason: string | null; orchestrator_action: string } };
    return json.data;
  }

  /**
   * Dispute a goal that ended `impossible_unverified`: the loop claimed it
   * cannot be done with no proof code could check. The dispute is recorded
   * on the goal and its receipt; nothing is refunded.
   *
   * @example
   * ```typescript
   * await agent.disputeComputeGoal(goalId, { reason: 'The data is public.' });
   * ```
   */
  async disputeComputeGoal(goalId: string, input: { reason?: string } = {}): Promise<{ goal_id: string; status: string; end_reason: string | null; dispute: { at: string; reason: string } }> {
    this.validate(goalId, 'goalId');
    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({ dispute: true, ...(input.reason ? { response: input.reason } : {}) }),
    });
    if (response.status === 404) throw new ToolError('Goal not found', 404, await response.text(), response.headers.get('retry-after'));
    if (!response.ok) throw new ToolError('Failed to dispute compute goal', response.status, await response.text(), response.headers.get('retry-after'));
    const json = await response.json() as { data: { goal_id: string; status: string; end_reason: string | null; dispute: { at: string; reason: string } } };
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      throw new ToolError('Failed to pause compute goal', response.status, await response.text(), response.headers.get('retry-after'));
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

    const response = await this.fetchApi(`${this.baseUrl}/v1/compute/${goalId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new ToolError('Failed to resume compute goal', response.status, await response.text(), response.headers.get('retry-after'));
    }

    const json = await response.json() as { data: { goal_id: string; status: string; next_run_at: string; run_count: number } };
    return json.data;
  }

  /**
   * Top up budget for a recurring compute goal, or for a goal (one-off or recurring) that
   * ended because it ran out of budget (`end_reason: 'budget_exhausted'`).
   *
   * Uses the quote-then-pay flow: the first call gets a 402 with the top-up price,
   * the second call (with payment) credits the budget. The amount IS the price.
   *
   * Funding a goal that ran out of budget sets it back to `active` and wakes it; it keeps its
   * id, tasks, workspace, outputs, done-check and deadline. A goal that ended any other way, or
   * whose deadline has passed, is refused (`invalid_state` / `deadline_passed`). While the first
   * ending's refund is still settling the call fails with a retryable `refund_pending` (409).
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

    if (this._accessToken) {
      const fundResp = await this.retryAsCreditsSession(quoteData as unknown as Record<string, unknown>, path, payload, quoteData.context.quote_id);
      if (!fundResp.ok) await this.failFromResponse('Failed to fund compute goal', fundResp);
      const json = await fundResp.json() as { data: { goal_id: string; topped_up: number; total_budget: string; remaining: string } };
      return json.data;
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

  /**
   * Add prepaid credits by paying the same amount in USDC via x402.
   *
   * Credits are what access-token (hosted MCP) sessions spend from. This is a
   * wallet-session operation: the wallet pays `amount` USDC on-chain and
   * `amount` lands on the agent's credit balance. A token session throws
   * before any request (credits cannot be bought with credits).
   *
   * @example
   * ```typescript
   * const r = await agent.topUpCredits(25);
   * console.log(r.credits_balance); // "25.000000"
   * ```
   */
  async topUpCredits(amount: number): Promise<CreditsTopUpResult> {
    this.assertWalletSession('top up credits');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('amount must be a positive number', 'amount');
    }
    const path = '/v1/credits/top-up';
    const payload = { amount };
    // A top-up moves USDC out of the wallet like any other paid call, so the
    // configured budgets apply: sync first, pre-flight the amount before signing.
    await this.ensureBudgetsSynced();

    const quoteResp = await this.makeRequest(path, payload);
    if (quoteResp.status !== 402) {
      await this.failFromResponse('Expected 402 for credit top-up', quoteResp);
    }
    const quoteData = await quoteResp.json() as {
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };
    this.log(`Credit top-up: paying ${quoteData.payment_request.amount}`);

    const paymentInfo: PaymentInfo = {
      protocol: 'x402',
      network: `eip155:${quoteData.payment_request.chain_id}`,
      payTo: quoteData.payment_request.recipient,
      amount: quoteData.payment_request.amount,
      currency: 'USD',
      facilitator_url: this.baseUrl,
      token: { address: quoteData.payment_request.token_address, symbol: 'USDC', decimals: 6 },
    };
    // No quote id on this route: the 402 header carries the exact requirement.
    const { accepted, resource, extensions } = this.parsePaymentRequired(quoteResp.headers.get("payment-required"));
    paymentInfo.amount = this.chargeAmount(accepted, quoteData.payment_request.amount);
    this.assertWithinBudget(paymentInfo.amount);
    const signed = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const resp = await this.makePaidRequest(signed, path, payload);
    if (!resp.ok) {
      await this.failFromResponse('Credit top-up failed', resp);
    }
    const json = await resp.json() as { data: CreditsTopUpResult };
    return json.data;
  }


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
    const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/spend/breakdown${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get spend breakdown', response.status, await response.text(), response.headers.get('retry-after'));
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/rocs${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get RoCS', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<RoCSResult>;
  }

  /**
   * List receipts with optional filtering
   *
   * Paginate with `limit`/`offset`, or page through an explicit time window with
   * `since`/`until` (ISO string or Date) - useful for reaching receipts older than
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
    category?: 'data' | 'verification' | 'communication' | 'commerce' | 'infrastructure' | 'agent_to_agent';
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/receipts${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to list receipts', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<ReceiptsListResult>;
  }

  /**
   * Tag value for RoCS computation.
   *
   * Three ways to address the value:
   * - `rcpt_…` receipt id (from `result.receipt_id` or `receiptsList`), or
   * - the `request_id` returned by the originating tool call (`result.request_id`,
   *   resolved server-side via `Receipt.job_id`) - annotate without a list lookup, or
   * - a `goalId` correlation key - attributes a whole *cadence* outcome (the email,
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
   * const r = await agent.personEmailStatus({ email: 'x@y.com' });
   * await agent.tagReceiptValue({ requestId: r.request_id }, { type: 'lead', amount: 1 });
   *
   * // By cadence correlation key - one call attributes a closed deal to the whole sequence:
   * await agent.tagReceiptValue({ goalId: 'goal_q2_acme' }, { type: 'revenue', amount: 5000, label: 'Closed deal' });
   * ```
   */
  async tagReceiptValue(
    ref: string | { receiptId?: string; requestId?: string; goalId?: string },
    valueTag: { type: string; amount?: number; label?: string },
  ): Promise<void> {
    this.validate(valueTag.type, 'valueTag.type');

    if (typeof ref === 'object' && ref.goalId && !ref.receiptId && !ref.requestId) {
      const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
        body: JSON.stringify({ goal_id: ref.goalId, ...valueTag }),
      });
      if (!response.ok) {
        throw new ToolError('Failed to record outcome value', response.status, await response.text(), response.headers.get('retry-after'));
      }
      return;
    }

    const id = typeof ref === 'string' ? ref : (ref.receiptId ?? ref.requestId);
    this.validate(id, 'receiptId/requestId/goalId');

    const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/receipts/${id}/value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify(valueTag)
    });

    if (response.status === 404) {
      throw new ToolError('Receipt not found', 404, 'Receipt not found or not owned by this agent');
    }
    if (!response.ok) {
      throw new ToolError('Failed to tag receipt value', response.status, await response.text(), response.headers.get('retry-after'));
    }
  }

  /**
   * Per-cadence RoCS rollup - spend (from receipts) vs. value (from outcomes)
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
    const response = await this.fetchApi(`${this.baseUrl}/v1/analytics/rocs/by-goal${qs ? `?${qs}` : ''}`, {
      headers: await this.signedReadHeaders()
    });

    if (!response.ok) {
      throw new ToolError('Failed to get RoCS by goal', response.status, await response.text(), response.headers.get('retry-after'));
    }
    return response.json() as Promise<RoCSByGoalResult>;
  }


  private log(msg: string): void {
    if (this.debug) this.logger(`[OneShot] ${msg}`);
  }

  private validate(value: unknown, field: string): void {
    if (!value) throw new ValidationError(`${field} is required`, field);
  }

  private headers(): Record<string, string> {
    return {
      ...this._defaultHeaders,
      ...(this._stagingKey ? { 'X-Staging-Key': this._stagingKey } : {}),
      'X-Agent-ID': this.provider.address,
      'X-OneShot-SDK-Version': SDK_VERSION,
      ...(this._accessToken ? { Authorization: `Bearer ${this._accessToken}` } : {}),
    };
  }

  /** Submit a wallet-proven application. Approval is performed by the staging operator. */
  async applyForStaging(contact: string, purpose: string): Promise<{ wallet: string; status: string; created_at: string }> {
    return this.stagingOnboarding('POST', '/applications', { contact, purpose });
  }

  async getStagingApplication(): Promise<{ wallet: string; status: string; tester_id: string | null; daily_micros: number | null; tools: string[] | null; expires_at: string | null; active: boolean | null }> {
    return this.stagingOnboarding('GET', '/applications/me');
  }

  /** Rotates the wallet's staging key and installs it on this SDK instance. */
  async obtainStagingKey(): Promise<string> {
    const result = await this.stagingOnboarding('POST', '/credential', {});
    this._stagingKey = result.staging_key;
    return result.staging_key;
  }

  private async stagingOnboarding(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
    if (this._accessToken) throw new Error('Staging onboarding requires a wallet signer');
    const digest = ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(body ?? {}))).slice(2);
    const headers = await this.signedReadHeaders(`staging:${method}:${path}:${digest}`);
    if (!headers['x-agent-proof']) throw new Error('Could not sign staging application');
    const response = await this.fetchApi(`${this.baseUrl}/v1/staging${path}`, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json() as any;
    if (!response.ok) throw new Error(result.error ?? `Staging request failed (${response.status})`);
    return result;
  }

  /** True for access-token sessions: credits-only, never signs. */
  get isAccessTokenSession(): boolean {
    return this._accessToken !== undefined;
  }

  /** Auth headers plus Content-Type for JSON-body requests. */
  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...this.headers() };
  }

  /** Signed, single-use proofs bind requests to the wallet; an address alone cannot authenticate reads.
   * Signing failure falls back to plain headers with a one-time warning. */
  private async signedReadHeaders(scope: string = 'read', domainName: string = 'OneShot Agent Auth'): Promise<Record<string, string>> {
    const base = this.headers();
    // The bearer token already binds the request to the agent (and is
    // revocable); the API accepts it in place of the signed proof.
    if (this._accessToken) return base;
    try {
      const agent = this.provider.address;
      const issuedAt = Math.floor(Date.now() / 1000) + (domainName === 'OneShot Agent Auth' ? this.proofClockOffsetSec : 0);
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const signature = await this.provider.signTypedData(
        // Separate EIP-712 domains prevent proof replay across services with independent nonce stores.
        { name: domainName, version: '1' },
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
      // Warn once even without debug so a failed proof explains the ensuing authentication failure.
      if (!this.readProofWarned) {
        this.readProofWarned = true;
        this.logger(`[OneShot] Warning: could not sign the x-agent-proof read proof, so requests go without it and will be rejected where the API enforces proofs. Pass a signer that supports signTypedData, or use an access token. Cause: ${err}`);
      } else {
        this.log(`Failed to sign read proof (continuing without): ${err}`);
      }
      return base;
    }
  }

  /** Retry a clock-window refusal once using the API's server_time, or a spent nonce on GET/HEAD.
   * Never retry a spent nonce on a write: the first delivery may already have executed it.
   * Callers supply replayable JSON bodies and retain their original abort/deadline signal. */
  private async fetchApi(url: string, init: RequestInit): Promise<Response> {
    const proof = new Headers(init.headers).get('x-agent-proof');
    // Disable connection reuse where supported to prevent transport retries from replaying a single-use proof.
    // Browsers control their own pooling; only replayed reads can be safely retried there.
    const deliver = (headers: RequestInit['headers']) =>
      fetch(url, proof ? { ...init, headers: OneShot.singleDelivery(headers), keepalive: false } : init);
    const response = await deliver(init.headers);
    if (response.status !== 401 || !proof || this._accessToken) return response;
    const origin = new URL(this.baseUrl).origin;
    if (new URL(url).origin !== origin || (response.url && new URL(response.url).origin !== origin)) return response;

    let scope: string;
    let serverTime: number | undefined;
    try {
      const body = await response.clone().json() as { error?: unknown; message?: unknown; server_time?: unknown } | null;
      if (body?.error !== 'proof_required' || typeof body.message !== 'string') return response;
      const prefix = 'This endpoint requires a signed agent proof (x-agent-proof): ';
      const reason = body.message.startsWith(prefix) ? body.message.slice(prefix.length) : '';
      const clockRefusal = reason === 'proof expired' || reason === 'proof issued in the future';
      const method = (init.method ?? 'GET').toUpperCase();
      const replayedRead = reason === 'proof nonce already used (replay)' && (method === 'GET' || method === 'HEAD');
      if (!clockRefusal && !replayedRead) return response;
      if (clockRefusal) {
        if (typeof body.server_time !== 'number' || !Number.isSafeInteger(body.server_time) || body.server_time <= 0) return response;
        serverTime = body.server_time;
      }
      const sent = JSON.parse(typeof Buffer !== 'undefined' ? Buffer.from(proof, 'base64').toString('utf-8') : atob(proof));
      if (typeof sent.scope !== 'string') return response;
      scope = sent.scope;
    } catch { return response; }

    init.signal?.throwIfAborted();
    if (serverTime !== undefined) this.proofClockOffsetSec = serverTime - Math.floor(Date.now() / 1000);
    const refreshed = await this.signedReadHeaders(scope);
    init.signal?.throwIfAborted();
    if (!refreshed['x-agent-proof']) return response;
    const retryHeaders = new Headers(init.headers); // Keep the caller's headers intact.
    retryHeaders.set('x-agent-proof', refreshed['x-agent-proof']);
    return deliver(retryHeaders);
  }

  /** The caller's headers plus `Connection: close`, in the caller's own shape (a plain record stays a record).
   * Runtimes that treat `Connection` as a forbidden request header (browsers) drop it silently; nothing throws. */
  private static singleDelivery(headers: RequestInit['headers']): RequestInit['headers'] {
    if (headers instanceof Headers || Array.isArray(headers)) {
      const copy = new Headers(headers);
      copy.set('connection', 'close');
      return copy;
    }
    return { ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== 'connection')), Connection: 'close' };
  }

  /** Skip null/undefined query values; callers must explicitly omit other unwanted falsy values. */
  private buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v));
    }
    return qs.toString();
  }

  /** Sync budgets lazily because signing is async; concurrent calls share the cached promise.
   * Fail closed until the server confirms the budget, and clear failed syncs so the next call retries. */
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
        response = await this.fetchApi(`${this.baseUrl}/v1/agents/me/budgets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new BudgetSyncError(`Could not sync spend budget (network): ${err}`);
      }
      if (!response.ok) {
        const text = await response.text();
        throw new BudgetSyncError(`Could not sync spend budget (${response.status}): ${text}`, response.status, text, response.headers.get('retry-after'));
      }
      this.log('Budget synced');
    })();

    this._budgetSync = attempt;
    try {
      await attempt;
    } catch (err) {
      this._budgetSync = undefined;
      this.log(`${(err as Error).message} — paid call refused until the budget is confirmed`);
      throw err;
    }
  }

  /** Fail oversized calls locally before a round-trip; the server also enforces shared daily spend. */
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
  /** Signed-proof JSON request to a free agent route; returns `data`. Errors map through failFromResponse. */
  private async agentJson<T>(path: string, method: string, body?: unknown, scope: 'read' | 'write' = 'read'): Promise<T> {
    const response = await this.fetchApi(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders(scope)) },
      ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) await this.failFromResponse(`${method} ${path.split('?')[0]} failed`, response);
    const json = await response.json() as { data?: T };
    return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
  }

  async budgets(): Promise<AgentBudgetStatus> {
    const response = await this.fetchApi(`${this.baseUrl}/v1/agents/me/budgets`, {
      headers: await this.signedReadHeaders(),
    });
    if (!response.ok) {
      throw new ToolError('Failed to fetch budgets', response.status, await response.text(), response.headers.get('retry-after'));
    }
    const body = await response.json() as { data?: AgentBudgetStatus };
    return (body.data ?? body) as AgentBudgetStatus;
  }


  private assertWalletSession(action: string): void {
    if (this._accessToken) {
      throw new ValidationError(`Access tokens cannot ${action}; use a wallet session`, 'accessToken');
    }
  }

  /**
   * Mint an access token for this agent: a revocable, credits-only credential
   * for code that runs where the wallet key cannot be (hosted MCP clients,
   * cloud runners). The plaintext is returned once and never stored.
   *
   * @example
   * ```typescript
   * const { token } = await agent.createAccessToken({ name: 'grok-bot' });
   * // hand `token` to the hosted client; it uses OneShot.create({ accessToken: token })
   * ```
   */
  async createAccessToken(opts: { name?: string; expires_in_days?: number } = {}): Promise<AccessTokenCreated> {
    this.assertWalletSession('mint access tokens');
    const response = await this.fetchApi(`${this.baseUrl}/v1/agents/me/access-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await this.signedReadHeaders('write')) },
      body: JSON.stringify({ ...(opts.name !== undefined ? { name: opts.name } : {}), ...(opts.expires_in_days !== undefined ? { expires_in_days: opts.expires_in_days } : {}) }),
    });
    if (!response.ok) throw new ToolError('Failed to create access token', response.status, await response.text(), response.headers.get('retry-after'));
    const body = await response.json() as { data: AccessTokenCreated };
    return body.data;
  }

  /** List this agent's access tokens (prefix, label, last use, spend today - never the token). */
  async listAccessTokens(opts: { activeOnly?: boolean } = {}): Promise<AccessTokenInfo[]> {
    this.assertWalletSession('list access tokens');
    const response = await this.fetchApi(`${this.baseUrl}/v1/agents/me/access-tokens${opts.activeOnly ? '?active=true' : ''}`, {
      headers: await this.signedReadHeaders(),
    });
    if (!response.ok) throw new ToolError('Failed to list access tokens', response.status, await response.text(), response.headers.get('retry-after'));
    const body = await response.json() as { data: { tokens: AccessTokenInfo[] } };
    return body.data.tokens;
  }

  /** Revoke an access token. Sessions using it fail with 401 from the next request. */
  async revokeAccessToken(id: string): Promise<{ id: string; revoked_at: string }> {
    this.assertWalletSession('revoke access tokens');
    this.validate(id, 'id');
    const response = await this.fetchApi(`${this.baseUrl}/v1/agents/me/access-tokens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await this.signedReadHeaders('write'),
    });
    if (!response.ok) throw new ToolError('Failed to revoke access token', response.status, await response.text(), response.headers.get('retry-after'));
    const body = await response.json() as { data: { id: string; revoked_at: string } };
    return body.data;
  }

  /** Local fast-fail guard: throw when a quote total exceeds the caller's cap. */
  private assertWithinMaxCost(total: string, maxCost?: number): void {
    if (maxCost && parseFloat(total) > maxCost) {
      throw new OneShotError(`Quote $${total} exceeds maxCost $${maxCost}`);
    }
  }

  /** Ask the API to enforce the caller's cap before payment, in addition to the local quote check. */
  /** Resolve decimal USDC from the authoritative PAYMENT-REQUIRED header (atomic units);
   * fall back to the legacy body only when the header is missing or unparseable. */
  /** A 402 on the paid retry is a payment rejection, not a quote; expose its cause as PaymentError. */
  private async failFromResponse(message: string, response: Response): Promise<never> {
    const text = await response.text();
    const credits = response.status === 402 ? this.parseInsufficientCredits(text) : undefined;
    if (credits) throw credits;
    const rejection = [402, 500].includes(response.status) ? this.parsePaymentRejection(text) : undefined;
    if (rejection) throw rejection;
    const policy = response.status === 403 ? this.parsePolicyRejection(text) : undefined;
    if (policy) throw policy;
    const budget = response.status === 403 ? this.parseBudgetRejection(text) : undefined;
    if (budget) throw budget;
    throw new ToolError(message, response.status, text, response.headers.get('retry-after'));
  }

  /**
   * Map a 402 `insufficient_credits` body (access-token sessions) onto a typed
   * error. Any other 402 falls through to the payment-rejection / quote parse.
   */
  private parseInsufficientCredits(text: string | Record<string, unknown>): InsufficientCreditsError | undefined {
    let body: any;
    try { body = typeof text === 'string' ? JSON.parse(text) : text; } catch { return undefined; }
    if (!body || body.error !== 'insufficient_credits') return undefined;
    const num = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : undefined;
    return new InsufficientCreditsError(
      body.message ?? 'Credit balance does not cover this call',
      num(body.required_usdc),
      num(body.credits_balance),
      num(body.shortfall_usdc),
    );
  }

  /** Token sessions never sign: retry the quote against credits and let the server ledger decide sufficiency. */
  private async retryAsCreditsSession(
    body: Record<string, unknown> | undefined,
    endpoint: string,
    payload: Record<string, unknown>,
    quoteId?: string,
    signal?: AbortSignal,
    timeoutMs?: number,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const credits = body ? this.parseInsufficientCredits(body) : undefined;
    if (credits) throw credits;
    const qid = quoteId ?? (body as { context?: { quote_id?: string } } | undefined)?.context?.quote_id;
    if (!qid) {
      const amount = (body as { payment_request?: { amount?: string } } | undefined)?.payment_request?.amount;
      throw new InsufficientCreditsError(
        `Credits do not cover ${amount ? `$${amount}` : 'this call'}; top up credits or use a wallet session`,
        amount ? parseFloat(amount) : undefined,
      );
    }
    this.log(`Access-token session: retrying quote ${qid} against credits`);
    const retry = await this.makeRequest(endpoint, payload, undefined, qid, signal, timeoutMs, extraHeaders);
    if (retry.status === 402) await this.failFromResponse('Credits do not cover this call', retry);
    return retry;
  }

  /** GET /v1/agents/me with the token, for OneShot.create({ accessToken }) without an address. */
  private static async resolveTokenAddress(config: OneShotConfig): Promise<string> {
    const TOKEN_RESOLVE_TIMEOUT_MS = 10_000;
    const baseUrl = config.baseUrl ?? BASE_URL;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/agents/me`, {
        headers: {
          ...(config.defaultHeaders ?? {}),
          ...(config.stagingKey ? { 'X-Staging-Key': config.stagingKey } : {}),
          Authorization: `Bearer ${config.accessToken}`,
          'X-OneShot-SDK-Version': SDK_VERSION,
        },
        // Bounded: with no signal, Node's fetch can wait minutes on a hung
        // connection and OneShot.create() would hang with it.
        signal: AbortSignal.timeout(TOKEN_RESOLVE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ToolError(`Could not resolve the access token's agent (network): ${err}`, 0, String(err));
    }
    if (!response.ok) {
      throw new ToolError('Could not resolve the access token\'s agent', response.status, await response.text(), response.headers.get('retry-after'));
    }
    const json = await response.json() as { data?: { wallet_address?: string } };
    const address = json.data?.wallet_address;
    if (!address) throw new ToolError('GET /v1/agents/me returned no wallet_address', response.status, JSON.stringify(json), response.headers.get('retry-after'));
    return address;
  }

  /**
   * Map a 403 `budget_exceeded` body onto a typed error, so callers can catch
   * "my own budget stopped this" separately from an auth failure or a payment
   * rejection. Any other 403 falls through to ToolError.
   */
  /** 403 from the action-policy gate: held for approval, or denied. */
  private parsePolicyRejection(text: string): ApprovalRequiredError | ActionDeniedError | undefined {
    let body: any;
    try { body = JSON.parse(text); } catch { return undefined; }
    if (body?.error === 'approval_required' && typeof body.approval_id === 'string') {
      return new ApprovalRequiredError(body.message ?? 'This call needs a human approval', body.approval_id, body.approval, body.approval?.policy_rule ?? undefined);
    }
    if (body?.error === 'action_denied_by_policy') {
      return new ActionDeniedError(body.message ?? 'Denied by the action policy', body.rule);
    }
    return undefined;
  }

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
      payment_attempt_id?: string;
      stage?: string;
      diagnostics?: import('./errors').PaymentDiagnostics;
    };
    try {
      data = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (!['payment_verification_failed', 'payment_processing_error'].includes(data?.error ?? '')) return undefined;

    const reason = data.reason || 'unknown';
    const expectedAmount = data.expected?.amount;
    const receivedAmount = data.received?.amount;
    const detail = [
      expectedAmount ? `expected $${expectedAmount}` : null,
      receivedAmount ? `signed $${receivedAmount}` : null,
    ].filter(Boolean).join(', ');

    return new PaymentError(
      `payment rejected: ${reason}${detail ? ` — ${detail}` : ''}${data.message ? ` (${data.message})` : ''}${data.payment_attempt_id ? ` [payment attempt ${data.payment_attempt_id}]` : ''}`,
      reason,
      {
        amount: expectedAmount,
        asset: data.expected?.asset,
        network: data.expected?.network,
        payTo: data.expected?.pay_to,
      },
      { amount: receivedAmount },
      data.quote_id,
      data.payment_attempt_id,
      data.stage,
      data.diagnostics,
    );
  }

  private chargeAmount(accepted: { amount?: string }, bodyAmount?: string): string {
    if (accepted?.amount == null || !/^\d+$/.test(String(accepted.amount))) {
      return bodyAmount ?? '0';
    }
    const fromHeader = ethers.formatUnits(accepted.amount, 6);
    // Preserve the body's amount formatting when it agrees with the authoritative header.
    if (bodyAmount != null && parseFloat(bodyAmount) === parseFloat(fromHeader)) {
      return bodyAmount;
    }
    return fromHeader;
  }

  private maxCostHeader(maxCost?: number): Record<string, string> | undefined {
    if (!maxCost || maxCost <= 0) return undefined;
    return { 'X-Max-Cost-USDC': maxCost.toString() };
  }

  /** Send the idempotency key on both legs so retries cannot double-charge or repeat the action. */
  private idempotencyHeader(idempotencyKey?: string): Record<string, string> | undefined {
    if (!idempotencyKey) return undefined;
    return { 'Idempotency-Key': idempotencyKey };
  }

  /** X-Approval-Id, sent on both legs; the server reads it only on the paid leg. */
  private approvalHeader(approvalId?: string): Record<string, string> | undefined {
    if (!approvalId) return undefined;
    return { 'X-Approval-Id': approvalId };
  }

  private async readReliabilityJson<T>(path: string, signed: boolean, allowDegraded = false): Promise<T> {
    const scope = deadlineScope(undefined, signed ? 10_000 : 5_000);
    try {
      return await abortable((async () => {
        const headers = signed ? await this.signedReadHeaders() : undefined;
        if (scope.signal.aborted) throw new OneShotError('Read deadline exceeded');
        const response = await this.fetchApi(`${this.baseUrl}${path}`, { headers, signal: scope.signal });
        if (!response.ok && !(allowDegraded && response.status === 503)) await this.failFromResponse('Reliability read failed', response);
        return await response.json() as T;
      })(), scope.signal);
    } finally { scope.close(); }
  }

  /** Recover a durable submission or generic keyed result without another quote or payment. */
  async recoverRequest(options: { endpoint: DurableRecoveryEndpoint; idempotencyKey: string }): Promise<{ request_id: string; receipt_id: string; status: string; settlement_status: string }>;
  async recoverRequest(options: { endpoint: RecoveryEndpoint; idempotencyKey: string }): Promise<RecoveryResponse>;
  async recoverRequest(options: { endpoint: RecoveryEndpoint; idempotencyKey: string }): Promise<RecoveryResponse> {
    const query = new URLSearchParams({ endpoint: options.endpoint, key: options.idempotencyKey });
    return this.readReliabilityJson(`/v1/submissions/recover?${query}`, true);
  }

  async getServiceStatus(): Promise<{ status: 'healthy' | 'degraded'; observed_at: string; dependencies: Record<string, unknown> }> {
    return this.readReliabilityJson('/v1/status', false, true);
  }

  private async executeToolRequest<T>(endpoint: string, options: ToolOptions & Record<string, unknown>, quoteId?: string): Promise<T> {
    // LinkedIn writes act through a human's account and cannot be recalled: always keyed.
    const reliable = /(?:^|\/)(lookup\/person-(profile|email|email-status)|lookup\/place-permits|solve|predict|linkedin\/(reply|message|profile-view|react|invite(?:\/withdraw)?))$/.test(endpoint);
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
      return markUntrusted(await abortable(this.executeToolRequestImpl<T>(endpoint, { ...options, idempotencyKey: key, signal: scope.signal }, quoteId, context), scope.signal), endpoint);
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
    const { timeout, totalTimeoutMs, onRequestCreated, onAccepted, signal, onStatusUpdate, wait = true, waitForPhones, phoneTimeoutSec, idempotencyKey, approvalId, maxCost, ...payload } = options;
    const extraHeaders = {
      ...this.maxCostHeader(maxCost as number | undefined),
      ...this.idempotencyHeader(idempotencyKey as string | undefined),
    };
    // Releases a call the action policy held (ToolOptions.approvalId).
    Object.assign(extraHeaders, this.approvalHeader(approvalId as string | undefined));

    if (payload.memo !== undefined) {
      if (typeof payload.memo !== 'string' || payload.memo.trim().length === 0) {
        delete payload.memo; // Invalid optional metadata must not block the call.
      } else if (payload.memo.length > 1000) {
        payload.memo = payload.memo.slice(0, 1000);
        this.log('Memo truncated to 1000 chars');
      }
    } else if (!endpoint.endsWith('/v1/tools/solve') && !endpoint.endsWith('/v1/tools/predict') && !endpoint.includes('/inbox') && !endpoint.includes('/notifications') && !endpoint.includes('/balance')) {
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

    // The server must know the configured budget before the first paid request.
    await this.ensureBudgetsSynced();

    if (signal?.aborted) throw new OneShotError('Operation cancelled');
    if (idempotencyKey) Object.assign(extraHeaders, { 'x-agent-proof': 'required' });
    if (signal?.aborted) throw new OneShotError('Operation cancelled');
    context.phase = 'submission';
    let response = await this.makeRequest(endpoint, payload, undefined, quoteId, signal, undefined, extraHeaders);

    if (response.status === 402 && /\/v1\/tools\/(solve|predict|find\/person|lookup\/person-(profile|dossier))$/.test(endpoint)) {
      ({ execResp: response } = await this.runQuoteToPay<{ quote_id: string; total: string }>({
        endpoint, payload, signal, maxCost, quoteResponse: response, extraHeaders,
        expectMsg: 'Expected a tool quote', totalOf: quote => quote.total,
        onQuote: () => { context.phase = 'payment'; },
      }));
      context.phase = 'submission';
    } else if (response.status === 402) {
      const paymentRequiredHeader = response.headers.get('payment-required');
      const { accepted, resource, extensions } = this.parsePaymentRequired(paymentRequiredHeader);

      const data = await response.json() as {
        payment_request?: { chain_id: number; token_address: string; amount: string; recipient: string };
        context?: { quote_id?: string };
      };
      quoteId ??= data.context?.quote_id;
      if (this._accessToken) {
        // Credits-only session: never sign. Let the server settle it.
        this.checkAbortBeforePayment(signal);
        response = await this.retryAsCreditsSession(data as Record<string, unknown>, endpoint, payload, quoteId, signal, undefined, extraHeaders);
      } else {
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
    }

    if (response.status === 409 && /(?:^|\/)linkedin\/invite(?:\/withdraw)?$/.test(endpoint)) {
      const duplicate = await response.clone().json().catch(() => null) as any;
      if (duplicate?.error === 'duplicate_request' && typeof duplicate.details?.request_id === 'string') {
        response = Response.json({ request_id: duplicate.details.request_id, receipt_id: duplicate.details.receipt_id,
          status: 'processing', tool: 'linkedin', linkedin: { action_request_id: duplicate.details.action_request_id,
            invitation_id: duplicate.details.invitation_id } }, { status: 202 });
      }
    }
    if (!response.ok) {
      await this.failFromResponse('Tool request failed', response);
    }

    const result = await response.json() as Record<string, unknown>;

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
        timeout ?? TOOL_TIMEOUTS[endpoint],
        signal,
        onStatusUpdate,
        waitForPhones ? { waitForPhones, phoneTimeoutSec } : undefined,
        endpoint,
      );
      if (completed && typeof completed === 'object' && !Array.isArray(completed)) {
        return { ...completed, request_id: context.requestId, receipt_id: completed.receipt_id ?? context.receiptId, idempotencyKey } as T;
      }
      return completed as T;
    }

    return (result.data ?? result) as T;
  }

  /** Shared quote-to-pay flow; callers own post-202 handling because some tools poll and others return directly. */
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
    /** Release a policy-held call (ToolOptions.approvalId). */
    approvalId?: string;
    /** Reuse an already fetched quote and preserve submission identity on both legs. */
    quoteResponse?: Response;
    extraHeaders?: Record<string, string>;
  }): Promise<{ context: Q; execResp: Response }> {
    await this.ensureBudgetsSynced();

    const approval = { ...cfg.extraHeaders, ...this.approvalHeader(cfg.approvalId) };
    const quoteResp = cfg.quoteResponse ?? await this.makeRequest(
      cfg.endpoint, cfg.payload, undefined, undefined,
      cfg.signal, cfg.quoteTimeoutMs, { ...this.maxCostHeader(cfg.maxCost), ...approval },
    );

    if (quoteResp.status === 400 && cfg.on400) {
      await cfg.on400(quoteResp);
    }

    if (quoteResp.status !== 402) {
      await this.failFromResponse(cfg.expectMsg, quoteResp);
    }

    const quoteData = await quoteResp.json() as {
      context: Q;
      payment_request: { chain_id: number; token_address: string; amount: string; recipient: string };
    };

    cfg.onQuote(quoteData.context);
    this.assertWithinMaxCost(cfg.totalOf(quoteData.context), cfg.maxCost);
    this.assertWithinBudget(cfg.totalOf(quoteData.context));

    if (this._accessToken) {
      this.checkAbortBeforePayment(cfg.signal);
      const execResp = await this.retryAsCreditsSession(
        quoteData as unknown as Record<string, unknown>, cfg.endpoint, cfg.payload, quoteData.context.quote_id, cfg.signal, cfg.execTimeoutMs, approval,
      );
      return { context: quoteData.context, execResp };
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

    this.checkAbortBeforePayment(cfg.signal);
    const { accepted, resource, extensions } = await this.getAcceptedRequirements(
      quoteResp, cfg.endpoint, cfg.payload, quoteData.context.quote_id, cfg.signal, approval,
    );
    paymentInfo.amount = this.chargeAmount(accepted, quoteData.payment_request.amount);
    const signed = await this.signPaymentAuthorization(paymentInfo, accepted, resource, extensions);
    const execResp = await this.makePaidRequest(
      signed, cfg.endpoint, cfg.payload, quoteData.context.quote_id, cfg.signal, cfg.execTimeoutMs, approval,
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
   * For compute goals, use `waitForComputeGoal(goal_id)` instead: their creation
   * request_id does not track progress. `onStatusUpdate` observes distinct job
   * statuses, including the terminal status before settlement.
   * With waitForPhones, completed is deferred until the phone wait returns.
   * Callback errors are ignored; returned promises are not awaited.
   *
   * `signal` ends the local wait only (in-flight fetch aborted, poll timer
   * cleared, rejects with `OneShotError('Operation cancelled')`); the job
   * itself keeps running and can be waited for again.
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

  private unwrapJobResult(job: Record<string, unknown>): unknown {
    const result = job.result ?? job;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const value = { ...result } as Record<string, unknown>;
      for (const field of ['cached', 'fetched_at']) {
        if (field in job) value[field] = job[field];
      }
      return value;
    }
    return result;
  }

  private async pollJob<T>(
    requestId: string,
    timeoutSec?: number,
    signal?: AbortSignal,
    onStatusUpdate?: StatusUpdateFn,
    phoneOpts?: { waitForPhones?: boolean; phoneTimeoutSec?: number },
    tool = '',
  ): Promise<T> {
    // Race HTTP with WebSocket push so a broken push channel cannot stall job completion.
    if (signal?.aborted) throw new OneShotError('Operation cancelled');
    const inner = new AbortController();
    const onOuterAbort = () => inner.abort();
    if (signal?.aborted) inner.abort();
    else signal?.addEventListener('abort', onOuterAbort, { once: true });

    const wait: JobWaitState = { pushConfirmed: false, lastStatus: undefined, via: undefined };
    const notify = (status: string) => {
      // Progress observers must not alter job outcomes or trigger HTTP retries.
      try {
        Promise.resolve(onStatusUpdate?.(status, requestId)).catch(() => {});
      } catch { /* Ignore synchronous observer errors too. */ }
    };
    // Latch terminal transport status immediately, but defer completion for
    // callers waiting on phones so the losing branch cannot emit stale states.
    const emit = (status: string) => {
      if (wait.lastStatus === 'completed' || wait.lastStatus === 'failed') return;
      if (status === wait.lastStatus) return;
      wait.lastStatus = status;
      if (status === 'completed' && phoneOpts?.waitForPhones) return;
      notify(status);
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

    // Phone reveals are opt-in; retain the completed snapshot if every refresh fails.
    if (phoneOpts?.waitForPhones && this._isPhonesPending(result)) {
      result = await this._pollForPhones<T>(
        requestId,
        phoneOpts.phoneTimeoutSec ?? 360,
        signal,
        result,
      );
    }
    if (phoneOpts?.waitForPhones) notify('completed');
    return markUntrusted(result, tool || wait.resultTool || '');
  }

  /** Detect pending phone reveals in search rows, profiles, dossier sections and legacy results. */
  private _isPhonesPending(result: unknown): boolean {
    if (!result || typeof result !== 'object') return false;
    const r = result as Record<string, unknown>;
    const pending = (value: unknown) => !!value && typeof value === 'object'
      && (value as Record<string, unknown>).phones_pending === true;
    return [r, r.result].some(value => {
      if (!value || typeof value !== 'object') return false;
      const body = value as Record<string, unknown>;
      const profile = body.profile as { data?: unknown } | undefined;
      return pending(body) || pending(profile) || pending(profile?.data)
        || (Array.isArray(body.results) && body.results.some(pending));
    });
  }

  /** Poll phone reveals every 5s to avoid wasting calls during slow callbacks; return the latest snapshot on timeout. */
  private async _pollForPhones<T>(
    requestId: string,
    timeoutSec: number,
    signal?: AbortSignal,
    initialResult?: T
  ): Promise<T> {
    const deadline = Date.now() + timeoutSec * 1000;
    const interval = 5000;
    let lastResult: T | undefined = initialResult;

    while (Date.now() < deadline) {
      if (signal?.aborted) throw new OneShotError('Operation cancelled');
      try {
        const resp = await this.fetchApi(`${this.baseUrl}/v1/requests/${requestId}`, {
          headers: await this.signedReadHeaders(),
          signal,
        });
        if (!resp.ok) {
          // Preserve the last successful snapshot across transient phone-wait errors.
          if (lastResult !== undefined) return lastResult;
          throw new ToolError('Failed to check job status', resp.status, await resp.text(), resp.headers.get('retry-after'));
        }
        const job = await resp.json() as Record<string, unknown>;
        lastResult = this.unwrapJobResult(job) as T;
        if (!this._isPhonesPending(lastResult)) {
          return lastResult;
        }
      } catch (err) {
        if (signal?.aborted) throw new OneShotError('Operation cancelled');
        if (err instanceof OneShotError) throw err;
        if (lastResult !== undefined) return lastResult;
        throw err;
      }
      await this.sleep(interval, signal);
    }

    return lastResult as T;
  }

  /** WebSocket transport failures leave HTTP polling in charge; job outcomes and cancellation settle the wait.
   * The HTTP branch owns the deadline and aborts this branch when it settles. */
  private async waitViaWebSocket<T>(
    requestId: string,
    signal: AbortSignal,
    emit: (status: string) => void,
    wait: JobWaitState
  ): Promise<T> {
    // WebSocket cannot carry an Authorization header; keep reusable bearer tokens out of logged URLs.
    // Token sessions use authenticated HTTP polling instead.
    if (this.isAccessTokenSession) {
      throw new Error('WebSocket push is not available for access-token sessions; falling back to HTTP polling');
    }

    // Authenticate the upgrade with a short-lived, single-use proof; a wallet address alone proves nothing.
    const authHeaders = await this.signedReadHeaders();
    const authParams = new URLSearchParams();
    if (authHeaders['x-agent-proof']) authParams.set('proof', authHeaders['x-agent-proof']);

    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') {
        return reject(new Error('WebSocket not available'));
      }
      if (signal.aborted) {
        return reject(new OneShotError('Operation cancelled'));
      }
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') +
        `/v1/requests/subscribe?wallet=${encodeURIComponent(this.provider.address)}` +
        (authParams.toString() ? `&${authParams.toString()}` : '');

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

          emit(String(msg.status));
          if (msg.status === 'completed') {
            this.log('Job completed (WebSocket)');
            settle(() => {
              cleanup();
              wait.via = 'ws';
              wait.resultTool = typeof msg.result_tool === 'string' ? msg.result_tool : undefined;
              const result = this.unwrapJobResult(msg) as Record<string, unknown>;
              if (msg.request_id && typeof result === 'object' && result !== null && !('request_id' in result)) {
                result.request_id = msg.request_id;
              }
              resolve(result as T);
            });
          } else if (msg.status === 'failed') {
            settle(() => {
              cleanup();
              wait.via = 'ws';
              reject(new JobError(`Job failed: ${msg.error ?? 'Unknown'}`, requestId, String(msg.error ?? 'Unknown'), msg.error_code as string | undefined, msg.result as Record<string, unknown> | undefined));
            });
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
      // An abort mid-fetch surfaces as the transport's AbortError; report it as the cancellation it is.
      if (signal?.aborted && !(error instanceof OneShotError)) throw new OneShotError('Operation cancelled');
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
        const resp = await this.fetchApi(`${this.baseUrl}/v1/requests/${requestId}`, {
          headers: await this.signedReadHeaders(),
          signal
        });

        if (!resp.ok) {
          const body = await resp.text();
          // 5xx / 429 from the poll endpoint are transient - keep polling.
          // Any other non-2xx (401/403/404) is a real answer about this job.
          if (resp.status >= 500 || resp.status === 429) {
            throw new Error(`Poll returned ${resp.status}: ${body.slice(0, 200)}`);
          }
          throw new ToolError('Failed to check job status', resp.status, body, resp.headers.get('retry-after'));
        }

        const job = await resp.json() as Record<string, unknown>;

        emit?.(String(job.status));
        if (job.status === 'completed') {
          this.log('Job completed');
          if (wait) { wait.via = 'http'; wait.resultTool = typeof job.result_tool === 'string' ? job.result_tool : undefined; }
          const result = this.unwrapJobResult(job) as Record<string, unknown>;
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
          throw new JobError(`Job failed: ${job.error ?? 'Unknown'}`, requestId, String(job.error ?? 'Unknown'), job.error_code as string | undefined, job.result as Record<string, unknown> | undefined);
        }

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
    let resp = await this.sendLeg(endpoint, data, payment, quoteId, signal, timeoutMs, extraHeaders);
    for (let attempt = 0; resp.status === 401; attempt++) {
      const refusal = await this.readInvalidProof(resp);
      if (!refusal) break;
      if (attempt > 0 || (refusal.reason !== 'expired' && refusal.reason !== 'already_used')) {
        throw new OneShotError(`The API refused the wallet proof (${refusal.reason}): ${refusal.message}`);
      }
      this.log(`Wallet proof refused (${refusal.reason}); signing a new proof and retrying once`);
      resp = await this.sendLeg(endpoint, data, payment, quoteId, signal, timeoutMs, extraHeaders);
    }
    return resp;
  }

  /** `{ reason, message }` when a 401 is the API's `invalid_proof` refusal; the response body stays readable. */
  private async readInvalidProof(resp: Response): Promise<{ reason: string; message: string } | undefined> {
    try {
      const body = await resp.clone().json() as { error?: unknown; reason?: unknown; message?: unknown };
      if (body?.error !== 'invalid_proof') return undefined;
      return {
        reason: typeof body.reason === 'string' ? body.reason : 'invalid',
        message: typeof body.message === 'string' ? body.message : 'The agent proof could not be verified.',
      };
    } catch {
      return undefined;
    }
  }

  private async sendLeg(
    endpoint: string,
    data: Record<string, unknown>,
    payment?: PaymentAuthorization,
    quoteId?: string,
    signal?: AbortSignal,
    timeoutMs?: number,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    // Credit spending requires wallet proof unless a real payment signature already proves ownership.
    // Zero-cost authorizations are unsigned stubs, so those still need a proof.
    const unsignedStub = payment?.payload?.signature === '0x';
    // Identity Verification requires wallet proof on the payment leg too, to recover keyed submissions.
    const provenPayment = /(?:^|\/)identity\/start$/.test(endpoint);
    const askedForProof = !!extraHeaders?.['x-agent-proof'];
    const proofScope = /(lookup\/person-(profile|email|email-status)|lookup\/place-permits|physical-mail\/send|solve|predict)$/.test(endpoint)
      ? 'submit'
      : askedForProof ? 'read' : 'write';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers(),
      ...(extraHeaders ?? {}),
      ...(askedForProof || !payment || unsignedStub || provenPayment ? await this.signedReadHeaders(proofScope) : {})
    };
    // 'required' is this SDK's own marker for "sign this leg"; never send it as a proof.
    if (headers['x-agent-proof'] === 'required') delete headers['x-agent-proof'];

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
    const work = this.fetchApi(`${this.baseUrl}${endpoint}`, {
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


  /** Reserve effective USDC (on-chain minus unsettled payments), swapping a buffer if needed.
   * Serialize reservations and swaps to avoid overspending and nonce races; release failed payments. */
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

  /** ETH mode is Base-mainnet-only; fail clearly before any RPC. */
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

  /** On-chain USDC balance (atomic units), deduped within one block. */
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

  /** Buy a buffer, or only the shortfall when getBalance shows insufficient ETH for the buffer. */
  private async sizeSwap(charge: bigint, effective: bigint, chainId: number): Promise<bigint> {
    const shortfall = charge - effective;
    // Bounded fixed-point math preserves precision without converting an unbounded float to BigInt.
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
        // Quoting failed - let executeSwap quote again and report properly.
      }
    }
    return amount;
  }

  /** Max ETH the buffered swap could cost (quote), or undefined if unavailable. */
  private async quoteSwapAmountInMax(usdcAmount: string, chainId: number): Promise<bigint | undefined> {
    const { getSwapQuote } = await import('./swap');
    const quote = await getSwapQuote(this.rpcProvider, usdcAmount, chainId, this._slippage);
    return quote?.amountInMax;
  }

  /** Swap on the configured chain using the wallet provider. */
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
      // Keyed writes may already be queued server-side after a transport failure: keep the reservation.
      if (!/(lookup\/person-(profile|email|email-status)|lookup\/place-permits|physical-mail\/send|solve|predict|linkedin\/(reply|message|profile-view|react|invite(?:\/withdraw)?))$/.test(endpoint)) this.releaseUsdcReservation(signed.reservation);
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
    signal?: AbortSignal,
    extraHeaders?: Record<string, string>,
  ): Promise<{
    accepted: PaymentRequirements;
    resource?: { url: string; description?: string; mimeType?: string };
    extensions?: Record<string, unknown>;
  }> {
    const header = initialResp.headers.get('payment-required');
    if (header) {
      return this.parsePaymentRequired(header);
    }
    // Carries X-Approval-Id: a policy-held call's probe must reach the 402,
    // not be held again.
    const probeResp = await this.makeRequest(endpoint, payload, undefined, quoteId, signal, undefined, extraHeaders);
    return this.parsePaymentRequired(probeResp.headers.get('payment-required'));
  }

  private async signPaymentAuthorization(
    paymentInfo: PaymentInfo,
    accepted: PaymentRequirements,
    resource?: { url: string; description?: string; mimeType?: string },
    extensions?: Record<string, unknown>,
  ): Promise<SignedPayment> {
    // Credits may cover the full cost - send a zero-cost authorization so the server
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

    if (this._accessToken) {
      throw new InsufficientCreditsError(
        `Credits do not cover $${paymentInfo.amount}; top up credits or use a wallet session`,
        parseFloat(paymentInfo.amount),
      );
    }

    const reservation = await this.ensureUsdcBalance(paymentInfo);

    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.randomBytes(32);
    const value = ethers.parseUnits(paymentInfo.amount, paymentInfo.token.decimals);
    const validAfter = now - 300; // Buffer for clock skew
    const validBefore = now + 3600;
    const nonceHex = ethers.hexlify(nonce);

    // Use the server's full EIP-712 domain, including chainId, so the signature matches its network.
    const domainName = (accepted.extra?.name as string) || 'USD Coin';
    const domainVersion = (accepted.extra?.version as string) || '2';
    const chainId = chainIdFromNetwork(accepted.network ?? paymentInfo.network) ?? CHAIN_ID;

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

export type { PaymentDiagnostics } from './errors';
