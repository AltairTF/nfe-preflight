# NF-e Preflight

Pré-teste de NF-e (modelo 55 e 65) com os campos do IBS/CBS. Recebe o XML e devolve a lista de problemas, com a linha de cada um, antes de você enviar à SEFAZ.

**O que confere**
1. **Estrutura:** schemas oficiais PL_010g v1.03 (Portal Nacional da NF-e), via `xmllint`.
2. **Regras de negócio do IBS/CBS:** NT 2025.002-RTC v1.52, com os códigos de rejeição oficiais. Cálculo de valores e alíquotas, totais, CST e `cClassTrib` (tabelas da IT 2025.002 v1.70), diferimento, redução, crédito presumido, ZFM/ALC e biocombustíveis.
3. **Chave de acesso:** campo `Id` contra os campos da nota (502) e dígito verificador (253), do MOC 7.0.

**O que não confere:** assinatura digital, certificado, situação do emitente e tudo o que a SEFAZ checa ao autorizar. É um pré-teste, não um substituto da SEFAZ. As regras de negócio só rodam quando a estrutura (XSD) passa.

## Rodar com Docker (mais rápido)

```sh
cp .env.example .env                # defina ADMIN_PASSWORD (a senha do painel)
docker compose up -d --build        # site em http://localhost:3210, painel em /admin
docker compose logs -f app
docker compose down                 # para (os dados ficam no volume nfe-data)
docker compose down -v              # para e APAGA clientes, chaves e uso
```

A imagem já traz o Node 24 e o `xmllint`, roda sem root e guarda o banco SQLite no volume `/data`. Sem clientes criados, a página web já funciona (usa `/v1/try`).

## Rodar sem Docker

Requisitos: Node 24 e `xmllint` (libxml2) no PATH. Sem dependências npm.

```sh
ADMIN_PASSWORD=sua-senha npm start   # porta 3000, banco em ./nfe-preflight.db
npm test
```

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel `/admin`. Sem ela o painel fica desligado (404). |
| `DB_FILE` | Arquivo do banco SQLite (padrão `nfe-preflight.db`). Precisa de disco persistente e de backup. |
| `PORT` | Porta (padrão 3000). |
| `DONATE_URL` | Na geração do site: link de doação (Ko-fi). Com ele aparece o banner em todas as páginas; vazio, nada aparece. |
| `TRUST_PROXY` | Se definida, o limite do `/v1/try` usa o primeiro IP de `X-Forwarded-For`. Só ative atrás de um proxy que sobrescreva esse cabeçalho. |

## Painel `/admin`

Para uma única pessoa (a senha vem de `ADMIN_PASSWORD`). Não aparece em buscadores. Nele você:
- cria clientes (nome, e-mail, mensalidade, limite por minuto, cota por mês, observações);
- gera chaves (mostradas uma única vez), **revoga e reativa** chaves e **suspende** o cliente inteiro, com efeito imediato, sem reiniciar;
- vê o uso do mês e dos 5 meses anteriores e a receita mensal prevista (soma das mensalidades dos clientes ativos);
- baixa o fechamento do mês em CSV (cliente, validações, válidas, inválidas, cota, mensalidade).

O login limita a 5 tentativas por minuto por IP e a sessão dura 12 horas. Reiniciar o servidor encerra a sessão.

## API

Envie o XML cru no corpo da requisição.

### `POST /v1/validate`  (com chave, cobrável)

```sh
curl -X POST https://SEU-HOST/v1/validate \
  -H "Authorization: Bearer nfp_SUACHAVE" \
  --data-binary @nota.xml
```

Também vale `x-api-key: nfp_SUACHAVE`. Resposta:

```json
{
  "valid": false,
  "issues": [
    { "rule": "1069", "line": 62, "message": "Rejeição: Valor da CBS difere do calculado [nItem: 1]" }
  ]
}
```

- `rule`: código de rejeição da SEFAZ (por exemplo `1069`), ou `XSD` para erro de estrutura.
- `line`: linha do XML. Pode faltar em regras que apontam para um grupo ausente.
- `valid` é `true` só quando `issues` está vazio.

### `GET /v1/usage`  (com chave)

```json
{ "client": "meu-cliente", "used": 42, "perMonth": 1000 }
```

### `POST /v1/try`  (sem chave)

Mesma resposta do `/v1/validate`, usado pela página web. Limitado por IP (5 por minuto, 300 por mês) e não entra na cobrança.

### Erros

| Status | `error` | Significado |
|---|---|---|
| 401 | `unauthorized` | Chave ausente ou inexistente |
| 403 | `access_revoked` | Chave revogada ou cliente suspenso |
| 413 | `payload_too_large` | XML acima de 2 MB |
| 429 | `rate_limited` | Limite por minuto. Veja o cabeçalho `Retry-After` (segundos). |
| 429 | `quota_exceeded` | Cota do mês esgotada. `Retry-After` aponta para o início do mês seguinte. |
| 429 | `fair_use_exceeded` | Total de chamadas do mês (válidas ou não) acima de 10 vezes a cota |
| 500 | `validator_failed` | Falha ao rodar o `xmllint` |

Só entra na cota e na cobrança a chamada de `/v1/validate` cujo XML volta **válido**. XML rejeitado é grátis (o cliente corrige e tenta de novo), mas conta para o teto de uso justo de 10 vezes a cota por mês. 401, 403 e 429 não contam. O limite por minuto vale para todas as chamadas.

## Site público e SEO

`scripts/build-site.ts` gera em `site/` as páginas estáticas: a home com o validador, `/docs/` (API e guia de IBS/CBS), `/rejeicoes/` e uma página por código de rejeição (`/rejeicao/1069/`), `/privacidade/`, `sitemap.xml` e `robots.txt`. O texto das regras vem de `src/rejections.json`, extraído da NT 2025.002-RTC v1.52 e do MOC 7.0 (cada página cita a fonte). `npm start` e o Docker rodam a geração antes de subir.

Defina `SITE_URL` (endereço público, usado em canonical e sitemap) e, se quiser, `CONTACT_EMAIL` no `.env`. Cada página tem título, descrição, canonical e dados estruturados próprios. `/admin` e `/v1/` ficam fora dos buscadores (`robots.txt`).

## Web

A página em `/` valida um XML colado ou arrastado e marca as linhas com problema. Depois de validar, os botões **Baixar CSV** e **Baixar PDF** geram o relatório no próprio navegador (nada é enviado ao servidor). O CSV usa `;` e BOM para abrir direto no Excel em português. Sem chave usa `/v1/try`. Quem tem chave pode informá-la na própria página. Ela fica só no navegador.

## Doações e contadores

Não há venda nem pagamento no site. Com `DONATE_URL`, um aviso em todas as páginas leva ao Ko-fi, que mostra os acessos e as doações. O servidor conta, sem guardar IP, as validações feitas na página (válidas e com erro); o painel mostra os últimos 6 meses em "Uso do site".

## Cobrança de clientes com chave (por enquanto)

Cada `/v1/validate` que chega a validar grava uma linha na tabela `usage` do banco, com a marca de válido ou não; só as válidas são cobradas. O mês de cobrança segue o horário de Brasília. A mensalidade e a cota de cada cliente são definidas por você no painel, e o fechamento mensal sai em CSV. Não há integração com meio de pagamento: a cobrança é feita por fora.

## Limites conhecidos

- O limite por minuto, o limite do `/v1/try` e a sessão do admin ficam em memória (uma instância só). O uso mensal dos clientes fica no banco.
- Regras de alíquota fixa cobrem 2025 a 2028 (IBS) e 2025 a 2026 (CBS). Depois disso a NT remete a legislação ainda não publicada.
- Compra governamental: as regras de diferimento e redução são puladas nos itens com `gTribCompraGov`.
- Nota Fiscal Avulsa (séries 890-899) usa o CNPJ da SEFAZ na chave e seria acusada no 502.
- Regras que a própria NT marca como "implementação futura" (Imposto Seletivo, `vNFTot`, base de cálculo 1104) não estão implementadas.

## Atualizar as tabelas

`src/tables.json` é gerado a partir das planilhas em `docs/`:

```sh
python3 -I scripts/build-tables.py
```

Troque o xlsx, rode o script e confira os testes. As regras em `src/rules.ts` citam a regra de validação (RV) da NT e o código de rejeição de cada verificação.
