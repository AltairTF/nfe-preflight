import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "../scripts/build-site.ts";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/server.ts";
import { openDb } from "../src/db.ts";

const valid = readFileSync(new URL("./fixtures/valid.xml", import.meta.url), "utf8");

// The public pages are generated, so each run builds them into a temp folder.
const SITE = join(mkdtempSync(join(tmpdir(), "site-")), "/");
buildSite(SITE, "https://exemplo.com.br");

async function start() {
  const server = makeServer(openDb(":memory:"), undefined, SITE);
  await new Promise<void>((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("serves the page and its assets without an API key", async () => {
  const { server, base } = await start();
  for (const [path, type] of [["/", "text/html"], ["/app.js", "text/javascript"], ["/app.css", "text/css"]]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.ok(res.headers.get("content-type")!.startsWith(type), path);
    assert.match(res.headers.get("content-security-policy")!, /default-src 'self'/);
  }
  server.close();
});

test("/v1/try validates anonymously, is limited per IP and is not billed", async () => {
  const { server, base } = await start();
  const call = () => fetch(`${base}/v1/try`, { method: "POST", body: valid });
  const first = await call();
  assert.deepEqual(await first.json(), { valid: true, issues: [] });
  for (let i = 0; i < 4; i++) await call();
  const limited = await call();
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate_limited");
  server.close();
});

test("/v1/validate still needs a key", async () => {
  const { server, base } = await start();
  assert.equal((await fetch(`${base}/v1/validate`, { method: "POST", body: valid })).status, 401);
  server.close();
});

test("pages: clean URLs, rejection pages, sitemap and robots", async () => {
  const { server, base } = await start();
  const get = (p: string, init: RequestInit = {}) => fetch(base + p, { redirect: "manual", ...init });

  const home = await (await get("/")).text();
  assert.match(home, /<title>Validador de NF-e com IBS\/CBS/);
  assert.match(home, /<link rel="canonical" href="https:\/\/exemplo.com.br\/">/);

  const rej = await get("/rejeicao/1069/");
  assert.equal(rej.status, 200);
  const html = await rej.text();
  assert.match(html, /<h1>Rejeição 1069: Valor da CBS difere do calculado<\/h1>/);
  assert.match(html, /UB67-10/);

  const redirect = await get("/rejeicao/1069");
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/rejeicao/1069/");

  assert.equal((await get("/rejeicao/9999/")).status, 404);
  assert.equal((await get("/..%2f..%2fpackage.json")).status, 404);
  assert.equal((await get("/src/server.ts")).status, 404);

  const docs = await (await get("/docs/")).text();
  assert.ok(docs.includes('href="https://www.nfe.fazenda.gov.br/" target="_blank" rel="noopener noreferrer"'), "official links open in a new tab");

  const sitemap = await (await get("/sitemap.xml")).text();
  assert.ok(sitemap.includes("<loc>https://exemplo.com.br/rejeicao/1115/</loc>"));
  assert.match(await (await get("/robots.txt")).text(), /Disallow: \/admin[\s\S]*Sitemap: https:\/\/exemplo.com.br\/sitemap.xml/);
  server.close();
});

test("donation banner links to the configured URL only, and web validations are counted", async () => {
  assert.throws(() => buildSite(join(mkdtempSync(join(tmpdir(), "site-")), "/"), "https://x.com", "", "javascript:alert(1)"));
  assert.ok(!readFileSync(SITE + "index.html", "utf8").includes('class="donate"'));
  const dir = join(mkdtempSync(join(tmpdir(), "site-")), "/");
  buildSite(dir, "https://exemplo.com.br", "", "https://ko-fi.com/x?a=1&b=2");
  assert.match(readFileSync(dir + "index.html", "utf8"), /class="donate">.*href="https:\/\/ko-fi\.com\/x\?a=1&#38;b=2" target="_blank" rel="noopener noreferrer"/);
  const store = openDb(":memory:");
  const server = makeServer(store, undefined, dir);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(`${base}/v1/try`, { method: "POST", body: valid });
  await fetch(`${base}/v1/try`, { method: "POST", body: "<x/>" });
  assert.deepEqual(store.eventsIn(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)), { try_valid: 1, try_invalid: 1 });
  server.close();
});
