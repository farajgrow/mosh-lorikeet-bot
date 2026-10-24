/**
 * Best-effort per-IP rate limit for the public demo (in memory, per server instance).
 * The real budget guard is a monthly spend limit set in the Anthropic console.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 40;
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_MESSAGES;
}
