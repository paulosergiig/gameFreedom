# Melhorias após o uso real: três vidas, progressão e tela móvel

Data do registro: 16/09/2026.
Status: implementação local concluída e envio ao GitHub autorizado explicitamente pelo usuário. A versão anterior já está publicada pelo usuário e possui participantes.

## Origem e decisões

O retorno de visitantes apontou partidas longas com espera para confirmar pontos, dificuldade baixa ao apenas acelerar, pouca descoberta do segundo jogo e área de jogo apertada no Safari em paisagem.

Decisões adotadas:

- Três vidas por tentativa em ambos os jogos. Colisão no Desafio e queda no Freestyle consomem uma vida; a terceira encerra e envia o resultado.
- Remover o encerramento por tempo fixo. O HUD mostra o tempo sobrevivido; a dificuldade aumenta com a progressão e continua dentro de limites jogáveis.
- Encerrar e tentar salvar ao sair ou ocultar o jogo. Confirmar o progresso periodicamente para reduzir perdas quando o sistema encerra a página abruptamente.
- Apresentar os dois jogos com destaque semelhante na abertura; retirar o rótulo de novidade.
- Acrescentar salto voluntário ao Freestyle: segurar acelerar e arrastar o dedo para cima, além de um botão explícito e Espaço no teclado.
- Adaptar a tela ao espaço visível do navegador, sem depender de conseguir ativar tela cheia.
- **Decisão posterior explícita do usuário:** manter os recordes antigos junto com os novos. Ela substitui a proposta técnica inicial de separar as edições do ranking.

Três vidas oferecem margem para aprender sem tornar a primeira falha o fim da participação. Um breve período de recuperação evita que o mesmo obstáculo ou sua proximidade retire várias vidas sem chance de reação. A interface deve indicar cada perda e as vidas restantes claramente.

## Desafio Freedom

O cenário e os obstáculos compartilham a mesma progressão de velocidade. A geração continua à frente da moto e descarta trechos ultrapassados, sem guardar uma pista infinita em memória. Espaçamento e distribuição dos obstáculos evoluem, preservando uma faixa livre e tempo de reação para mudar de faixa.

O modelo compartilhado está em `public/shared/classic-survival.js`. Usa 60 passos por segundo, semente determinística, três vidas e estado serializável. Os comandos continuam sendo mudanças reais de faixa, com intervalo mínimo de dez passos e validação de faixa possível. O modelo anterior de 60 segundos permanece intacto para compatibilidade.

## Freedom Freestyle

A pista lateral continua gerando rampas e obstáculos à frente do jogador. Apenas manter o acelerador não deve garantir sobrevivência: troncos e pedras exigem salto ou manejo da velocidade. A velocidade máxima e a dificuldade da sequência progridem, e o circuito não termina por cronômetro.

O salto voluntário ocorre ao pressionar o controle, com contato com o chão e um breve intervalo entre saltos. Manter o comando pressionado não deve causar saltos automáticos repetidos. Rampas continuam lançando a moto naturalmente. Pontos pendentes só são incorporados após aterrissagem válida; cair perde o combo e os pontos ainda no ar, preservando os já confirmados.

O modelo está em `public/shared/freestyle-survival.js`. A máscara de controles acrescenta o bit de salto aos controles anteriores. A pontuação usa a progressão pela pista para impedir obter pontos repetidamente saltando sobre o mesmo obstáculo ou parado no mesmo lugar. O modelo de 90 segundos continua disponível para clientes antigos.

## Ranking e preservação

As regras novas têm versão `survival-1` e tabelas adicionais `survival_runs` e `survival_scores`, ligadas ao mesmo participante. O código não copia nem apaga recordes antigos. Na consulta pública de cada modo, combina as duas fontes e seleciona o maior resultado de cada pessoa identificada pela sessão.

Se o jogador tiver 2.000 pontos antigos e fizer 700 na tentativa nova, continua com 2.000 no ranking. Se depois fizer 2.500, passa a aparecer com 2.500. Nunca aparecem duas linhas por ter jogado nas duas versões. Empates seguem posições compartilhadas; se um recorde igual existir nas duas fontes, sua data mais antiga determina a ordem visual.

Os indicadores de melhor resultado pessoal e novo recorde geral também consideram os recordes antigos. As APIs antigas e suas tabelas permanecem disponíveis para clientes anteriores já carregados. Como o ranking é recreativo, o usuário escolheu essa continuidade mesmo com a mudança de regras; não há equivalência matemática entre as duas dificuldades.

## Saída, checkpoint e falhas de rede

A página sincroniza aproximadamente a cada cinco segundos. Cada mensagem identifica o trecho jogado e suas mudanças de controle; não envia um valor de pontuação confiável. O servidor executa os passos novos a partir do último estado confirmado, valida controles e tempo real transcorrido e persiste um checkpoint limitado em tamanho.

Encerrar normalmente ou perder a terceira vida produz um resultado confirmado. Ao ocultar a página ou sair, a interface tenta uma mensagem final com beacon/keepalive. Reenvios e sobreposições não reduzem o progresso confirmado nem duplicam a classificação. Uma mensagem final repetida retorna o mesmo resultado.

O sistema operacional pode encerrar o navegador sem permitir esse envio. Após 30 segundos sem sincronização, o servidor encerra a tentativa com o último checkpoint recebido. A limpeza roda a cada dez segundos; consultar o ranking ou o status também verifica a expiração. A última fração não enviada pode se perder, especialmente com rede instável. Cancelar a contagem inicial antes de jogar não cria uma entrada vazia no ranking.

Endpoints novos ficam sob `/api/survival/classic/` e `/api/survival/freestyle/`. Mantêm sessão, Origin, CSRF e limites de acesso. O token de beacon pode ir no corpo JSON exclusivamente da rota de sincronização, sem relaxar a checagem da origem. Os payloads não persistem nem registram esse token.

## iPhone, orientação e área disponível

Usar a altura dinâmica disponível, ajustes de `visualViewport` e espaçamento para áreas seguras. Em paisagem curta, compactar HUD e controles para deixar a pista visível. A rotação deve recalcular o enquadramento sem reiniciar a partida nem prender um controle pressionado.

A opção de tela cheia só é ativada se a API estiver disponível e aceitar a chamada. Ela é uma conveniência, não condição para jogar. Safari pode manter barras; nesse caso o jogo deve continuar utilizável dentro da área visível. Adicionar à Tela de Início pode ser oferecido como opção de experiência mais ampla, sem exigir instalação para participar.

Referências primárias consultadas durante a análise:

- [MDN: sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) — eventos de saída não são garantidos em dispositivos móveis; envio assíncrono e limitado.
- [WebKit: Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) — unidades de viewport `svh`, `lvh` e `dvh` para lidar com a interface variável do navegador.

## Operação e validação

A atualização deve preservar `.env`, DB_PATH, o banco, suas permissões, o subdomínio, o Tunnel e a supervisão já usados. Criar backup consistente na versão instalada antes de trocar o código. A inicialização faz migração aditiva; **não executar reset-event**. O checklist completo está em `docs/PUBLICACAO-WINDOWS.md`.

A administração local lista os rankings combinados e os valores anteriores. Backup inclui todas as tabelas; remover participante e expirar sua retenção removem também as partidas e os resultados novos por cascata.

Os testes de servidor cobrem replay incremental, saída e timeout, três vidas, repetição e overlap, comandos inválidos, tempo impossível, CSRF com beacon, recuperação, compatibilidade antiga, ranking combinado, empates, persistência, backup e remoção. Os testes de física cobrem progressão, obstáculos, salto e estado limitado. A validação final inclui jornadas no navegador e conferência visual em paisagem curta.

A homologação do usuário em smartphones reais continua necessária, especialmente no Safari com barras abertas/recolhidas e no gesto de salto. Chromium/WebKit emulados ajudam a detectar regressões, mas não reproduzem todos os detalhes do Safari no aparelho.

O usuário pediu testar localmente antes de autorizar o envio ao GitHub. Após receber a versão local, autorizou explicitamente o envio. Esta autorização permite commit e push; atualização do servidor, reset de ranking e mudanças no Tunnel não fazem parte desta etapa.


## Verificação local concluída

- 56 testes de regras, API, segurança, migração e administração aprovados.
- 12 jornadas aprovadas em Chromium e WebKit, incluindo gesto de salto, controles simultâneos, rotação, três vidas, saída antecipada, falha de envio, recuperação após recarregar e navegação real para outra página.
- Tela inicial conferida em 360 × 740; Freestyle conferido em paisagem curta de 844 × 260, com controles de pelo menos 44 px.
- Prévia local reiniciada em 127.0.0.1:3000 após backup consistente. O conteúdo das tabelas anteriores foi comparado por hash antes/depois e permaneceu igual.
- Testes de navegador usam banco em memória, sem inserir jogadores fictícios no banco da prévia.
- As verificações acima foram concluídas antes do envio ao GitHub. Posteriormente, o usuário autorizou o envio desta versão; o servidor da empresa não foi alterado.
