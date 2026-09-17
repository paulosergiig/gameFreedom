# Atualizações e cache do GameFreedom

## Diagnóstico confirmado

O código anterior de `server.mjs` enviava `Cache-Control: no-cache` para os arquivos estáticos, mas reutilizava URLs como `/styles.css`, `/app.js`, `/game.js` e `/freestyle.js` em todas as publicações. Não existia service worker.

Na investigação de `https://game.freedom.dev.br`, foram observadas estas respostas públicas:

| Recurso | Cache-Control recebido pelo visitante | CF-Cache-Status |
| --- | --- | --- |
| `/` | `no-cache` | `DYNAMIC` |
| `/styles.css`, `/app.js`, `/game.js`, `/freestyle.js`, `/shared/classic-survival.js` | `max-age=14400` | `MISS` e, em consulta posterior, `EXPIRED` |
| `/api/health` | `no-store` | `DYNAMIC` |

`14400` segundos são quatro horas. Isso permite que o navegador reutilize um CSS/JS anterior enquanto busca o HTML atualizado. O cache particular de cada navegador explica o contraste entre visitante recorrente e janela anônima. A resposta pública dos estáticos difere da política definida no código de origem, e coincide com o Browser Cache TTL padrão do Cloudflare. Não houve acesso ao painel para identificar qual configuração/regra exata produz a sobrescrita.

As diferenças de bytes dos arquivos CSS, app e regras entre local e produção desapareceram ao normalizar CRLF/LF; não indicavam, naquela coleta, arquivos de aplicação diferentes na origem. O problema é a identidade reutilizada das URLs combinada ao cache entregue ao visitante. `no-cache` significa revalidar antes de reutilizar, e não proibir armazenamento.

## Solução adotada

O servidor cria, na inicialização, um snapshot em memória somente dos arquivos públicos permitidos. Calcula um hash SHA-256 usando nomes e conteúdo de HTML, CSS, módulos dos dois jogos, imagens, fontes e carregador. O próprio código de entrega participa do hash para que alterações na transformação das URLs também mudem a versão.

O HTML aponta para caminhos como `/static/HASH/styles.css` e `/static/HASH/assets/logo.png`. O carregador busca `/static/HASH/app.js`. Imports relativos herdam esse caminho, inclusive as regras compartilhadas transitivas do Freestyle. As URLs absolutas de assets no CSS também recebem o prefixo. Não é necessário editar números de versão nem executar build.

Enquanto o processo está rodando, os arquivos entregues pertencem ao mesmo snapshot. Alterar arquivos no disco durante `git pull` não mistura os bytes dessa versão com os da próxima. O reinício carrega o novo conjunto e calcula outra identidade. Um hash antigo desconhecido nunca devolve bytes da versão atual: responde 404 sem cache.

| Tipo de resposta | Política |
| --- | --- |
| HTML, `/boot.js`, URLs antigas sem versão, APIs e erros | `no-store` para navegador e CDN |
| Recursos sob o hash correto | `public, max-age=31536000, immutable` |

As políticas também são expressas por `CDN-Cache-Control` e `Cloudflare-CDN-Cache-Control`. Uma URL versionada só representa o mesmo conteúdo; por isso pode ser reutilizada com segurança. Sessão, ranking, estado de partida e versão atual nunca devem ficar em cache compartilhado.

`public/boot.js` é um carregador pequeno, sem dependências e servido sem armazenamento. Antes de iniciar o aplicativo, consulta `/api/version`, verifica a folha de estilo e carrega o grafo de módulos da versão do documento. Se uma navegação atravessar exatamente um reinício e encontrar uma versão indisponível, renova o documento automaticamente. Falhas temporárias têm tentativas espaçadas, sem ciclo rápido de recarregamento.

Ao voltar de outra aba/aplicativo ou recuperar uma página pelo histórico do navegador, confere novamente a versão. Se houver partida em andamento, espera seu encerramento. A recuperação de pontuações pendentes permanece a cargo do fluxo existente, sem apagar cookies nem armazenamento do participante.

Não há service worker, novo framework, bundler, manifesto gerado em disco, novo banco ou limpeza de dados do visitante.

## Como publicar

O procedimento continua sendo atualizar o código completo com `git pull` e reiniciar um único processo com `npm start` ou o supervisor já adotado. Preserve o backup e a configuração usados pela empresa. Não altere `PUBLIC_URL`, `PORT`, `DB_PATH`, Tunnel, DNS nem o QR code: produção continua em `https://game.freedom.dev.br`, porta local 3100.

Não é necessário:

- editar uma versão, gerar arquivos ou executar build;
- pedir limpeza de cache, navegação anônima ou recarregamento forçado aos visitantes;
- purgar o cache do Cloudflare em cada publicação;
- apagar ou recriar o banco, sessões ou ranking.

O servidor precisa ser reiniciado depois de completar a atualização dos arquivos. Atualizações parciais ou arquivos ausentes são falhas de publicação, não algo que deve ser ocultado pelo cache. Em desenvolvimento no Windows, `npm run dev` também observa `public/`, `lib/` e `server.mjs`, reiniciando ao editar esses arquivos. Com `npm start`, reinicie manualmente após editar o frontend.

## Conferência após esta publicação

Exemplo em PowerShell, somente leitura:

```powershell
$gameOrigin = 'https://game.freedom.dev.br'
$gameRelease = (Invoke-RestMethod -Uri "$gameOrigin/api/version").version
$gameUrls = @('/', '/api/version', '/boot.js', "/static/$gameRelease/styles.css")
foreach ($gamePath in $gameUrls) {
    $gameResponse = Invoke-WebRequest -UseBasicParsing -Uri "$gameOrigin$gamePath"
    [pscustomobject]@{
        Caminho = $gamePath
        Status = $gameResponse.StatusCode
        Cache = $gameResponse.Headers['Cache-Control']
        Cloudflare = $gameResponse.Headers['CF-Cache-Status']
    }
}
```

HTML, versão e carregador devem chegar com `no-store`; o CSS versionado deve chegar com a política longa/imutável. `MISS`, `HIT` ou revalidação de um arquivo versionado são normais. A consulta de versão não cria cookie nem participante.

Não foi necessário alterar a configuração do Cloudflare nesta correção. Se o painel tiver uma regra explícita que ignore cabeçalhos da origem, armazene HTML/API ou transforme os módulos JavaScript, corrija apenas a regra aplicável a `game.freedom.dev.br`: respeitar cabeçalhos de origem para cache de navegador e não armazenar HTML, `/boot.js` e `/api/*`. Não aplicar uma regra global aos outros sistemas da empresa. Se uma regra indevida já tiver armazenado HTML/API no edge, pode ser necessária uma purga pontual desses caminhos após corrigi-la. Isso é uma correção administrativa excepcional, não uma etapa de todas as publicações; purgar Cloudflare não remove o cache já guardado no celular.

## Limites e preservação

A correção atende ao acesso normal pelo endereço existente, incluindo quem já tem os arquivos antigos no cache. O HTML observado em produção já era dinâmico; ao receber o HTML corrigido, o navegador passa a usar caminhos novos, sem reutilizar os estáticos antigos.

Nenhum servidor consegue instalar retroativamente um verificador em JavaScript que já está em execução numa aba anterior a esta correção. Essa aba passa a ter o novo comportamento quando carregar o documento atualizado por uma navegação normal. Depois disso, as retomadas e os acessos futuros usam a conferência automática. A correção também não promete disponibilidade sem conexão ou durante a parada do processo.

Não houve alteração nas regras, física, pontuação, tabelas SQLite, retenção, cookies, CSRF, validações de Host/Origin ou CSP. A API de versão é pública, somente leitura e também passa pelas validações e limites do servidor.

## Referências primárias

- [Cloudflare: Edge and Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/) — sobrescrita de TTL, padrão de quatro horas e limites da purga.
- [Cloudflare: CDN-Cache-Control](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/) — políticas destinadas aos caches intermediários.
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) — URLs versionadas e recursos imutáveis.
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — semântica de `no-cache`, `no-store` e BFCache.

## Validação executada

Foram aprovados 61 testes de regras/servidor/cache e 20 cenários de navegador no conjunto final (12 jornadas existentes e 8 novas, em Chromium e WebKit). Os testes novos incluem cache HTTP real aquecido com TTL de quatro horas, visita seguinte no mesmo contexto, mudança apenas em dependência transitiva/CSS, identidade e CSRF preservados, os dois jogos, renovação adiada durante partida, publicação durante o carregamento e falhas temporárias consecutivas. O banco local foi conferido por hash antes e depois da atualização e permaneceu igual. A aplicação em produção ainda precisa receber esta correção para conferir os cabeçalhos através do Cloudflare.
