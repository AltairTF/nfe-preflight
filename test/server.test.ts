import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/server.ts";
import { openDb } from "../src/db.ts";
import { createLimiter } from "../src/auth.ts";

const valid = readFileSync(new URL("./fixtures/valid.xml", import.meta.url), "utf8");

async function start() {
  const store = openDb(":memory:");
  const server = makeServer(store);
  await new Promise<void>((r) => server.listen(0, r));
  return { server, store, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("/v1/try reports issues for a broken XML and counts both outcomes", async () => {
  const { server, store, base } = await start();
  const post = (body: string) => fetch(`${base}/v1/try`, { method: "POST", body });
  assert.deepEqual(await (await post(valid)).json(), { valid: true, issues: [] });
  assert.equal((await (await post("<broken")).json()).valid, false);
  const month = Object.values(store.eventsIn(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)));
  assert.deepEqual(month, [1, 1]);
  server.close();
});

test("payloads above 2 MB are refused", async () => {
  const { server, base } = await start();
  const res = await fetch(`${base}/v1/try`, { method: "POST", body: "x".repeat((2 << 20) + 1) });
  assert.equal(res.status, 413);
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
