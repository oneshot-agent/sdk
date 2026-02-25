import type { WalletProvider, TypedDataDomain, TypedDataField } from '../wallet-provider';

/**
 * Wallet provider backed by Coinbase CDP Server Wallets v2.
 *
 * Signing happens in Coinbase's TEE — no private key ever leaves the server.
 * Requires env vars: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/eip-712-signing
 */
export class CdpWalletProvider implements WalletProvider {
  private readonly cdp: any; // CdpClient from @coinbase/cdp-sdk
  private readonly _address: string;

  private constructor(cdp: any, address: string) {
    this.cdp = cdp;
    this._address = address;
  }

  /**
   * Create a CDP wallet provider.
   * If address is provided, reuses an existing CDP account.
   * Otherwise creates a new one.
   */
  static async create(opts?: { address?: string }): Promise<CdpWalletProvider> {
    let CdpClient: any;
    try {
      const mod = await import('@coinbase/cdp-sdk');
      CdpClient = mod.CdpClient;
    } catch {
      throw new Error(
        'CDP wallet requires @coinbase/cdp-sdk. Install it: npm install @coinbase/cdp-sdk'
      );
    }

    const cdp = new CdpClient();
    const address = opts?.address ?? (await cdp.evm.createAccount()).address;
    return new CdpWalletProvider(cdp, address);
  }

  get address(): string {
    return this._address;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    // Build EIP712Domain type array from the domain fields that are present
    const eip712DomainFields: TypedDataField[] = [];
    if (domain.name !== undefined) eip712DomainFields.push({ name: 'name', type: 'string' });
    if (domain.version !== undefined) eip712DomainFields.push({ name: 'version', type: 'string' });
    if (domain.chainId !== undefined) eip712DomainFields.push({ name: 'chainId', type: 'uint256' });
    if (domain.verifyingContract !== undefined) eip712DomainFields.push({ name: 'verifyingContract', type: 'address' });

    const primaryType = Object.keys(types)[0];

    return this.cdp.evm.signTypedData({
      address: this._address,
      domain,
      types: {
        EIP712Domain: eip712DomainFields,
        ...types,
      },
      primaryType,
      message: value,
    });
  }
}
