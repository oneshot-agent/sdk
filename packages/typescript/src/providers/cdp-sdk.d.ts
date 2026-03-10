declare module '@coinbase/cdp-sdk' {
  export class CdpClient {
    evm: {
      createAccount(): Promise<{ address: string }>;
      signTypedData(params: {
        address: string;
        domain: Record<string, unknown>;
        types: Record<string, Array<{ name: string; type: string }>>;
        primaryType: string;
        message: Record<string, unknown>;
      }): Promise<string>;
    };
  }
}
