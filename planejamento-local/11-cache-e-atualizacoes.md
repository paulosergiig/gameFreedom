# Cache e consistência entre publicações

O usuário relatou HTML quebrado no celular recorrente após atualizar o servidor, enquanto janela anônima e PC funcionavam. A implementação foi autorizada para corrigir o projeto, preservar jogos/dados/proteções e validar regressões. Esta etapa não incluiu envio ao GitHub nem alteração do servidor ou Cloudflare.

## Evidência e decisão

A origem no código mandava `no-cache`, mas os estáticos públicos chegavam com `max-age=14400`, enquanto HTML/API continuavam dinâmicos. URLs sem versão permitiam HTML novo combinado com CSS/JS ainda frescos no cache do celular. Não havia service worker. A regra específica do painel Cloudflare não foi inspecionada; a diferença de cabeçalhos públicos e a janela de quatro horas foram observadas diretamente.

Adotado hash SHA-256 automático do conjunto público e snapshot em memória por processo, com URLs `/static/HASH/...`, imports relativos preservados, HTML/API/carregador sem armazenamento e recuperação automática na retomada ou troca de versão. Sem build extra, dependências novas, exclusão de cookies/storage ou alteração de SQLite/gameplay. Ver [documentação operacional](../docs/ATUALIZACOES-E-CACHE.md).

A verificação de versão não interrompe uma partida ativa. A regra é manter todos os recursos do documento na mesma versão e renovar o documento completo quando apropriado. Nunca responder com conteúdo atual sob um hash anterior.

Foi mantido o endereço informado `https://game.freedom.dev.br` e a porta de produção informada 3100, sem editar ambiente ou Tunnel. Publicações futuras continuam com `git pull` e reinício. Abas que já executavam código anterior à primeira instalação só recebem a nova lógica ao carregar o documento corrigido; o servidor não consegue alterar retroativamente seu JavaScript.

## Verificações

Testes adicionados para cabeçalhos, identidades estáveis, alterações transitivas, snapshot durante atualização, bloqueio de versões inexistentes, allowlist e Host/Origin. Jornadas de navegador aquecem o cache HTTP real com recursos antigos de quatro horas e usam o mesmo contexto sem limpar dados nem interceptar requisições. A suíte existente continua cobrindo ambos os jogos, vida/controles, saída, ranking, CSRF e persistência.

## Resultado da validação

- 61 testes de regras/API/segurança/cache aprovados, incluindo os 56 existentes.
- 20 cenários de navegador aprovados no conjunto final: 12 jornadas existentes e 8 casos novos de cache/atualização, executados em Chromium e WebKit.
- As novas jornadas usam cache HTTP real, sem interceptação de requisições nem limpeza do contexto; verificam a mesma identificação e CSRF após atualizações e exercitam os dois modos.
- Falhas temporárias consecutivas de módulo e atualização entre consulta de versão e importação se recuperaram automaticamente. A renovação de aba com partida ativa aguardou seu encerramento.
- Backup local criado antes do reinício; comparação por hash de todas as tabelas de participação e partidas confirmou dados locais idênticos depois.
- Prévia local atualizada e cabeçalhos conferidos em HTML, boot, versão, saúde e CSS versionado.
- Após a validação local, o usuário autorizou enviar esta correção ao GitHub junto com a troca de jogador. A atualização do servidor/Cloudflare continua sendo uma etapa separada; os cabeçalhos públicos novos deverão ser conferidos depois da publicação.
