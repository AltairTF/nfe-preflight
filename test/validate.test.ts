import { test } from "node:test";
import assert from "node:assert/strict";
import { validateXsd } from "../src/xsd.ts";

test("reports missing required elements", async () => {
  const issues = await validateXsd('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00"/></NFe>');
  assert.ok(issues.some((i) => i.message.includes("atributo 'Id' é obrigatório")));
});

test("reports malformed XML instead of throwing", async () => {
  const issues = await validateXsd("<broken");
  assert.equal(issues.length, 1);
});

test("translates facet errors to Portuguese", async () => {
  const xml = (await import("node:fs")).readFileSync(new URL("./fixtures/invalid.xml", import.meta.url), "utf8");
  const msgs = (await validateXsd(xml)).map((i) => i.message);
  assert.ok(msgs.includes("<mod>: o valor '99' não é permitido. Valores aceitos: '55', '65'."), msgs.join("\n"));
  assert.ok(msgs.some((m) => m.startsWith("<enderEmit> está fora do lugar") && m.includes("xNome")), msgs.join("\n"));
  assert.ok(msgs.every((m) => !m.includes("portalfiscal")), msgs.join("\n"));
});

test("describes schema patterns in Portuguese", async () => {
  const { describePattern } = await import("../src/xsd.ts");
  assert.equal(describePattern("[0-9A-Z]{12}[0-9]{2}"), "12 letra(s) maiúscula(s) ou dígito(s) + 2 dígito(s)");
  assert.match(describePattern("0|0\\.[0-9]{2}|[1-9]{1}[0-9]{0,12}(\\.[0-9]{2})?"), /^número decimal.*2 casa\(s\).*100\.00/);
  assert.equal(describePattern("ISENTO|[0-9]{2,14}"), '"ISENTO" ou de 2 a 14 dígito(s)');
});

test("translates length facet errors", async () => {
  const { friendlyXsd } = await import("../src/xsd.ts");
  assert.equal(
    friendlyXsd("Element '{http://www.portalfiscal.inf.br/nfe}xNome': [facet 'minLength'] The value has a length of '1'; this underruns the allowed minimum length of '2'."),
    "<xNome>: o valor tem 1 caractere(s); o mínimo permitido é 2.",
  );
});

test("invalid-rules fixture passes the XSD but trips business rules", async () => {
  const { validateRules } = await import("../src/rules.ts");
  const xml = (await import("node:fs")).readFileSync(new URL("./fixtures/invalid-rules.xml", import.meta.url), "utf8");
  assert.deepEqual(await validateXsd(xml), []);
  assert.deepEqual(validateRules(xml).map((i) => i.rule), ["502", "1023", "1021", "1085"]);
});
