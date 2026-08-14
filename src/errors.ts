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
