# Desafio Freedom

Dois jogos web da Pneus Freedom, com o mesmo apelido e rankings recreativos separados. Acesso por QR code em smartphones, sem instalação e sem premiação.

## Executar no computador

Requer Node.js 24 LTS (24.11 ou superior dentro da linha 24).

1. Abra um terminal nesta pasta.
2. Execute `npm start`.
3. Abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

O servidor não depende de pacotes externos em execução: HTTP e SQLite vêm do Node. O banco é criado em `data/freedom.sqlite`, fora da pasta pública. Um aviso do Node sobre SQLite experimental não significa falha.

Use `npm ci` para instalar as ferramentas de desenvolvimento e geração de QR. Não abra `index.html` por duplo clique: o ranking depende do servidor.

Se a porta 3000 estiver ocupada, copie `.env.example` para `.env` e ajuste PORT e PUBLIC_URL juntos. Essa porta é uma sugestão para desenvolvimento e não foi reservada no servidor da empresa.

## Escolher seu desafio

A página inicial apresenta os dois jogos com acesso direto. Ambos têm **três vidas** e continuam enquanto houver vidas. O tempo exibido é o tempo sobrevivido, sem contagem regressiva de 60 ou 90 segundos.

**Desafio Freedom:** três faixas, asfalto e trilha. Desvie dos obstáculos e colete pneus dourados. Cada colisão consome uma vida; velocidade e dificuldade aumentam progressivamente. Há um breve intervalo de proteção após a batida para evitar acidentes consecutivos sem oportunidade de reação.

**Freedom Freestyle:** visão lateral, rampas, troncos, pedras e manobras. Segure acelerar ou frear e incline a moto. Para saltar, mantenha o acelerador pressionado e arraste o dedo para cima, ou use o botão de salto. As rampas também lançam a moto. Cada queda consome uma vida; a terceira encerra a tentativa. Pontos no ar só são confirmados ao pousar. A dificuldade aumenta com a progressão.

No computador, o Desafio usa ←/→ para mudar de faixa. No Freestyle, W acelera, ↓ ou S freiam, ←/→ inclinam e Espaço ou ↑ saltam.

A área de jogo se adapta ao espaço visível do navegador. No iPhone, a experiência funciona com as barras do Safari presentes, em pé ou deitado. Tela cheia é uma opção quando suportada; não é requisito para jogar.

## Participação e ranking

- Escolha um apelido de 2 a 20 caracteres e um dos dois jogos.
- Consulte as instruções antes da primeira tentativa.
- Em aparelho compartilhado, confira “Jogando como” e use **Trocar jogador** para outra pessoa. Cancelar mantém o jogador atual; confirmar cria uma participação separada, preservando os recordes anteriores.
- Ao acabar a terceira vida ou encerrar a partida, o resultado confirmado entra no ranking daquele modo. Pontos dos jogos não são somados.
- A página confirma o progresso com o servidor periodicamente e tenta enviar o trecho final ao sair ou trocar de aplicativo.
- Se o sistema fechar o navegador sem permitir o último envio, o servidor encerra a tentativa após 30 segundos sem confirmação e preserva o último trecho recebido. Os segundos ainda não enviados podem se perder.
- Quando houver erro de envio, use a opção de tentar salvar novamente; a interface só confirma o registro depois da resposta do servidor.

Os recordes anteriores e os novos aparecem juntos no ranking de cada jogo, conforme decisão do usuário. Vale a maior pontuação de cada participante entre as duas versões; os dados antigos são preservados e um resultado menor nunca os substitui. O apelido e a sessão continuam os mesmos.

O navegador mantém o jogador selecionado até uma troca explícita ou expiração da sessão. Cada troca cria outra identificação nos dois jogos; digitar um nome anterior não recupera sua participação, pois não há login. Nomes iguais não juntam pontuações. Não existe comprovação de pessoa única e não há proteção absoluta contra automação.

## Testes

```powershell
npm ci
npm test
npx playwright install chromium webkit
npm run test:e2e
```

Os testes de navegador usam servidor e banco em memória próprios na porta 39177. Chromium e WebKit emulam perfis móveis, mas não substituem a conferência final em Android e iPhone reais.

## Publicação e operação

- [Publicar no Windows Server com Cloudflare Tunnel](docs/PUBLICACAO-WINDOWS.md)
- [Moderação, backup e privacidade](docs/OPERACAO.md)
- [Decisões da melhoria com três vidas](planejamento-local/10-melhorias-sobrevivencia.md)
- [Recursos visuais e origem da arte](docs/ASSETS.md)

Para gerar QR code **depois de definir e publicar a URL real**:

```powershell
npm run qr -- https://SEU-SUBDOMINIO.freedom.dev.br
```

Os arquivos PNG e SVG são gravados em `output/qrcode/`. O comando valida o domínio e não altera DNS nem publica o site. Não imprima um QR com endereço de exemplo.

## Estrutura

- `public/`: interface, renderização e regras compartilhadas.
- `server.mjs` e `lib/`: API, sessões, verificação e armazenamento.
- `tests/`: testes de regras, servidor e jornadas no navegador.
- `scripts/`: comandos locais para administração e QR code.
- `data/`: dados de execução, ignorados pelo Git.
- `planejamento-local/`: anotações internas, versionadas por decisão do usuário no repositório privado.

Por decisão do usuário em 16/09/2026, o planejamento deve ser versionado no repositório privado [gameFreedom](https://github.com/paulosergiig/gameFreedom). Dados de execução, `.env`, backups e arquivos de `output/` continuam ignorados pelo Git.

A aplicação serve uma lista restrita de arquivos dentro de `public/`. Nunca configure outro servidor para publicar a raiz do repositório.

## Atualizações sem misturar arquivos em cache

O servidor identifica automaticamente cada versão do frontend por seu conteúdo e entrega CSS, módulos dos dois jogos, imagens e fontes em URLs próprias. HTML e APIs não são armazenados. Continue publicando com `git pull` e reinício do processo: não há build nem versão manual. Banco e sessões são preservados.

Em desenvolvimento, `npm run dev` acompanha alterações em `public/`, `lib/` e `server.mjs`; com `npm start`, reinicie após editar arquivos. Consulte [Atualizações e cache](docs/ATUALIZACOES-E-CACHE.md) para o diagnóstico, recuperação de abas antigas e verificação dos cabeçalhos no Cloudflare.
