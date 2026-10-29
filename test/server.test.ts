import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/server.ts";
import { openDb } from "../src/db.ts";
import { createLimiter } from "../src/auth.ts";

const valid = readFileSync(new URL("./fixtures/valid.xml", import.meta.url), "utf8");

// A client "acme" with one key "k1" is created directly in the database.
async function start(perMinute = 60, perMonth = 1000, file = join(mkdtempSync(join(tmpdir(), "nfp-")), "t.db")) {
  const store = openDb(file);
  let clientId = store.clients()[0]?.id;
  let key = "";
  if (!clientId) {
    clientId = store.addClient({ name: "acme", email: "", priceCents: 0, perMinute, perMonth, note: "" });
    key = store.newKey(clientId);
  }
  const server = makeServer(store);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (k?: string, body = valid) => fetch(`${base}/v1/validate`, { method: "POST", body, headers: k ? { authorization: `Bearer ${k}` } : {} });
  return { server, store, base, post, key, clientId, file };
}

test("rejects missing and wrong API keys, accepts a good one", async () => {
  const { server, post, key } = await start();
  assert.equal((await post()).status, 401);
  assert.equal((await post("nope")).status, 401);
  const ok = await post(key);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { valid: true, issues: [] });
  server.close();
});

test("x-api-key header works and /v1/usage counts billable calls", async () => {
  const { server, base, post, key } = await start();
  await post(key);
  await post(key, "<broken"); // rejected XMLs are free
  const res = await fetch(`${base}/v1/usage`, { headers: { "x-api-key": key } });
  assert.deepEqual(await res.json(), { client: "acme", used: 1, perMonth: 1000 });
  server.close();
});

test("429 with Retry-After once the per-minute limit is hit; the call is not billed", async () => {
  const { server, post, key, store, clientId } = await start(1);
  assert.equal((await post(key)).status, 200);
  const limited = await post(key);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM usage WHERE client_id = ?").get(clientId)!.n, 1);
  server.close();
});

test("monthly quota survives a restart because usage is in the database", async () => {
  const first = await start(60, 2);
  await first.post(first.key);
  await first.post(first.key);
  first.server.close();
  const second = await start(60, 2, first.file);
  const res = await second.post(first.key);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "quota_exceeded");
  second.server.close();
});

test("revoking a key or suspending the client blocks access immediately (403), no restart", async () => {
  const { server, post, key, store, clientId } = await start();
  assert.equal((await post(key)).status, 200);
  store.setKeyActive(store.keys(clientId)[0].id as number, false);
  const r = await post(key);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "access_revoked");
  store.setKeyActive(store.keys(clientId)[0].id as number, true);
  assert.equal((await post(key)).status, 200);
  store.setClientActive(clientId, false);
  assert.equal((await post(key)).status, 403);
  server.close();
});

test("only valid XMLs use the quota; rejected ones are free until the fair-use ceiling", async () => {
  const { server, post, key } = await start(60, 1);
  for (let i = 0; i < 5; i++) assert.equal((await (await post(key, "<broken")).json()).valid, false);
  assert.equal((await post(key)).status, 200); // the one included validation is still available
  assert.equal((await post(key)).status, 429); // now used up, even though the XML is fine
  server.close();
});

test("fair use: too many rejected calls are refused even with quota left", async () => {
  const { server, post, key } = await start(60, 1); // ceiling is 10 calls for a quota of 1
  for (let i = 0; i < 10; i++) await post(key, "<broken");
  const r = await post(key);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "fair_use_exceeded");
  server.close();
});

test("per-minute window resets with the clock", () => {
  let t = Date.UTC(2026, 9, 29, 12, 0, 10);
  const l = createLimiter(() => t);
  assert.equal(l.take("a", 1, 10, 0), undefined);
  assert.equal(l.take("a", 1, 10, 0)?.error, "rate_limited");
  t += 60_000;
  assert.equal(l.take("a", 1, 10, 0), undefined);
});
