/**
 * Receipt canonicalization + offline verification.
 *
 * The api-service signs every terminal receipt with Ed25519
 * (`apps/api-service/src/services/receipt-signing.ts`) and publishes the
 * verification keys at `/.well-known/oneshot-receipts.json`. Anyone holding a
 * receipt from `GET /v1/analytics/receipts` (or the audit export) can verify
 * it offline with `verifyReceipt` below, or with the `oneshot-verify-receipt`
 * CLI.
 *
 * `canonicalizeReceipt` here is the ONE canonical implementation. The
 * api-service signer imports it from this file (see
 * `apps/api-service/src/services/receipt-signing.ts`) rather than keeping
 * its own copy, so signer and verifier can never drift apart — see
 * `tests/unit/receipt-verify.test.ts`'s "shared canonicalizer" guard.
 *
 * There is exactly ONE payload format, and it carries no version field. The
 * signing key is ours and every receipt is an attestation by us, so when the
 * payload has to change we change this function and re-sign every stored
 * receipt (`scripts/resign-receipts.ts`, bumping `revision`) instead of
 * forking a numbered format and carrying verification code for old ones.
 *
 * This lives in `libs/agent-sdk` (not `libs/shared-types`) because
 * `libs/agent-sdk` is the package that ships to npm as a standalone SDK
 * with no other workspace dependencies (see package.json — only `ethers`).
 * `libs/shared-types` is never published, so a published SDK cannot import
 * from it without breaking for every external consumer. api-service is not
 * published, so it can and does import straight from this file's source
 * (the same pattern `apps/api-service/src/mcp/agent.ts` already uses for
 * `OneShot` itself).
 */
import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto';

export const RECEIPT_SIGNATURE_ALG = 'Ed25519' as const;

/**
 * Fields covered by a receipt signature. Every one of them is public: the
 * canonical payload contains nothing the public receipt projection omits, so
 * whoever holds the receipt can recompute the exact signed bytes.
 */
export interface SignableReceipt {
  receiptId: string;
  agentId: string;
  soulAgentId?: string | null;
  jobId?: string | null;
  goalId?: string | null;
  category: string;
  subcategory: string;
  amountUsdc: string;
  serviceFee?: string | null;
  status: string;
  executionStatus: string;
  settlementTx?: string | null;
  createdAt: Date | string;
  settledAt?: Date | string | null;
  /**
   * Signing-time revision counter. Bound into the signed bytes, so two signed
   * copies of the same `receipt_id` order from the bytes alone — no database
   * lookup required. Defaults to 1; every re-sign persists one more.
   */
  revision?: number;
  /**
   * Free-form receipt metadata (`memo`, `decisionContext`, etc. — see
   * `apps/api-service/src/services/receipts.ts`'s `createReceipt`). The
   * metadata VALUE is never placed in the signed bytes — it is free-form and
   * unbounded — only its digest is (see `computeMetadataDigest`), so a memo
   * or decision-context edit invalidates the signature until the receipt is
   * re-signed. `null` and absent digest identically.
   */
  metadata?: unknown;
}

/**
 * Deterministic JSON serialization used ONLY to derive `metadata_digest` — it
 * is never itself part of the signed bytes. Object keys are sorted
 * recursively (arrays keep their order) so two semantically equal metadata
 * objects with differently-ordered keys hash identically, at any nesting
 * depth. `undefined` values inside objects are dropped (mirrors
 * `JSON.stringify`'s own behavior for object properties) so an
 * explicitly-`undefined` key and an absent key digest the same way.
 */
function canonicalizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMetadataValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // A plain `{}` accumulator is unsafe here: `Object.prototype` defines
    // `__proto__` as an ACCESSOR, so `sorted['__proto__'] = x` on an
    // ordinary object sets the object's prototype instead of creating an
    // own data property — and JSON.stringify only serializes own
    // properties, so the assigned value would silently vanish from the
    // digest input. `JSON.parse` itself creates a genuine own `__proto__`
    // property (via CreateDataProperty, not the setter), so a caller
    // sending `decisionContext: { "__proto__": {...} }` in a JSON request
    // body reaches this function with a real own key — a null-prototype
    // accumulator has no inherited `__proto__` accessor to intercept the
    // assignment, so it is preserved as an ordinary own property instead.
    const sorted: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      sorted[key] = canonicalizeMetadataValue(entry);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 hex digest of a receipt's `metadata`, key-order-independent.
 *
 * `metadata: null` (and `metadata: undefined`, treated identically —
 * `receipts.metadata` is a nullable jsonb column, and the two never carry
 * different meaning here) canonicalize to the literal 4-byte string `null`,
 * exactly like every other nested `null`/absent value, rather than a special
 * case — this is the stable, documented digest for a metadata-less receipt.
 */
export function computeMetadataDigest(metadata: unknown): string {
  const canonical = JSON.stringify(canonicalizeMetadataValue(metadata ?? null));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** The signature fields signReceipt() attaches to a SignableReceipt. */
export interface ReceiptSignatureFields {
  signature: string;
  digest: string;
  keyId: string;
  alg?: string;
}

function receiptTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Deterministic JSON payload signed for every terminal receipt. Object
 * insertion order is intentional and is part of the wire format. Amounts are
 * strings, timestamps are UTC ISO-8601, absent optionals are `null`.
 */
export function canonicalizeReceipt(receipt: SignableReceipt): string {
  return JSON.stringify({
    receipt_id: receipt.receiptId,
    agent_id: receipt.agentId,
    soul_agent_id: receipt.soulAgentId ?? null,
    job_id: receipt.jobId ?? null,
    goal_id: receipt.goalId ?? null,
    category: receipt.category,
    subcategory: receipt.subcategory,
    amount_usdc: String(receipt.amountUsdc),
    service_fee: String(receipt.serviceFee ?? '0'),
    status: receipt.status,
    execution_status: receipt.executionStatus,
    settlement_tx: receipt.settlementTx ?? null,
    created_at: receiptTimestamp(receipt.createdAt),
    settled_at: receiptTimestamp(receipt.settledAt),
    revision: receipt.revision === undefined ? 1 : receipt.revision,
    metadata_digest: computeMetadataDigest(receipt.metadata),
  });
}

/** One entry from the published JWKS (`/.well-known/oneshot-receipts.json`). */
export interface ReceiptJwk {
  kty: string;
  crv: string;
  x: string;
  kid: string;
  alg?: string;
  use?: string;
}

export interface ReceiptJwks {
  keys: ReceiptJwk[];
}

/** Reasons a receipt can fail verification — distinguishable, not a generic false. */
export type ReceiptVerificationFailureReason =
  | 'malformed_receipt'
  | 'key_not_found'
  | 'digest_mismatch'
  | 'signature_invalid';

export type ReceiptVerificationResult =
  | { valid: true; keyId: string }
  | { valid: false; reason: ReceiptVerificationFailureReason; keyId?: string; message: string };

/**
 * Verify a signed receipt offline against a JWKS.
 *
 * Recomputes the canonical payload via `canonicalizeReceipt` (including the
 * metadata digest, so the receipt's `metadata` must be the value that was
 * signed), matches the receipt's `keyId` against the JWKS `kid`s (so a
 * rotated-out key still verifies as long as the JWKS retains it), checks the
 * SHA-256 digest, and checks the Ed25519 signature. A `key_id` that matches
 * no key in the JWKS fails with `reason: 'key_not_found'` rather than a
 * generic false.
 */
export function verifyReceipt(
  receipt: SignableReceipt & Partial<ReceiptSignatureFields>,
  jwks: ReceiptJwks,
): ReceiptVerificationResult {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      !jwks || typeof jwks !== 'object' || !Array.isArray(jwks.keys) ||
      !jwks.keys.every(k => k && typeof k === 'object' && typeof k.kid === 'string')) {
    return { valid: false, reason: 'malformed_receipt', message: 'Expected a receipt object and a JWKS keys array' };
  }
  const { signature, digest, keyId } = receipt;
  if (typeof signature !== 'string' || !signature || typeof digest !== 'string' || !digest || typeof keyId !== 'string' || !keyId ||
      (receipt.alg !== undefined && receipt.alg !== RECEIPT_SIGNATURE_ALG)) {
    return {
      valid: false,
      reason: 'malformed_receipt',
      message: 'Receipt is missing signature, digest, or keyId',
    };
  }

  const key = jwks.keys.find((candidate) => candidate.kid === keyId);
  if (!key) {
    return {
      valid: false,
      reason: 'key_not_found',
      keyId,
      message: `No key with kid "${keyId}" was found in the supplied JWKS`,
    };
  }

  let payload: Buffer;
  try { payload = Buffer.from(canonicalizeReceipt(receipt), 'utf8'); }
  catch { return { valid: false, reason: 'malformed_receipt', keyId, message: 'Receipt contains invalid signed fields or timestamps' }; }

  const expectedDigest = createHash('sha256').update(payload).digest('hex');
  if (expectedDigest !== digest) {
    return {
      valid: false,
      reason: 'digest_mismatch',
      keyId,
      message: 'SHA-256 digest does not match the recomputed canonical payload',
    };
  }

  let publicKey;
  try {
    if (key.kty !== 'OKP' || key.crv !== 'Ed25519' || (key.use !== undefined && key.use !== 'sig') ||
        (key.alg !== undefined && !['Ed25519', 'EdDSA'].includes(key.alg))) throw new Error('Expected an Ed25519 signing key');
    publicKey = createPublicKey({ key: { kty: key.kty, crv: key.crv, x: key.x }, format: 'jwk' });
  } catch (err) {
    return {
      valid: false,
      reason: 'malformed_receipt',
      keyId,
      message: `Could not construct a public key from JWKS entry "${keyId}": ${(err as Error).message}`,
    };
  }

  let signatureValid = false;
  try {
    signatureValid = ed25519Verify(null, payload, publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return {
      valid: false,
      reason: 'signature_invalid',
      keyId,
      message: 'Ed25519 signature does not match the recomputed canonical payload',
    };
  }

  return { valid: true, keyId };
}

/**
 * Adapt the wire-format (snake_case) JSON a caller gets from the API — e.g.
 * `GET /v1/analytics/receipts` or a receipt JSON file — into the shape
 * `verifyReceipt` expects. The audit export (`GET /v1/audit/receipts`) names
 * the attestation fields `receipt_*` because its plain `signature` is the
 * on-chain settlement transaction; both shapes are accepted.
 */
export function receiptFromWire(input: object): SignableReceipt & Partial<ReceiptSignatureFields> {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Receipt must be a JSON object');
  const wire = { ...input } as Record<string, unknown>;
  const own = (key: string) => Object.prototype.hasOwnProperty.call(wire, key);
  const audit = own('receipt_signature');
  const algKey = audit ? 'receipt_alg' : 'alg';
  if (own(algKey) && wire[algKey] !== 'Ed25519') throw new Error('Unsupported receipt signature algorithm');
  const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
  const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
  return {
    receiptId: str(wire.receipt_id) ?? str(wire.receiptId) ?? '',
    agentId: str(wire.agent_id) ?? str(wire.agentId) ?? '',
    soulAgentId: str(wire.soul_agent_id) ?? str(wire.soulAgentId) ?? null,
    jobId: str(wire.job_id) ?? str(wire.jobId) ?? null,
    goalId: str(wire.goal_id) ?? str(wire.goalId) ?? null,
    category: str(wire.category) ?? '',
    subcategory: str(wire.subcategory) ?? '',
    amountUsdc: str(wire.amount_usdc) ?? str(wire.amountUsdc) ?? '0',
    serviceFee: str(wire.service_fee) ?? str(wire.serviceFee) ?? null,
    status: str(wire.status) ?? '',
    executionStatus: str(wire.execution_status) ?? str(wire.executionStatus) ?? '',
    settlementTx: str(wire.settlement_tx) ?? str(wire.settlementTx) ?? (audit ? str(wire.signature) : null) ?? null,
    createdAt: str(wire.created_at) ?? str(wire.createdAt) ?? new Date(0).toISOString(),
    settledAt: str(wire.settled_at) ?? str(wire.settledAt) ?? null,
    revision: audit ? num(wire.receipt_revision) : num(wire.revision),
    metadata: wire.metadata,
    signature: str(audit ? wire.receipt_signature : wire.signature),
    digest: str(audit ? wire.receipt_digest : wire.digest),
    keyId: audit ? str(wire.receipt_key_id) : str(wire.key_id) ?? str(wire.keyId),
    alg: str(audit ? wire.receipt_alg : wire.alg),
  };
}
