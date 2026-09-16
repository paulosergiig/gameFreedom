# Operação do Desafio Freedom

## Ranking recreativo

- Top 10, recorde geral e posição pessoal independentes para Desafio Freedom e Freedom Freestyle. O apelido é compartilhado; pontos não são misturados.
- Cada sessão de navegador mantém uma posição com sua melhor pontuação.
- Nomes iguais não juntam pessoas.
- Empates compartilham posição; a ordem visual é estabilizada pela data do resultado.
- Não há prêmios, sorteios, cadastro de contatos ou comprovação de identidade.
- A partida é reconstituída no servidor por regras determinísticas. Isso impede trocar apenas o número de pontos, mas não elimina bots ou comandos automatizados.

A validade contada da emissão é de três minutos no Desafio Freedom (60 s + 3 s de contagem) e quatro minutos no Freestyle (90 s + 3 s de contagem). Uma conclusão só é aceita após o tempo de contagem e jogo. Reenvios de resultado já concluído retornam a mesma confirmação, sem duplicar pontos.

## Moderação local

Execute os comandos no servidor com a mesma configuração da aplicação:

```powershell
npm run admin -- list
npm run admin -- backup
npm run admin -- remove-player IDENTIFICADOR --confirm
```

O identificador é a TAG exibida pelo comando de listagem e no resultado/ranking do jogador. A listagem mostra os pontos dos dois modos em colunas separadas. Remover participante exclui apelido, recordes dos dois modos, sessão e todas as partidas vinculadas. O comando reset-event limpa os dois rankings. A pessoa pode voltar com uma nova sessão; isso não é bloqueio permanente de identidade.

Para limpar todos os participantes do evento, somente após decidir a operação e criar backup:

```powershell
npm run admin -- reset-event --confirm
```

Não há painel administrativo exposto na internet. Filtragem automática de apelidos ajuda, mas não substitui revisão dos nomes publicados.

## Backup e restauração

O comando `backup` usa a API de backup do SQLite para gerar cópia consistente. Com o banco ativo em WAL, copiar somente o arquivo principal pelo Explorador não é uma garantia de backup completo.

Armazene backups fora de `public/`, com acesso restrito. Para restaurar, pare o processo do jogo e use um diretório de dados novo com a cópia escolhida; atualize DB_PATH e valide antes de retomar. Isso evita misturar o arquivo recuperado com WAL/SHM de uma versão anterior.

Faça um teste de restauração em ambiente isolado antes da feira. Backups também contêm apelidos; inclua-os na política de retenção e pedidos de exclusão.

## Privacidade e retenção

A aplicação guarda apelido público, identificador de sessão protegido, melhor resultado e dados mínimos de partida. O cookie é necessário ao reconhecimento do navegador; em produção HTTPS usa Secure, HttpOnly e SameSite. Não há scripts de publicidade ou analytics.

A retenção padrão é de 30 dias, configurável com RETENTION_DAYS. O prazo do participante não é renovado ao visitar. Resultados expirados ficam fora das consultas; a limpeza remove dados vencidos enquanto o serviço funciona. Banco parado e backups exigem operação adequada de limpeza.

O texto público é um aviso básico do produto. Antes da divulgação, a empresa deve confirmar finalidade, responsável, canal de atendimento e retenção efetiva. No estande, a equipe pode atender pedidos de retirada mediante o identificador; fora dele, o aviso aponta ao canal oficial da Freedom.

## Falha de rede

- Se a sessão ou início não carregar, apresentar erro e permitir tentar de novo.
- Ao falhar o envio final, a tela não afirma que o resultado entrou no ranking.
- O botão de salvar novamente reenvia a mesma partida, dentro da validade.
- Iniciar uma nova tentativa ou fechar a página pode descartar o resultado ainda não confirmado. Oriente o visitante a tentar salvar antes.
- Ao trocar de aplicativo ou ocultar a página durante a corrida, a tentativa é interrompida; uma nova partida pode ser iniciada.

## Limites de segurança

HTTPS e Tunnel protegem o transporte e evitam expor uma porta de entrada do jogo, mas não substituem atualizações, permissões restritas e supervisão. A aplicação limita tamanho de requisições, valida origem e sessão, reconstitui resultados e publica apenas arquivos permitidos. O servidor Windows continua compartilhado.

O link pode circular fora da feira. O QR code facilita acesso; não comprova presença física. Isso é aceitável para o ranking de diversão definido pelo usuário.

## Atualização para o Freestyle

A abertura do banco cria tabelas adicionais para o segundo modo. O recorde, as partidas e o identificador do Desafio original são mantidos. Faça backup consistente antes da atualização, como em qualquer troca de versão. A rotina de exclusão e retenção abrange os dois jogos.

Os arquivos da interface e das regras devem ser publicados junto com o servidor da mesma versão. O Freestyle usa a versão de regras `freestyle-1`. Alterações futuras na física, pista ou pontuação exigem avaliar nova edição do ranking; não misture resultados de regras diferentes.

Iniciar uma tentativa encerra outra ainda ativa daquele navegador, inclusive de outro modo. Abrir o mesmo jogo em várias abas não cria tentativas simultâneas válidas.