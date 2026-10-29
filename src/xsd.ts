import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

// Official package from Portal Nacional da NF-e (published 26/10/2026).
const SCHEMA = fileURLToPath(new URL("../schemas/PL_010g_v1.03/nfe_v4.00.xsd", import.meta.url));

export interface Issue {
  rule: string;
  message: string;
  line?: number;
}

// xmllint prints one "file:LINE: element X: Schemas validity error : MESSAGE" per problem.
const LINE = /^-:(\d+): (?:parser error|element [^:]*: Schemas (?:validity|parser) error) ?: (.*)$/;

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
          if (m) issues.push({ rule: "XSD", line: Number(m[1]), message: m[2].trim() });
        }
        resolve(issues);
      },
    );
    child.stdin!.end(xml);
  });
}
