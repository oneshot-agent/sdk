import { UNTRUSTED_ROUTES, UNTRUSTED_TOOLS } from './untrusted-tools.generated';

/** Tool data remains untrusted even after hidden-content filtering. */
export interface UntrustedContent { untrusted_content: true }

export function toolHasUntrustedContent(tool: string, method = 'POST'): boolean {
  if (!tool.startsWith('/')) return UNTRUSTED_TOOLS.has(tool.replace(/^oneshot_/, ''));
  const path = tool.split('?')[0].split('/');
  return UNTRUSTED_ROUTES.some(([verb, template]) => verb === method &&
    template.split('/').length === path.length && template.split('/').every((part, i) => part.startsWith(':') || part === path[i]));
}

/** Preserve computed results and job acknowledgements; mark only declared third-party data. */
export function markUntrusted<T>(value: T, tool: string, method = 'POST'): T {
  if (!toolHasUntrustedContent(tool, method)) return value;
  if (value && typeof value === 'object' && 'request_id' in value && 'status' in value &&
      ['pending', 'processing', 'queued'].includes(String(value.status))) return value;
  if (Array.isArray(value)) return value.map(item => markUntrusted(item, tool, method)) as T;
  if (value && typeof value === 'object') return { ...value, untrusted_content: true };
  return value;
}
