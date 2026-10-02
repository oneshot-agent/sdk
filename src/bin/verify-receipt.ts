#!/usr/bin/env node
import { verifyReceiptCli } from '../receipt-verify-cli';

async function run(): Promise<void> {
  const { exitCode, output } = await verifyReceiptCli(process.argv.slice(2));
  if (exitCode === 0) console.log(output);
  else console.error(output);
  process.exit(exitCode);
}

run();
