# Divulgação do NF Preflight - canais e riscos (pesquisa 2026-10-29)

Limites da pesquisa: Reddit e pt.stackoverflow.com bloqueiam o fetch (regras não lidas). Facebook/WhatsApp/LinkedIn exigem login. Nenhum grupo de Facebook, Telegram ou WhatsApp sobre NF-e foi encontrado e verificado; nenhum subreddit de contabilidade foi confirmado. Nada abaixo foi inventado: o que não foi lido está marcado "não verificado".

## Recomendação: 5 canais para começar (nesta ordem)

1. **Fórum Projeto ACBr** (ACBrNFe 137,5k posts, ACBrDFe 105,4k, Legislação Fiscal 6,2k; 142,8k membros). É o público exato: devs com rejeição de NF-e. Responder tópicos de rejeição com a explicação e o link para a página do código. A regra 2.1 manda propaganda para "Classificados", então nada de post de lançamento fora dela. Faça um post na seção Classificados e responda dúvidas de forma útil, com o link como complemento.
2. **TabNews** - post com "Pitch" no início do título, mais um artigo técnico (como validar IBS/CBS da NT 2025.002, por que cada rejeição acontece). Regra permitida desde que acrescente valor; só post comercial é proibido.
3. **Show HN (Hacker News)** - ferramenta que se testa sem cadastro (a regra pede isso). Alcance internacional, pouco público fiscal; o ganho é backlink e tráfego de curiosos de dev.
4. **GitHub: issues e discussões do sped-nfe / ACBr** - só responder quando o link resolver a dúvida de alguém (ver risco abaixo). O sped-nfe manda dúvidas para o Google Group NFePHP.
5. **r/brdev** (~310 mil membros segundo GummySearch, tag "projetos"). Regras não lidas, e há relatos de remoções por autopromoção. Só postar depois de ler a barra lateral, como relato técnico e com a autoria declarada.

## Tabela

| Canal | URL | Tamanho / atividade | Autopromoção | Melhor ângulo |
|---|---|---|---|---|
| Fórum Projeto ACBr | https://www.projetoacbr.com.br/forum/ | 142,8k membros, 617k posts; ACBrNFe 137,5k posts | Parcial. Regra 2.1: "qualquer propaganda ou requisição de produtos e serviços deve ser postada lá [Classificados]"; spam gera remoção e ban sem aviso; links tidos como spam são removidos. Links em respostas úteis: regra não diz | Responder rejeições com link; 1 post em Classificados |
| TabNews | https://www.tabnews.com.br | Comunidade dev brasileira ativa | Permitida com "Pitch" no título. FAQ: "você deve colocar `Pitch` no título"; "Publicações com foco exclusivo comercial são expressamente proibidas." Reposta/apagar e republicar = risco de ban (via relatos de moderadores) | Artigo técnico sobre IBS/CBS + pitch |
| Hacker News (Show HN) | https://news.ycombinator.com/showhn.html | Global | Permitida se for algo testável: "make it easy for users to try your thing out, ideally without barriers such as signups"; "Don't post landing pages" | "Show HN: validador de NF-e brasileira com regras IBS/CBS e API grátis" |
| GitHub nfephp-org/sped-nfe | https://github.com/nfephp-org/sped-nfe | ~1,6k stars, 652 forks, 8 issues abertas | README: "Para tirar suas duvidas não inicie uma ISSUE"; CONTRIBUTING.md não lido. Risco alto de spam em issues | Só comentar quando o link resolve; melhor tentar um link em README/docs de projetos próprios |
| NFePHP Google Group | https://groups.google.com/group/nfephp | Atividade não verificada | Não verificado | Responder dúvidas de rejeição |
| r/brdev | https://www.reddit.com/r/brdev/ | ~310k (GummySearch); flair "projetos" | Não verificado (Reddit bloqueado). Relatos no TabNews de remoções por autopromoção | Relato técnico, autoria declarada |
| r/devBR, r/programacao, r/devpt | gummysearch.com/r/devBR/ etc. | ~39k, ~142k, ~58k (GummySearch) | Não verificado | Só se r/brdev funcionar bem |
| DEV Community (dev.to), tag braziliandevs | https://dev.to/t/braziliandevs | Ativa | Docs da DEV: compartilhar posts completos e evitar conteúdo muito promocional | Artigo em PT sobre IBS/CBS no XML |
| Product Hunt | https://www.producthunt.com | Global | Sem política oficial lida; conselho de comunidade: makers podem divulgar o próprio lançamento sem forçar | Lançamento secundário; fit médio |
| Indie Hackers | https://www.indiehackers.com | Global | Regras oficiais não lidas | Post de build-in-public, baixa prioridade |
| Stack Overflow em Português | https://pt.stackoverflow.com | Não verificado | Não lido (bloqueado). Exigência geral do Stack Exchange é declarar a afiliação | Só responder perguntas reais, revelando autoria |
| Fórum Contábeis | https://www.contabeis.com.br/forum/ | Existe (seção tributos); thread de NF-e achada é de 2006, atividade atual não verificada | Não verificado | Contadores: avaliar antes de investir tempo |
| Discord do ACBr | via https://www.projetoacbr.com.br | Existe (divulgado pelo projeto); tamanho não verificado | Não verificado | Entrar e ler regras antes |
| Discord do ZeusFiscal (C#) | citado em https://www.tabnews.com.br/RobertoTuche/ef8771b1-004d-4182-b748-87ab511874f0 | Link de convite não confirmado | Não verificado | Devs C# com rejeições |
| Help centers (Omie, Conta Azul) | https://ajuda.omie.com.br | Páginas de rejeição existem; sem fórum público achado | N/A | Não é canal; serve para ver as rejeições mais comuns e priorizar o conteúdo |
| Facebook (grupos NF-e, contadores, ERP, reforma tributária) | - | Nenhum grupo identificado | Não verificado (login) | Procurar manualmente dentro do Facebook |
| LinkedIn, Telegram, WhatsApp | - | Nenhum grupo identificado | Não verificado | Perfil pessoal no LinkedIn; grupos só se convidado |

## Como postar sem parecer spam

- Valor primeiro: leve a resposta completa para dentro do post (causa da rejeição, como corrigir). O link é complemento, nunca a resposta.
- Declare a autoria sempre: "Sou o autor desta ferramenta gratuita".
- Respostas de rejeição: só quando o código da pergunta bate com uma das 82 páginas, uma resposta por pergunta, sem repetir texto.
- Uma postagem por canal; não apagar e republicar; respeitar as regras de título e seção de cada lugar. Responder aos comentários e aceitar feedback.
- Sem contas falsas, votos combinados ou pedidos de upvote. Nenhum envio em massa.
- Conteúdo que serve fora do lançamento: artigos sobre a NT 2025.002, comparativos de rejeições e um exemplo de uso da API.

## Canais que alimentam o SEO

- Google Search Console: verificar o domínio, enviar o sitemap com as 82 páginas de rejeição e acompanhar consultas como "rejeição 539 nfe".
- Cada página de código com título e H1 estáveis, a explicação, o XML de exemplo e o texto igual ao que os devs digitam no Google.
- Backlinks: fóruns acima, README/docs de projetos de terceiros que citam a ferramenta, artigos no TabNews e no dev.to com link para as páginas de código (não só para a home).
- Atenção: links em fóruns costumam ser nofollow; o valor é o tráfego e a descoberta.

## Fontes

- ACBr: https://www.projetoacbr.com.br/forum/ e https://www.projetoacbr.com.br/forum/guidelines/
- TabNews: https://www.tabnews.com.br/faq e pesquisa de apoio sobre moderação em https://www.tabnews.com.br/JeanCarlosDev/brdev-onde-a-censura-enterra-a-comunidade (relato de usuário, não regra)
- Show HN: https://news.ycombinator.com/showhn.html
- sped-nfe: https://github.com/nfephp-org/sped-nfe
- r/brdev: https://gummysearch.com/r/brdev/ (tamanho); regras não lidas
- dev.to: https://dev.to/help/organizations/maximizing-your-dev-organization
- Omie: https://ajuda.omie.com.br/pt-BR/articles/6167078-minha-nf-e-foi-rejeitada-e-agora
