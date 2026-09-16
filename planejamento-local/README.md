# Planejamento local do projeto

Atualizado em: 16/09/2026.

Esta pasta reúne os registros de planejamento, estudo e análise do jogo promocional da Pneus Freedom. Em 16/09/2026, o usuário decidiu incluí-la no repositório privado [gameFreedom](https://github.com/paulosergiig/gameFreedom) e removeu sua entrada do `.gitignore`. Esta decisão substitui as orientações anteriores de manter o planejamento apenas local. Os demais documentos preservam o histórico das decisões.

## Acordos de trabalho

- Atuar como arquiteto de software e analista de sistemas.
- Planejamento inicial concluído; implementação autorizada pelo usuário em 16/09/2026.
- Fazer perguntas consultivas e atualizar os registros conforme as respostas.
- Distinguir contexto confirmado, pesquisa, hipótese e proposta.
- Não transformar sugestões técnicas ou de gameplay em decisões aprovadas.
- Manter a experiência promocional exclusivamente vinculada à Pneus Freedom.

## Documentos

1. [Contexto e levantamento](01-levantamento.md)
2. [Decisões confirmadas e propostas](02-decisoes.md)
3. [Pesquisa da marca e do evento](03-pesquisa-marca-evento.md)
4. [Proposta de jogo e escopo](04-proposta-jogo.md)
5. [Arquitetura, segurança e publicação futura](05-arquitetura-seguranca.md)
6. [Ranking compartilhado e experiência em smartphones](06-ranking-mobile.md)
7. [Implementação atual e verificações](07-implementacao.md)
8. [Estudo do segundo jogo com visão lateral](08-segundo-jogo-lateral.md)
9. [Implementação do Freedom Freestyle](09-freestyle-implementacao.md)
10. [Melhorias após uso real: vidas, progressão e tela móvel](10-melhorias-sobrevivencia.md)

O usuário autorizou criar o jogo e confirmou que o ranking é recreativo, sem premiação. Consulte [Implementação atual](07-implementacao.md).

As anotações contêm informações operacionais fornecidas pelo usuário. Seu versionamento no repositório privado não as torna parte do site: o servidor deve disponibilizar somente os arquivos permitidos dentro de `public/` e as rotas da API. Nunca publique a raiz do repositório. Dados de execução, `.env`, backups e `output/` continuam fora do Git.

## Direção atual

O acesso principal será pelo smartphone do visitante, via QR code. A recomendação foi revista para incluir backend e banco de dados exclusivos do jogo, para o ranking compartilhado recreativo confirmado. A proposta anterior de operação apenas estática com recorde local foi substituída. A implementação atual está descrita no documento 07; não haverá premiação.

## Etapa consultiva atual

O primeiro jogo foi aprovado pelo usuário e deve ser preservado. Após a etapa consultiva, o usuário autorizou explicitamente criar o Freedom Freestyle em 16/09/2026: visão lateral, manobras e pontuação, com prioridade para celular deitado. A restrição anterior de não criar código terminou com essa autorização. O segundo modo foi implementado e validado localmente; consulte o registro 09 para o resultado e as verificações.


## Evolução após publicação

O usuário informou que o jogo está online e recebeu sugestões de participantes. Autorizou implementar localmente três vidas, dificuldade progressiva, salvamento ao sair, melhor descoberta dos dois jogos e ajustes para Safari. Confirmou manter recordes antigos junto com os novos. Após a entrega da versão local para teste, o usuário autorizou explicitamente enviar esta atualização ao GitHub. A atualização do servidor será uma etapa separada. As regras históricas de 60/90 segundos nos documentos anteriores foram substituídas para novas partidas; consulte o documento 10.
