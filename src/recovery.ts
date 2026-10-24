export type DurableRecoveryEndpoint =
  | 'lookup/person-profile' | 'lookup/person-email' | 'lookup/person-email-status'
  | 'lookup/place-permits' | 'physical-mail/send' | 'solve' | 'predict';

/** Endpoint names accepted by GET /v1/submissions/recover. */
export type RecoveryEndpoint = DurableRecoveryEndpoint
  | 'sms' | 'sms/send' | 'voice' | 'voice/call' | 'email' | 'email/send'
  | 'linkedin' | 'linkedin/reply' | 'linkedin/message' | 'linkedin/profile-view'
  | 'linkedin/react' | 'linkedin/invite' | 'linkedin/invite/withdraw'
  | 'crm/notes' | 'commerce/buy' | 'browser';

/** Generic tools retain their original envelope; inline tools need not have job handles. */
export interface RecoveryResponse {
  request_id?: string;
  receipt_id?: string;
  status?: string;
  settlement_status?: string;
  idempotency_key?: string;
  [key: string]: unknown;
}
