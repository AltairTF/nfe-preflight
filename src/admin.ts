import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { monthOf, type Db } from "./db.ts";

// Single administrator, password from ADMIN_PASSWORD. Read-only page with the site usage counters.
// shortcut: sessions are kept in memory, so restarting the server logs the admin out; fine for one admin.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sha = (s: string) => createHash("sha256").update(s).digest();

const page = (title: string, body: string, logged = true) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} - Admin</title><link rel="stylesheet" href="/app.css"></head>
<body class="admin"><div id="wrap">
<div id="top"><a href="/admin" class="brand">NF-e Preflight - Admin</a>${logged ? `<form method="post" action="/admin/logout" class="inline"><button class="link">Sair</button></form>` : ""}</div>
${body}</div></body></html>`;


export function createAdmin(db: Db, password: string | undefined, now = () => Date.now()) {
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { window: number; n: number }>();

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://x");
    const html = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; frame-ancestors 'none'", ...headers });
      res.end(body);
    };
    const go = (to: string, headers: Record<string, string> = {}) => { res.writeHead(303, { location: to, ...headers }); res.end(); };
    if (!password) return html(404, "Not found");

    // Forms: parsed from a small urlencoded body. Same-origin check stops other sites from posting here.
    let form = new URLSearchParams();
    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return html(403, "Forbidden");
      let raw = "";
      req.setEncoding("utf8");
      for await (const c of req) { raw += c; if (raw.length > 16_384) return html(413, "Too large"); }
      form = new URLSearchParams(raw);
    }

    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    const token = /(?:^|; )nfp_admin=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const logged = !!token && (sessions.get(token) ?? 0) > now();

    if (url.pathname === "/admin/login") {
      if (req.method === "POST") {
        const ip = String(req.socket.remoteAddress);
        const w = Math.floor(now() / 60_000), a = attempts.get(ip);
        const n = a?.window === w ? a.n : 0;
        if (n >= 5) return html(429, page("Entrar", `<p class="err">Muitas tentativas. Aguarde um minuto.</p>`, false));
        attempts.set(ip, { window: w, n: n + 1 });
        if (timingSafeEqual(sha(form.get("senha") ?? ""), sha(password))) {
          const t = randomBytes(32).toString("base64url");
          sessions.set(t, now() + 12 * 3600_000);
          return go("/admin", { "set-cookie": `nfp_admin=${t}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=43200${secure}` });
        }
        return html(401, page("Entrar", `<p class="err">Senha incorreta.</p>${loginForm}`, false));
      }
      return html(200, page("Entrar", loginForm, false));
    }
    if (!logged) return go("/admin/login");

    if (url.pathname === "/admin/logout" && req.method === "POST") {
      sessions.delete(token!);
      return go("/admin/login", { "set-cookie": `nfp_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0${secure}` });
    }

    const ym = monthOf(now());
    if (req.method === "GET" && url.pathname === "/admin") {
      const siteRows = Array.from({ length: 6 }, (_, i) => {
        const [y, m] = ym.split("-").map(Number);
        const mm = monthOf(Date.UTC(y, m - 1 - i, 15));
        const e = db.eventsIn(mm);
        return `<tr><td>${mm}</td><td class="n">${e.try_valid ?? 0} / ${e.try_invalid ?? 0}</td></tr>`;
      }).join("");
      return html(200, page("Painel", `
<h1>Painel</h1>
<h2>Uso do site</h2>
<table class="narrow"><tr><th>Mês</th><th>Validações na página (válidas / com erro)</th></tr>${siteRows}</table>`));
    }

    return html(404, page("Não encontrado", `<p>Página não encontrada. <a href="/admin">Voltar</a></p>`));
  };
}

const loginForm = `<h1>Entrar</h1><form method="post" action="/admin/login"><p><label>Senha<br><input type="password" name="senha" autofocus required></label></p><p><button>Entrar</button></p></form>`;
