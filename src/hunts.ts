export interface HuntQuote {
  predictionId: string;
  roundTarget: number;
  stake: number;
}

/** Per-request ceiling so a stalled Soul Hunt call can't hang the caller. */
const HUNT_REQUEST_TIMEOUT_MS = 30_000;

/** The only SDK headers forwarded to the Soul Hunt origin. */
const HUNT_FORWARDED_HEADERS = ['X-Agent-ID', 'X-OneShot-SDK-Version', 'x-agent-proof'] as const;

interface HuntApiEnvelope<T> {
  data: T;
}

export class Hunts {
  private readonly client: any;

  constructor(client: any) {
    this.client = client;
  }

  private getBaseUrl(): string {
    return this.client.huntUrl || 'https://api.soulhunt.ai';
  }

  /**
   * Headers for a Soul Hunt API call. Soul Hunt is a separate service
   * (api.soulhunt.ai) from the OneShot API this SDK otherwise talks to, so
   * the OneShot agent access token (meant only for win.oneshotagent.com)
   * must never be forwarded there — an access-token/OAuth session would
   * otherwise leak its credit-billing bearer credential to a different
   * origin on every hunt call. `X-Agent-ID` (the public wallet address) is
   * harmless to send; the signed `x-agent-proof`, when present, is what
   * Soul Hunt actually authenticates with.
   */
  private async huntHeaders(scope: 'read' | 'write'): Promise<Record<string, string>> {
    // Soul Hunt domain name MUST match apps/soul-hunt-api/src/services/
    // wallet-proof.ts's AGENT_AUTH_DOMAIN exactly — EIP-712 signatures are
    // bound to the domain, so a mismatch here would make every signed proof
    // this client sends to Soul Hunt fail verification. Using a domain name
    // distinct from api-service's own ('OneShot Agent Auth') is what stops a
    // proof signed for one service's nonce store from verifying against the
    // other's (security finding F-t_d4805d6f-3, round 2).
    const signed: Record<string, string> = await this.client.signedReadHeaders(scope, 'OneShot Agent Auth (Soul Hunt)');
    // Allowlist: only identity + proof headers cross to Soul Hunt. The bearer
    // token, X-Staging-Key and any caller-configured default headers are
    // OneShot-API credentials and must not reach a different origin.
    const headers: Record<string, string> = {};
    for (const name of HUNT_FORWARDED_HEADERS) {
      if (signed[name] !== undefined) headers[name] = signed[name];
    }
    return headers;
  }

  /**
   * Soul Hunt predictions and captures debit a stake and require a fresh,
   * caller-signed write proof (soul-hunt-api's `requireAgentWriteProof`).
   * An access-token (hosted/OAuth) session never holds the wallet key and
   * cannot produce that proof, so the request would otherwise reach the
   * network only to be rejected with a 401. Fail closed, locally, with an
   * actionable message — the same guard the rest of the SDK uses for
   * other wallet-only operations (createAccessToken, budgets, staging).
   */
  private assertWalletSession(action: string): void {
    this.client.assertWalletSession(action);
  }

  async list(status: string = 'active', limit: number = 20, offset: number = 0): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: await this.huntHeaders('read'),
    });
    if (!response.ok) await this.client.failFromResponse('Failed to list hunts', response);
    return (await response.json() as HuntApiEnvelope<any>).data;
  }

  async status(huntId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts/${encodeURIComponent(huntId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: await this.huntHeaders('read'),
    });
    if (!response.ok) await this.client.failFromResponse('Failed to get hunt status', response);
    return (await response.json() as HuntApiEnvelope<any>).data;
  }

  async predict(huntId: string, predictedTool: string, predictedAction: string, predictedMotivation: string): Promise<HuntQuote> {
    this.assertWalletSession('submit Soul Hunt predictions');
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts/${encodeURIComponent(huntId)}/predict`, {
      method: 'POST',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: { ...(await this.huntHeaders('write')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictedTool, predictedAction, predictedMotivation }),
    });
    if (!response.ok) await this.client.failFromResponse('Failed to submit prediction', response);
    return (await response.json() as HuntApiEnvelope<HuntQuote>).data;
  }


  async capture(huntId: string): Promise<any> {
    this.assertWalletSession('capture souls');
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts/${encodeURIComponent(huntId)}/capture`, {
      method: 'POST',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: { ...(await this.huntHeaders('write')), 'Content-Type': 'application/json' },
    });
    if (!response.ok) await this.client.failFromResponse('Failed to capture soul', response);
    return (await response.json() as HuntApiEnvelope<any>).data;
  }

  async collection(): Promise<any[]> {
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts/me/collection`, {
      method: 'GET',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: await this.huntHeaders('read'),
    });
    if (!response.ok) await this.client.failFromResponse('Failed to get collection', response);
    return (await response.json() as HuntApiEnvelope<any[]>).data;
  }

  async leaderboard(period: string = 'all', sort: string = 'captures', limit: number = 25, offset: number = 0): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v1/hunts/leaderboard?period=${encodeURIComponent(period)}&sort=${encodeURIComponent(sort)}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      signal: AbortSignal.timeout(HUNT_REQUEST_TIMEOUT_MS),
      headers: await this.huntHeaders('read'),
    });
    if (!response.ok) await this.client.failFromResponse('Failed to get leaderboard', response);
    return (await response.json() as HuntApiEnvelope<any>).data;
  }
}
