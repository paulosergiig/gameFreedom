# Segundo jogo — Freedom Freestyle

Data: 16/09/2026.
Status: registro histórico da etapa consultiva. Após este estudo, o usuário aprovou a proposta e autorizou a implementação em 16/09/2026. As alternativas abaixo documentam a discussão original; consulte 09 para o resultado implementado.

## Pedido confirmado

- Preservar o jogo atual, que foi aprovado pelo usuário.
- Estudar um segundo jogo em visão lateral.
- Incluir aceleração, frenagem, saltos, manobras e obstáculos.
- Oferecer uma experiência mais desafiadora a quem desejar.
- Manter acesso web pelos smartphones dos visitantes e identidade exclusivamente Freedom.
- Ranking continua recreativo, sem premiação.
- Preferência confirmada: fazer manobras e buscar pontuação alta.
- Orientação confirmada: priorizar o celular deitado.
- Nenhuma implementação, configuração ou dado do jogo existente foi alterado durante este estudo.

## Viabilidade

É viável desenvolver uma experiência 2D desse tipo para navegador. O projeto atual oferece uma base para identidade visual, apelidos, publicação e classificação. Entretanto, controle de velocidade, equilíbrio, contato das rodas com o terreno e aterrissagem exigem uma simulação nova.

A recomendação é física de arcade: resposta consistente, controle previsível e tolerância ajustada ao público. A prioridade é que jogar seja agradável. Não simular especificações reais de pneus nem prometer precisão de uma motocicleta real.

O desempenho relevante será principalmente o do celular. A capacidade de armazenamento e a RAM do servidor não tornam a física no navegador mais fluida.

## Referências pesquisadas

- [Moto X3M — página do jogo em sua plataforma de distribuição](https://poki.com/en/g/moto-x3m): exemplo jogável no navegador, com acelerar, frear, equilíbrio, rampas e retomadas por checkpoint. Referência de controles e ritmo.
- [Trials — apresentação oficial](https://www.ubisoft.com/en-us/company/about-us/our-brands/trials): referência conceitual de percursos com obstáculos e controle físico da moto. Não é apresentado aqui como comprovação de que sua versão comercial rode no navegador.
- [Trials Rising — descrição oficial de saltos e checkpoints](https://news.ubisoft.com/en-us/article/4Br16FNvGgY2MtpWelZDIh/trials-rising-going-tandem-and-breaking-bones-abroad-e3-2018): referência de aprendizado por tentativa e retomada rápida.

As referências servem apenas ao estudo. Arte, personagens, nomes, pistas, sons e publicidade de outros jogos não serão incorporados ao produto Freedom. Não usar jogo externo embutido no site.

## Proposta de experiência

Nome de trabalho: **Freedom Freestyle — Desafio de Manobras**. Nome ainda não aprovado.

Moto genérica de trilha, vista de lado, com piloto equipado. Percurso fictício inspirado no ambiente rural de Massaranduba: terra, serras ao fundo, pedras, troncos, rampas de madeira e pequenas travessias. Bandeiras e elementos de cenário podem receber a marca Freedom.

O visitante controla a velocidade, escolhe como abordar cada rampa e corrige a inclinação no ar. Saltos acontecem ao sair da rampa; inicialmente não há necessidade de botão separado para pular.

Objetivo confirmado: realizar manobras e buscar a maior pontuação. A proposta passa a ser uma sessão de 90 segundos, com saltos, giros e aterrissagens como foco. O cronômetro encerra a rodada; não há obrigação de cruzar uma linha de chegada para participar do ranking.

Mesmo sem completar um giro, um salto bem executado pode render pontos. A evolução está em aprender a combinar velocidade, rotação e aterrissagem.

Exemplo de trecho:

1. Reta curta ensina a acelerar e frear.
2. Pequena rampa apresenta a primeira aterrissagem.
3. Subida com tronco pede controle de velocidade.
4. Um ponto de retomada permite continuar perto da ação depois de cair.
5. Salto mais longo oferece oportunidade de giro completo.
6. Rampas seguintes permitem encadear manobras e melhorar o multiplicador.

A dificuldade deve vir de escolhas compreensíveis e habilidade, não de obstáculos invisíveis ou colisões imprevisíveis.

## Controles a discutir

| Alternativa | Funcionamento | Benefício | Limitação |
| --- | --- | --- | --- |
| Dois botões | Acelerar e frear no chão; no ar, ajudam a levantar/baixar a frente | Entrada simples e poucos controles | A mudança de função precisa de tutorial e oferece menos controle independente |
| Quatro botões | Acelerar, frear, inclinar para trás e inclinar para frente | Melhor domínio de saltos e manobras | Exige aprendizado e mais espaço de tela |

Recomendação principal para o objetivo de maior habilidade: quatro controles, organizados em dois grupos para os polegares. Um lado controla equilíbrio; o outro, aceleração e freio. Em cada grupo, as ações opostas não precisam ser usadas simultaneamente.

A alternativa de dois botões continua válida se a prioridade for acessibilidade. A escolha não foi aprovada pelo usuário. Não acrescentar botão de salto, marcha, embreagem ou catálogo de manobras antes de validar a experiência básica.

O usuário confirmou a preferência por celular deitado, para enxergar o próximo obstáculo e acomodar os dois polegares. Menus podem atender ambas as orientações. A futura implementação não deve depender de o navegador permitir bloquear a orientação ou entrar em tela cheia.

## Quedas, manobras e retomadas

- Tombar ou atingir o terreno de forma incompatível provoca uma queda breve.
- Retorno ao último checkpoint após uma animação curta; o cronômetro da sessão continua.
- Uma queda perde os pontos ainda não confirmados daquele salto e zera o combo. Pontos confirmados anteriormente são preservados.
- Reinício rápido, sem telas longas interrompendo o ritmo.
- Manobras propostas: salto longo, giro completo para trás ou para frente e aterrissagem precisa. Começar pelo salto e giro, acrescentando variedade após ajustar os controles.
- Bônus só confirmado ao aterrissar com sucesso.
- Associar a recompensa ao salto/trecho e impedir que voltar ao checkpoint permita repetir a mesma coleta de pontos.
- Não premiar ficar girando indefinidamente no mesmo lugar.
- Apoio em uma roda pode ser uma melhoria posterior, dependendo do equilíbrio da física.

Tolerância de aterrissagem, tamanho de salto e penalidade de queda devem ser ajustados com testes de jogo.

## Escopo inicial recomendado

- Uma moto e uma pista completa, desenhada e testada.
- Três trechos de dificuldade progressiva dentro dessa pista.
- Rampas, obstáculos estáticos, gravidade, equilíbrio e contato com o chão.
- Dois checkpoints e reinício rápido.
- Salto e giro reconhecidos, com aterrissagem obrigatória para confirmar pontos; combo com limite.
- Tela de resultado e classificação exclusiva do modo.
- Controles confortáveis em tela horizontal.
- Tutorial curto e testes em Android e iPhone.

Duração proposta: 90 segundos por rodada, sujeita a teste e decisão final. A pista deve oferecer obstáculos e oportunidades de manobra suficientes para toda a sessão, incluindo quem avançar mais rápido. O primeiro trecho serve de aquecimento; os seguintes oferecem maior risco e recompensa.

Ficam para depois: várias motos, quadriciclo jogável, melhorias compráveis, combustível, editor de pistas, obstáculos móveis complexos, multiplayer e física detalhada do corpo do piloto.

## Convivência com o jogo existente

Proposta de uma entrada comum após o QR code, com escolha clara:

| Jogo | Apresentação |
| --- | --- |
| Desafio Freedom | Partida rápida, reflexos e controles simples |
| Freedom Freestyle | Manobras, saltos e busca de pontuação |

O mesmo apelido pode servir aos dois. Os rankings devem permanecer separados. O resultado do jogo lateral não pode sobrescrever ou competir diretamente com os pontos do atual.

Na futura implementação, preservar regras, partidas e recordes do primeiro jogo. É possível acrescentar uma seleção de jogos sem redesenhar toda sua experiência. A rota de entrada e a apresentação dessa seleção ainda não foram decididas.

## Classificação proposta

Ranking separado por maior pontuação confirmada ao longo da sessão. Não usar o menor tempo de conclusão como objetivo, pois o usuário priorizou manobras.

Proposta de cálculo, ainda sem valores definitivos:

- Pontos por salto com duração/distância significativa, com limites.
- Bônus por giro completo, identificado pela rotação durante o salto.
- Bônus por aterrissagem precisa.
- Multiplicador limitado para sequências de manobras bem-sucedidas.
- Queda interrompe a sequência e descarta somente o ganho não confirmado do salto.
- Repetir um trecho via checkpoint não deve permitir acumular o mesmo bônus indefinidamente.

Na interface, separar “pontos do salto” ainda pendentes do total já confirmado. Depois de pousar com sucesso, uma animação curta incorpora o ganho ao total.

Evitar recompensa de giro automático por botão: a proposta é o visitante controlar a rotação. Um botão de manobra assistida seria outra experiência, a ser discutida se os controles se mostrarem difíceis demais.

Pontuações iguais podem compartilhar a mesma posição, como no jogo atual. Guardar apenas o melhor resultado de cada participante nesse modo.

Não comparar tentativas de pistas ou versões físicas diferentes no mesmo ranking. Modificar a pista ou regras competitivas requer separar a edição correspondente.

## Arquitetura futura

Reaproveitar sessão e infraestrutura de publicação; separar estado, regras, interface de partida e classificação por jogo.

O protocolo atual de movimentos por faixa não serve automaticamente ao novo modo: a simulação lateral precisa registrar duração dos comandos, velocidade, inclinação e interações com o terreno. O servidor deve vincular a tentativa ao modo, pista e versão corretos.

Dar preferência a simulação com passos fixos e regras reproduzíveis. Um motor físico genérico não garante sozinho resultados idênticos entre navegadores e servidor. Avaliar uma prova técnica quando houver autorização de implementação; não escolher biblioteca nem prometer replay exato antes dessa verificação.

Toda migração de dados deve preservar o recorde atual. A aceitação da segunda versão inclui testes de regressão do primeiro jogo.

## Riscos práticos e prioridade de entrega

A maior parcela do trabalho estará no ajuste de colisões, estabilidade da moto, resposta dos controles e dificuldade da pista. Não se trata apenas de mudar o ângulo da câmera.

Como a feira começa em 17/09/2026, o jogo existente é a versão já disponível. O novo modo só deve ser oferecido ao público depois de estar agradável e verificado; sua conclusão antes do evento não está garantida por este estudo.

Não foram instaladas dependências, criados protótipos ou modificados arquivos do aplicativo durante esta análise.

## Respostas confirmadas e decisões em aberto

O usuário respondeu às duas perguntas consultivas:

1. Diversão principal: **fazer manobras e buscar pontuação alta**.
2. Orientação: **priorizar o celular deitado**.

A proposta anterior de terminar o percurso com menor tempo foi substituída pela sessão de manobras.

Ainda são propostas: nome Freedom Freestyle, quatro controles, duração de 90 segundos, pista inicial, valores dos bônus, combo e regra detalhada de aterrissagem. Nenhum código deste segundo modo está autorizado nesta etapa.
