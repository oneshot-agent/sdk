import type { WalletProvider } from '../wallet-provider';
import { InsufficientCreditsError } from '../errors';

/**
 * Wallet provider for access-token sessions: knows the agent's address (the
 * API still keys job status and the WebSocket on X-Agent-ID) but holds no key.
 * Any attempt to sign is a programming error the SDK guards against earlier —
 * an access-token session pays from credits and never signs x402 — so this
 * throws the same typed error the caller would see for a credit shortfall.
 */
export class ReadOnlyWalletProvider implements WalletProvider {
  constructor(public readonly address: string) {}

  async signTypedData(): Promise<string> {
    throw new InsufficientCreditsError(
      'Access-token sessions cannot sign payments; add credits or use a wallet session',
    );
  }
}
