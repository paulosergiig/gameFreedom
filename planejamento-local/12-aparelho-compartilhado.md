# Uso compartilhado do aparelho

## Solicitação e decisão

O usuário autorizou implementar a possibilidade de outra pessoa jogar no mesmo smartphone, tablet ou computador com seu próprio nome, mantendo o jogador atual quando não houver troca.

A identidade existente associa nome, cookie e pontuações. Apenas alterar o nome da linha atual renomearia os recordes já conquistados. Por isso, a ação explícita “Trocar jogador” cria outro participante e seleciona sua sessão para os dois jogos. A opção aparece junto à identificação “Jogando como”. Cancelar não modifica dados.

Não foi criado sistema de contas, login, seleção de perfis ou recuperação de participação pelo apelido. Nomes iguais continuam independentes; esse comportamento é explicado no formulário. Os recordes anteriores permanecem até sua retenção normal. O gameplay, SQLite e regras dos rankings foram preservados.

## Implementação

- Formulário separado do cadastro inicial; nome atual visível fora da pista.
- POST /api/player/switch com nome e TAG anterior, validação existente de apelidos, Origin/CSRF/Host, cookie novo protegido e limites de criação por IP/global reutilizados.
- Nenhuma migração: insere outro participante na tabela players, sem modificar registros anteriores.
- Confirmação pendente impede a troca; partidas ativas também são bloqueadas no servidor, incluindo os dois modos e clientes legados.
- Relê a sessão antes de ações importantes e ao retornar à página; aviso sem tokens entre abas evita nome antigo na interface.
- Resposta perdida após o cookie ser instalado é reconciliada consultando a sessão antes de oferecer nova tentativa.
- Checkpoints temporários distinguem partida em andamento de saída explícita. A recuperação de outra aba não pode finalizar uma partida ainda ativa; a recuperação de uma saída explícita mantém seu fluxo anterior.
- A correção de cache implementada anteriormente continua presente e versiona automaticamente estes recursos.

## Publicação e verificação

Após a implementação e validação local, o usuário autorizou explicitamente enviar esta melhoria e a correção de cache ao GitHub. A atualização do servidor da empresa permanece uma etapa separada, sem alterações no Cloudflare. A publicação continua sendo git pull e reinício do processo.

Os testes cobrem recordes históricos/atuais dos dois jogos, cookies/CSRF, validação, nomes iguais, cancelamento, repetição de visitas, falhas de rede, resposta perdida, resultado pendente, múltiplas abas e layout em celular/tablet/computador. A validação automatizada usa banco isolado e Chromium/WebKit; emulação não substitui um aparelho físico.

Resultado final: 70 testes de regras/API e 34 jornadas de navegador passaram. Layout conferido em 360 × 740, 1024 × 768 e 1440 × 900; ambos os jogos continuam visíveis na entrada móvel com o jogador identificado. Prévia local reiniciada para teste manual; banco local conferido antes/depois.
