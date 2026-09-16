# Freedom Freestyle — implementação

> Registro histórico da versão com tempo fixo. As melhorias atuais com três vidas e os recordes combinados estão no [documento 10](10-melhorias-sobrevivencia.md).

Data: 16/09/2026.
Status: implementado e validado localmente.

## Decisão do usuário

O usuário aprovou o primeiro jogo, pediu preservação e escolheu um segundo modo lateral com foco em manobras e pontuação, priorizando celular deitado. Depois da consulta, autorizou expressamente criar o jogo. A proposta de quatro controles foi adotada na implementação.

## Experiência

- Entrada própria na página inicial, preservando o Desafio Freedom original.
- Sessão de 90 segundos e contagem inicial de 3 segundos.
- Acelerar/frear no grupo direito e inclinar para trás/frente no esquerdo; suporte a toques simultâneos e teclado.
- Saltos naturais nas rampas, giros completos e confirmação de pontos ao pousar.
- Pontos no ar são provisórios. Queda perde esses pontos e o combo, mantém o total confirmado e retoma em ponto próximo. Relógio continua.
- Circuito fixo para comparação recreativa; cenário fictício inspirado no interior da Paraíba. Não é reprodução de percurso real nem simulação de desempenho de pneus.
- Um apelido por navegador compartilhado pelos modos; rankings independentes.
- Não depende de bloqueio de orientação ou de tela cheia. Sugere deitar o celular; rotação não interrompe a tentativa.

## Arquitetura

- Motor próprio em Canvas 2D, sem biblioteca adicional em execução.
- `public/shared/freestyle-rules.js`: simulação compartilhada, 60 passos por segundo, regras `freestyle-1`, 5.400 passos por rodada.
- `public/freestyle.js`: renderização, câmera, sons opcionais, entrada e controle de tempo.
- Transições de controles `{tick, buttons}` limitadas a 720 por partida. O servidor reconstitui o resultado e não aceita pontuação informada pelo cliente.
- Endpoints sob `/api/freestyle/` mantêm sessão, Origin, CSRF, limites de acesso e lista restrita de arquivos públicos já existentes.
- Tabelas adicionais `freestyle_scores` e `freestyle_runs`, com referência ao participante e exclusão por cascata.
- Tabelas, recordes e regras do Desafio original preservados. O início em um modo abandona apenas outra tentativa ainda ativa do mesmo navegador.
- Envio final é idempotente: o mesmo resultado já confirmado pode ser recuperado, sem duplicação.
- Validade da tentativa: quatro minutos; confirmação após pelo menos 93 segundos de relógio do servidor.
- Retenção e moderação local abrangem ambos os modos. Administração não possui página pública.

## Preservação e operação

Antes da integração foi criado backup consistente em `output/backups/antes-freestyle.sqlite`, ignorado pelo Git. Nenhum registro de produção, servidor da empresa, DNS, Tunnel ou repositório remoto foi alterado.

A publicação continua no mesmo processo/porta do jogo: não precisa abrir outra aplicação ou porta para o Freestyle. Os arquivos novos devem acompanhar o pacote completo. Instruções operacionais e de publicação ficam em `docs/`.

## Verificações

- API: separação dos rankings, identidade compartilhada, rejeição de resultados forjados, propriedade da tentativa, CSRF, expiração e repetição segura.
- Migração: banco criado no esquema antigo, dados preservados linha por linha e novo ranking inicialmente vazio; empates, persistência e cascata de exclusão.
- Física: saltos, rotações, pontos pendentes, quedas, obstáculos, combo e limite de comandos.
- Navegador: jornadas completas nos perfis Chromium/Android e WebKit/iPhone; comparação da pontuação do navegador com o replay Node; falha/reenvio, troca de ranking, rotação e liberação dos controles.

Resultados: `npm test` — 31/31 testes aprovados. Playwright — 10/10 jornadas aprovadas, cobrindo os dois modos nos perfis Android/Chromium e iPhone/WebKit. Nenhum erro de página nas jornadas. Pontuação exibida pelo Freestyle coincidiu com o replay Node nos dois navegadores. Capturas do início, tutorial, pista e ranking foram conferidas; enquadramento ajustado para a moto ficar maior em paisagem.

A limpeza de diretórios temporários dos testes ganhou repetição limitada para tolerar bloqueio breve do Windows. A regressão de colisão no mesmo passo de aterrissagem está coberta por teste: queda nunca confirma os pontos daquele salto.

A prévia em http://127.0.0.1:3000 foi reiniciada com a nova API. Perfis móveis emulados não substituem uma rodada de conferência em smartphones reais antes da feira.

## Refinamento visual do piloto e da moto

Pedido posterior do usuário: melhorar a aparência do conjunto no Freedom Freestyle.

O desenho em Canvas foi refeito com capacete de trilha menor e mais definido (pala, óculos e queixeira), postura inclinada, mãos no guidão, botas nas pedaleiras e articulação visual dos membros. Carenagem com curvas, banco preto, painel lateral claro, motor, escapamento, corrente, suspensão e pneus com cravos formam uma silhueta mais legível. Dourado, preto, prata e detalhes claros dão contraste com o cenário. A postura acompanha os controles de inclinação e os saltos.

As rodas mantêm a linha de contato visual no mesmo ponto da simulação. O enquadramento foi ajustado ao novo contorno do piloto. Os pontos pendentes continuam no HUD; a indicação duplicada sobre o capacete foi removida para deixar a arte livre durante os saltos. Regras, duração, pontuação e dados do ranking não foram alterados.

Verificação: sintaxe do módulo, comparação visual antes/depois em três poses, renderização sem erro de página em Chromium e WebKit e captura durante partida com viewport horizontal de celular. Não foi necessário repetir as jornadas de pontuação, pois a alteração ficou no desenho.
