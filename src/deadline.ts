/** A deadline covers response bodies and non-fetch promises as well as HTTP headers. */
export interface DeadlineScope { signal: AbortSignal; timedOut: () => boolean; close: () => void; }
export function deadlineScope(outer?: AbortSignal, timeoutMs?: number): DeadlineScope {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(outer?.reason);
  if (outer?.aborted) cancel();
  else outer?.addEventListener('abort', cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Native timers overflow above ~24.8 days. Infinity means no deadline;
  // finite deadlines use bounded chunks without shortening the caller's wait.
  if (timeoutMs !== undefined && timeoutMs !== Infinity) {
    const deadline = Date.now() + (Number.isNaN(timeoutMs) ? 0 : Math.max(0, timeoutMs));
    const schedule = () => {
      timer = setTimeout(() => {
        if (Date.now() < deadline) { schedule(); return; }
        timedOut = true;
        controller.abort(new Error('Deadline exceeded'));
      }, Math.min(2_147_483_647, Math.max(0, deadline - Date.now())));
    };
    schedule();
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    close() { clearTimeout(timer); outer?.removeEventListener('abort', cancel); controller.abort(); },
  };
}

export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let listener: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    listener = () => reject(signal.reason ?? new Error('Operation cancelled'));
    if (signal.aborted) listener();
    else signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener('abort', listener); }
}
