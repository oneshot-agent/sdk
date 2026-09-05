// Custom error hierarchy. Every SDK-thrown error is a subclass of OneShotError
// so consumers can `catch (err instanceof OneShotError)` once and inspect
// `err.name` for the specific type. Each subclass carries the structured fields
// that drove the throw (statusCode/responseBody, jobId, field, categories, …)
// so error handlers don't need to re-parse strings.

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
export class PaymentError extends OneShotError {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly expected?: { amount?: string; asset?: string; network?: string; payTo?: string },
    public readonly received?: { amount?: string },
    public readonly quoteId?: string
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
    // invalid_input, content_blocked, rate_limited, provider_unavailable,
    // provider_auth, enrichment_exhausted, checkout_failed, internal_error.
    // Branch on this to decide whether to fund/fix vs. blind-retry.
    public readonly code?: string
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
  constructor(message: string, public readonly status?: number, public readonly responseBody?: string) {
    super(message);
    this.name = 'BudgetSyncError';
  }
}
