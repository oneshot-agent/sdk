/**
 * Wallet Provider abstraction for x402 payment signing.
 *
 * Implementations:
 *   - EthersWalletProvider: Raw private key via ethers.js (default)
 *   - CdpWalletProvider:    Coinbase CDP Server Wallet (no private key exposure)
 */

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: string;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export interface WalletProvider {
  /** The wallet's public address (checksummed) */
  readonly address: string;

  /**
   * Sign EIP-712 typed data.
   * Used by x402 for EIP-3009 TransferWithAuthorization.
   *
   * @returns The signature as a hex string
   */
  signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string>;
}
