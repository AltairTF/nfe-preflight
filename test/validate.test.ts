import { test } from "node:test";
import assert from "node:assert/strict";
import { validateXsd } from "../src/xsd.ts";

test("reports missing required elements", async () => {
  const issues = await validateXsd('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00"/></NFe>');
  assert.ok(issues.some((i) => i.message.includes("'Id' is required")));
});

test("reports malformed XML instead of throwing", async () => {
  const issues = await validateXsd("<broken");
  assert.equal(issues.length, 1);
});
