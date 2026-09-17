# Operação do Desafio Freedom

## Ranking recreativo e edições

- Top 10, recorde e posição pessoal independentes para Desafio Freedom e Freedom Freestyle.
- As partidas atuais usam três vidas, dificuldade progressiva e duração aberta. O tempo mostrado mede a sobrevivência.
- Por decisão explícita do usuário, os recordes anteriores de 60/90 segundos aparecem junto com os novos. Para cada participante vale a maior pontuação entre as duas versões daquele jogo. Os dados antigos permanecem intactos.
- A sessão e o apelido selecionados são compartilhados entre os dois jogos. Nomes iguais não juntam pessoas; cada participante mantém uma posição por jogo, combinando seu melhor resultado antigo ou novo. Um navegador pode selecionar outro participante com “Trocar jogador”.
- Empates compartilham posição; a ordem visual é estabilizada pela data do resultado e identificador. Se o mesmo recorde pessoal existir nas duas versões, vale a data mais antiga.
- Não há premiação, sorteio, cadastro de contatos ou comprovação de identidade.

O servidor reconstitui os comandos recebidos com as mesmas regras determinísticas do navegador. Não aceita pontuação, quantidade de vidas ou posição da moto informadas pelo cliente. Isso impede adulterar apenas o número de pontos, mas não elimina automação de controles.

## Aparelho compartilhado

A faixa “Jogando como” aparece no início, no ranking e no resultado, depois de informar o primeiro apelido. **Trocar jogador** abre um formulário para a próxima pessoa. Fechar a janela ou escolher “Continuar como…” mantém a participação atual. Confirmar cria uma nova identificação para os dois jogos; não renomeia nem transfere os recordes anteriores.

O nome selecionado permanece nas visitas seguintes, dentro da retenção da sessão. O jogo não oferece login nem lista de perfis para restaurar participações anteriores: usar de novo um apelido cria outra participação. Os recordes anteriores continuam públicos até sua exclusão ou expiração normal. A troca não renova a retenção do participante anterior.

A interface aguarda a confirmação de pontuações pendentes antes da troca. A API também bloqueia a troca enquanto existir uma partida ativa, inclusive em outra aba. Um checkpoint ainda ativo compartilhado entre abas não é enviado como encerramento pela tela de troca nem pela recuperação de uma página recém-aberta. Se o navegador morrer sem emitir a saída, vale a finalização do servidor após a inatividade já descrita abaixo.

A troca usa POST /api/player/switch, protegida por sessão, Origin e CSRF. O servidor valida o apelido e a identificação anterior, aplica os limites existentes de criação por IP e global e emite um novo cookie HttpOnly/SameSite (Secure em HTTPS), com novo CSRF. Um aviso local avisa as outras abas para reler a sessão; esse aviso não armazena tokens de autenticação. A identidade também é conferida ao voltar à página e antes de iniciar uma partida.

Não exige migração, limpeza do banco, outra porta nem alteração do Tunnel. A publicação continua com git pull e reinício do processo.

## Confirmação durante a partida

A interface envia o progresso aproximadamente a cada cinco segundos. O servidor persiste o estado confirmado, sem recalcular toda a partida a cada envio. Os comandos precisam respeitar o tempo transcorrido, as regras físicas e os controles válidos. Uma requisição comporta no máximo 3.600 passos novos, 1.200 comandos e 49.152 bytes. A confirmação permite reenvios sobrepostos sem voltar a um estado anterior.

A terceira colisão/queda encerra a partida. Sair pelo controle do jogo, ocultar a página ou trocar de aplicativo também encerra e tenta salvar a pontuação já conquistada. Se a última mensagem não chegar, 30 segundos sem confirmação tornam a tentativa elegível a encerramento com o último estado persistido. Isso ocorre na consulta do ranking/status ou na limpeza periódica, que roda a cada dez segundos. Portanto, sem consulta, pode haver até cerca de dez segundos adicionais até aparecer no ranking.

Não há limite total de duração nas novas regras. A sessão mantém sua retenção normal. Cancelar durante a contagem inicial, antes de qualquer passo jogado, não cria entrada de zero pontos. Iniciar outra partida da edição atual encerra a tentativa ainda ativa do mesmo navegador, preservando o trecho confirmado.

O navegador pode ser encerrado pelo sistema operacional sem executar seus eventos de saída. Por isso, a última fração ainda não sincronizada pode se perder; não se deve prometer salvar todos os pontos em qualquer fechamento abrupto. Após uma conexão normal, a janela típica é o último intervalo de cinco segundos. Em rede instável, pode ser maior.

## Moderação local

Execute no servidor com a mesma configuração da aplicação:

```powershell
npm run admin -- list
npm run admin -- backup
npm run admin -- remove-player IDENTIFICADOR --confirm
```

O identificador é a TAG exibida na listagem e no resultado/ranking. A listagem mostra `desafio_atual` e `freestyle_atual` com o maior recorde combinado, além de `desafio_historico` e `freestyle_historico` para consultar o resultado anterior. Um valor vazio indica ausência de pontuação.

Remover participante exclui seu apelido, sessão, todos os recordes atuais e históricos, partidas e checkpoints por cascata. A pessoa pode voltar com uma nova sessão; isso não bloqueia sua identidade permanentemente.

Para excluir **todos** os participantes e **todos** os rankings, somente após decidir essa operação e criar backup:

```powershell
npm run admin -- reset-event --confirm
```

**Não execute reset-event para instalar esta atualização.** A migração é aditiva e não exige limpar dados. Não há painel administrativo público; a filtragem automática de apelidos não substitui revisão dos nomes publicados.

## Backup e restauração

O comando `backup` usa a API do SQLite e inclui participantes, rankings atuais e históricos e checkpoints. Com WAL ativo, copiar somente o arquivo principal pelo Explorador não garante uma cópia completa.

Guarde backups fora de `public/`, com acesso restrito. Antes de atualizar o código, execute o comando da versão já instalada e confira o arquivo gerado. Para restaurar, pare somente o processo do jogo e use um diretório de dados novo com a cópia escolhida; ajuste DB_PATH e valide antes de retomar. Isso evita misturar o banco restaurado com WAL/SHM de outra cópia.

Uma restauração pode trazer uma partida ativa. Se ela já estiver há 30 segundos sem confirmação, será encerrada a partir do checkpoint recuperado. Não recopie o banco em uso para apagar seletivamente um resultado.

Teste a restauração em ambiente isolado. Backups contêm apelidos; inclua-os na política de retenção e nos pedidos de exclusão.

## Privacidade e retenção

A aplicação guarda apelido público, identificador de sessão protegido, resultados e dados mínimos necessários à validação da partida. Checkpoints guardam o estado confirmado do jogo; não são histórico de navegação. O cookie é necessário ao reconhecimento do navegador; em HTTPS usa Secure, HttpOnly e SameSite. Não há publicidade de terceiros ou analytics.

A retenção padrão é de 30 dias, configurável com RETENTION_DAYS. O prazo do participante não é renovado a cada visita. Resultados expirados ficam fora das consultas; a limpeza remove o participante e todas as suas tabelas vinculadas enquanto o serviço funciona. Banco parado e backups exigem limpeza operacional apropriada.

A empresa deve manter finalidade, responsável, canal de atendimento e retenção alinhados ao aviso público. A equipe do estande pode atender pedidos usando a TAG; o aviso também aponta ao canal oficial da Freedom.

## Falha de rede

- Sem sessão ou início confirmado, a interface informa o erro e permite tentar novamente.
- Uma falha de envio final não deve aparecer como resultado salvo.
- Reenvios de uma partida concluída devolvem o mesmo resultado, sem duplicar linhas ou reduzir o recorde pessoal.
- Se houver encerramento por inatividade, o servidor devolve o resultado do último checkpoint; reenviar depois não acrescenta comandos a uma partida já encerrada.
- Ao voltar ao site, a interface pode consultar a tentativa pendente e recuperar a confirmação armazenada.

## Compatibilidade e atualização

As regras atuais são `survival-1`, com módulos compartilhados separados por modo. A abertura do banco cria `survival_scores` e `survival_runs`; mantém `players`, `runs`, `freestyle_scores` e `freestyle_runs`. APIs e regras legadas (`1` e `freestyle-1`) permanecem para concluir clientes antigos já carregados e consultar seu histórico. O ranking público atual combina o maior resultado por participante a partir das tabelas, sem copiar, reescrever ou excluir as linhas antigas. Uma nova tentativa menor não reduz o recorde anterior.

A atualização deve incluir servidor, módulos, HTML e estilos da mesma revisão. Não precisa de outro processo, porta ou Tunnel. O usuário optou por reunir os recordes mesmo com a mudança das regras, por se tratar de diversão. Essa combinação não transforma resultados antigos em replays das regras atuais. Mudanças futuras devem novamente definir como preservar e apresentar o histórico.

A tela usa a altura disponível e controles compactos em paisagem. Tela cheia depende do navegador e não é obrigatória. Conferir Safari em iPhone real com barras abertas, recolhidas, teclado, rotação e gesto de salto continua sendo parte da homologação.

## Limites de segurança

HTTPS e Tunnel protegem o transporte e evitam expor diretamente o processo, mas não substituem atualizações e permissões restritas. A aplicação limita requisições, valida sessão/Origin/CSRF, reconstitui resultados e publica somente arquivos permitidos. O token enviado por beacon só é aceito no corpo JSON da rota de confirmação; a origem e a sessão continuam obrigatórias.

O link pode circular fora da feira. O QR facilita acesso e não comprova presença física, compatível com o ranking recreativo definido pelo usuário.

## Entrega de versões e cache

Reinicie o processo após concluir a atualização dos arquivos; o frontend em execução é um snapshot consistente em memória. `GET /api/version` informa sua identidade sem criar sessão. HTML, APIs e o carregador não devem ser armazenados por caches intermediários.

O procedimento continua sendo `git pull` e reinício, sem novo comando de build ou migração de dados. [Detalhes e diagnóstico de cache](ATUALIZACOES-E-CACHE.md).
