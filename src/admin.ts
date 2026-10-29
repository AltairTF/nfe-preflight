import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { monthOf, type Db } from "./db.ts";

// Single administrator, password from ADMIN_PASSWORD. Pages are rendered on the server and every change is a plain form POST.
// shortcut: sessions are kept in memory, so restarting the server logs the admin out; fine for one admin.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (t?: number | null) => (t ? new Date(t - 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "nunca");
const sha = (s: string) => createHash("sha256").update(s).digest();

const page = (title: string, body: string, logged = true) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} - Admin</title><link rel="stylesheet" href="/app.css"></head>
<body class="admin"><div id="wrap">
<div id="top"><a href="/admin" class="brand">NF-e Preflight - Admin</a>${logged ? `<form method="post" action="/admin/logout" class="inline"><button class="link">Sair</button></form>` : ""}</div>
${body}</div></body></html>`;

const money = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);
const int = (v: string, d: number) => (Number.isInteger(Number(v)) && Number(v) >= 0 && v !== "" ? Number(v) : d);

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
    const fields = () => ({
      name: (form.get("nome") ?? "").trim(), email: (form.get("email") ?? "").trim(), priceCents: money(form.get("preco") || "0") || 0,
      perMinute: int(form.get("por_minuto") ?? "", 60), perMonth: int(form.get("por_mes") ?? "", 1000), note: (form.get("obs") ?? "").trim(),
    });

    if (req.method === "GET" && url.pathname === "/admin") {
      const used = db.usageByClient(ym);
      const clients = db.clients();
      const mrr = clients.filter((c) => c.active).reduce((s, c) => s + c.priceCents, 0);
      const calls = [...used.values()].reduce((s, u) => s + u.valid, 0);
      const siteRows = Array.from({ length: 6 }, (_, i) => {
        const [y, m] = ym.split("-").map(Number);
        const mm = monthOf(Date.UTC(y, m - 1 - i, 15));
        const e = db.eventsIn(mm);
        return `<tr><td>${mm}</td><td class="n">${e.try_valid ?? 0} / ${e.try_invalid ?? 0}</td></tr>`;
      }).join("");
      const rows = clients.map((c) => {
        const u = used.get(c.id)?.valid ?? 0;
        return `<tr class="${c.active ? "" : "off"}"><td><a href="/admin/cliente?id=${c.id}">${esc(c.name)}</a></td><td>${c.active ? "Ativo" : "Suspenso"}</td>
<td class="n">${u} / ${c.perMonth}</td><td class="n">${brl(c.priceCents)}</td></tr>`;
      }).join("");
      return html(200, page("Painel", `
<h1>Painel</h1>
<table class="sum"><tr><th>Clientes ativos</th><td>${clients.filter((c) => c.active).length}</td><th>Validações cobradas em ${ym}</th><td>${calls}</td><th>Receita mensal prevista</th><td>${brl(mrr)}</td></tr></table>
<h2>Uso do site</h2>
<table class="narrow"><tr><th>Mês</th><th>Validações na página (válidas / com erro)</th></tr>${siteRows}</table>
<h2>Clientes</h2>
<table><tr><th>Nome</th><th>Situação</th><th>Válidas no mês / cota</th><th>Mensalidade</th></tr>${rows || `<tr><td colspan="4">Nenhum cliente ainda.</td></tr>`}</table>
<p><a href="/admin/fechamento.csv?mes=${ym}">Baixar fechamento de ${ym} (CSV)</a></p>
<h2>Novo cliente</h2>${clientForm("/admin/clientes", { name: "", email: "", priceCents: 0, perMinute: 60, perMonth: 1000, note: "" }, "Criar cliente")}`));
    }

    if (req.method === "POST" && url.pathname === "/admin/clientes") {
      const f = fields();
      if (!f.name) return html(400, page("Erro", `<p class="err">Informe o nome.</p><p><a href="/admin">Voltar</a></p>`));
      try { return go(`/admin/cliente?id=${db.addClient(f)}`); }
      catch { return html(409, page("Erro", `<p class="err">Já existe um cliente com esse nome.</p><p><a href="/admin">Voltar</a></p>`)); }
    }

    if (url.pathname === "/admin/fechamento.csv") {
      const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get("mes") ?? "") ? url.searchParams.get("mes")! : ym;
      const used = db.usageByClient(mes);
      const cell = (v: unknown) => `"${String(v).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
      const rows = [["Cliente", "Situação", "Válidas (cobradas)", "Rejeitadas (grátis)", "Total", "Cota", "Mensalidade"], ...db.clients().map((c) => {
        const u = used.get(c.id) ?? { total: 0, valid: 0 };
        return [c.name, c.active ? "Ativo" : "Suspenso", u.valid, u.total - u.valid, u.total, c.perMonth, (c.priceCents / 100).toFixed(2).replace(".", ",")];
      })];
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="fechamento-${mes}.csv"` });
      return void res.end("﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n");
    }

    // Everything below is about one client or one key.
    const id = Number(url.searchParams.get("id") ?? form.get("id"));
    const client = db.client(id);
    const back = `/admin/cliente?id=${id}`;

    if (req.method === "GET" && url.pathname === "/admin/cliente") {
      if (!client) return html(404, page("Não encontrado", `<p>Cliente não encontrado. <a href="/admin">Voltar</a></p>`));
      const keys = db.keys(id).map((k) => `<tr class="${k.active ? "" : "off"}"><td>${esc(k.prefix)}…</td><td>${k.active ? "Ativa" : "Revogada"}</td><td>${date(k.created_at as number)}</td><td>${date(k.last_used as number | null)}</td>
<td><form method="post" action="/admin/chave/status" class="inline"><input type="hidden" name="id" value="${id}"><input type="hidden" name="chave" value="${k.id}"><input type="hidden" name="ativa" value="${k.active ? 0 : 1}"><button class="link">${k.active ? "Revogar" : "Reativar"}</button></form></td></tr>`).join("");
      const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now() - 3 * 3600_000); d.setUTCMonth(d.getUTCMonth() - i, 1); return d.toISOString().slice(0, 7); });
      const hist = months.map((m) => `<tr><td>${m}</td><td class="n">${db.usedIn(id, m)}</td></tr>`).join("");
      return html(200, page(client.name, `
<p><a href="/admin">&larr; Clientes</a></p>
<h1>${esc(client.name)} ${client.active ? "" : `<span class="tag">suspenso</span>`}</h1>
<h2>Acesso</h2>
<form method="post" action="/admin/cliente/status" class="inline"><input type="hidden" name="id" value="${id}"><input type="hidden" name="ativo" value="${client.active ? 0 : 1}">
<button>${client.active ? "Suspender cliente (bloqueia todas as chaves)" : "Reativar cliente"}</button></form>
<h2>Chaves</h2>
<table><tr><th>Chave</th><th>Situação</th><th>Criada em</th><th>Último uso</th><th></th></tr>${keys || `<tr><td colspan="5">Nenhuma chave.</td></tr>`}</table>
<form method="post" action="/admin/chave/nova"><input type="hidden" name="id" value="${id}"><button>Gerar nova chave</button></form>
<h2>Validações por mês</h2><table class="narrow"><tr><th>Mês</th><th>Válidas (cobradas)</th></tr>${hist}</table>
<h2>Dados</h2>${clientForm("/admin/cliente/salvar", client, "Salvar", id)}`));
    }

    if (req.method === "POST" && client) {
      if (url.pathname === "/admin/cliente/salvar") {
        const f = fields();
        if (!f.name) return html(400, page("Erro", `<p class="err">Informe o nome.</p><p><a href="${back}">Voltar</a></p>`));
        try { db.updateClient(id, f); } catch { return html(409, page("Erro", `<p class="err">Já existe um cliente com esse nome.</p><p><a href="${back}">Voltar</a></p>`)); }
        return go(back);
      }
      if (url.pathname === "/admin/cliente/status") { db.setClientActive(id, form.get("ativo") === "1"); return go(back); }
      if (url.pathname === "/admin/chave/nova") {
        const key = db.newKey(id);
        return html(200, page("Nova chave", `<h1>Nova chave para ${esc(client.name)}</h1>
<p>Copie agora e envie ao cliente. Ela <strong>não será mostrada de novo</strong>: o sistema guarda apenas um resumo irreversível.</p>
<p><input class="key" readonly value="${esc(key)}" size="48" onfocus="this.select()"></p><p><a href="${back}">Voltar ao cliente</a></p>`));
      }
      if (url.pathname === "/admin/chave/status") { db.setKeyActive(Number(form.get("chave")), form.get("ativa") === "1"); return go(back); }
    }
    return html(404, page("Não encontrado", `<p>Página não encontrada. <a href="/admin">Voltar</a></p>`));
  };
}

const loginForm = `<h1>Entrar</h1><form method="post" action="/admin/login"><p><label>Senha<br><input type="password" name="senha" autofocus required></label></p><p><button>Entrar</button></p></form>`;

function clientForm(action: string, c: { name: string; email: string; priceCents: number; perMinute: number; perMonth: number; note: string }, label: string, id?: number) {
  return `<form method="post" action="${action}">${id ? `<input type="hidden" name="id" value="${id}">` : ""}
<table class="form">
<tr><th><label for="nome">Nome</label></th><td><input id="nome" name="nome" value="${esc(c.name)}" required maxlength="120"></td></tr>
<tr><th><label for="email">E-mail</label></th><td><input id="email" name="email" type="email" value="${esc(c.email)}" maxlength="160"></td></tr>
<tr><th><label for="preco">Mensalidade (R$)</label></th><td><input id="preco" name="preco" value="${(c.priceCents / 100).toFixed(2).replace(".", ",")}" size="10"></td></tr>
<tr><th><label for="pm">Limite por minuto</label></th><td><input id="pm" name="por_minuto" type="number" min="1" value="${c.perMinute}"></td></tr>
<tr><th><label for="pmes">Cota por mês</label></th><td><input id="pmes" name="por_mes" type="number" min="0" value="${c.perMonth}"></td></tr>
<tr><th><label for="obs">Observações</label></th><td><textarea id="obs" name="obs" rows="3" maxlength="1000">${esc(c.note)}</textarea></td></tr>
</table><p><button>${label}</button></p></form>`;
}
