import { DatabaseSync } from "node:sqlite";

// Brazil has no daylight saving time since 2019, so months are a fixed UTC-3 offset.
const BRT = 3 * 3600_000;
export const monthOf = (t: number) => new Date(t - BRT).toISOString().slice(0, 7);
export const monthRange = (ym: string): [number, number] => {
  const [y, m] = ym.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1) + BRT, Date.UTC(y, m, 1) + BRT];
};

export function openDb(file: string, now = () => Date.now()) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (t INTEGER NOT NULL, kind TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_t ON events (t);
  `);
  const q = (sql: string) => db.prepare(sql);

  return {
    db,
    // Anonymous site counters (web validations). No IP or any identifier is stored.
    logEvent: (kind: "try_valid" | "try_invalid") => void q("INSERT INTO events (t, kind) VALUES (?, ?)").run(now(), kind),
    eventsIn(ym: string): Record<string, number> {
      const [a, b] = monthRange(ym);
      const rows = q("SELECT kind, count(*) AS n FROM events WHERE t >= ? AND t < ? GROUP BY kind").all(a, b);
      return Object.fromEntries(rows.map((r) => [r.kind as string, r.n as number]));
    },
  };
}
export type Db = ReturnType<typeof openDb>;
