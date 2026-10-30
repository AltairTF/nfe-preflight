import type { Issue } from "./xsd.ts";
import tables from "./tables.json" with { type: "json" };

// Business rules of NT 2025.002-RTC v1.52 (Setembro/2026), section 7, and NT 2026.008 v1.00 (Valor Líquido do Produto). Each rule cites its RV id; `rule` is the SEFAZ rejection code.
// CST/cClassTrib indicators come from tables.json, generated from IT 2025.002 v.1.70 by scripts/build-tables.py.
const CST = tables.cst as Record<string, (typeof tables.cst)["000"]>;
const CREDPRES = tables.cCredPres as Record<string, (typeof tables.cCredPres)["01"]>;
const CCLASS = tables.cClassTrib as Record<string, (typeof tables.cClassTrib)["000001"]>;

// Shown to the user so they know which layout and rules the verdict is based on.
export const VERSIONS = {
  schema: "Pacote de Liberação PL_010g v1.03 (NT 2026.006 v1.00 e NT 2026.008 v1.00, publicado em 26/10/2026)",
  rules: "NT 2025.002-RTC v1.52 e NT 2026.008 v1.00",
};

// Rollout of a rule: ISO dates for homologation and production; `prod` undefined means the NT gives no date ("implementação futura").
interface Rollout { nt: string; hom?: string; prod?: string }
const NT008: Rollout = { nt: "NT 2026.008", hom: "2026-10-05", prod: "2026-11-03" };
const NT008_NB01_30: Rollout = { nt: "NT 2026.008", hom: "2027-02-01", prod: "2027-03-01" };
const NT008_NO_DATE: Rollout = { nt: "NT 2026.008" };
const br = (d: string) => d.split("-").reverse().join("/");

// Undefined when the rule already rejects in production at `today`, so the issue is a plain error.
function vigencia(r: Rollout | undefined, today: string): string | undefined {
  if (!r || (r.prod && today >= r.prod)) return undefined;
  if (!r.prod) return `Erro futuro (${r.nt}): a SEFAZ ainda não definiu a data em que esta regra passa a valer.`;
  if (r.hom && today >= r.hom)
    return `Erro futuro em produção (${r.nt}): já rejeita em homologação desde ${br(r.hom)}; em produção passa a rejeitar em ${br(r.prod)}.`;
  return `Erro futuro (${r.nt}): passa a rejeitar em homologação em ${br(r.hom ?? r.prod)} e em produção em ${br(r.prod)}.`;
}

interface Node {
  name: string;
  text: string;
  line: number;
  path: string;
  nItem?: string;
  id?: string;
  kids: Node[];
}

// shortcut: minimal parser for XML that already passed the XSD (no entities, CDATA or DOCTYPE); only used after validateXsd returns no issues.
export function parse(xml: string): Node {
  const root: Node = { name: "", text: "", line: 1, path: "", kids: [] };
  const stack = [root];
  let line = 1;
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(xml)); ) {
    const [whole, close, name, self, text] = m;
    if (text !== undefined) stack.at(-1)!.text += text.trim();
    else if (name && !close) {
      const local = name.replace(/^.*:/, "");
      const nItem = /nItem="(\d+)"/.exec(whole)?.[1];
      const parent = stack.at(-1)!;
      const n: Node = { name: local, text: "", line, path: (parent.path ? parent.path + "/" : "") + local + (nItem ? `[${nItem}]` : ""), nItem, id: /\bId="([^"]*)"/.exec(whole)?.[1], kids: [] };
      stack.at(-1)!.kids.push(n);
      if (!self) stack.push(n);
    } else if (close) stack.pop();
    line += whole.split("\n").length - 1;
  }
  return root.kids[0];
}

const kid = (n: Node | undefined, name: string) => n?.kids.find((k) => k.name === name);
const path = (n: Node | undefined, p: string) => p.split("/").reduce<Node | undefined>((a, s) => kid(a, s), n);
const num = (n: Node | undefined, p: string) => {
  const t = path(n, p)?.text;
  return t === undefined || t === "" ? undefined : Number(t);
};
const all = (n: Node | undefined, name: string): Node[] => (n ? [n, ...n.kids.flatMap((k) => all(k, name))].filter((x) => x.name === name) : []);

const cents = (x: number) => Math.round(x * 100);
// Most rules allow ±0.01 ("Aceitar uma tolerância de 0,01 a mais ou a menos").
const near = (a: number, b: number) => Math.abs(cents(a) - cents(b)) <= 1;

// Incentive areas of UB56-10: ZFM municipalities trade among themselves; each ALC lists its own municipality pairs.
const ZFM = ["1301902", "1302603", "1303569"];
const ALC_PAIRS = ["1304062-1304062", "1100106-1100106", "1400100-1400100", "1400100-1400159", "1400159-1400100", "1400159-1400159",
  "1600303-1600303", "1600303-1600600", "1600600-1600303", "1600600-1600600", "1200104-1200104", "1200104-1200252", "1200104-1200203",
  "1200252-1200104", "1200252-1200252", "1200252-1200203", "1200203-1200104", "1200203-1200252", "1200203-1200203"];
const sameArea = (a?: string, b?: string) => !!a && !!b && ((ZFM.includes(a) && ZFM.includes(b)) || ALC_PAIRS.includes(`${a}-${b}`));
// NCMs that never get the zero CBS rate in incentive areas (UB56-10 Condição 01).
const restrictedNcm = (ncm = "") => /^(93|24|220[3-8]|8703)/.test(ncm) || (/^33/.test(ncm) && !/^330[3-7]/.test(ncm));
const isoDay = (d: string) => d.slice(0, 10);

// finNFe-independent tables from UB14-70 / UB14-80.
const DEBITO: Record<string, string> = { "01": "800002", "02": "811001", "03": "811002", "05": "800001", "07": "410030", "08": "811003" };
const CREDITO: Record<string, string> = { "02": "810001", "05": "800001" };

// Modulo 11 with weights 2..9 from the right; alphanumeric CNPJ characters count as ASCII - 48.
export const accessKeyDv = (k43: string) => {
  const r = [...k43].reverse().reduce((acc, c, i) => acc + (c.charCodeAt(0) - 48) * (2 + (i % 8)), 0) % 11;
  return r < 2 ? "0" : String(11 - r);
};

export function validateRules(xml: string, now = new Date()): Issue[] {
  const today = now.toISOString().slice(0, 10);
  const nfe = parse(xml);
  const inf = kid(nfe, "infNFe");
  const issues: Issue[] = [];
  const add = (rule: string, n: Node | undefined, message: string, nItem?: string, rollout?: Rollout) =>
    issues.push({ rule, line: n?.line, path: n?.path, message: nItem ? `${message} [nItem: ${nItem}]` : message, vigencia: vigencia(rollout, today) });

  const ide = kid(inf, "ide");

  // MOC 7.0 Anexo I: A03-10 (502) Id differs from the concatenated fields; B23-10 (253) invalid check digit.
  const id = inf?.id?.replace(/^NFe/, "") ?? "";
  const doc = path(inf, "emit/CNPJ")?.text ?? (path(inf, "emit/CPF")?.text ?? "").padStart(14, "0");
  const dh = path(ide, "dhEmi")?.text ?? "";
  const expectedId =
    (path(ide, "cUF")?.text ?? "") + dh.slice(2, 4) + dh.slice(5, 7) + doc + (path(ide, "mod")?.text ?? "") +
    (path(ide, "serie")?.text ?? "").padStart(3, "0") + (path(ide, "nNF")?.text ?? "").padStart(9, "0") +
    (path(ide, "tpEmis")?.text ?? "") + (path(ide, "cNF")?.text ?? "") + (path(ide, "cDV")?.text ?? "");
  // shortcut: Nota Fiscal Avulsa (series 890-899) uses the SEFAZ CNPJ in the key, so it would be flagged here; not handled.
  if (id !== expectedId) add("502", inf, "Rejeição: Erro na Chave de Acesso - Campo Id não corresponde à concatenação dos campos correspondentes");
  if (id.length === 44 && accessKeyDv(id.slice(0, 43)) !== id[43]) add("253", inf, "Rejeição: Digito Verificador da chave de acesso composta inválida");
  const model55 = path(ide, "mod")?.text === "55";
  const tpDeb = path(ide, "tpNFDebito")?.text;
  const tpCred = path(ide, "tpNFCredito")?.text;
  const finNFe = path(ide, "finNFe")?.text;
  const dhEmi = path(ide, "dhEmi")?.text ?? "";
  const year = Number(dhEmi.slice(0, 4));
  const munEmit = path(inf, "emit/enderEmit/cMun")?.text;
  const munDest = path(inf, "dest/enderDest/cMun")?.text;
  // UB12-10 (obrigatoriedade): CRT 3 from 03/08/2026 (v1.51 schedule, same date in homologation and production); Simples (CRT 1, 2, 4) from 04/01/2027.
  // Exceção 1: devolução (finNFe 4) or complementar (2) of a nota issued before 2027 (the NT's "2026 2027" is a tracked change; I took the later year).
  const crt = path(inf, "emit/CRT")?.text;
  const refYear = all(ide, "refNFe").map((n) => 2000 + Number(n.text.slice(2, 4)));
  const required =
    ((crt === "3" && isoDay(dhEmi) >= "2026-08-03") || (["1", "2", "4"].includes(crt ?? "") && isoDay(dhEmi) >= "2027-01-04")) &&
    !((finNFe === "4" || finNFe === "2") && refYear.some((y) => y < 2027));
  const dets = inf?.kids.filter((k) => k.name === "det") ?? [];
  const sum: Record<string, number> = {};
  let anyItemIbsCbs = false;
  const seenZfm = new Set<string>();
  const tpOperGov = path(ide, "gCompraGov/tpOperGov")?.text;
  // NB01: ICMS previsto only in the advance-payment scenarios.
  const advance = tpDeb === "06" || tpOperGov === "4";
  let sumLiq = 0;
  let anyLiq = false;

  for (const det of dets) {
    const nItem = det.nItem ?? "?";

    // NT 2026.008: net value of the product (I11c) and ICMS previsto (NB01).
    const prod = kid(det, "prod");
    const vLiq = num(prod, "vProdLiq");
    if (vLiq === undefined) add("1278", prod, "Rejeição: Valor Líquido do Produto não informado", nItem, NT008_NO_DATE);
    else {
      anyLiq = true;
      sumLiq += cents(vLiq);
      if (finNFe === "1" && !near((num(prod, "vUnComLiq") ?? 0) * (num(prod, "qCom") ?? 0), vLiq))
        add("1279", kid(prod, "vProdLiq"), "Rejeição: Valor Líquido do Produto difere do calculado (vUnComLiq x qCom)", nItem, NT008);
    }
    const nb = path(det, "imposto/ICMS/ICMSPrevistoPagtoAntecip");
    if (nb && (!model55 || !advance)) add("1280", nb, "Rejeição: Grupo do ICMS Previsto no Pagamento Antecipado informado indevidamente", nItem, NT008);
    if (!nb && model55 && advance) add("1281", path(det, "imposto/ICMS") ?? det, "Rejeição: Grupo do ICMS Previsto no Pagamento Antecipado não informado", nItem, NT008_NB01_30);

    const ibscbs = path(det, "imposto/IBSCBS");
    if (!ibscbs) {
      if (required && !tables.cProdANPMonofasico.includes(all(det, "cProdANP")[0]?.text ?? "")) add("1115", path(det, "imposto") ?? det, "Rejeição: Grupo IBSCBS não informado", nItem);
      continue;
    }
    anyItemIbsCbs = true;
    const cClass = path(ibscbs, "cClassTrib")?.text;

    if (model55 && tpDeb && DEBITO[tpDeb] && cClass !== DEBITO[tpDeb])
      add("1200", ibscbs, "Rejeição: cClassTrib incompatível com o tipo de Nota de Débito", nItem);
    if (model55 && tpCred && CREDITO[tpCred] && cClass !== CREDITO[tpCred])
      add("1201", ibscbs, "Rejeição: cClassTrib incompatível com o tipo de Nota de Crédito", nItem);

    const cst = path(ibscbs, "CST")?.text ?? "";
    const ind = CST[cst];
    const cc = CCLASS[cClass ?? ""];
    if (!ind) add("1020", path(ibscbs, "CST"), "Rejeição: CST do IBS/CBS informado inexistente", nItem);
    if (!cc) add("1023", path(ibscbs, "cClassTrib"), "Rejeição: Classificação Tributária do IBS/CBS informada inexistente", nItem);
    else {
      if (cc.cst !== cst) add("1024", path(ibscbs, "cClassTrib"), "Rejeição: Classificação Tributária do IBS e da CBS incompatível com o CST informado", nItem);
      const mod = path(ide, "mod")?.text;
      if ((mod === "55" && !cc.indNFe) || (mod === "65" && !cc.indNFCe))
        add("1025", path(ibscbs, "cClassTrib"), "Rejeição: cClassTrib do IBS/CBS não permitido neste modelo de DFe", nItem);
    }

    const g = kid(ibscbs, "gIBSCBS");
    const group = (name: string, rule: [string, string], allowed: boolean | undefined, label: string, required = false) => {
      const n = kid(ibscbs, name);
      if (ind && n && !allowed) add(rule[0], n, `Rejeição: ${label} informado indevidamente`, nItem);
      // UB13-30/UB13-45 exempt "tpNFDebito=07-Perda em estoque" only for gIBSCBS.
      if (ind && !n && allowed && required) add(rule[1], ibscbs, `Rejeição: ${label} não informado`, nItem);
    };
    group("gIBSCBS", ["1021", "1022"], ind?.gIBSCBS, "Grupo gIBSCBS", tpDeb !== "07");
    group("gIBSCBSMono", ["1151", ""], ind?.gIBSCBSMono, "Grupo gIBSCBSMono"); // UB13-40 (1116) is "implementação futura".
    group("gTransfCred", ["1131", "1132"], ind?.gTransfCred, "Grupo de transferência de crédito", true);

    // UB68-10 / UB68-11
    const regular = kid(g, "gTribRegular");
    if (cc && !regular && cc.gTribRegular) add("1065", ibscbs, "Rejeição: Classificação Tributária do IBS e da CBS informada obriga informação da tributação regular", nItem);
    if (cc && regular && !cc.gTribRegular) add("1114", regular, "Rejeição: Classificação Tributária do IBS e da CBS informada não permite informação da tributação regular", nItem);
    if (regular) {
      if (!CST[path(regular, "CSTReg")?.text ?? ""]) add("1066", path(regular, "CSTReg"), "Rejeição: CST do IBS e da CBS informado no grupo de tributação regular inexistente", nItem);
      if (!CCLASS[path(regular, "cClassTribReg")?.text ?? ""]) add("1067", path(regular, "cClassTribReg"), "Rejeição: Classificação Tributária do IBS e da CBS informada no grupo de tributação regular inexistente", nItem);
    }
    const cp = kid(ibscbs, "gCredPresOper");
    const cCred = cp ? path(cp, "cCredPres")?.text : undefined;
    const credInfo = cCred ? CREDPRES[cCred] : undefined;
    if (cp) {
      if (path(ide, "mod")?.text === "65") add("1049", cp, "Rejeição: Não é permitido o uso de Crédito Presumido na NFC-e modelo 65", nItem);
      else if (cc && !cc.gCredPresOper && !all(det, "indBemMovelUsado").some((n) => n.text === "1"))
        add("1175", cp, "Rejeição: Grupo de Crédito Presumido na Operação informado indevidamente", nItem);
      if (cCred && !credInfo) add("1055", path(cp, "cCredPres"), "Rejeição: Código de Crédito Presumido (cCredPres) da Operação inexistente", nItem);
      const vProd = num(det, "prod/vProd") ?? 0;
      for (const [grp, allowedKey, bad, req, over, susp, minYear, label] of [
        ["gIBSCredPres", "gIBS", "1053", "1054", "1107", "1056", 2033, "IBS"],
        ["gCBSCredPres", "gCBS", "1050", "1058", "1124", "1060", 2027, "CBS"],
      ] as const) {
        const n = kid(cp, grp);
        if (credInfo && n && !credInfo[allowedKey]) add(bad, n, `Rejeição: Crédito Presumido para ${label === "IBS" ? "o" : "a"} ${label} informado indevidamente`, nItem);
        if (credInfo && !n && credInfo[allowedKey]) add(req, cp, `Rejeição: Crédito Presumido para ${label === "IBS" ? "o" : "a"} ${label} não informado`, nItem);
        if (cCred === "04" && (num(n, "vCredPres") ?? 0) > vProd) add(over, path(n, "vCredPres"), `Rejeição: Valor do Crédito Presumido d${label === "IBS" ? "o" : "a"} ${label} não pode ser superior a vProd`, nItem);
        if (n && kid(n, "vCredPresCondSus") && (year < minYear || cCred !== "04")) add(susp, path(n, "vCredPresCondSus"), `Rejeição: Valor do Crédito Presumido em condição suspensiva d${label === "IBS" ? "o" : "a"} ${label} informado indevidamente`, nItem);
        sum[`cred${label}`] = (sum[`cred${label}`] ?? 0) + (num(n, "vCredPres") ?? 0);
      }
    }

    // UB14-30 / UB14-50: 620004 needs a blend above the mandatory one, 620005 below it (table valid on the issue date).
    if (model55 && (cClass === "620004" || cClass === "620005")) {
      const anp = all(det, "cProdANP")[0]?.text;
      const day = isoDay(dhEmi);
      const req = tables.pBioObrigatorio.find((r) => r.cProdANP === anp && r.ini! <= day && (!r.fim || day <= r.fim));
      const pBio = Number(all(det, "pBio")[0]?.text ?? 0);
      if (req && cClass === "620004" && !(pBio > req.pBio)) add("1043", ibscbs, "Rejeição: Índice de mistura do Biocombustível inferior ao obrigatório para esta Classificação Tributária do IBS e CBS", nItem);
      if (req && cClass === "620005" && !(pBio < req.pBio)) add("1059", ibscbs, "Rejeição: Índice de mistura do Biocombustível superior ao obrigatório para esta Classificação Tributária do IBS e CBS", nItem);
    }

    // UB131-10..UB133-10: IBS presumed credit on the ZFM balance.
    const zfm = kid(ibscbs, "gCredPresIBSZFM");
    if (zfm && path(ide, "mod")?.text === "65") add("1138", zfm, "Rejeição: Não é permitido o uso de Crédito Presumido ZFM na NFC-e modelo 65", nItem);
    else if (model55) {
      if (ind && zfm && !ind.gCredPresIBSZFM) add("1134", zfm, "Rejeição: CST do IBS/CBS informado não permite informação do grupo para apropriação de crédito presumido de IBS sobre o saldo devedor na ZFM", nItem);
      if (ind && !zfm && ind.gCredPresIBSZFM) add("1135", ibscbs, "Rejeição: CST do IBS/CBS informado exige a informação do grupo para apropriação de crédito presumido de IBS sobre o saldo devedor na ZFM", nItem);
      if (zfm && tpCred !== "02") add("1158", zfm, "Rejeição: Tipo de Nota de Crédito não permite o grupo para apropriação de crédito presumido de IBS sobre o saldo devedor na ZFM", nItem);
      if (!zfm && tpCred === "02") add("1159", ibscbs, "Rejeição: Tipo de Nota de Crédito exige o grupo para apropriação de crédito presumido de IBS sobre o saldo devedor na ZFM", nItem);
    }
    if (zfm) {
      const compet = path(zfm, "competApur")?.text ?? "";
      if (compet.slice(0, 7) > new Date().toISOString().slice(0, 7)) add("1160", path(zfm, "competApur"), "Rejeição: Ano e mês referência do período de apuração superior ao ano e mês atual", nItem);
      const tp = path(zfm, "tpCredPresIBSZFM")?.text ?? "";
      if (seenZfm.has(tp)) add("1136", path(zfm, "tpCredPresIBSZFM"), "Rejeição: Não é possível repetir o Tipo de Classificação para o cálculo do crédito presumido na ZFM neste DFe", nItem);
      seenZfm.add(tp);
    }

    if (!g) continue;
    const vBC = num(g, "vBC") ?? 0;
    // shortcut: compra governamental (gTribCompraGov/pRedutor) changes the effective-rate and value formulas; skipped until covered.
    const compraGov = all(g, "gTribCompraGov").length > 0;

    // Same shape for the three taxes: UB23/UB42/UB61 (vDif), UB28/UB47/UB66 (pAliqEfet), UB35/UB54/UB67 (value).
    const taxes = [
      { grp: "gIBSUF", p: "pIBSUF", v: "vIBSUF", codes: { dif: "1031", efet: "1035", val: "1041" }, difGrp: ["1029", "1030"], redGrp: ["1032", "1033"], rate: "1026", label: "IBS UF" },
      { grp: "gIBSMun", p: "pIBSMun", v: "vIBSMun", codes: { dif: "1045", efet: "1047", val: "1052" }, difGrp: ["1083", "1044"], redGrp: ["1007", "1074"], rate: "1036", label: "IBS Municipal" },
      { grp: "gCBS", p: "pCBS", v: "vCBS", codes: { dif: "1062", efet: "1064", val: "1069" }, difGrp: ["1090", "1061"], redGrp: ["1028", "1079"], rate: "1037", label: "CBS" },
    ];
    for (const t of taxes) {
      const tg = kid(g, t.grp);
      if (!tg) continue;
      // UB22/UB40/UB59 (gDif) and UB26/UB45/UB64 (gRed): presence must match the CST indicators.
      // shortcut: with compra governamental, gRed is mandatory/allowed regardless of the CST (see NT UB26-10), so those checks are skipped.
      if (ind && !compraGov) {
        for (const [name, allowed, [bad, req]] of [["gDif", ind.gDif, t.difGrp], ["gRed", ind.gRed, t.redGrp]] as const) {
          const n = kid(tg, name);
          if (n && !allowed) add(bad, n, `Rejeição: CST do IBS/CBS informado não permite informação de ${name} do ${t.label}`, nItem);
          if (!n && allowed) add(req, tg, `Rejeição: CST do IBS/CBS informado obriga informação de ${name} do ${t.label}`, nItem);
        }
      }
      const pAliq = num(tg, t.p) ?? 0;
      // UB18-10 / UB37-10 / UB56-10. shortcut: only 2025-2028 (IBS) and 2025-2026 (CBS) have fixed rates in the NT; later years await legislation.
      const exempt = t.grp === "gCBS" ? tpCred === "04" : tpCred === "04" || tpCred === "03" || tpCred === "06" || finNFe === "4";
      const expected =
        cc?.gTribRegular ? 0 : t.grp === "gCBS" ? (year <= 2026 ? 0.9 : undefined) : year <= 2026 ? (t.grp === "gIBSUF" ? 0.1 : 0) : year <= 2028 ? 0.05 : undefined;
      if (!exempt && expected !== undefined && Math.round(pAliq * 1e4) !== Math.round(expected * 1e4)) {
        // UB56-10 Exceção 3: zero CBS is allowed when the NCM is not restricted and issuer and recipient share an incentive area.
        const zeroOk = t.grp === "gCBS" && pAliq === 0 && !restrictedNcm(path(det, "prod/NCM")?.text) && sameArea(munEmit, munDest);
        if (!zeroOk) add(t.rate, path(tg, t.p), `Rejeição: Alíquota do ${t.label} inválida`, nItem);
      }
      const alc = t.grp === "gCBS" ? kid(tg, "gALCZFMCBS") : undefined;
      if (alc) {
        if (all(inf, "ISUFEmit").length === 0) add("1190", alc, "Rejeição: Inscrição do emitente na Suframa não informado", nItem);
        if (path(alc, "tpALCZFMCBS")?.text === "2" && /^0*$/.test(path(alc, "nProcSuframa")?.text ?? ""))
          add("1192", alc, "Rejeição: Número do processo na Suframa não informado", nItem);
        const calc = vBC * ((num(alc, "pAliqEfetRegCBS") ?? 0) / 100);
        if (!near(calc, num(alc, "vTribRegCBS") ?? 0)) add("1218", path(alc, "vTribRegCBS"), "Rejeição: Valor da CBS para operação fora de áreas ou regimes incentivado difere do calculado", nItem);
      }
      if (t.grp === "gCBS" && alc && (restrictedNcm(path(det, "prod/NCM")?.text) || !sameArea(munEmit, munDest)))
        add("1191", kid(tg, "gALCZFMCBS"), "Rejeição: Grupo de operações em áreas incentivadas (ALC/ZFM) - CBS (alíquota zero) não permitido", nItem);
      const gRed = kid(tg, "gRed");
      const efet = num(gRed, "pAliqEfet");
      const rate = gRed && efet !== undefined ? efet : pAliq;
      const vDif = num(tg, "gDif/vDif");
      const vDev = num(tg, "gDevTrib/vDevTrib");

      if (gRed && !compraGov) {
        const calc = pAliq * (1 - (num(gRed, "pRedAliq") ?? 0) / 100);
        if (Math.round(calc * 1e4) !== Math.round((efet ?? 0) * 1e4))
          add(t.codes.efet, gRed, `Rejeição: Valor da Alíquota Efetiva do ${t.label} calculado incorretamente`, nItem);
      }
      const gDif = kid(tg, "gDif");
      if (gDif && !compraGov) {
        const calc = vBC * (rate / 100) * ((num(gDif, "pDif") ?? 0) / 100);
        if (!near(calc, vDif ?? 0)) add(t.codes.dif, gDif, `Rejeição: Valor do Diferimento do ${t.label} difere do calculado`, nItem);
      }
      const v = num(tg, t.v);
      if (v !== undefined && !compraGov) {
        const calc = vBC * (rate / 100) - (vDif ?? 0) - (vDev ?? 0);
        if (!near(calc, v)) add(t.codes.val, path(tg, t.v), `Rejeição: Valor do ${t.label} difere do calculado`, nItem);
      }
      // Item values feed the totals below.
      const add2 = (k: string, x: number | undefined) => (sum[k] = (sum[k] ?? 0) + (x ?? 0));
      add2(`${t.grp}.vDif`, vDif);
      add2(`${t.grp}.vDevTrib`, vDev);
      add2(`${t.grp}.v`, v);
    }
    sum.vBC = (sum.vBC ?? 0) + vBC;
    sum.vIBS = (sum.vIBS ?? 0) + (num(g, "vIBS") ?? 0);

    // UB54a-10: vCredPres is deducted only when the cCredPres has indDeduzCredPres=1; an unknown cCredPres skips the check (1055 already fired).
    const vIBS = num(g, "vIBS");
    if (vIBS !== undefined && (!cp || credInfo) && !compraGov) {
      const deduct = credInfo?.deduz ? (num(cp, "gIBSCredPres/vCredPres") ?? 0) : 0;
      const calc = (num(g, "gIBSUF/vIBSUF") ?? 0) + (num(g, "gIBSMun/vIBSMun") ?? 0) - deduct;
      if (!near(calc, vIBS)) add("1150", path(g, "vIBS"), "Rejeição: Valor do IBS do Item (vIBS) difere do calculado", nItem);
    }
  }

  // B25-80 (NT 2026.008 version): debit/credit notes carry only IBS/CBS, except the listed cases.
  // Exceções 2 and 3 (tpNFDebito 06) come from NT 2025.002 v1.52; exceção 4 is the NB01 group.
  if (model55 && (finNFe === "5" || finNFe === "6" || tpOperGov === "2") && !["03", "04", "06"].includes(tpCred ?? "") && tpDeb !== "07") {
    const adv06 = tpDeb === "06";
    const found = dets.flatMap((d) =>
      ["ICMS", "ISSQN", "IPI", "II", "PIS", "PISST", "COFINS", "COFINSST", "ICMSUFDest", "impostoDevol"]
        .map((tag) => ({ tag, n: all(d, tag)[0], item: d.nItem }))
        .filter(({ tag, n }) =>
          n &&
          !(tag === "ICMS" && n.kids.every((k) => k.name === "ICMSPrevistoPagtoAntecip")) &&
          !(adv06 && tag === "IPI") &&
          !(adv06 && year === 2026 && ["PIS", "PISST", "COFINS", "COFINSST"].includes(tag))),
    )[0];
    if (found) add("1001", found.n, `Rejeição: NF-e com finalidade de débito ou crédito somente para IBS/CBS (${found.tag} informado no item ${found.item})`, undefined, NT008);
  }

  // W01a-10 / W01a-20 (NT 2026.008)
  const totalNode = kid(inf, "total");
  const liqTot = num(totalNode, "vProdLiqTot");
  if (anyLiq && liqTot === undefined) add("1282", totalNode, "Rejeição: Total Líquido não informado", undefined, NT008);
  if (liqTot !== undefined && cents(liqTot) !== sumLiq)
    add("1283", kid(totalNode, "vProdLiqTot"), `Rejeição: Total Líquido difere do somatório dos itens (informado ${liqTot.toFixed(2)}, soma dos itens ${(sumLiq / 100).toFixed(2)})`, undefined, NT008);

  // W34-10 / W34-20
  const tot = path(inf, "total/IBSCBSTot");
  if (tot && !anyItemIbsCbs) add("1118", tot, "Rejeição: Total de IBS e CBS informado indevidamente");
  if (!tot && anyItemIbsCbs) add("1119", kid(inf, "total"), "Rejeição: Total de IBS e CBS não informado");

  if (tot) {
    const checks: [string, string, number | undefined, string][] = [
      ["1076", "vBCIBSCBS", sum.vBC, "Total da BC do IBS e da CBS"],
      ["1077", "gIBS/gIBSUF/vDif", sum["gIBSUF.vDif"], "Total de Diferimento do IBS UF"],
      ["1078", "gIBS/gIBSUF/vDevTrib", sum["gIBSUF.vDevTrib"], "Total Devolvido do IBS UF"],
      ["1080", "gIBS/gIBSUF/vIBSUF", sum["gIBSUF.v"], "Total de IBS UF"],
      ["1081", "gIBS/gIBSMun/vDif", sum["gIBSMun.vDif"], "Total de Diferimento do IBS Municipal"],
      ["1082", "gIBS/gIBSMun/vDevTrib", sum["gIBSMun.vDevTrib"], "Total Devolvido do IBS Municipal"],
      ["1084", "gIBS/gIBSMun/vIBSMun", sum["gIBSMun.v"], "Total de IBS Municipal"],
      ["1085", "gIBS/vIBS", sum.vIBS, "Total do IBS"],
      ["1088", "gCBS/vDif", sum["gCBS.vDif"], "Total de Diferimento da CBS"],
      ["1089", "gCBS/vDevTrib", sum["gCBS.vDevTrib"], "Total Devolvido da CBS"],
      ["1091", "gCBS/vCBS", sum["gCBS.v"], "Total de CBS"],
      ["1086", "gIBS/vCredPres", sum.credIBS, "Total de Crédito Presumido do IBS UF"],
      ["1087", "gCBS/vCredPres", sum.credCBS, "Total de Crédito Presumido da CBS"],
    ];
    for (const [rule, p, expected, label] of checks) {
      const got = num(tot, p);
      // Totals are plain sums of the items, so no ±0.01 tolerance (W35..W56 do not grant one).
      if (got !== undefined && cents(got) !== cents(expected ?? 0)) {
        const diff = cents(got) - cents(expected ?? 0);
        // A few cents usually mean the total was computed on the whole and then spread over the items.
        const hint = Math.abs(diff) <= 5 ? "; diferença de centavos costuma vir de rateio: o total deve ser a soma exata dos itens" : "";
        add(rule, path(tot, p), `Rejeição: ${label} difere da soma dos itens (informado ${got.toFixed(2)}, soma dos itens ${(expected ?? 0).toFixed(2)}, diferença ${(diff / 100).toFixed(2)}${hint})`);
      }
    }
  }
  return issues;
}
