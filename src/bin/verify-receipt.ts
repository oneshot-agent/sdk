#!/usr/bin/env node
/**
 * Runnable entrypoint for `verifyReceiptCli` (issue #745). Kept separate from
 * `receipt-verify-cli.ts` so that file stays a pure, testable function with
 * no top-level side effects — this file is the only place that touches
 * `process.argv` / `process.exit` / stdio directly.
 */
import { verifyReceiptCli } from '../receipt-verify-cli';

async function run(): Promise<void> {
  const { exitCode, output } = await verifyReceiptCli(process.argv.slice(2));
  if (exitCode === 0) console.log(output);
  else console.error(output);
  process.exit(exitCode);
}

run();
