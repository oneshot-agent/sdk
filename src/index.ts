import { ethers } from 'ethers';

const SDK_VERSION = '0.4.0';

// ============================================================================
// Environment Configuration
// ============================================================================

/** Test environment (Base Sepolia) - safe for development */
export const TEST_ENV = {
  baseUrl: 'https://oneshot-api-stg-525492415644.us-central1.run.app',
  rpcUrl: 'https://sepolia.base.org',
  chainId: 84532,
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
} as const;

/** Production environment (Base Mainnet) - real money */
export const PROD_ENV = {
  baseUrl: 'https://win.oneshotagent.com',
  rpcUrl: 'https://mainnet.base.org',
  chainId: 8453,
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
} as const;

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

export interface PaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  signature: { v: number; r: string; s: string };
  network: string;
  token: string;
}

export type LoggerFn = (message: string) => void;
export type StatusUpdateFn = (status: string, requestId: string) => void;

export interface OneShotConfig {
  /** Private key for the agent's wallet (required) */
  privateKey: string;
  /** Test mode uses staging API + testnet (default: true) */
  testMode?: boolean;
  /** Override API URL */
  baseUrl?: string;
  /** Override RPC URL */
  rpcUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger function */
  logger?: LoggerFn;
}

export interface ToolOptions {
  maxCost?: number;
  timeout?: number;
  signal?: AbortSignal;
  onStatusUpdate?: StatusUpdateFn;
  wait?: boolean;
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
  max_sources?: number;
  output_format?: 'report_markdown' | 'structured_json';
}

export interface PeopleSearchOptions extends ToolOptions {
  job_titles?: string[];
  keywords?: string[];
  companies?: string[];
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
  provider: string;
  completed_at: string;
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
  success: boolean;
  message_id?: string;
  job_id?: string;
}

export interface EnrichProfileResult {
  status: string;
  profile: PersonResult;
  provider: string;
}

export interface FindEmailResult {
  status: string;
  email: string | null;
  found: boolean;
  provider: string;
}

export interface AsyncJobResult {
  request_id: string;
  status: string;
}

export interface VerifyEmailResult {
  status: string;
  email: string;
  deliverable: boolean;
  reason?: string;
  provider: string;
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
  request_id: string;
  status: string;
  product?: { title: string; total_charged: string };
}

export interface CommerceSearchResult {
  request_id: string;
  status: string;
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
  private readonly wallet: ethers.Wallet;
  private readonly baseUrl: string;
  private readonly debug: boolean;
  private readonly logger: LoggerFn;
  private readonly _testMode: boolean;
  private readonly _expectedChainId: number;
  private readonly _usdcAddress: string;

  constructor(config: OneShotConfig) {
    if (!config.privateKey) {
      throw new ValidationError('privateKey is required', 'privateKey');
    }

    this._testMode = config.testMode ?? true;
    const env = this._testMode ? TEST_ENV : PROD_ENV;

    this.baseUrl = config.baseUrl ?? env.baseUrl;
    this._expectedChainId = env.chainId;
    this._usdcAddress = env.usdcAddress;
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? console.log;

    const provider = new ethers.JsonRpcProvider(config.rpcUrl ?? env.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, provider);

    if (this.debug) {
      this.log(`SDK initialized [${this._testMode ? 'TEST' : 'PROD'}] chain=${this._expectedChainId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  get address(): string {
    return this.wallet.address;
  }

  get isTestMode(): boolean {
    return this._testMode;
  }

  get usdcAddress(): string {
    return this._usdcAddress;
  }

  get expectedChainId(): number {
    return this._expectedChainId;
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

    const quoteResp = await this.makeRequest('/v1/tools/commerce/buy', payload, undefined, undefined, options.signal);
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

    const auth = await this.signPaymentAuthorization(paymentInfo);
    const buyResp = await this.makeRequest('/v1/tools/commerce/buy', payload, auth, quoteData.context.quote_id, options.signal);

    if (buyResp.status !== 202) {
      throw new ToolError('Commerce buy failed', buyResp.status, await buyResp.text());
    }

    const result = await buyResp.json() as CommerceBuyResult;
    this.log(`Order submitted: ${result.request_id}`);

    if (options.wait !== false && result.request_id) {
      return this.pollJob(result.request_id, options.timeout, options.signal, options.onStatusUpdate);
    }
    return result;
  }

  async commerceSearch(options: CommerceSearchOptions): Promise<CommerceSearchResult> {
    this.validate(options.query, 'query');
    return this.tool('commerce/search', { ...options, limit: options.limit ?? 10 });
  }

  async getBalance(tokenAddress: string): Promise<string> {
    this.validate(tokenAddress, 'tokenAddress');

    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
      this.wallet
    );

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(this.wallet.address),
      contract.decimals()
    ]);

    return ethers.formatUnits(balance, decimals);
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
      'X-Agent-ID': this.wallet.address,
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
      const { payment_info } = await response.json() as { payment_info: PaymentInfo };
      this.log(`Payment required: ${payment_info.amount} USDC`);

      const auth = await this.signPaymentAuthorization(payment_info);
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
    signal?: AbortSignal
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers()
    };

    if (payment) headers['x-payment'] = JSON.stringify(payment);
    if (quoteId) headers['x-quote-id'] = quoteId;

    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal
    });
  }

  private async signPaymentAuthorization(paymentInfo: PaymentInfo): Promise<PaymentAuthorization> {
    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.randomBytes(32);
    const value = ethers.parseUnits(paymentInfo.amount, paymentInfo.token.decimals);

    // Parse chain ID from CAIP-2 format or plain number
    const chainId = paymentInfo.network.includes(':')
      ? parseInt(paymentInfo.network.split(':')[1])
      : parseInt(paymentInfo.network);

    // Warn on chain mismatch
    if (chainId !== this._expectedChainId) {
      console.warn(
        `[OneShot] Chain mismatch: API returned ${chainId}, expected ${this._expectedChainId} (${this._testMode ? 'test' : 'prod'})`
      );
    }

    const signature = await this.wallet.signTypedData(
      {
        name: 'USD Coin', // EIP-712 domain name from USDC contract (not the ticker symbol)
        version: '2',
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
        from: this.wallet.address,
        to: paymentInfo.payTo,
        value,
        validAfter: now - 300, // Buffer for clock skew
        validBefore: now + 3600,
        nonce: ethers.hexlify(nonce)
      }
    );

    const sig = ethers.Signature.from(signature);

    return {
      from: this.wallet.address,
      to: paymentInfo.payTo,
      value: value.toString(),
      validAfter: now - 300,
      validBefore: now + 3600,
      nonce: ethers.hexlify(nonce),
      signature: { v: sig.v, r: sig.r, s: sig.s },
      network: paymentInfo.network,
      token: paymentInfo.token.address
    };
  }
}
