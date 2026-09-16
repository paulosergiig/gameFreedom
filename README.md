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

**Desafio Freedom:** o jogo original, com 60 segundos, três faixas, asfalto e trilha. Toque nas setas para desviar e coletar pneus dourados.

**Freedom Freestyle:** 90 segundos em visão lateral, com rampas, obstáculos e manobras. Priorize o celular deitado. Segure acelerar ou frear com o polegar direito e incline a moto com o esquerdo. A moto salta ao sair das rampas; giros completos e boas aterrissagens dão pontos. Pontos no ar só são confirmados ao pousar. Quedas perdem o combo e os pontos pendentes, preservam o total confirmado e retomam perto da ação; o relógio continua.

No computador, o Freestyle usa ↑ para acelerar, ↓ para frear e ←/→ para inclinar. O Desafio original continua usando ←/→ para mudar de faixa.

## Participação e ranking

- Escolha um apelido de 2 a 20 caracteres.
- Escolha um dos dois modos na página inicial.
- Consulte as instruções do modo antes da primeira tentativa.
- Mantenha a página aberta durante a partida. Ao trocar de aplicativo, a tentativa é interrompida.
- O servidor reconstitui a partida e confirma a pontuação. Seu melhor resultado aparece no ranking daquele modo. As pontuações dos dois jogos não são somadas.
- Se o envio falhar, use o botão de tentar salvar novamente enquanto a partida ainda estiver válida.

A identidade é daquele navegador. Não existe comprovação de pessoa única e não há proteção absoluta contra automação.

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
