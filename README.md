# NF-e Preflight

Pré-teste de NF-e (modelo 55 e 65) com os campos do IBS/CBS, em um site. Recebe o XML e devolve a lista de problemas, com a linha de cada um, antes de você enviar à SEFAZ.

**O que confere**
1. **Estrutura:** schemas oficiais PL_010g v1.03 (Portal Nacional da NF-e), via `xmllint`.
2. **Regras de negócio do IBS/CBS:** NT 2025.002-RTC v1.52 e NT 2026.008 v1.00 (valor líquido do produto, ICMS previsto), com os códigos de rejeição oficiais. Cálculo de valores e alíquotas, totais, CST e `cClassTrib` (tabelas da IT 2025.002 v1.70), diferimento, redução, crédito presumido, ZFM/ALC e biocombustíveis.
3. **Chave de acesso:** campo `Id` contra os campos da nota (502) e dígito verificador (253), do MOC 7.0.

**O que não confere:** assinatura digital, certificado, situação do emitente e tudo o que a SEFAZ checa ao autorizar. É um pré-teste, não um substituto da SEFAZ. As regras de negócio só rodam quando a estrutura (XSD) passa.

## Rodar com Docker (mais rápido)

```sh
cp .env.example .env                # defina ADMIN_PASSWORD (a senha do painel)
docker compose up -d --build        # site em http://localhost:3210, painel em /admin
docker compose logs -f app
docker compose down                 # para (os dados ficam no volume nfe-data)
docker compose down -v              # para e APAGA os contadores de uso
```

A imagem já traz o Node 24 e o `xmllint`, roda sem root e guarda o banco SQLite no volume `/data`.

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
| `TRUST_PROXY` | Se definida, o limite por IP usa o primeiro IP de `X-Forwarded-For`. Só ative atrás de um proxy que sobrescreva esse cabeçalho. |

## Painel `/admin`

Para uma única pessoa (a senha vem de `ADMIN_PASSWORD`). Não aparece em buscadores. Mostra o uso do site: validações feitas na página (válidas e com erro) nos últimos 6 meses.

O login limita a 5 tentativas por minuto por IP e a sessão dura 12 horas. Reiniciar o servidor encerra a sessão.

## Validação

O site chama `POST /v1/try` com o XML cru no corpo. É um endereço interno da página, sem chave e sem suporte para uso por programa. Limitado por IP (5 por minuto, 300 por mês). Erros: 413 (XML acima de 2 MB), 429 (`rate_limited` ou `quota_exceeded`, com `Retry-After`) e 500 (`validator_failed`).

## Site público e SEO

`scripts/build-site.ts` gera em `site/` as páginas estáticas: a home com o validador, `/docs/` (guia de IBS/CBS), `/rejeicoes/` e uma página por código de rejeição (`/rejeicao/1069/`), `/privacidade/`, `sitemap.xml` e `robots.txt`. O texto das regras vem de `src/rejections.json`, extraído da NT 2025.002-RTC v1.52 e do MOC 7.0 (cada página cita a fonte). `npm start` e o Docker rodam a geração antes de subir.

Defina `SITE_URL` (endereço público, usado em canonical e sitemap) e, se quiser, `CONTACT_EMAIL` no `.env`. Cada página tem título, descrição, canonical e dados estruturados próprios. `/admin` e `/v1/` ficam fora dos buscadores (`robots.txt`).

## Web

A página em `/` valida um XML colado ou arrastado e marca as linhas com problema. Depois de validar, os botões **Baixar CSV** e **Baixar PDF** geram o relatório no próprio navegador (nada é enviado ao servidor). O CSV usa `;` e BOM para abrir direto no Excel em português.

## Doações e contadores

Não há venda nem pagamento no site. Com `DONATE_URL`, um aviso em todas as páginas leva ao Ko-fi, que mostra os acessos e as doações. O servidor conta, sem guardar IP, as validações feitas na página (válidas e com erro); o painel mostra os últimos 6 meses em "Uso do site".

## Limites conhecidos

- Os limites por IP e a sessão do admin ficam em memória (uma instância só). Os contadores de uso ficam no banco.
- Regras de alíquota fixa cobrem 2025 a 2028 (IBS) e 2025 a 2026 (CBS). Depois disso a NT remete a legislação ainda não publicada.
- Compra governamental: as regras de diferimento e redução são puladas nos itens com `gTribCompraGov`.
- Nota Fiscal Avulsa (séries 890-899) usa o CNPJ da SEFAZ na chave e seria acusada no 502.
- Regras que ainda não rejeitam em produção aparecem como **aviso de erro futuro**, com a data em que passam a valer (homologação e produção). Elas não tornam o XML inválido. Cada resposta traz as versões do schema e das NTs usadas, e cada problema das regras de negócio traz o caminho do campo (`NFe/infNFe/det[1]/...`). Erros do XSD não têm caminho, só a linha.
- Da NT 2026.008 ficaram de fora VB01-10/20 (`vItem`), que a NT marca como implementação futura.
- Regras que a própria NT marca como "implementação futura" (Imposto Seletivo, `vNFTot`, base de cálculo 1104) não estão implementadas.

## Atualizar as tabelas

`src/tables.json` é gerado a partir das planilhas em `docs/`:

```sh
python3 -I scripts/build-tables.py
```

Troque o xlsx, rode o script e confira os testes. As regras em `src/rules.ts` citam a regra de validação (RV) da NT e o código de rejeição de cada verificação.
