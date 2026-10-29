import { monthOf, monthRange } from "./db.ts";

// shortcut: per-minute and anonymous counters live in memory (one process, cleared on restart, never evicted);
// client monthly usage comes from the database, so it is already shared and durable.
export function createLimiter(now = () => Date.now()) {
  const minute = new Map<string, { window: number; n: number }>();
  const anonMonth = new Map<string, number>();

  return {
    // `used` is the client's calls so far this month; omit it for anonymous ids, which are counted here.
    // Returns undefined when the call is allowed (and counts it), else the reason and seconds to wait.
    take(id: string, perMinute: number, perMonth: number, used?: number): { error: "rate_limited" | "quota_exceeded"; retryAfter: number } | undefined {
      const t = now();
      const w = Math.floor(t / 60_000);
      const m = minute.get(id);
      const n = m?.window === w ? m.n : 0;
      if (n >= perMinute) return { error: "rate_limited", retryAfter: Math.ceil(((w + 1) * 60_000 - t) / 1000) };
      const mk = `${id}:${monthOf(t)}`;
      const month = used ?? anonMonth.get(mk) ?? 0;
      if (month >= perMonth) {
        const [, next] = monthRange(monthOf(t));
        return { error: "quota_exceeded", retryAfter: Math.ceil((next - t) / 1000) };
      }
      minute.set(id, { window: w, n: n + 1 });
      if (used === undefined) anonMonth.set(mk, month + 1);
      return undefined;
    },
  };
}
