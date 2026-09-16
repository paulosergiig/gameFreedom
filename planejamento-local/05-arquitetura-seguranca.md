> Atualização: em 16/09/2026 o usuário confirmou ranking apenas recreativo e autorizou a implementação. Este registro preserva o planejamento anterior. Consulte [a implementação atual](07-implementacao.md).

# Arquitetura, segurança e publicação futura

Status: recomendação consultiva. Nenhuma configuração do servidor foi inspecionada ou alterada.

## Arquitetura recomendada

O navegador executa o jogo e desenha a animação. Com o ranking compartilhado proposto pelo usuário, o servidor passa a entregar arquivos e atender uma API pequena, responsável por participantes, partidas e classificação. O banco é exclusivo do jogo. Esta proposta substitui a arquitetura apenas estática sugerida anteriormente.

Fluxo previsto: smartphone → HTTPS no subdomínio escolhido → Cloudflare Tunnel → serviço isolado do jogo → banco local ou serviço de banco privado. Arquivos do jogo e API ficam preferencialmente sob a mesma origem.

Uma implementação 2D para navegador é suficiente. A escolha do backend deve considerar a operação já existente; Django é uma possibilidade, em projeto e ambiente próprios, sem incorporar o jogo aos sistemas de manutenção ou SST. Motor e tecnologias não foram decididos.

A memória e o processador informados não parecem ser o principal limitador desse desenho. O peso dos recursos, a banda disponível e o desempenho do aparelho do visitante precisam ser medidos; não estimar capacidade de público simultâneo sem teste.

## Hospedagem no Windows compartilhado

Se o IIS já estiver instalado e adequado, avaliar site, pool e identidade exclusivos para entrega de conteúdo e eventual encaminhamento à API. O processo do backend deve ter identidade própria e acesso somente aos seus dados; arquivos estáticos ficam em leitura, com diretório de dados separado da raiz pública. Se o IIS não estiver disponível, escolher uma alternativa suportada após verificar o ambiente. Não reconfigurar componentes compartilhados às pressas.

Fonte: [isolamento de sites no IIS — Microsoft](https://learn.microsoft.com/en-us/iis/manage/configuring-security/ensure-security-isolation-for-web-sites).

Separação de processo e permissões reduz o alcance de uma falha, mas não equivale a isolamento de máquina: o sistema operacional continua compartilhado.

Selecionar uma porta somente após inspecionar listeners e reservas. As portas 8000, 8500, 8600 e 8900 foram informadas como ocupadas; nenhuma outra foi verificada.

Se o conector Tunnel estiver no mesmo servidor, dar preferência a serviço acessível por loopback. Se ele estiver em outra máquina, esse desenho deve ser revisto para a conectividade necessária, sem abrir o serviço indiscriminadamente.

## Cloudflare Tunnel

Adicionar futuramente uma rota específica do novo hostname ao serviço do jogo, preservando as rotas atuais e a configuração anterior para reversão.

O Tunnel estabelece conexões de saída; a publicação não exige abrir uma nova porta de entrada para o jogo. Isso não elimina a necessidade de corrigir falhas e limitar permissões.

Fontes: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) e [roteamento](https://developers.cloudflare.com/tunnel/concepts/routing/).

Um hostname publicado fica acessível ao público se não houver política adicional. O túnel não valida pontuações nem protege automaticamente os demais processos. WAF e outras proteções dependem da configuração e do plano.

Fonte: [aplicações publicadas](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

## Controles a preparar na publicação

- Publicar apenas o pacote final, nunca a raiz inteira do repositório.
- Excluir da publicação anotações, .git, .env, backups e arquivos internos.
- Nunca colocar tokens do Tunnel, credenciais ou segredos no frontend ou no GitHub.
- Preferir imagens, fontes e áudio locais, sem dependência de CDN para a partida.
- Servir arquivos com permissões restritas, sem listagem de diretórios ou execução desnecessária.
- Manter banco e backups fora da raiz pública; não abrir o banco diretamente para a internet.
- Restringir operações da API, tamanho dos envios e frequência de requisições; usar consultas parametrizadas e nomes exibidos como texto.
- Sessão do participante restrita ao subdomínio do jogo; revisar proteção contra requisições forjadas e acessos a resultados de outro participante.
- Moderação e manutenção precisam de acesso protegido; ocultar uma URL não é controle de acesso.
- Configurar cabeçalhos adequados, incluindo CSP e prevenção de interpretação incorreta de conteúdo, após conhecer os recursos realmente utilizados.
- Usar conta de serviço com privilégios mínimos e revisar atualizações do Windows, servidor HTTP e conector.
- Verificar a revisão completa do Windows; o número 17763 sozinho não informa o nível de correções.
- Preparar reversão para a versão anterior e testar os serviços existentes após a alteração.

São ações futuras condicionadas à inspeção, não garantias já cumpridas.

## Ranking, banco e verificação

A proposta detalhada está em [Ranking e smartphones](06-ranking-mobile.md). O servidor é a referência para resultados publicados; o navegador não pode impor uma pontuação apenas enviando um número.

SQLite em disco local é uma hipótese para um serviço pequeno, com gravações curtas e teste de concorrência. PostgreSQL pode ser preferível se já houver operação adequada ou demanda medida. Espaço livre e RAM não demonstram capacidade de escrita simultânea.

Fonte: [usos apropriados do SQLite](https://www.sqlite.org/whentouse.html).

Não há premiação confirmada. A identificação por navegador e validações de consistência atendem melhor a uma disputa recreativa; brindes exigem rever identificação, regras e análise de resultados.

## Smartphones e falta de internet

Acesso confirmado: QR code → navegador do celular do visitante. O primeiro carregamento e a participação no ranking precisam de conexão. O QR code não comprova presença física no estande e o link pode ser compartilhado.

Se os recursos já estiverem carregados, pode haver treino sem classificação quando a API estiver indisponível. O resultado deve mostrar claramente se está pendente, confirmado ou indisponível; não exibir sucesso antes da confirmação do servidor. Reenvios precisam ser idempotentes e respeitar a validade da partida.

Um modo offline persistente com service worker é opcional e precisa de cache previamente preparado e testado. Não prometer acesso inicial sem internet nem aceitar automaticamente partidas offline no ranking.

Fonte: [Service Worker API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Uma demonstração local no estande pode ser alternativa operacional se existir equipamento disponível, mas não substitui o acesso dos visitantes pelos próprios celulares.

## Roteiro posterior de publicação

1. Confirmar versão do jogo, regras do ranking, aparelhos e testes funcionais e de concorrência.
2. Inspecionar servidor, serviços HTTP, portas, identidade de execução e topologia do Tunnel.
3. Preparar pacote final e cópia da configuração que possa precisar de reversão.
4. Disponibilizar o serviço isolado, dados persistentes e backup; testar localmente.
5. Definir hostname e configurar apenas a nova rota.
6. Testar HTTPS, arquivos expostos, carregamento externo e cache.
7. Conferir os sistemas existentes, QR code, ranking em dois aparelhos e comportamento sem conexão.
8. Registrar comandos e instruções com os dados reais do ambiente.

Não foram escolhidos porta ou hostname, nem executadas ações de implantação.
