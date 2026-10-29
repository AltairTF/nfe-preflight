import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/server.ts";
import { openDb } from "../src/db.ts";


async function start(password: string | null = "segredo") {
  const store = openDb(":memory:");
  const server = makeServer(store, password ?? undefined);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  // redirect: "manual" so each step can be asserted; the session cookie is carried by hand.
  const req = (path: string, form?: Record<string, string>) =>
    fetch(base + path, {
      method: form ? "POST" : "GET", redirect: "manual", headers: { cookie, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
  const login = async (senha = "segredo") => {
    const r = await req("/admin/login", { senha });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    return r;
  };
  return { server, store, base, req, login };
}

test("admin is closed without a session and disabled without ADMIN_PASSWORD", async () => {
  const a = await start();
  const r = await a.req("/admin");
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/admin/login");
  a.server.close();
  const b = await start(null);
  assert.equal((await b.req("/admin")).status, 404);
  b.server.close();
});

test("wrong password is refused, right one opens a HttpOnly SameSite=Strict session", async () => {
  const { server, req, login } = await start();
  assert.equal((await login("errada")).status, 401);
  const ok = await login();
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  assert.equal((await req("/admin")).status, 200);
  server.close();
});

test("login is rate limited after 5 attempts", async () => {
  const { server, login } = await start();
  for (let i = 0; i < 5; i++) await login("x");
  assert.equal((await login("segredo")).status, 429);
  server.close();
});

test("posts from another origin are refused", async () => {
  const { server, base, login } = await start();
  await login();
  const r = await fetch(`${base}/admin/logout`, { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(r.status, 403);
  server.close();
});

test("dashboard shows web validations", async () => {
  const a = await start();
  a.store.logEvent("try_valid"); a.store.logEvent("try_invalid");
  await a.login();
  const html = await (await a.req("/admin")).text();
  assert.match(html, /Uso do site/);
  assert.match(html, /<td class="n">1 \/ 1<\/td>/);
  a.server.close();
});
