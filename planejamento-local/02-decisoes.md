> Atualização: em 16/09/2026 o usuário confirmou ranking apenas recreativo e autorizou a implementação. Este registro preserva o planejamento anterior. Consulte [a implementação atual](07-implementacao.md).

# Decisões e propostas

Atualizado em: 16/09/2026.

## Decisões confirmadas

### D-001 — Planejamento antes do código

- Origem: instrução explícita do usuário.
- Realizar planejamento, estudo e análise de caso, com documentação Markdown.
- O objetivo de entregar um jogo pronto não foi interpretado como revogação automática dessa instrução.

### D-002 — Anotações em pasta dedicada

- Criação de documentos autorizada pelo usuário.
- Nome escolhido pelo assistente: `planejamento-local/`.
- Inclusão no `.gitignore` fica para depois, conforme indicado pelo usuário.

### D-003 — Exclusividade promocional da Freedom

- Origem: instrução explícita do usuário.
- Não exibir marcas, modelos identificáveis, logos, publicidade ou informações comerciais de outras empresas na experiência.
- Motocicleta, cenário e objetos devem ser genéricos ou próprios da Freedom.
- Nomes de fornecedores técnicos podem aparecer na documentação interna quando necessários.
- Selecionar recursos e licenças que permitam a apresentação pretendida, preservando avisos legais obrigatórios quando aplicáveis.

### D-004 — Direção de publicação

- Origem: intenção informada pelo usuário.
- Preparar futuramente GitHub e publicação em subdomínio de freedom.dev.br usando a infraestrutura da empresa.
- Servidor, DNS, Tunnel e GitHub não foram acessados ou alterados nesta análise.

### D-005 — Acesso por smartphones e QR code

- Origem: confirmação explícita do usuário.
- Priorizar Android e iPhone nos navegadores usados pelos visitantes.
- Não depender de computador do estande ou instalação de aplicativo.
- Compatibilidade precisa de testes reais; não foi declarada como já cumprida.

## Revisão de escopo — ranking

O usuário propôs ranking central com nome, líderes e recorde. A análise passa a recomendar um backend e banco próprios do jogo. Isso substitui a recomendação anterior de recorde exclusivamente local; detalhes e premiação ainda não foram aprovados.

## Propostas ainda não aprovadas

| Proposta | Motivo | Situação |
| --- | --- | --- |
| Nome de trabalho: Desafio Freedom | Comunicação simples e vinculada à marca | Proposto |
| Arcade de pilotagem de 60 segundos | Entrada rápida e boa circulação no estande | Proposto |
| Jogo no navegador + backend e banco exclusivos | Permitir ranking central | Recomendado após nova informação |
| Apelido público, sem conta ou coleta de contatos | Identificar no ranking com poucos dados | Recomendado |
| Top 10, recorde e posição pessoal | Incentivar repetição das partidas | Proposto |
| Melhor resultado por participante do navegador | Evitar ocupar a lista com todas as tentativas | Proposto; não comprova pessoa única |
| Toque e tela vertical | Adequação ao acesso por celular | Recomendado |
| Ranking geral do evento | Simplicidade nos três dias | Proposto |
| Treino sem ranking durante indisponibilidade | Degradação clara, se o jogo já estiver carregado | Proposto |

Não há decisão final sobre biblioteca, motor de jogo, linguagem de autoria, porta, servidor HTTP ou subdomínio.
