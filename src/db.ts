import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";

export interface Client {
  id: number;
  name: string;
  email: string;
  priceCents: number; // monthly fee, set by hand: there is no payment integration yet
  perMinute: number;
  perMonth: number;
  active: boolean;
  note: string;
  createdAt: number;
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// Brazil has no daylight saving time since 2019, so billing months are a fixed UTC-3 offset.
const BRT = 3 * 3600_000;
export const monthOf = (t: number) => new Date(t - BRT).toISOString().slice(0, 7);
export const monthRange = (ym: string): [number, number] => {
  const [y, m] = ym.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1) + BRT, Date.UTC(y, m, 1) + BRT];
};

type Row = Record<string, any>;
const toClient = (r: Row): Client => ({
  id: r.id, name: r.name, email: r.email, priceCents: r.price_cents, perMinute: r.per_minute, perMonth: r.per_month,
  active: !!r.active, note: r.note, createdAt: r.created_at,
});

export function openDb(file: string, now = () => Date.now()) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL DEFAULT 0,
      per_minute INTEGER NOT NULL DEFAULT 60, per_month INTEGER NOT NULL DEFAULT 1000, active INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_used INTEGER);
    CREATE TABLE IF NOT EXISTS usage (t INTEGER NOT NULL, client_id INTEGER NOT NULL, valid INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_client_t ON usage (client_id, t);
    CREATE TABLE IF NOT EXISTS events (t INTEGER NOT NULL, kind TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_t ON events (t);
  `);
  const q = (sql: string) => db.prepare(sql);

  return {
    db,
    // Looks a key up. `revoked` means it exists but the key or its client was switched off.
    findKey(key: string | undefined): { client: Client; keyId: number; revoked: boolean } | undefined {
      if (!key) return undefined;
      const r = q("SELECT c.*, k.id AS key_id, k.active AS key_active FROM keys k JOIN clients c ON c.id = k.client_id WHERE k.hash = ?").get(hashKey(key));
      return r && { client: toClient(r), keyId: r.key_id, revoked: !r.key_active || !r.active };
    },
    touchKey: (keyId: number) => void q("UPDATE keys SET last_used = ? WHERE id = ?").run(now(), keyId),
    logUsage: (clientId: number, valid: boolean) => void q("INSERT INTO usage (t, client_id, valid) VALUES (?, ?, ?)").run(now(), clientId, valid ? 1 : 0),

    // Billable use = calls whose XML came back valid. Rejected XMLs are free (they are logged to measure fair use).
    usedIn(clientId: number, ym: string, all = false): number {
      const [a, b] = monthRange(ym);
      return q(`SELECT count(*) AS n FROM usage WHERE client_id = ? AND t >= ? AND t < ?${all ? "" : " AND valid = 1"}`).get(clientId, a, b)!.n as number;
    },
    // Per client for one month: total and valid calls.
    usageByClient(ym: string): Map<number, { total: number; valid: number }> {
      const [a, b] = monthRange(ym);
      const rows = q("SELECT client_id, count(*) AS total, sum(valid) AS valid FROM usage WHERE t >= ? AND t < ? GROUP BY client_id").all(a, b);
      return new Map(rows.map((r) => [r.client_id as number, { total: r.total as number, valid: r.valid as number }]));
    },

    // Anonymous site counters (web validations). No IP or any identifier is stored.
    logEvent: (kind: "try_valid" | "try_invalid") => void q("INSERT INTO events (t, kind) VALUES (?, ?)").run(now(), kind),
    eventsIn(ym: string): Record<string, number> {
      const [a, b] = monthRange(ym);
      const rows = q("SELECT kind, count(*) AS n FROM events WHERE t >= ? AND t < ? GROUP BY kind").all(a, b);
      return Object.fromEntries(rows.map((r) => [r.kind as string, r.n as number]));
    },

    clients: () => q("SELECT * FROM clients ORDER BY active DESC, name COLLATE NOCASE").all().map(toClient),
    client: (id: number) => { const r = q("SELECT * FROM clients WHERE id = ?").get(id); return r && toClient(r); },
    addClient(c: Pick<Client, "name" | "email" | "priceCents" | "perMinute" | "perMonth" | "note">): number {
      const r = q("INSERT INTO clients (name, email, price_cents, per_minute, per_month, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(c.name, c.email, c.priceCents, c.perMinute, c.perMonth, c.note, now());
      return Number(r.lastInsertRowid);
    },
    updateClient: (id: number, c: Pick<Client, "name" | "email" | "priceCents" | "perMinute" | "perMonth" | "note">) =>
      void q("UPDATE clients SET name = ?, email = ?, price_cents = ?, per_minute = ?, per_month = ?, note = ? WHERE id = ?")
        .run(c.name, c.email, c.priceCents, c.perMinute, c.perMonth, c.note, id),
    setClientActive: (id: number, active: boolean) => void q("UPDATE clients SET active = ? WHERE id = ?").run(active ? 1 : 0, id),

    keys: (clientId: number) => q("SELECT * FROM keys WHERE client_id = ? ORDER BY id DESC").all(clientId),
    // The plain key is returned once and never stored; only its hash is.
    newKey(clientId: number): string {
      const key = `nfp_${randomBytes(24).toString("base64url")}`;
      q("INSERT INTO keys (client_id, hash, prefix, created_at) VALUES (?, ?, ?, ?)").run(clientId, hashKey(key), key.slice(0, 8), now());
      return key;
    },
    setKeyActive: (keyId: number, active: boolean) => void q("UPDATE keys SET active = ? WHERE id = ?").run(active ? 1 : 0, keyId),
  };
}
export type Db = ReturnType<typeof openDb>;
