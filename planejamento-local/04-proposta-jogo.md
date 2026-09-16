> Atualização: em 16/09/2026 o usuário confirmou ranking apenas recreativo e autorizou a implementação. Este registro preserva o planejamento anterior. Consulte [a implementação atual](07-implementacao.md).

# Proposta de jogo — Desafio Freedom

Status: proposta para discussão; implementação não iniciada. Revisada para smartphones próprios e ranking compartilhado.

## Ideia para apresentar ao gestor

Uma experiência de aproximadamente um minuto na qual o visitante conduz uma moto genérica em um circuito fictício da Freedom, desvia de obstáculos e acumula pontos. A identidade da empresa aparece desde a abertura até o resultado. A partida termina com um convite curto para conhecer os pneus no estande.

A meta comercial é atrair atenção e facilitar uma conversa. Não se presume que o jogo, sozinho, gere vendas ou contatos qualificados.

## Mecânica recomendada

- Arcade 2D com sensação de profundidade e movimento, sem simulação física complexa.
- Percurso com três faixas; movimento automático e comandos de esquerda/direita.
- Circuito fechado fictício, com piloto equipado, sem trânsito real ou outras marcas.
- Aproximadamente 60 segundos por partida, após instrução visual curta.
- Desviar de cones e barreiras; coletar marcadores de pontos.
- Colisões reduzem a pontuação ou o multiplicador, com feedback breve, sem eliminar imediatamente um iniciante.
- Dificuldade progressiva, com obstáculos legíveis e trajetos possíveis.
- Pontos são fictícios; não há equivalência com velocidade ou desempenho de produto real.
- Pontuação da partida, melhor resultado do participante e classificação compartilhada, conforme as regras propostas em [Ranking e smartphones](06-ranking-mobile.md).

Para refletir as linhas de pneus, o circuito pode ter um trecho asfaltado e outro de terra com a mesma mecânica. Essa transição é temática, sem afirmar que um pneu específico é adequado a qualquer terreno. Se faltar tempo para polir ambos, entregar um cenário completo primeiro.

## Fluxo de uso

1. Visitante lê o QR code com o próprio celular e abre a URL oficial do jogo.
2. Abertura: logo Freedom, nome do desafio, botões Jogar e Ranking.
3. Primeiro acesso: escolha de nome curto ou apelido, com aviso de exibição pública.
4. Instrução: demonstração dos dois comandos e do objetivo.
5. Partida: pista ocupa o foco; tempo e pontos ficam legíveis.
6. Resultado: pontuação, estado do envio ao servidor, melhor resultado e posição confirmada.
7. Ranking: líderes do evento, recorde geral e destaque para o próprio participante.
8. Opção de jogar novamente e convite para conhecer os pneus no estande.

O nome deve ser lembrado no mesmo navegador quando a sessão estiver disponível. Não há retorno automático para “próximo visitante”, pois cada pessoa usa seu próprio aparelho.

A ação de iniciar deve liberar eventual áudio; som será opcional. Se o navegador for colocado em segundo plano, interromper a partida com uma mensagem clara; a regra de retomada para ranking deve ser definida antes de implementar, sem depender apenas do relógio do celular.

## Identidade e apresentação

- Logo fornecida, paleta validada pelo manual e textos em português.
- Moto sem emblemas ou reprodução identificável de modelo de fabricante.
- Cenário com referências visuais genéricas ao Nordeste, sem imagens ou logotipos de terceiros.
- Marca presente de forma clara, sem cobrir os controles ou o percurso.
- Imagens de pneus reais na abertura ou no resultado, se trouxerem clareza e não comprometerem prazo e carregamento.
- Interface adequada ao público adulto de negócios, com texto curto e boa legibilidade.
- Sem obrigar cadastro, instalação ou conhecimento técnico para jogar.

## Escopo da primeira entrega proposta

Essencial:

- Ciclo completo: abrir, entender, jogar, terminar e reiniciar.
- Controles de toque grandes, com tela vertical como proposta; teclado serve apenas de apoio às demonstrações.
- Personalização Freedom aplicada ao conjunto da experiência.
- Pontuação consistente, colisões compreensíveis e dificuldade acessível.
- Ajuste de som, tratamento de interrupções e recuperação de redimensionamento sem corromper pontuação.
- Testes reais em Safari no iPhone e Chrome no Android, incluindo um aparelho intermediário; Samsung Internet como verificação adicional.
- Nome/apelido, serviço de classificação, persistência e tela de líderes e recorde.
- QR code para a URL definitiva, acompanhado de endereço legível e testado nas câmeras dos aparelhos.
- Pacote final de publicação, regras para falta de conexão e instruções ao responsável.

Opcionais após o essencial:

- Segundo ambiente e efeitos visuais adicionais.
- Pequeno destaque de produto no resultado, incluindo a linha de quadriciclos.
- Ranking diário e tela específica para exibição no estande.
- Quadriciclo jogável, somente após avaliar arte, equilíbrio e prazo.

Fora da proposta inicial:

- Multiplayer, contas com senha e painel administrativo público completo.
- Captura de nome completo obrigatório, telefone, e-mail, CPF ou contatos comerciais.
- Sorteio, premiação automática e comprovação forte de identidade.
- Loja, catálogo completo, física realista ou mundo aberto.

## Por que esta proposta

| Formato | Avaliação para este contexto |
| --- | --- |
| Desafio arcade curto | Recomendado: visual, ligado à pilotagem e acessível com poucos comandos |
| Quiz sobre produtos | Pode apoiar ações futuras, mas exige conteúdo validado e leitura |
| Jogo da memória | Viável, porém com relação menos direta com pilotagem e percurso |
| Corrida 3D completa | Exige mais recursos, ajustes e testes do que o prazo aconselha |

Essa comparação é julgamento de projeto, não resultado de teste com o público da feira.

## Critérios para chamar a versão de pronta

- Uma pessoa sem familiaridade com jogos entende os comandos com a instrução exibida.
- A partida funciona do início ao fim e reinicia repetidamente sem travar.
- Controles e textos cabem nas telas acordadas.
- O jogo permanece utilizável sem áudio e não depende somente de cores para os avisos.
- Nenhuma marca de outra empresa aparece na experiência.
- Dois celulares diferentes consultam a mesma classificação; nomes iguais não fundem participantes.
- Reenvio do mesmo resultado não gera duplicação; apenas resultado confirmado aparece como publicado.
- Falha de rede é testada ao iniciar e ao terminar a partida, sem prometer classificação offline.
- O QR code impresso abre a URL correta nas câmeras de Android e iPhone.
- A publicação não altera o funcionamento dos sistemas existentes.
- O usuário consegue demonstrar e operar a versão entregue.

O prazo recomenda uma única experiência bem acabada. A viabilidade de conclusão antes do evento dependerá do equipamento, das respostas pendentes e dos testes; não há promessa de prazo fechado nesta análise.

## Inspiração regional

A Trilha Pneus Freedom pode orientar o ambiente de terra e o vínculo com Massaranduba, conforme [pesquisa](03-pesquisa-marca-evento.md). O jogo continua sendo uma experiência fictícia. Não foi aprovado um segundo tipo de veículo ou a reprodução de um percurso real.
