// Builds the public static pages into site/ (home, docs, one page per rejection code, sitemap, robots).
// Usage: SITE_URL=https://example.com node scripts/build-site.ts [outDir]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rejections from "../src/rejections.json" with { type: "json" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
type Rej = { message: string; entries: { rv: string; model: string; src: string; rule: string }[] };
const REJ = rejections as Record<string, Rej>;
const codes = Object.keys(REJ).sort((a, b) => Number(a) - Number(b));
const plain = (m: string) => m.replace(/^Rejeição:\s*/, "").replace(/\s*\[nItem: N\]/, "");

// `donateUrl` (e.g. a Ko-fi link) turns on the donation banner; empty means no banner.
export function buildSite(outDir: string, siteUrl: string, contact = "", donateUrl = "") {
  if (donateUrl && !/^https?:\/\//.test(donateUrl)) throw new Error("DONATE_URL must start with http:// or https://");
  const base = siteUrl.replace(/\/$/, "");
  const day = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];
  rmSync(outDir, { recursive: true, force: true });

  const page = (path: string, o: { title: string; description: string; body: string; jsonld?: object; index?: boolean }) => {
    urls.push(path);
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${base}${path}">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="NF-e Preflight">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}"><meta property="og:url" content="${base}${path}">
<link rel="stylesheet" href="/app.css">
${o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<main>
<p class="nav"><a href="/">Validar XML</a> | <a href="/docs/">Documentação</a> | <a href="/rejeicoes/">Rejeições</a> | <a href="/docs/api/">API</a></p>
${o.body}
${donateUrl ? `<p class="donate">Este validador é grátis e mantido por uma pessoa só. Se ele te ajudou, <a href="${esc(donateUrl)}" target="_blank" rel="noopener noreferrer">ajude a pagar o servidor</a>.</p>` : ""}
<footer>
<p>Pré-teste: confere a estrutura (schema oficial PL_010g) e as regras de negócio do IBS/CBS da NT 2025.002. Não verifica a assinatura digital nem o que a SEFAZ checa ao autorizar a nota, então não substitui a SEFAZ.</p>
<p><a href="/privacidade/">Privacidade</a> | <a href="/docs/">Documentação</a>${contact ? ` | <a href="mailto:${esc(contact)}">${esc(contact)}</a>` : ""}</p>
</footer>
</main>
${path === "/" ? '<script src="/app.js"></script>' : ""}
</body>
</html>
`;
    const file = join(outDir, path === "/" ? "index.html" : join(path, "index.html"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  };

  // ---- Home: the validator itself ----
  page("/", {
    title: "Validador de NF-e com IBS/CBS online e grátis | NF-e Preflight",
    description: "Valide o XML da sua NF-e com as regras de IBS e CBS da NT 2025.002 antes de enviar à SEFAZ. Mostra a linha de cada erro e o código de rejeição.",
    jsonld: {
      "@context": "https://schema.org", "@type": "WebApplication", name: "NF-e Preflight", url: `${base}/`, inLanguage: "pt-BR",
      applicationCategory: "BusinessApplication", operatingSystem: "Qualquer navegador",
      description: "Validador de XML de NF-e com as regras de IBS e CBS da Reforma Tributária.",
    },
    body: `<header>
<h1>Validador de NF-e com IBS e CBS</h1>
<p>Valide o XML da sua NF-e, incluindo as regras de IBS/CBS, antes de enviar à SEFAZ.</p>
</header>

<section class="card" aria-labelledby="in">
<h2 id="in">1. Envie o XML</h2>
<label class="drop" id="drop">
<input type="file" id="file" accept=".xml,text/xml,application/xml">
<span><strong>Escolha um arquivo</strong> ou arraste o XML aqui</span>
</label>
<label for="xml" class="sub">ou cole o conteúdo</label>
<textarea id="xml" rows="8" spellcheck="false" placeholder="&lt;NFe xmlns=&quot;http://www.portalfiscal.inf.br/nfe&quot;&gt;…"></textarea>
<div class="row">
<button id="go" type="button">Validar</button>
<button id="clear" type="button" class="ghost">Limpar</button>
</div>
<details>
<summary>Tenho uma chave de API</summary>
<label for="key" class="sub">Chave (fica só neste navegador)</label>
<input id="key" type="password" autocomplete="off" placeholder="nfp_…">
</details>
<p class="note">O XML é validado e não é armazenado. Sem chave, o uso é limitado por IP.</p>
</section>

<section class="card" id="result" aria-live="polite" hidden>
<h2>2. Resultado</h2>
<p id="summary" class="summary"></p>
<div class="row" id="report" hidden>
<button id="csv" type="button" class="ghost">Baixar CSV</button>
<button id="pdf" type="button" class="ghost">Baixar PDF</button>
</div>
<ol id="issues"></ol>
<h3 id="codeTitle" hidden>XML</h3>
<div id="code" class="code" hidden></div>
</section>

<section>
<h2>O que é conferido</h2>
<ul>
<li><strong>Estrutura:</strong> o XML contra os schemas oficiais do Portal Nacional da NF-e (pacote PL_010g).</li>
<li><strong>Regras do IBS e da CBS:</strong> alíquotas, cálculo de valores e totais, CST e cClassTrib, diferimento, redução, crédito presumido, ZFM e ALC, conforme a NT 2025.002-RTC.</li>
<li><strong>Chave de acesso:</strong> composição e dígito verificador.</li>
</ul>
<p>Cada problema aparece com a linha do XML e o código de rejeição da SEFAZ. Veja a lista em <a href="/rejeicoes/">Rejeições da NF-e (${codes.length} códigos)</a> e como usar por programa em <a href="/docs/api/">API</a>.</p>
</section>`,
  });

  // ---- Docs ----
  page("/docs/", {
    title: "Documentação | NF-e Preflight",
    description: "Como usar o NF-e Preflight, guia das regras de IBS/CBS na NF-e e lista de códigos de rejeição com o texto oficial da NT 2025.002.",
    body: `<h1>Documentação</h1>
<ul>
<li><a href="/docs/api/"><strong>API</strong></a>: validar XML por programa, com chave.</li>
<li><a href="/docs/ibs-cbs/"><strong>IBS e CBS na NF-e</strong></a>: o que muda no XML e o que o validador confere.</li>
<li><a href="/rejeicoes/"><strong>Rejeições</strong></a>: ${codes.length} códigos com o texto oficial da regra.</li>
</ul>
<h2>Fontes oficiais</h2>
<ul>
<li><a href="https://www.nfe.fazenda.gov.br/" target="_blank" rel="noopener noreferrer">Portal Nacional da NF-e</a></li>
<li><a href="https://dfe-portal.svrs.rs.gov.br/Nfe/Documentos" target="_blank" rel="noopener noreferrer">Portal SVRS: documentos da NF-e</a> (notas técnicas e tabelas)</li>
</ul>
<p>Este site resume e cita os documentos oficiais. Em caso de divergência vale o documento da SEFAZ.</p>`,
  });

  page("/docs/api/", {
    title: "API de validação de NF-e | NF-e Preflight",
    description: "Envie o XML da NF-e por HTTP e receba a lista de problemas com linha e código de rejeição. Exemplo com curl, formato da resposta e erros.",
    body: `<h1>API de validação</h1>
<p>Envie o XML cru no corpo da requisição e receba os problemas encontrados.</p>
<h2>POST /v1/validate</h2>
<pre class="pre">curl -X POST ${esc(base)}/v1/validate \\
  -H "Authorization: Bearer nfp_SUACHAVE" \\
  --data-binary @nota.xml</pre>
<p>Também vale o cabeçalho <code>x-api-key: nfp_SUACHAVE</code>. Resposta:</p>
<pre class="pre">{
  "valid": false,
  "issues": [
    { "rule": "1069", "line": 62, "message": "Rejeição: Valor da CBS difere do calculado [nItem: 1]" }
  ]
}</pre>
<ul>
<li><code>rule</code>: código de rejeição da SEFAZ (veja a <a href="/rejeicoes/">lista</a>) ou <code>XSD</code> para erro de estrutura.</li>
<li><code>line</code>: linha do XML. Pode faltar quando a regra aponta para um grupo ausente.</li>
<li><code>valid</code> é <code>true</code> só quando <code>issues</code> está vazio.</li>
<li>As regras de negócio só rodam quando a estrutura (XSD) passa.</li>
</ul>
<h2>GET /v1/usage</h2>
<p>Mostra o consumo do mês: <code>{ "client": "...", "used": 42, "perMonth": 1000 }</code>.</p>
<h2>Cobrança</h2>
<p>Só validações cujo XML volta <strong>válido</strong> contam na cota do mês. XML rejeitado não é cobrado, para você poder corrigir e tentar de novo. Há um teto de uso justo para o total de chamadas.</p>
<h2>Erros</h2>
<table>
<tr><th>Status</th><th><code>error</code></th><th>Significado</th></tr>
<tr><td>401</td><td>unauthorized</td><td>Chave ausente ou inexistente</td></tr>
<tr><td>403</td><td>access_revoked</td><td>Chave revogada ou cliente suspenso</td></tr>
<tr><td>413</td><td>payload_too_large</td><td>XML acima de 2 MB</td></tr>
<tr><td>429</td><td>rate_limited</td><td>Limite por minuto; veja o cabeçalho <code>Retry-After</code> (segundos)</td></tr>
<tr><td>429</td><td>quota_exceeded</td><td>Cota do mês esgotada</td></tr>
<tr><td>429</td><td>fair_use_exceeded</td><td>Total de chamadas do mês acima do teto de uso justo</td></tr>
<tr><td>500</td><td>validator_failed</td><td>Falha ao validar</td></tr>
</table>`,
  });

  page("/docs/ibs-cbs/", {
    title: "IBS e CBS na NF-e: o que muda no XML e como validar | NF-e Preflight",
    description: "Grupos IBSCBS e IBSCBSTot da NF-e, alíquotas de transição, cronograma da regra 1115 e fórmulas de validação segundo a NT 2025.002-RTC v1.52.",
    body: `<h1>IBS e CBS na NF-e</h1>
<p>Resumo das regras de validação da Nota Técnica 2025.002-RTC (versão 1.52, setembro de 2026) e das tabelas da IT 2025.002 v.1.70. Confira sempre o documento oficial.</p>

<h2>O que muda no XML</h2>
<ul>
<li>Em cada item (<code>det/imposto</code>) entra o grupo <code>IBSCBS</code> com o <code>CST</code>, o <code>cClassTrib</code> e, conforme o CST, o grupo <code>gIBSCBS</code> com a base (<code>vBC</code>) e os blocos <code>gIBSUF</code>, <code>gIBSMun</code> e <code>gCBS</code>.</li>
<li>No total da nota entra <code>total/IBSCBSTot</code>, com a soma dos itens.</li>
<li>O CST define quais grupos são obrigatórios ou proibidos (diferimento, redução de alíquota, transferência de crédito, monofásico). A tabela oficial traz esses indicadores.</li>
</ul>

<h2>Alíquotas de transição conforme a NT</h2>
<table>
<tr><th>Ano de emissão</th><th>IBS (UF)</th><th>IBS (município)</th><th>CBS</th></tr>
<tr><td>2025 e 2026</td><td class="n">0,1%</td><td class="n">0%</td><td class="n">0,9%</td></tr>
<tr><td>2027 e 2028</td><td class="n">0,05%</td><td class="n">0,05%</td><td>aguarda legislação</td></tr>
<tr><td>2029 em diante</td><td colspan="3">alíquota de referência a ser publicada</td></tr>
</table>
<p>Se o <code>cClassTrib</code> indica tributação regular, a alíquota deve ser zero. Há exceções para notas de crédito, devolução e áreas incentivadas (ZFM e ALC). Rejeições: <a href="/rejeicao/1026/">1026</a>, <a href="/rejeicao/1036/">1036</a> e <a href="/rejeicao/1037/">1037</a>.</p>

<h2>Quando o grupo IBSCBS passa a ser exigido</h2>
<p>A regra <a href="/rejeicao/1115/">1115</a> rejeita item sem o grupo <code>IBSCBS</code>. Segundo o cronograma da NT (versão 1.51): para emitente do Regime Normal (CRT 3), a partir de 03/08/2026; para o Simples Nacional (CRT 1, 2 e 4), a partir de 04/01/2027. A própria NT traz observações divergentes sobre a data em produção, então <strong>confirme no Portal Nacional</strong> antes de depender dela.</p>

<h2>Como os valores são conferidos</h2>
<ul>
<li>IBS da UF: <code>vIBSUF = vBC × (pIBSUF/100) − vDif − vDevTrib</code> (<a href="/rejeicao/1041/">1041</a>). O IBS municipal e a CBS seguem a mesma conta (<a href="/rejeicao/1052/">1052</a> e <a href="/rejeicao/1069/">1069</a>).</li>
<li>Com redução de alíquota, usa-se a alíquota efetiva: <code>pAliqEfet = alíquota × (1 − pRedAliq/100)</code>, com 4 casas decimais.</li>
<li>Tolerância de R$ 0,01 a mais ou a menos nos valores calculados.</li>
<li>Os totais de <code>IBSCBSTot</code> são a soma dos itens (<a href="/rejeicao/1076/">1076</a> a <a href="/rejeicao/1091/">1091</a>).</li>
</ul>

<h2>Chave de acesso</h2>
<p>O <code>Id</code> deve ser a concatenação de UF, ano e mês, CNPJ, modelo, série, número, tipo de emissão, código numérico e DV (<a href="/rejeicao/502/">502</a>), e o DV deve bater no módulo 11 (<a href="/rejeicao/253/">253</a>).</p>`,
  });

  // ---- Rejections ----
  page("/rejeicoes/", {
    title: "Códigos de rejeição da NF-e com IBS/CBS (NT 2025.002) | NF-e Preflight",
    description: `Lista de ${codes.length} códigos de rejeição da NF-e relacionados a IBS, CBS e chave de acesso, com o texto oficial de cada regra de validação.`,
    body: `<h1>Rejeições da NF-e (IBS, CBS e chave de acesso)</h1>
<p>Códigos que o NF-e Preflight verifica, com a mensagem oficial. Clique para ver a regra de validação como está na NT 2025.002-RTC v1.52 e no MOC 7.0.</p>
<table>
<tr><th>Código</th><th>Mensagem</th></tr>
${codes.map((c) => `<tr><td><a href="/rejeicao/${c}/">${c}</a></td><td>${esc(plain(REJ[c].message))}</td></tr>`).join("\n")}
</table>`,
  });

  for (const c of codes) {
    const r = REJ[c];
    const msg = plain(r.message);
    page(`/rejeicao/${c}/`, {
      title: `Rejeição ${c} NF-e: ${msg} | NF-e Preflight`,
      description: `Rejeição ${c} da NF-e: ${msg}. Veja a regra de validação oficial da ${r.entries[0].src} e valide seu XML.`.slice(0, 300),
      jsonld: {
        "@context": "https://schema.org", "@type": "TechArticle", headline: `Rejeição ${c} da NF-e: ${msg}`, inLanguage: "pt-BR",
        dateModified: day, mainEntityOfPage: `${base}/rejeicao/${c}/`,
      },
      body: `<p class="nav"><a href="/rejeicoes/">&larr; Todas as rejeições</a></p>
<h1>Rejeição ${c}: ${esc(msg)}</h1>
<p>Mensagem oficial: <strong>${esc(r.message)}</strong></p>
<h2>Regra de validação${r.entries.length > 1 ? " (há mais de uma regra com este código)" : ""}</h2>
${r.entries.map((e) => `<h3>${esc(e.rv)} <span class="note">modelo ${esc(e.model)}</span></h3>
<blockquote>${esc(e.rule)}</blockquote>
<p class="note">Fonte: ${esc(e.src)}.</p>`).join("\n")}
<p><a href="/">Valide seu XML agora</a>: o NF-e Preflight aponta a linha onde essa regra falha. Veja também o <a href="/docs/ibs-cbs/">guia de IBS e CBS na NF-e</a>.</p>
<p class="note">Texto da regra reproduzido do documento oficial. Em caso de divergência vale o documento da SEFAZ, disponível no <a href="https://dfe-portal.svrs.rs.gov.br/Nfe/Documentos" target="_blank" rel="noopener noreferrer">Portal SVRS</a>.</p>`,
    });
  }

  page("/privacidade/", {
    title: "Privacidade | NF-e Preflight",
    description: "Como o NF-e Preflight trata o XML enviado e os dados de uso.",
    body: `<h1>Privacidade</h1>
<h2>O XML que você envia</h2>
<p>O XML é lido na memória do servidor, validado e descartado. Ele não é gravado em banco, em arquivo nem em registro de acesso.</p>
<h2>O que é guardado</h2>
<ul>
<li><strong>Clientes com chave de API:</strong> nome, e-mail, plano, o resumo irreversível da chave e, para cada validação, a data e hora e se o XML estava válido. Isso serve para controlar a cota e a cobrança.</li>
<li><strong>Uso sem chave:</strong> o endereço IP é usado só para limitar o número de tentativas e fica na memória do servidor, sem ser gravado.</li>
<li><strong>No seu navegador:</strong> se você informar uma chave de API na página, ela fica somente no seu navegador (armazenamento local). O site não usa cookies de rastreamento nem ferramentas de análise de terceiros.</li>
<li><strong>Contadores anônimos:</strong> o servidor soma quantas validações foram feitas na página, sem guardar IP nem qualquer identificador.</li>
</ul>
<h2>Relatórios</h2>
<p>Os arquivos CSV e PDF são gerados no seu navegador e não passam pelo servidor.</p>`,
  });

  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /v1/\n\nSitemap: ${base}/sitemap.xml\n`);
  writeFileSync(join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${base}${u}</loc><lastmod>${day}</lastmod></url>`).join("\n")}\n</urlset>\n`);
  return urls.length;
}

if (import.meta.main) {
  const out = process.argv[2] ?? fileURLToPath(new URL("../site/", import.meta.url));
  const n = buildSite(out, process.env.SITE_URL ?? "http://localhost:3000", process.env.CONTACT_EMAIL, process.env.DONATE_URL);
  console.log(`${n} pages in ${out}`);
}
