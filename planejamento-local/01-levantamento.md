> Atualização: em 16/09/2026 o usuário confirmou ranking apenas recreativo e autorizou a implementação. Este registro preserva o planejamento anterior. Consulte [a implementação atual](07-implementacao.md).

# Contexto e levantamento

Atualizado em: 16/09/2026.

## Confirmado pelo usuário

- Projeto: jogo web customizado para a Pneus Freedom.
- Objetivo: entreter visitantes do estande e contribuir com a presença da empresa na feira.
- O usuário trabalha na Freedom e teve a iniciativa; o trabalho ainda será apresentado ao gestor.
- Não foi relatada solicitação ou aprovação prévia do gestor.
- A publicidade deve ser exclusiva da Freedom. Referências a fabricantes e modelos de motos foram usadas para explicar o mercado, não para aparecer no jogo.
- A empresa fabrica pneus para motocicletas de baixa cilindrada, trilha e quadriciclos.
- Visitantes usarão seus próprios smartphones Android e iPhone, acessando por QR code nos navegadores padrão.
- O usuário propôs armazenar nomes e pontuações no servidor e mostrar classificação e recorde compartilhados.
- O usuário informou que a Trilha Pneus Freedom acontece anualmente em Massaranduba-PB, município da fábrica.
- Evento em Campina Grande-PB, de 17 a 19/09/2026; a data inicial é amanhã em relação a este registro.
- Há preferência por chegar a uma versão utilizável e customizada, possivelmente já pronta, em vez de apenas um protótipo.
- É a primeira experiência do usuário com desenvolvimento de jogos.
- Fluxo pretendido: desenvolver localmente, colocar no GitHub e publicar depois no servidor da empresa.
- O usuário precisará de instruções de publicação quando chegar essa etapa.
- A exposição à internet deve ser planejada para reduzir riscos aos sistemas existentes.

## Infraestrutura informada, ainda não inspecionada

- Windows Server 2019 Standard, versão 1809, build 17763.
- Memória: 128 GB; processador: Xeon E5-2620 v4.
- Acesso externo por Cloudflare Tunnel já configurado.
- Domínio previsto: algum subdomínio de freedom.dev.br, ainda não escolhido.
- Serviços existentes: manutencao.freedom.dev.br e sst.freedom.dev.br.
- Portas citadas como ocupadas por aplicações locais: 8000, 8500, 8600 e 8900.
- Não foi confirmada a presença do IIS, a topologia do túnel ou a disponibilidade de outras portas.

## Público

Hipótese inicial do usuário: possíveis clientes e parceiros de negócios.

A pesquisa do site oficial reforça o perfil de fabricantes, distribuidores, lojistas e profissionais do setor. A composição efetiva do público que visitará o estande permanece desconhecida.

## Definições e pergunta pendente

- Dispositivo: respondido — smartphones dos próprios visitantes, Android e iPhone, acesso por QR code.
- Ranking: o usuário deseja avaliar classificação central com nome, primeiros colocados e recorde; proposta técnica atualizada.
- Pergunta pendente enviada: a classificação será recreativa ou poderá determinar brindes?
- Enquanto não houver resposta, documentar regras como propostas e não assumir premiação.

## Pontos para a sequência

- Celulares representativos disponíveis para teste e conectividade dos visitantes (dados móveis ou Wi-Fi).
- Orientação vertical recomendada, ainda não definida pelo usuário.
- Possibilidade de demonstração ao gestor e prazo real para essa apresentação.
- Aceitação do conceito proposto e da duração aproximada de um minuto.
- Som opcional, eventual tela externa para exibir o ranking e responsável pela moderação.
- Produto ou linha que o gestor deseja destacar, se houver.
- Subdomínio definitivo e detalhes de hospedagem, somente quando a publicação for preparada.

## Materiais locais encontrados

- `media/logo-1.png`: logo preta, inspecionada visualmente.
- `media/logo-2.png`: versão dourada, inspecionada visualmente.

Não foram alterados esses arquivos.
