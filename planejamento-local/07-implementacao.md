# Implementação autorizada e entregue localmente

Data: 16/09/2026.

## Confirmações mais recentes do usuário

- O ranking é somente para diversão; não há premiação.
- O usuário autorizou explicitamente iniciar a criação do jogo.
- Essa autorização encerra a restrição anterior de trabalhar apenas em planejamento.

## Decisões de implementação

- Node.js 24 LTS, com servidor HTTP e SQLite integrados, sem dependências de runtime externas.
- Jogo 2D Canvas, renderização com perspectiva, 60 segundos e contagem inicial de 3 segundos.
- Controles por toque, gesto na pista e setas do teclado; modo retrato priorizado.
- Duas ambientações na mesma partida: asfalto e trilha.
- Identidade Freedom com logos fornecidas, arte fictícia gerada e fontes locais.
- Backend separado com sessão por navegador, apelido público, ranking Top 10, recorde e posição pessoal.
- Melhor resultado por participante; empates compartilham posição.
- Pontuação calculada por replay das regras no servidor, com validação, idempotência e limites de requisição.
- Retenção padrão de 30 dias, moderação e backup por comandos locais, sem painel administrativo público.
- Gerador de QR code para o subdomínio definitivo; ainda não há URL pública escolhida ou publicada.
- Anotações internas, dados, backups e arquivos de ambiente incluídos no .gitignore.

## Verificação realizada

- 17 testes de regras e servidor passaram.
- Jornadas completas de um minuto passaram em Chromium e WebKit com perfis móveis, incluindo falha simulada do envio, reenvio e ranking.
- Também passaram casos de privacidade, layout estreito, cancelamento, interrupção de partida e carregamento de fontes locais.
- Capturas da abertura e da pista foram inspecionadas visualmente.
- Ferramentas de desenvolvimento instaladas com zero vulnerabilidades reportadas pelo npm audit na instalação.
- O gerador de QR recusa localhost e URLs fora do domínio previsto.

## Limites e pendências externas

- Ainda não foi testado em Android e iPhone físicos.
- Não foi realizado teste de carga no servidor da empresa.
- Nenhuma alteração em GitHub, DNS, Cloudflare Tunnel ou servidor remoto.
- A identidade por navegador não impede múltiplas participações da mesma pessoa.
- Replay não impede bots que produzam comandos válidos; adequado ao propósito recreativo declarado.
- O QR definitivo depende do subdomínio e da publicação.
- A empresa deve conferir a operação, aviso de privacidade, retenção de backups e canal de atendimento antes da divulgação.

## Onde seguir

Documentos operacionais atuais: README.md, docs/PUBLICACAO-WINDOWS.md, docs/OPERACAO.md e docs/ASSETS.md.

Os documentos anteriores desta pasta preservam a pesquisa e as propostas que originaram o jogo. Quando houver divergência, esta atualização e os documentos operacionais descrevem a implementação atual.
