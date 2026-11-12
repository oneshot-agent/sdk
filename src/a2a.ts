import { OneShotError, ToolError } from './errors';

export type A2ATaskEvent = {
  status: { state: string; [key: string]: unknown };
  contextId: string;
  metadata?: Record<string, unknown>;
} & (
  | { kind: 'task'; id: string; history?: unknown[] }
  | { kind: 'status-update'; taskId: string; final: boolean }
);

export class A2AError extends OneShotError {
  constructor(message: string, public readonly code: number, public readonly data?: unknown) {
    super(message);
    this.name = 'A2AError';
  }
}

/** The server closes a subscription at five minutes; this ends one that outlives it (the Python SDK's read timeout). */
export const SUBSCRIPTION_DEADLINE_MS = 330_000;

/** Decode SSE lines incrementally, including split UTF-8 and CRLF sequences. */
async function* sseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal, deadlineMs = SUBSCRIPTION_DEADLINE_MS): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let line = '';
  let data: string[] = [];
  let skipLF = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  // Cancelling resolves the pending read as done, so the deadline ends the subscription the way EOF does.
  const deadline = setTimeout(cancel, deadlineMs);
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) return; // An unterminated event is not dispatched by SSE.
      for (const char of decoder.decode(value, { stream: true })) {
        if (skipLF && char === '\n') { skipLF = false; continue; }
        skipLF = char === '\r';
        if (char !== '\n' && char !== '\r') { line += char; continue; }
        if (line === '') {
          if (data.length) { const event = data.join('\n'); data = []; yield event; }
        } else if (line === 'data' || line.startsWith('data:')) {
          data.push(line === 'data' ? '' : line.slice(5).replace(/^ /, ''));
        }
        line = '';
      }
    }
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export const isEventStream = (response: Response) =>
  response.ok && response.headers.get('content-type')?.split(';')[0].trim() === 'text/event-stream';

/** Settle with the signal's reason as soon as it aborts; the promise itself is left to finish unobserved. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** One bounded platform connection; never retries or reconnects. */
export async function* taskEvents(response: Response, signal?: AbortSignal, deadlineMs = SUBSCRIPTION_DEADLINE_MS): AsyncGenerator<A2ATaskEvent> {
  try {
    if (!isEventStream(response)) {
      const text = await response.text();
      let body: { error?: { message: string; code: number; data?: unknown } } | null = null;
      try { body = JSON.parse(text); } catch (error) { if (response.ok) throw error; }
      if (typeof body?.error?.message === 'string' && typeof body.error.code === 'number') {
        throw new A2AError(body.error.message, body.error.code, body.error.data);
      }
      if (!response.ok) {
        throw new ToolError('Task subscription failed', response.status, text, response.headers.get('retry-after'));
      }
      throw new OneShotError('Expected a task subscription SSE response');
    }
    if (!response.body) throw new OneShotError('Missing task subscription body');
    for await (const data of sseData(response.body, signal, deadlineMs)) {
      signal?.throwIfAborted();
      const envelope = JSON.parse(data);
      if (envelope.error) throw new A2AError(envelope.error.message, envelope.error.code, envelope.error.data);
      const event = envelope.result as A2ATaskEvent;
      if (!event || !['task', 'status-update'].includes(event.kind) || typeof event.status?.state !== 'string') {
        throw new OneShotError('Invalid task subscription event');
      }
      yield event;
      if ((event.kind === 'status-update' && event.final) || ['completed', 'failed', 'canceled'].includes(event.status.state)) return;
    }
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
