/**
 * Verify a signed OneShot receipt from the command line (issue #745).
 *
 * Usage:
 *   oneshot-verify-receipt <receipt.json> [jwksUrlOrPath]
 *
 * `receipt.json` is a receipt object as returned by the API (e.g. one entry
 * from `GET /v1/analytics/receipts`, or the `.well-known` JWKS-adjacent
 * export). `jwksUrlOrPath` may be an http(s) URL (fetched) or a local file
 * path (read from disk) — it defaults to the production well-known path,
 * `https://win.oneshotagent.com/.well-known/oneshot-receipts.json`.
 *
 * Kept as a pure, importable function (`verifyReceiptCli`) so it can be
 * exercised directly in the test suite instead of only by hand — see
 * `tests/unit/receipt-verify.test.ts`.
 */
import { readFileSync } from 'node:fs';
import {
  receiptFromWire,
  verifyReceipt,
  type ReceiptJwks,
} from './receipt';

export const PRODUCTION_JWKS_URL = 'https://win.oneshotagent.com/.well-known/oneshot-receipts.json';

export interface VerifyReceiptCliResult {
  /** 0 = verified, 1 = verification failed, 2 = usage/IO error. */
  exitCode: 0 | 1 | 2;
  output: string;
}

async function loadJwks(jwksArg: string, fetchImpl: typeof fetch): Promise<ReceiptJwks> {
  if (/^https?:\/\//i.test(jwksArg)) {
    const response = await fetchImpl(jwksArg);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS from ${jwksArg}: HTTP ${response.status}`);
    }
    return await response.json() as ReceiptJwks;
  }
  return JSON.parse(readFileSync(jwksArg, 'utf8')) as ReceiptJwks;
}

/**
 * Run the CLI logic against explicit argv (excluding the node/script argv0/1
 * entries — pass e.g. `process.argv.slice(2)`). Never calls `process.exit`
 * itself so it stays testable; the bin entrypoint does that.
 */
export async function verifyReceiptCli(
  argv: string[],
  opts: { fetch?: typeof fetch } = {},
): Promise<VerifyReceiptCliResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const [receiptPath, jwksArg = PRODUCTION_JWKS_URL] = argv;

  if (!receiptPath) {
    return {
      exitCode: 2,
      output: 'Usage: oneshot-verify-receipt <receipt.json> [jwksUrlOrPath]',
    };
  }

  let receiptWire: Record<string, unknown>;
  try {
    receiptWire = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (!receiptWire || typeof receiptWire !== 'object' || Array.isArray(receiptWire)) throw new Error('Receipt must be a JSON object');
  } catch (err) {
    return { exitCode: 2, output: `Could not read/parse receipt file "${receiptPath}": ${(err as Error).message}` };
  }

  let jwks: ReceiptJwks;
  try {
    jwks = await loadJwks(jwksArg, fetchImpl);
    if (!jwks || typeof jwks !== 'object' || !Array.isArray(jwks.keys)) throw new Error('JWKS must contain a keys array');
  } catch (err) {
    return { exitCode: 2, output: `Could not load JWKS from "${jwksArg}": ${(err as Error).message}` };
  }

  let receipt: ReturnType<typeof receiptFromWire>;
  try { receipt = receiptFromWire(receiptWire); }
  catch (err) { return { exitCode: 2, output: `Invalid receipt: ${(err as Error).message}` }; }
  const result = verifyReceipt(receipt, jwks);

  if (result.valid) {
    return {
      exitCode: 0,
      output: `PASS — receipt ${receipt.receiptId || '(no receipt_id)'} verified against key "${result.keyId}"`,
    };
  }

  return {
    exitCode: 1,
    output: `FAIL (${result.reason})${result.keyId ? ` [key: ${result.keyId}]` : ''} — ${result.message}`,
  };
}
