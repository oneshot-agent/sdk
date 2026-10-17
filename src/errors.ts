/** Retry-After is either integer seconds or an HTTP-date, never a partial number. */
function retryAfterMs(header?: string | null): number | undefined {
  if (!header?.trim()) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isSafeInteger(ms) ? ms : undefined;
  }

  const now = Date.now();
  // HTTP's two-digit years use a rolling fifty-year future boundary, unlike
  // JavaScript's fixed 1950/2050 boundary.
  const dateValue = value.replace(/^([A-Za-z]+, \d{2}-[A-Za-z]{3}-)(\d{2})( )/, (_, prefix, shortYear, space) => {
    const cutoff = new Date(now).getUTCFullYear() + 50;
    const year = Number(shortYear);
    return `${prefix}${Math.floor((cutoff - year) / 100) * 100 + year}${space}`;
  });
  // asctime has no timezone suffix, but HTTP still defines it as GMT.
  const timestamp = Date.parse(dateValue.endsWith('GMT') ? dateValue : `${dateValue} GMT`);
  if (!Number.isFinite(timestamp)) return undefined;
  // Round-trip all three HTTP-date formats to reject JS date-parser extensions
  // (including negative numbers, ISO dates, and normalized impossible dates).
  const date = new Date(timestamp);
  const canonical = date.toUTCString();
  const [, day, month, year, time] = canonical.split(' ');
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];
  const rfc850 = `${weekday}, ${day}-${month}-${year.slice(-2)} ${time} GMT`;
  const asctime = `${canonical.slice(0, 3)} ${month} ${day.startsWith('0') ? ` ${day[1]}` : day} ${time} ${year}`;
  if (![canonical, rfc850, asctime].includes(value)) return undefined;
  return Math.max(0, timestamp - now);
}

export class OneShotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OneShotError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ToolError extends OneShotError {
  /** Server-requested delay in milliseconds; undefined when absent or invalid. */
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
    retryAfter?: string | null,
  ) {
    super(message);
    this.name = 'ToolError';
    this.retryAfterMs = retryAfterMs(retryAfter);
  }
}

/** The saved LinkedIn connection is gone; ask the human to authorize a new connect. */
export class LinkedInConnectRequiredError extends ToolError {
  readonly code = 'connect_required';
  readonly nextAction = 'connect';
  constructor(responseBody: string) {
    super('This LinkedIn connection no longer exists. Start a new connection.', 409, responseBody);
    this.name = 'LinkedInConnectRequiredError';
  }
}

/**
 * The facilitator rejected the payment signed for this request.
 *
 * Distinct from the ordinary 402 that opens the quote-pay handshake: this is a
 * 402 arriving on the PAID retry, meaning the signature was refused. `reason`
 * is the facilitator's machine-readable code (`insufficient_funds`,
 * `invalid_exact_evm_payload_authorization_value`, …) and `expected`/`received`
 * name the amounts when the two disagree — the case that produced a silent,
 * bodiless 402 before the server started reporting it.
 */
export interface PaymentDiagnostics {
  status: string;
  observation_block?: string;
  observation_time?: string;
  findings: { code: string }[];
}

export class PaymentError extends OneShotError {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly expected?: { amount?: string; asset?: string; network?: string; payTo?: string },
    public readonly received?: { amount?: string },
    public readonly quoteId?: string,
    public readonly paymentAttemptId?: string,
    public readonly stage?: string,
    public readonly diagnostics?: PaymentDiagnostics,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class JobError extends OneShotError {
  constructor(
    message: string,
    public readonly jobId: string,
    public readonly jobError: string,
    // Stable error-code taxonomy (issue #111): insufficient_funds, payment_failed,
    // invalid_input, content_blocked, rate_limited, service_unavailable,
    // service_auth, enrichment_exhausted, target_unreachable,
    // source_unsupported, checkout_failed, internal_error.
    // Branch on this to decide whether to fund/fix vs. blind-retry.
    public readonly code?: string,
    public readonly partialResult?: Record<string, unknown>
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

/** The server may have accepted work even when no response reached the caller. */
export class RequestTimeoutError extends OneShotError {
  constructor(
    public readonly elapsedMs: number,
    public readonly phase: string,
    public readonly idempotencyKey?: string,
    public readonly requestId?: string,
    public readonly receiptId?: string,
  ) {
    super(`Request deadline exceeded during ${phase}; recover the original submission before retrying`);
    this.name = 'RequestTimeoutError';
  }
  get acceptance(): 'accepted' | 'unknown' { return this.requestId ? 'accepted' : 'unknown'; }
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

/**
 * The agent's own spend budget stopped this call (HTTP 403 `budget_exceeded`).
 *
 * Distinct from PaymentError: nothing was signed and nothing was charged. A
 * retry cannot succeed until the daily window resets (`resetsAt`) or the budget
 * is raised — which is why the server answers 403 rather than 402.
 *
 * `reason` is 'daily' when cumulative UTC-day spend would cross the budget, or
 * 'per_transaction' when this single call is larger than the per-call cap.
 */
export class BudgetExceededError extends OneShotError {
  constructor(
    message: string,
    public readonly reason: 'daily' | 'per_transaction',
    public readonly cap?: number,
    public readonly spent?: number,
    public readonly charge?: number,
    public readonly resetsAt?: string
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * The SDK could not confirm the configured spend budget with the server
 * before a paid call, so the call was NOT made.
 *
 * Budgets are enforced server-side; if the sync fails (network error, 5xx,
 * rate limit, or a rejected config) the only honest options are to proceed
 * without the guardrail the developer asked for, or to stop. We stop. The
 * sync is retried on the next paid call. `status` is the HTTP status when the
 * server answered, undefined on a network failure.
 */
export class BudgetSyncError extends OneShotError {
  /** Server-requested delay in milliseconds; undefined when absent or invalid. */
  public readonly retryAfterMs?: number;

  constructor(message: string, public readonly status?: number, public readonly responseBody?: string, retryAfter?: string | null) {
    super(message);
    this.name = 'BudgetSyncError';
    this.retryAfterMs = retryAfterMs(retryAfter);
  }
}

/**
 * An access-token session's credit balance cannot cover the call (HTTP 402
 * `insufficient_credits`). Access-token sessions pay from credits only and
 * never sign x402, so this is the end of the road for the call: top up the
 * agent's credits (or use a wallet session) and retry. `required` is the
 * gross price of the call and `balance` the current credit balance, in USDC,
 * when the server reported them.
 */
export class InsufficientCreditsError extends OneShotError {
  constructor(
    message: string,
    public readonly required?: number,
    public readonly balance?: number,
    public readonly shortfall?: number,
  ) {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * The agent's action policy held this call for a human decision. It was NOT
 * run or charged. Wait for `approvalId` (agent.approvals.waitFor) and, if it
 * is approved, repeat the same call with `{ approvalId }` — it then runs once.
 */
export class ApprovalRequiredError extends OneShotError {
  constructor(
    message: string,
    public readonly approvalId: string,
    public readonly approval?: Record<string, unknown>,
    public readonly rule?: string,
  ) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

/** The agent's action policy denies this call outright. It was not run or charged. */
export class ActionDeniedError extends OneShotError {
  constructor(message: string, public readonly rule?: string) {
    super(message);
    this.name = 'ActionDeniedError';
  }
}
