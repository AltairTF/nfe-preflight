import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

// Official package from Portal Nacional da NF-e (published 26/10/2026).
const SCHEMA = fileURLToPath(new URL("../schemas/PL_010g_v1.03/nfe_v4.00.xsd", import.meta.url));

export interface Issue {
  rule: string;
  message: string;
  line?: number;
  // Path of the failing element, e.g. NFe/infNFe/det[1]/imposto/IBSCBS/gIBSCBS/vIBS (business rules only; xmllint gives no path).
  path?: string;
  // Set only when the rule does not reject in production yet; says when it will. Such issues do not make the document invalid.
  vigencia?: string;
}

// xmllint prints one "file:LINE: element X: Schemas validity error : MESSAGE" per problem.
const LINE = /^-:(\d+): (?:parser error|element [^:]*: Schemas (?:validity|parser) error) ?: (.*)$/;

const list = (s: string) => s.replace(/\{http[^}]*\}/g, "").replace(/\s+/g, " ").trim();

const DIGIT = "dígito(s)";
const CLASS: Record<string, string> = {
  "[0-9]": DIGIT, "\\d": DIGIT, "[0-9A-Z]": "letra(s) maiúscula(s) ou dígito(s)", "[A-Z0-9]": "letra(s) maiúscula(s) ou dígito(s)",
  "[A-Z]": "letra(s) maiúscula(s)", "[!-ÿ]": "caractere(s) sem espaço", "[ -ÿ]": "caractere(s)",
};
const ATOM = /(\[[^\]]*\]|\\.|\([^)]*\)|[^|()[\]\\{}?+*])(?:\{(\d+)(?:(,)(\d*))?\}|([?+*]))?/g;

function describeClass(c: string): string | undefined {
  if (CLASS[c]) return CLASS[c];
  const range = /^\[(.)-(.)\]$/.exec(c);
  if (range) return range[1] === "0" && range[2] === "9" ? DIGIT : `${/\d/.test(range[1]) ? DIGIT : "caractere(s)"} de ${range[1]} a ${range[2]}`;
  if (/^\[[^\]-]*\]$/.test(c)) return `um de ${[...c.slice(1, -1)].filter((x) => x !== ",").join(", ")}`;
}

// Describes a sequence like "[0-9A-Z]{12}[0-9]{2}" as "12 letra(s) maiúscula(s) ou dígito(s) + 2 dígito(s)".
function describeSeq(seq: string): string {
  const parts: string[] = [];
  let lit = "";
  const flush = () => lit && (parts.push(`"${lit}"`), (lit = ""));
  for (const [, atom, n, comma, m, q] of seq.matchAll(ATOM)) {
    if (!n && !q && atom.length <= 2 && !atom.startsWith("[") && !atom.startsWith("(") && atom !== "\\d") {
      lit += atom.replace(/^\\/, "");
      continue;
    }
    flush();
    const name = atom.startsWith("(") ? describeSeq(atom.slice(1, -1)) : describeClass(atom);
    if (!name) throw new Error("unknown atom");
    if (atom.startsWith("(")) parts.push(q === "?" ? `(opcional: ${name})` : `(${name})`);
    else if (n === "0" && !comma) parts.push("vazio");
    else if (q === "+") parts.push(`1 ou mais ${name}`);
    else if (q === "*") parts.push(`${name} (qualquer quantidade)`);
    else if (q === "?") parts.push(`(opcional: ${name})`);
    else if (comma && m === "") parts.push(`${n} ou mais ${name}`);
    else if (comma) parts.push(n === "0" ? `até ${m} ${name}` : `de ${n} a ${m} ${name}`);
    else parts.push(name.startsWith("um de") ? name : `${n ?? 1} ${name}`);
  }
  flush();
  return parts.join(" + ");
}

// Decimal shape used all over the schema: 0|0\.[0-9]{2}|[1-9]{1}[0-9]{0,12}(\.[0-9]{2})?
const DECIMAL = /^0\|0\\\.\[0-9\]\{(\d+)(?:,(\d+))?\}\|\[1-9\]\{1\}\[0-9\]\{0,(\d+)\}(?:\|\[1-9\]\{1\}\[0-9\]\{0,\d+\})?\(\\\.\[0-9\]\{(\d+)(?:,(\d+))?\}\)\?$/;

export function describePattern(pattern: string): string {
  const d = DECIMAL.exec(pattern);
  if (d) {
    const dec = d[5] ? `de ${d[4]} a ${d[5]}` : d[4];
    return `número decimal com ponto, até ${Number(d[3]) + 1} dígito(s) inteiro(s) e ${dec} casa(s) decimal(is) (ex.: 100.${"0".repeat(Number(d[5] ?? d[4]))})`;
  }
  try {
    return pattern.split("|").map(describeSeq).join(" ou ");
  } catch {
    return pattern; // shortcut: exotic regex stays raw, add to describeClass when one shows up.
  }
}

// Turns libxml2's English diagnostics into plain Portuguese; anything unrecognised is kept as is (minus namespaces).
// shortcut: covers the common libxml2 shapes only, add a case when a new one shows up in the wild.
export function friendlyXsd(raw: string): string {
  const m = list(raw);
  let r: RegExpExecArray | null;
  if ((r = /^Element '(\S+)': \[facet 'enumeration'\] The value '(.*)' is not an element of the set \{(.*)\}\.$/.exec(m)))
    return `<${r[1]}>: o valor '${r[2]}' não é permitido. Valores aceitos: ${r[3]}.`;
  if ((r = /^Element '(\S+)': \[facet 'pattern'\] The value '(.*)' is not accepted by the pattern '(.*)'\.$/.exec(m)))
    return `<${r[1]}>: o valor '${r[2]}' tem formato inválido. Esperado: ${describePattern(r[3])}.`;
  if ((r = /^Element '(\S+)': \[facet '(max|min)Length'\] The value (?:'.*' )?has a length of '(\d+)'; this (?:exceeds|underruns) the allowed (?:maximum|minimum) length of '(\d+)'\.$/.exec(m)))
    return `<${r[1]}>: o valor tem ${r[3]} caractere(s); ${r[2] === "max" ? "o máximo" : "o mínimo"} permitido é ${r[4]}.`;
  if ((r = /^Element '(\S+)': This element is not expected\. Expected is (?:one of )?\( (.*) \)\.$/.exec(m)))
    return `<${r[1]}> está fora do lugar ou há um campo obrigatório faltando antes dele. Esperado aqui: ${r[2]}.`;
  if ((r = /^Element '(\S+)': Missing child element\(s\)\. Expected is (?:one of )?\( (.*) \)\.$/.exec(m)))
    return `<${r[1]}> está incompleto: falta o campo ${r[2]}.`;
  if ((r = /^Element '(\S+)': The attribute '(\S+)' is required but missing\.$/.exec(m)))
    return `<${r[1]}>: o atributo '${r[2]}' é obrigatório e não foi informado.`;
  if ((r = /^Element '(\S+)': '(.*)' is not a valid value of the atomic type '(\S+)'\.$/.exec(m)))
    return `<${r[1]}>: o valor '${r[2]}' é inválido.`;
  if ((r = /^Element '(\S+)': No matching global declaration available for the validation root\.$/.exec(m)))
    return `<${r[1]}> não é um elemento raiz de NF-e válido.`;
  return m;
}

// shortcut: shells out to xmllint (libxml2), so the host image must have it; swap for a WASM validator if that stops being true.
export function validateXsd(xml: string): Promise<Issue[]> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "xmllint",
      ["--noout", "--nonet", "--schema", SCHEMA, "-"],
      { timeout: 10_000, maxBuffer: 1 << 20 },
      (err, _stdout, stderr) => {
        // xmllint exits non-zero on invalid input; only a failure with no diagnostics is a real error.
        if (err && !stderr) return reject(err);
        const issues: Issue[] = [];
        for (const raw of stderr.split("\n")) {
          const m = LINE.exec(raw);
          if (m) issues.push({ rule: "XSD", line: Number(m[1]), message: friendlyXsd(m[2]) });
        }
        resolve(issues);
      },
    );
    child.stdin!.end(xml);
  });
}
