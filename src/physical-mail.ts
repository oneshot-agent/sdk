/** Delivery is a postal observation; it is never evidence of readership. */
export interface PostalAddress {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: "US";
}
export type MailArtwork =
  | { kind: "letter"; file: string; color?: boolean; double_sided?: boolean }
  | { kind: "postcard"; front: string; back: string };
export interface MailPreviewInput {
  to: PostalAddress;
  from: PostalAddress;
  artwork: MailArtwork;
}
export interface MailQuote {
  quote_id: string;
  input: MailPreviewInput;
  input_hash: string;
  status: "rendering" | "ready";
  preview: { url: string | null; thumbnails: unknown[] };
  total_usdc: string | null;
  service_fee_usdc: string | null;
  expires_at: string;
  approval_id: string | null;
  delivery_proves_readership: false;
}
export interface MailApproval {
  quote_id: string;
  approval_id: string;
}
export interface MailOrder {
  order_id: string;
  quote_id: string;
  order_status:
    | "pending"
    | "submitting"
    | "accepted"
    | "canceled"
    | "failed"
    | "needs_reconciliation";
  payment_status: string;
  fulfillment_status: string;
  receipt_id: string;
  signed_receipt: unknown;
  total_usdc: string;
  idempotency_key: string;
  events: { event_id: string; event_type: string; occurred_at: string }[];
  cancellation_requested: boolean;
  cancellation_error: string | null;
  cancel_before: string | null;
  refunded_at: string | null;
  delivery_proves_readership: false;
}
export interface MailSendInput extends MailApproval {
  idempotencyKey: string;
  maxCost?: number;
  memo?: string;
  decisionContext?: Record<string, unknown>;
}
export type MailRequest = <T>(
  path: string,
  method: string,
  body?: unknown,
  mime?: string,
) => Promise<T>;
export class PhysicalMail {
  constructor(
    private request: MailRequest,
    private submit: (input: MailSendInput) => Promise<MailOrder>,
  ) {}
  uploadArtwork(data: Uint8Array, mime: "application/pdf" | "image/png" | "image/jpeg") {
    return this.request<{ asset_id: string; content_hash: string; mime_type: string }>(
      "/assets",
      "POST",
      data,
      mime,
    );
  }
  validateAddress(address: PostalAddress) {
    return this.request<{ deliverable: boolean; deliverability: string; address: PostalAddress }>(
      "/validate-address",
      "POST",
      address,
    );
  }
  preview(input: MailPreviewInput) {
    return this.request<MailQuote>("/preview", "POST", input);
  }
  getQuote(id: string) {
    return this.request<MailQuote>(`/quotes/${encodeURIComponent(id)}`, "GET");
  }
  approve(input: { quote_id: string; input_hash: string; total_usdc: string; approved: true }) {
    if (input.approved !== true) throw new Error("Explicit mailpiece approval required");
    return this.request<MailApproval>("/approve", "POST", input);
  }
  send(input: MailSendInput) {
    if (input.maxCost !== undefined && (!Number.isFinite(input.maxCost) || input.maxCost <= 0))
      throw new Error("Physical mail maxCost must be finite and positive");
    if (!input.idempotencyKey || !input.approval_id)
      throw new Error("Persist an idempotency key and explicitly approve the quote before sending");
    return this.submit(input);
  }
  getOrder(id: string) {
    return this.request<MailOrder>(`/orders/${encodeURIComponent(id)}`, "GET");
  }
  recover(key: string) {
    return this.request<MailOrder>(`/orders/recover?key=${encodeURIComponent(key)}`, "GET");
  }
  cancel(id: string) {
    return this.request<MailOrder>(`/orders/${encodeURIComponent(id)}/cancel`, "POST", {});
  }
}
