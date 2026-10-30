import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateXsd } from "../src/xsd.ts";
import { validateRules, accessKeyDv } from "../src/rules.ts";

const valid = readFileSync(new URL("./fixtures/valid.xml", import.meta.url), "utf8");
const codes = (xml: string) => validateRules(xml).map((i) => i.rule);

test("valid sample passes XSD and business rules", async () => {
  assert.deepEqual(await validateXsd(valid), []);
  assert.deepEqual(validateRules(valid), []);
});

test("1069: vCBS differs from vBC x pCBS", () => {
  assert.deepEqual(codes(valid.replace("<vCBS>0.90</vCBS>", "<vCBS>0.50</vCBS>")), ["1069", "1091"]);
});

test("1041 + 1150 + 1085: vIBSUF wrong propagates to item and total checks", () => {
  const out = codes(valid.replace("<vIBSUF>0.10</vIBSUF></gIBSUF>\n", "<vIBSUF>0.20</vIBSUF></gIBSUF>\n"));
  assert.ok(out.includes("1041") && out.includes("1150") && out.includes("1080"));
});

test("1076: total BC differs from item sum, with line number", () => {
  const issues = validateRules(valid.replace("<vBCIBSCBS>100.00", "<vBCIBSCBS>90.00"));
  assert.equal(issues[0].rule, "1076");
  assert.ok(issues[0].line! > 50);
});

test("1119: items carry IBS/CBS but the total group is missing", () => {
  assert.deepEqual(codes(valid.replace(/<IBSCBSTot>[\s\S]*<\/IBSCBSTot>/, "")), ["1119"]);
});

test("1200: debit note type 07 requires cClassTrib 410030", () => {
  const xml = valid.replace("<finNFe>1</finNFe>", "<finNFe>6</finNFe><tpNFDebito>07</tpNFDebito>");
  assert.ok(codes(xml).includes("1200"));
});

test("1020/1023: unknown CST and cClassTrib", () => {
  const out = codes(valid.replace("<CST>000</CST>", "<CST>999</CST>").replace("000001</cClassTrib>", "999999</cClassTrib>"));
  assert.ok(out.includes("1020") && out.includes("1023"));
});

test("1024 + 1032 + 1033: CST 011 needs gRed in each tax and cClassTrib of its own CST", () => {
  const out = codes(valid.replace("<CST>000</CST>", "<CST>011</CST>"));
  assert.ok(out.includes("1024"));
  assert.deepEqual(["1032", "1033"].filter((c) => out.includes(c)), ["1033"]);
});

test("1021: CST without IBS/CBS group (410) but gIBSCBS informed", () => {
  const out = codes(valid.replace("<CST>000</CST>", "<CST>410</CST>").replace("000001</cClassTrib>", "410001</cClassTrib>"));
  assert.ok(out.includes("1021"));
});

test("1030: CST 510 requires deferral in IBS UF", () => {
  assert.ok(codes(valid.replace("<CST>000</CST>", "<CST>510</CST>").replace("000001</cClassTrib>", "510001</cClassTrib>")).includes("1030"));
});

test("1026/1037: rates for 2026 are IBS UF 0.1% and CBS 0.9%", () => {
  const out = codes(valid.replace("<pIBSUF>0.1000", "<pIBSUF>0.2000").replace("<pCBS>0.9000", "<pCBS>0.5000"));
  assert.ok(out.includes("1026") && out.includes("1037"));
  assert.ok(!codes(valid.replace("2026-10-20", "2029-10-20")).includes("1026"), "no fixed rate known after 2028");
});

test("1175: gCredPresOper where the cClassTrib forbids it; 1055 unknown cCredPres", () => {
  const cp = "<gCredPresOper><vBCCredPres>100.00</vBCCredPres><cCredPres>99</cCredPres></gCredPresOper>";
  const out = codes(valid.replace("</IBSCBS>", cp + "</IBSCBS>"));
  assert.ok(out.includes("1175") && out.includes("1055"));
});

test("1053/1054: cCredPres 08 allows only the IBS credit group", () => {
  const cp = (g: string) => `<gCredPresOper><cCredPres>08</cCredPres>${g}</gCredPresOper>`;
  const cbs = "<gCBSCredPres><pCredPres>1</pCredPres><vCredPres>1.00</vCredPres></gCBSCredPres>";
  const out = codes(valid.replace("</IBSCBS>", cp(cbs) + "</IBSCBS>"));
  assert.ok(out.includes("1054") && out.includes("1050"));
});

test("1043: 620004 needs a bio blend above the mandatory one", () => {
  const xml = valid.replace("000001</cClassTrib>", "620004</cClassTrib>").replace("</prod>", "<comb><cProdANP>320102001</cProdANP><pBio>20.0000</pBio></comb></prod>");
  assert.ok(codes(xml).includes("1043"));
});

test("1190/1192/1218: gALCZFMCBS needs issuer Suframa registration, process number and a consistent value", () => {
  const alc = "<gALCZFMCBS><tpALCZFMCBS>2</tpALCZFMCBS><nProcSuframa>000</nProcSuframa><pAliqEfetRegCBS>0.9000</pAliqEfetRegCBS><vTribRegCBS>5.00</vTribRegCBS></gALCZFMCBS>";
  const out = codes(valid.replace("<vCBS>0.90</vCBS>", alc + "<vCBS>0.90</vCBS>"));
  for (const c of ["1190", "1192", "1218", "1191"]) assert.ok(out.includes(c), c);
});

test("1159/1135/1136: ZFM credit group rules", () => {
  assert.ok(codes(valid.replace("<finNFe>1</finNFe>", "<finNFe>5</finNFe><tpNFCredito>02</tpNFCredito>")).includes("1159"));
  const z = "<gCredPresIBSZFM><competApur>2026-01</competApur><tpCredPresIBSZFM>1</tpCredPresIBSZFM><vCredPresIBSZFM>1.00</vCredPresIBSZFM></gCredPresIBSZFM>";
  assert.ok(codes(valid.replace("</IBSCBS>", z + "</IBSCBS>")).includes("1158"));
});

test("1115: item without IBSCBS is rejected for CRT 3 from 03/08/2026, not before", () => {
  const noGroup = valid.replace(/<IBSCBS>[\s\S]*?<\/IBSCBS>/, "").replace(/<IBSCBSTot>[\s\S]*<\/IBSCBSTot>/, "");
  assert.deepEqual(codes(noGroup), ["1115"]);
  // Changing the date also breaks the access key (AAMM), which is not what this test is about.
  assert.deepEqual(codes(noGroup.replace("2026-10-20", "2026-08-02")).filter((c) => c !== "502"), []);
  assert.deepEqual(codes(noGroup.replace("<CRT>3</CRT>", "<CRT>1</CRT>")), [], "Simples only from 2027-01-04");
  const devol = (key: string) => noGroup.replace("<finNFe>1</finNFe>", "<finNFe>4</finNFe>").replace("</ide>", `<NFref><refNFe>${key}</refNFe></NFref></ide>`);
  assert.deepEqual(codes(devol("35261012345678000195550010000000011000000011")), [], "devolução of a pre-2027 nota is exempt");
  assert.deepEqual(codes(devol("35271012345678000195550010000000011000000019")), ["1115"]);
});

test("real homologation XML (test/fixtures/real, anonymised) passes XSD and every rule", async () => {
  const real = readFileSync(new URL("./fixtures/real/xml-teste.xml", import.meta.url), "utf8");
  assert.deepEqual(await validateXsd(real), []);
  // The sample predates NT 2026.008, so only the undated "vProdLiq obrigatório" warning may remain.
  assert.deepEqual(validateRules(real).filter((i) => !i.vigencia), []);
  assert.deepEqual(codes(real), ["1278"]);
});

test("502/253: access key must match the fields and carry a valid check digit", () => {
  const key = /Id="NFe(\d{44})"/.exec(valid)![1];
  assert.equal(accessKeyDv(key.slice(0, 43)), key[43]);
  assert.deepEqual(codes(valid.replace("<nNF>1</nNF>", "<nNF>2</nNF>")), ["502"]);
  const bad = key[43] === "0" ? "1" : "0";
  const badDv = valid.replaceAll(key, key.slice(0, 43) + bad).replace(`<cDV>${key[43]}</cDV>`, `<cDV>${bad}</cDV>`);
  assert.deepEqual(codes(badDv), ["253"]);
});

const D = (iso: string) => new Date(iso + "T12:00:00Z");
const NOV = D("2026-11-10"); // after production start of NT 2026.008
const OCT = D("2026-10-30"); // homologation only
const run = (xml: string, now = NOV) => validateRules(xml, now);

test("1279: vProdLiq must equal vUnComLiq x qCom (±0.01); error from 03/11/2026, future before", () => {
  const bad = valid.replace("<vProdLiq>100.00", "<vProdLiq>99.00").replace("<vProdLiqTot>100.00", "<vProdLiqTot>99.00");
  assert.deepEqual(run(bad).map((i) => i.rule), ["1279"]);
  assert.equal(run(bad)[0].vigencia, undefined);
  assert.equal(run(bad)[0].path, "NFe/infNFe/det[1]/prod/vProdLiq");
  assert.match(run(bad, OCT)[0].vigencia!, /homologação desde 05\/10\/2026.*produção.*03\/11\/2026/);
  assert.match(run(bad, D("2026-09-01"))[0].vigencia!, /homologação em 05\/10\/2026 e em produção em 03\/11\/2026/);
  assert.deepEqual(run(valid.replace("<vProdLiq>100.00", "<vProdLiq>100.01").replace("<vProdLiqTot>100.00", "<vProdLiqTot>100.01")), []);
});

test("1278: missing vProdLiq is an error with no date defined yet", () => {
  const xml = valid.replace(/<vUnComLiq>.*?<\/vProdLiq>/, "").replace(/<vProdLiqTot>.*?<\/vProdLiqTot>\s*/, "");
  const [i] = run(xml);
  assert.equal(i.rule, "1278");
  assert.match(i.vigencia!, /ainda não definiu a data/);
});

test("1282/1283: vProdLiqTot required and equal to the sum of vProdLiq", () => {
  assert.deepEqual(codes(valid.replace(/<vProdLiqTot>.*?<\/vProdLiqTot>\s*/, "")), ["1282"]);
  const [i] = run(valid.replace("<vProdLiqTot>100.00", "<vProdLiqTot>100.01"));
  assert.equal(i.rule, "1283");
  assert.match(i.message, /informado 100\.01, soma dos itens 100\.00/);
});

test("1280/1281: ICMS previsto only in advance-payment notes; its absence is a 2027 error", () => {
  const nb = "<ICMSPrevistoPagtoAntecip><vICMSPrevisto>1.00</vICMSPrevisto></ICMSPrevistoPagtoAntecip>";
  const withNb = valid.replace("<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>", `<ICMS>${nb}</ICMS>`);
  assert.deepEqual(codes(withNb), ["1280"]);
  const adv = valid.replace("<finNFe>1</finNFe>", "<finNFe>6</finNFe><tpNFDebito>06</tpNFDebito>");
  const missing = run(adv, NOV).find((i) => i.rule === "1281")!;
  assert.match(missing.vigencia!, /homologação em 01\/02\/2027 e em produção em 01\/03\/2027/);
  assert.equal(run(adv, D("2027-03-02")).find((i) => i.rule === "1281")!.vigencia, undefined);
});

test("1001: debit/credit notes carry no ICMS/PIS/...; tpNFDebito 07 and the NB01 group are exempt", () => {
  const credit = valid.replace("<finNFe>1</finNFe>", "<finNFe>5</finNFe>");
  assert.ok(codes(credit).includes("1001"));
  assert.equal(run(credit).find((i) => i.rule === "1001")!.path, "NFe/infNFe/det[1]/imposto/ICMS");
  assert.ok(!codes(valid.replace("<finNFe>1</finNFe>", "<finNFe>6</finNFe><tpNFDebito>07</tpNFDebito>")).includes("1001"));
  assert.ok(!codes(credit.replace("<finNFe>5</finNFe>", "<finNFe>5</finNFe><tpNFCredito>04</tpNFCredito>")).includes("1001"));
});

test("totals: a one-cent gap says expected vs informed and hints at rateio", () => {
  const i = validateRules(valid.replace("<vBCIBSCBS>100.00", "<vBCIBSCBS>100.01"))[0];
  assert.equal(i.rule, "1076");
  assert.match(i.message, /informado 100\.01, soma dos itens 100\.00, diferença 0\.01.*rateio/);
});
