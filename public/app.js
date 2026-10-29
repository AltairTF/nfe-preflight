"use strict";
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: key just isn't remembered */ } },
};

$("key").value = store.get("nfp_key");

$("file").addEventListener("change", (e) => load(e.target.files[0]));
const drop = $("drop");
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => load(e.dataTransfer.files[0]));
$("clear").addEventListener("click", () => { $("xml").value = ""; $("file").value = ""; $("result").hidden = true; });
$("go").addEventListener("click", validate);

async function load(file) {
  if (!file) return;
  $("xml").value = await file.text();
  validate();
}

const ERRORS = {
  401: "Chave de API inválida.",
  413: "Arquivo grande demais (limite de 2 MB).",
  500: "Falha interna ao validar. Tente de novo em instantes.",
};

async function validate() {
  const xml = $("xml").value;
  if (!xml.trim()) return show("bad", "Cole ou envie um XML primeiro.", [], "");
  const key = $("key").value.trim();
  store.set("nfp_key", key);
  $("go").disabled = true;
  try {
    const res = await fetch(key ? "/v1/validate" : "/v1/try", {
      method: "POST",
      body: xml,
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const wait = res.headers.get("retry-after");
      const quota = body.error === "quota_exceeded";
      return show("bad", quota ? "Cota do mês esgotada." : `Muitas validações seguidas. Tente de novo em ${wait || "alguns"} s.`, [], "");
    }
    if (!res.ok) return show("bad", ERRORS[res.status] || "Erro inesperado.", [], "");
    show(body.valid ? "ok" : "bad", body.valid ? "Nenhum problema encontrado." : `${body.issues.length} problema(s) encontrado(s).`, body.issues, xml, body.valid);
  } catch {
    show("bad", "Sem conexão com o servidor.", [], "");
  } finally {
    $("go").disabled = false;
  }
}

// Result of the last successful validation, used by the report buttons.
let last = null;

function show(kind, text, issues, xml, ok) {
  last = ok === undefined ? null : { valid: ok, issues, xml, at: new Date() };
  $("report").hidden = !last;
  $("result").hidden = false;
  const s = $("summary");
  s.className = `summary ${kind}`;
  s.textContent = text;

  const list = $("issues");
  list.replaceChildren(...issues.map((i) => {
    const li = document.createElement("li");
    const rule = Object.assign(document.createElement("span"), { className: "rule", textContent: i.rule });
    const msg = Object.assign(document.createElement("span"), { className: "msg", textContent: i.message });
    li.append(rule, msg);
    if (i.line) {
      const a = Object.assign(document.createElement("button"), { type: "button", className: "line", textContent: `linha ${i.line}` });
      a.addEventListener("click", () => goTo(i.line));
      li.append(a);
    }
    return li;
  }));

  // Lines are built with textContent only: the XML is untrusted input.
  const code = $("code");
  const bad = new Set(issues.map((i) => i.line));
  code.replaceChildren(...xml.split("\n").map((t, idx) => {
    const row = document.createElement("div");
    row.id = `L${idx + 1}`;
    if (bad.has(idx + 1)) row.className = "bad";
    row.append(Object.assign(document.createElement("span"), { className: "n", textContent: idx + 1 }), document.createTextNode(t));
    return row;
  }));
  $("codeTitle").hidden = code.hidden = !xml;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function goTo(line) {
  const row = $(`L${line}`);
  if (row) row.scrollIntoView({ block: "center" });
}

// ---- Report download (CSV and PDF, both built in the browser; nothing is sent anywhere) ----

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const when = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const accessKey = (xml) => /\bId="NFe(\d{44})"/.exec(xml)?.[1] || "não informada";

function download(name, type, data) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ';' separator and a BOM so Excel in pt-BR opens it with the right columns and accents.
function csv(r) {
  // A leading = + - @ would be run as a formula by spreadsheets, and the message can echo XML content.
  const cell = (v) => `"${String(v ?? "").replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const rows = [["Regra", "Linha", "Mensagem"], ...r.issues.map((i) => [i.rule, i.line, i.message])];
  return "\ufeff" + rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

function wrap(text, width) {
  const out = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (cur && (cur + " " + word).length > width) { out.push(cur); cur = word; }
    else cur = cur ? cur + " " + word : word;
  }
  return cur ? [...out, cur] : out;
}

// Minimal text-only PDF: A4, Helvetica (WinAnsi, so Portuguese accents work), one content stream per page.
function pdf(r) {
  const lines = [
    { t: "NF-e Preflight - Relatório de validação", f: 2, size: 16, gap: 8 },
    { t: `Data: ${when(r.at)}` },
    { t: `Chave de acesso: ${accessKey(r.xml)}` },
    { t: r.valid ? "Resultado: nenhum problema encontrado." : `Resultado: ${r.issues.length} problema(s) encontrado(s).`, f: 2, gap: 8 },
  ];
  r.issues.forEach((i, n) => {
    lines.push({ t: `${n + 1}. Regra ${i.rule}${i.line ? ` (linha ${i.line})` : ""}`, f: 2, gap: 4 });
    for (const w of wrap(i.message, 88)) lines.push({ t: w, x: 14 });
  });
  wrap("Pré-teste: não verifica a assinatura digital nem o que a SEFAZ checa ao autorizar a nota. Não substitui a SEFAZ.", 95)
    .forEach((w, i) => lines.push({ t: w, size: 8, gap: i ? 0 : 12 }));

  const H = 842, top = 792, bottom = 60, pages = [[]];
  let y = top;
  for (const l of lines) {
    const lead = (l.size || 10) * 1.4 + (l.gap || 0);
    if (y - lead < bottom) { pages.push([]); y = top; }
    y -= lead;
    pages.at(-1).push({ ...l, y });
  }
  // Latin-1 only: one char is one byte, so string lengths are byte offsets. Anything outside becomes '?'.
  const enc = (s) => [...s].map((c) => (c.charCodeAt(0) < 256 ? c : "?")).join("").replace(/([\\()])/g, "\\$1");
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // Pages, filled below
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = pages.map((pg, idx) => {
    const text = [...pg, { t: `Página ${idx + 1} de ${pages.length}`, size: 8, y: 30, x: 480 }]
      .map((l) => `BT /F${l.f || 1} ${l.size || 10} Tf 1 0 0 1 ${50 + (l.x || 0)} ${l.y} Tm (${enc(l.t)}) Tj ET`)
      .join("\n");
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

$("csv").addEventListener("click", () => last && download(`relatorio-nfe-${stamp(last.at)}.csv`, "text/csv;charset=utf-8", csv(last)));
$("pdf").addEventListener("click", () => last && download(`relatorio-nfe-${stamp(last.at)}.pdf`, "application/pdf", pdf(last)));
