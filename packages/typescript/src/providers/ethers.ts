import { ethers } from 'ethers';
import type { WalletProvider, TypedDataDomain, TypedDataField, TransactionRequest, TransactionResponse } from '../wallet-provider';

/**
 * Wallet provider backed by a raw private key via ethers.js.
 * This is the default provider — zero behavior change from pre-abstraction SDK.
 */
export class EthersWalletProvider implements WalletProvider {
  private readonly wallet: ethers.Wallet;

  constructor(privateKey: string, provider: ethers.Provider) {
    this.wallet = new ethers.Wallet(privateKey, provider);
  }

  get address(): string {
    return this.wallet.address;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const resp = await this.wallet.sendTransaction({
      to: tx.to,
      value: tx.value,
      data: tx.data,
      gasLimit: tx.gasLimit,
    });
    return {
      hash: resp.hash,
      wait: async () => {
        const receipt = await resp.wait();
        return { status: receipt?.status ?? 0 };
      },
    };
  }

  async getBalance(): Promise<bigint> {
    const provider = this.wallet.provider;
    if (!provider) throw new Error('No provider connected');
    return provider.getBalance(this.wallet.address);
  }
}
