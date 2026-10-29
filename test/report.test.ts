import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// public/app.js is a browser script; run it against stub DOM objects to reach csv() and pdf().
const stub: any = { addEventListener() {}, value: "", classList: { add() {}, remove() {} } };
const ctx: any = vm.createContext({
  document: { getElementById: () => stub },
  localStorage: { getItem: () => "", setItem() {} },
  URL, Blob, Uint8Array, Object, Set, Date, String, Math, console,
});
vm.runInContext(readFileSync(new URL("../public/app.js", import.meta.url), "utf8"), ctx);

const issues = [
  { rule: "1069", line: 62, message: "Rejeição: Valor da CBS difere do calculado [nItem: 1]" },
  { rule: "XSD", line: 3, message: '=HYPERLINK("x") and "quotes"; semicolon' },
];
const report = { valid: false, issues, xml: 'x Id="NFe35250811222333000181550020000074941000083971" y', at: new Date(2026, 9, 29, 15, 30) };

test("CSV has BOM, ; separators, escaped quotes and neutralised formulas", () => {
  const out: string = ctx.csv(report);
  assert.ok(out.startsWith("﻿\"Regra\";\"Linha\";\"Mensagem\"\r\n"));
  assert.ok(out.includes('"1069";"62";"Rejeição: Valor da CBS difere do calculado [nItem: 1]"'));
  assert.ok(out.includes(`"'=HYPERLINK(""x"") and ""quotes""; semicolon"`));
});

test("PDF is well formed: xref offsets point at their objects and the text is there", () => {
  const bytes: Uint8Array = ctx.pdf(report);
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4") && s.trimEnd().endsWith("%%EOF"));
  const start = Number(/startxref\n(\d+)/.exec(s)![1]);
  assert.ok(s.slice(start).startsWith("xref"));
  const offsets = [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  assert.ok(s.includes("Relatório de validação".replace("ó", "\xf3")), "accents are single Latin-1 bytes");
  assert.ok(s.includes("Regra 1069 \\(linha 62\\)") && s.includes("35250811222333000181550020000074941000083971"));
});

test("PDF paginates long reports", () => {
  const many = { ...report, issues: Array.from({ length: 120 }, (_, i) => ({ rule: "1069", line: i, message: "m ".repeat(60) })) };
  const s = Buffer.from(ctx.pdf(many)).toString("latin1");
  assert.ok(Number(/\/Count (\d+)/.exec(s)![1]) > 1);
});
