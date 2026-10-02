/**
 * Approvals and action policies.
 *
 * An action policy decides which paid calls (email, SMS, voice, commerce) run,
 * are denied, or wait for a named human. A held call throws
 * `ApprovalRequiredError` carrying an `approvalId`; once the approver says yes,
 * repeat the same call with `{ approvalId }` and it runs once.
 *
 * @example
 * ```typescript
 * await agent.policy.set({
 *   approver: { email: 'ops@acme.com' },
 *   rules: [{ tool: 'commerce', when: { amount_over_usdc: 50 }, action: 'require_approval' }],
 * });
 * try {
 *   await agent.commerceBuy(order);
 * } catch (err) {
 *   if (!(err instanceof ApprovalRequiredError)) throw err;
 *   const decided = await agent.approvals.waitFor(err.approvalId);
 *   if (decided.status === 'approved') await agent.commerceBuy({ ...order, approvalId: err.approvalId });
 * }
 * ```
 */
import { OneShotError } from './errors';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'consumed';

export interface Approval {
  approval_id: string;
  source: 'policy' | 'api' | 'compute';
  tool: 'email' | 'sms' | 'voice' | 'commerce' | null;
  status: ApprovalStatus;
  action_summary: string;
  preview: Record<string, unknown> | null;
  policy_rule: string | null;
  /** Which approver was paged; the address is masked. */
  approver: { channel: 'email' | 'sms'; address: string };
  expires_at: string;
  /** After approval: the held call must be retried before this time. */
  use_by: string | null;
  decided_at: string | null;
  decided_via: 'link' | 'api' | 'timeout' | null;
  decision_note: string | null;
  /** Signed $0 receipt recording the decision. */
  decision_receipt_id: string | null;
  consumed_at: string | null;
  notified: boolean;
  notify_error: string | null;
  compute: { goal_id: string; task_id: string } | null;
  created_at: string;
}

export interface CreateApprovalOptions {
  /** What the human is deciding, in one line. */
  action_summary: string;
  /** Details shown to the approver (up to 4000 characters as JSON). */
  preview?: Record<string, unknown>;
  approver: { email?: string; phone?: string };
  /** Seconds until the request expires unanswered (= denied). Default 3600, max 7 days. */
  expires_in_seconds?: number;
}

export type PolicyTool = 'email' | 'sms' | 'voice' | 'commerce';

export interface ActionPolicyRule {
  id?: string;
  tool: PolicyTool | '*';
  when: {
    always?: true;
    amount_over_usdc?: number;
    recipients_over?: number;
    /** Email only. */
    recipient_domain_not_in?: string[];
    outside_hours?: { timezone: string; start: string; end: string; days?: number[] };
  };
  action: 'require_approval' | 'deny';
}

export interface ActionPolicy {
  enabled?: boolean;
  rules: ActionPolicyRule[];
  approver?: { email?: string | null; phone?: string | null };
  /** Seconds an approver has to decide a held call. Default 3600. */
  timeout_seconds?: number;
}

type Request = <T>(path: string, method: string, body?: unknown, scope?: 'read' | 'write') => Promise<T>;

/** Wait `ms`, rejecting at once if `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new OneShotError('Operation cancelled'));
    const onAbort = () => { clearTimeout(timer); reject(new OneShotError('Operation cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const TERMINAL: ApprovalStatus[] = ['approved', 'denied', 'expired', 'cancelled', 'consumed'];

export class Approvals {
  constructor(private readonly request: Request) {}

  /** Ask a named human to decide something. The agent reads the decision itself. */
  async create(options: CreateApprovalOptions): Promise<Approval> {
    return this.request<Approval>('/v1/approvals', 'POST', options, 'write');
  }

  async get(approvalId: string): Promise<Approval> {
    return this.request<Approval>(`/v1/approvals/${encodeURIComponent(approvalId)}`, 'GET');
  }

  async list(options: { status?: ApprovalStatus; limit?: number } = {}): Promise<Approval[]> {
    const qs = new URLSearchParams();
    if (options.status) qs.set('status', options.status);
    if (options.limit) qs.set('limit', String(options.limit));
    const q = qs.toString();
    const data = await this.request<{ approvals: Approval[] }>(`/v1/approvals${q ? `?${q}` : ''}`, 'GET');
    return data.approvals;
  }

  /** Withdraw a pending approval. */
  async cancel(approvalId: string): Promise<Approval> {
    return this.request<Approval>(`/v1/approvals/${encodeURIComponent(approvalId)}/cancel`, 'POST', {}, 'write');
  }

  /**
   * Poll until the approval is decided (or expires). Resolves with the final
   * approval; it never throws on a denial — check `status`.
   */
  async waitFor(approvalId: string, options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}): Promise<Approval> {
    const deadline = Date.now() + (options.timeoutMs ?? 24 * 3600 * 1000);
    const interval = Math.max(1000, options.intervalMs ?? 5000);
    const { signal } = options;
    for (;;) {
      if (signal?.aborted) throw new OneShotError('Operation cancelled');
      const approval = await this.get(approvalId);
      if (TERMINAL.includes(approval.status)) return approval;
      if (Date.now() + interval > deadline) return approval;
      await sleep(interval, signal);
    }
  }
}

export class ActionPolicies {
  constructor(private readonly request: Request) {}

  /** The current policy, or null when the agent has none. */
  async get(): Promise<ActionPolicy | null> {
    return this.request<ActionPolicy | null>('/v1/agents/me/action-policy', 'GET');
  }

  /** Replace the policy. Wallet sessions only. */
  async set(policy: ActionPolicy): Promise<ActionPolicy> {
    return this.request<ActionPolicy>('/v1/agents/me/action-policy', 'PUT', policy, 'write');
  }

  /** Remove the policy: every call runs as it did before. Wallet sessions only. */
  async delete(): Promise<void> {
    await this.request<null>('/v1/agents/me/action-policy', 'DELETE', undefined, 'write');
  }
}
