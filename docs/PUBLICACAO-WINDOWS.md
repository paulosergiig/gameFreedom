# Publicação no Windows Server

Este roteiro prepara a publicação do jogo no servidor da empresa, uma etapa distinta do envio ao GitHub. Nenhuma mudança no servidor, Tunnel ou DNS foi executada pelo assistente. A disponibilidade de portas, permissões e serviços existentes ainda precisa ser inspecionada no ambiente real.

## 1. Preparar uma pasta e identidade próprias

- Use Node.js 24 LTS x64, atualizado dentro da linha 24, obtido do site oficial.
- Mantenha o jogo em pasta própria, separada dos sistemas de manutenção e SST.
- Use conta de execução sem privilégios administrativos.
- Essa conta precisa ler o código e gravar apenas na pasta de dados; não deve ter acesso aos bancos ou credenciais dos outros sistemas.
- Não exponha a raiz da pasta por IIS ou por outro servidor HTTP.
- O processo do Node já serve o frontend e a API. Não é necessário instalar IIS ou uma nova aplicação Django para este jogo.
- Um único processo Node deve operar o banco SQLite em disco local. Não colocar esse arquivo em compartilhamento de rede.

Por decisão do usuário em 16/09/2026, `planejamento-local/` deve ser versionada no repositório privado [gameFreedom](https://github.com/paulosergiig/gameFreedom). O `.gitignore` continua excluindo dados de execução, backups, dependências, `output/` e `.env`. Arquivos já rastreados pelo Git não deixam de ser rastreados apenas por entrar no ignore.

Se o repositório for clonado no servidor, o planejamento deve continuar inacessível pela web: somente a lista permitida de arquivos em `public/` e as rotas da API devem ser acessíveis pela web. Não configure IIS ou outro servidor para servir a raiz do clone.

## 2. Escolher uma porta livre

As portas 8000, 8500, 8600 e 8900 foram informadas como ocupadas. A aplicação usa 3000 apenas como padrão de desenvolvimento.

No servidor, consulte:

```powershell
Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Select-Object LocalAddress,LocalPort,OwningProcess
```

Não encerrar processos ou reutilizar portas dos sistemas existentes. Verifique também reservas antes de escolher a porta.

## 3. Configurar o ambiente

Crie `.env` na pasta do jogo a partir de `.env.example`. Exemplo com placeholders que devem ser substituídos:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=PORTA_LIVRE_VERIFICADA
PUBLIC_URL=https://SUBDOMINIO_ESCOLHIDO.freedom.dev.br
TRUST_PROXY=true
RETENTION_DAYS=30
DB_PATH=C:/CAMINHO/PRIVADO/dados-freedom/freedom.sqlite
```

- PORT deve conter somente um número válido.
- PUBLIC_URL é exatamente a origem HTTPS final, sem caminho, parâmetros ou credenciais.
- TRUST_PROXY=true só é adequado ao cloudflared no mesmo servidor, encaminhando por loopback. A aplicação só confia no endereço de cliente encaminhado quando a conexão vem de loopback.
- Se o Tunnel estiver em outra máquina, interrompa esta adaptação e revise a conectividade; não abra o backend para todas as interfaces sem necessidade.
- O banco e seus backups precisam ficar fora de `public/`.
- Não colocar tokens do Tunnel no código, frontend, GitHub ou capturas de tela.

Execute `npm start` para testar a inicialização. Com PUBLIC_URL pública, a aplicação valida esse host e não aceita navegar por qualquer hostname. Antes da rota externa, a saúde local pode ser consultada com o Host esperado:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:PORTA_LIVRE_VERIFICADA/api/health' -Headers @{ Host = 'SUBDOMINIO_ESCOLHIDO.freedom.dev.br' }
```

A resposta deve conter `ok: true`. A aplicação deve recusar subir em produção sem URL HTTPS.

## 4. Acrescentar somente a nova rota no Tunnel

No Tunnel já existente, adicione um hostname público apontando a:

- Hostname: o subdomínio escolhido em freedom.dev.br.
- Serviço: HTTP.
- Origem: `127.0.0.1:PORTA_LIVRE_VERIFICADA`.

Preserve o Host da URL pública até o Node. Caso exista configuração de sobrescrita de Host na origem, ajuste-a para a mesma origem de PUBLIC_URL.

Faça cópia das configurações relevantes antes. Preserve as rotas de manutenção, SST e outros serviços. Não criar regras curinga desnecessárias. Em túnel gerenciado por arquivo, as regras e a regra final de fallback exigem conferência antes de alterar; este documento não presume qual modo está em uso.

Não é necessário abrir uma nova porta de entrada no roteador para o jogo quando o Tunnel está no mesmo servidor. O banco não deve ter porta pública.

Fontes oficiais: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) e [roteamento](https://developers.cloudflare.com/tunnel/concepts/routing/).

## 5. Manter o processo em execução

O comando manual depende do terminal permanecer aberto. Para operação contínua, use o mecanismo de supervisão já adotado pela empresa. Uma opção nativa é o Agendador de Tarefas do Windows:

- Executar com a conta restrita do jogo, mesmo sem sessão interativa.
- Disparador ao iniciar o servidor, com pequeno atraso.
- Programa: caminho absoluto de `node.exe`.
- Argumentos: `--env-file=.env server.mjs`.
- Iniciar em: pasta absoluta do jogo, onde estão `.env` e `server.mjs`.
- Reiniciar em caso de falha e não iniciar nova instância se uma já estiver rodando.
- Desabilitar limite automático de duração da tarefa para o processo contínuo.

Não usar `New-Service` diretamente com node.exe: o processo não implementa por si só um serviço Windows. Teste reinício e recuperação usando a forma de supervisão escolhida, sem reiniciar o servidor compartilhado só para esse teste.

## 6. Validar antes de divulgar

1. Abrir a URL HTTPS em um Android e em um iPhone reais.
2. Conferir a logo, controles, teclado do apelido, som opcional e tela pequena.
3. Jogar uma partida completa de cada modo em cada aparelho; conferir o Freestyle com o celular deitado e dois dedos simultâneos.
4. Verificar os rankings compartilhados nos dois aparelhos e a separação de pontuações entre os modos.
5. Testar o botão de reenvio e a mensagem de falha em conexão instável.
6. Conferir que `/.env`, `/data/freedom.sqlite`, `/planejamento-local/README.md` e `/.git/config` retornam erro.
7. Verificar que os sistemas já existentes continuam funcionando.
8. Criar um backup consistente, testar restauração em uma cópia isolada e designar responsável pela moderação.
9. Confirmar aviso de privacidade, prazo de retenção e canal de contato com a empresa.
10. Gerar e testar o QR code impresso, em tamanho e iluminação reais.

O jogo depende de conexão para primeiro acesso e ranking. Ele não inclui modo offline persistente e não exige instalação.

## 7. QR code definitivo

Em uma máquina de preparação, execute `npm ci` e:

```powershell
npm run qr -- https://SUBDOMINIO_ESCOLHIDO.freedom.dev.br
```

Use o PNG ou SVG de `output/qrcode/`, com borda branca preservada e URL legível ao lado. O gerador recusa localhost e endereços que não sejam subdomínio HTTPS de freedom.dev.br. Gerar o QR não cria o subdomínio nem comprova que ele está acessível.

## Atualização e reversão

Antes de atualizar, faça backup e guarde o pacote anterior. Pare apenas o processo do jogo, substitua os arquivos da aplicação e preserve `.env` e a pasta privada de dados. Suba novamente e valide a saúde e uma partida.

Mudanças de regras não devem misturar pontuações incompatíveis. Nesta versão há um evento fixo; para outro evento ou mudança competitiva, faça backup e reinicie o ranking pelo comando local, após decidir essa operação.

Se houver problema, restaure a versão anterior e, se necessário, o backup compatível, com o processo parado. Nunca sobreponha um banco em uso com arquivos copiados. Preserve os arquivos de dados e configuração até confirmar a recuperação.
