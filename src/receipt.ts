/**
 * The signer shares this canonicalizer so signed bytes cannot drift from offline verification.
 * Format changes require re-signing stored receipts with a higher revision; there is no format version.
 * Keep this in the published SDK: external consumers cannot import the unpublished shared-types package.
 */
import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto';

export const RECEIPT_SIGNATURE_ALG = 'Ed25519' as const;

/** Signed fields must be public so receipt holders can recompute the exact signed bytes. */
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
  /** Signing the revision lets receipt holders order re-signed copies without a database lookup. */
  revision?: number;
  /** Digest unbounded metadata so edits invalidate the signature without expanding the signed payload. */
  metadata?: unknown;
}

function canonicalizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMetadataValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // A null prototype keeps __proto__ as an own property so it cannot vanish from the digest.
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

export function computeMetadataDigest(metadata: unknown): string {
  const canonical = JSON.stringify(canonicalizeMetadataValue(metadata ?? null));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

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

/** Object insertion order is part of the signed wire format. */
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

export type ReceiptVerificationFailureReason =
  | 'malformed_receipt'
  | 'key_not_found'
  | 'digest_mismatch'
  | 'signature_invalid';

export type ReceiptVerificationResult =
  | { valid: true; keyId: string }
  | { valid: false; reason: ReceiptVerificationFailureReason; keyId?: string; message: string };

/** Verification needs the original metadata and the signing key retained in the JWKS after rotation. */
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

// Audit exports use receipt_* for attestations because signature holds the settlement transaction.
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
