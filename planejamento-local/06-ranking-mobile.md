> Atualização: em 16/09/2026 o usuário confirmou ranking apenas recreativo e autorizou a implementação. Este registro preserva o planejamento anterior. Consulte [a implementação atual](07-implementacao.md).

# Ranking compartilhado e smartphones

Atualizado em: 16/09/2026. Documento consultivo; sem código.

## O que está confirmado

- Visitantes usarão smartphones próprios, Android e iPhone.
- Entrada por QR code e navegador do aparelho.
- O usuário propôs nome, armazenamento central, líderes e recorde.
- Existência de pneus para quadriciclos e da Trilha Freedom foi informada.

As regras abaixo são recomendações. A pergunta sobre brindes continua pendente.

## Experiência proposta

Tela vertical, controles de toque grandes e carregamento leve. Antes da primeira partida, o visitante escolhe nome curto ou apelido. Texto sugerido: “Seu apelido e sua pontuação aparecerão no ranking público.”

Na abertura e no resultado, oferecer acesso ao ranking:

- Pódio visual dos três primeiros e lista dos dez melhores.
- Recorde geral do evento.
- Melhor resultado e posição do próprio participante, mesmo fora dos dez primeiros.
- Uma entrada por participante do navegador, baseada na melhor pontuação.
- Ranking geral dos três dias; diário é melhoria opcional.
- Pontuações iguais compartilham posição. Dentro do empate, ordenar visualmente pelo momento registrado no servidor, sem apresentar isso como desempate de prêmio.

Não utilizar nome como chave única: dois visitantes podem se chamar João. Um código público curto pode diferenciá-los; ele não deve ser o segredo de sessão.

## Identificação sem conta

Proposta: o servidor cria um participante e mantém sua sessão no navegador, com cookie seguro, HttpOnly, SameSite apropriado e restrito ao host do jogo. O nome é só uma forma de exibição.

Limpar cookies, trocar aparelho, usar outro navegador ou encerrar uma sessão privada pode gerar outro participante. Sem cadastro ou verificação adicional, não há garantia de uma inscrição por pessoa nem recuperação entre aparelhos.

Fonte: [OWASP — gestão de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Dados mínimos

| Registro | Informações previstas |
| --- | --- |
| Participante | Identificador interno, apelido público e datas necessárias à operação |
| Partida | Identificador único, participante, evento, versão das regras, início, conclusão, pontuação validada e estado |
| Classificação | Melhor resultado por participante dentro do evento; pode ser derivado das partidas |
| Verificação | Parâmetros e evidências mínimas de jogo necessários à validação escolhida, com volume e retenção limitados |

Não solicitar nome completo obrigatório, e-mail, telefone, CPF, localização ou fotos para um ranking recreativo. O servidor e serviços de infraestrutura podem registrar dados técnicos; prever acesso restrito e prazo adequado também para esses registros.

Apelido reduz a exposição, mas não garante anonimato. Definir aviso de privacidade curto, finalidade, duração da publicação, prazo de exclusão e canal de solicitação com a empresa antes de coletar dados reais. A forma de autorização e a base legal devem ser alinhadas à operação; um aviso isolado não resolve tudo.

Referências: [princípio da necessidade — ANPD](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/glossario-anpd) e [dados pessoais — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados).

## Integridade e moderação

- Criar a partida no servidor com identificador de uso único, validade e versão de regras.
- Conferir participante, estado, duração e consistência dos dados ao concluir.
- Não aceitar a pontuação enviada como verdade; verificar evidências proporcionais à mecânica. Reconstituir a partida com parâmetros e comandos é uma opção mais forte, com custo adicional.
- Impedir que reenvio por falha de rede duplique a partida ou atualize indevidamente o recorde.
- Aplicar limites por participante e por operação; considerar que vários visitantes compartilham IP de Wi-Fi ou operadora.
- Validar comprimento e conteúdo de nomes, preservando acentos; renderizar sempre como texto.
- Prever retirada de nomes ofensivos e resultados suspeitos por operação administrativa protegida. Filtro automático sozinho é insuficiente.
- Registrar o mínimo necessário para revisar incidentes, com retenção definida.

Essas medidas reduzem abuso, mas não impedem toda automação ou manipulação de um navegador controlado pelo jogador. HTTPS e Tunnel não validam gameplay.

Fontes: [OWASP — APIs](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) e [prevenção de XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

## Banco e operação

Nomes e resultados tendem a ocupar pouco espaço. A escolha do banco depende mais de concorrência, confiabilidade e operação do que de capacidade de disco.

SQLite é candidato para um único serviço com gravações breves em disco local. Possui um gravador por vez; validar o pico esperado antes de adotá-lo. PostgreSQL é alternativa se já for operado ou se testes justificarem. Nenhum banco foi escolhido.

Fonte: [SQLite — quando usar](https://www.sqlite.org/whentouse.html).

Manter banco e cópias fora da pasta pública, sem acesso direto pela internet. Planejar backup consistente e restauração; com SQLite ativo, não tratar uma cópia avulsa do arquivo principal como garantia de backup completo.

## Compatibilidade móvel a validar

- Safari no iPhone e Chrome no Android como testes principais; Samsung Internet como verificação adicional.
- Celular intermediário real, tela pequena e rede móvel, além de dispositivos de desenvolvimento.
- Toque confiável, sem comandos dependentes de passar o mouse, inclinar o aparelho, vibração ou tela cheia.
- Layout que acomode recortes da tela, barras do navegador e teclado ao preencher o apelido.
- Áudio iniciado após interação, com controle para silenciar.
- Ao trocar de aplicativo, bloquear a tela ou receber interrupção, tratar a partida explicitamente. Proposta conservadora: permitir nova tentativa ranqueada; uma retomada em treino não altera a classificação.
- Calcular tempo e movimento de forma independente da taxa de quadros, evitando vantagem de aparelhos mais rápidos.
- Evitar mudanças de regras durante o mesmo ranking; se necessárias, separar versões competitivas.
- Testar reenvio, sessão indisponível, nomes iguais, nomes abusivos, interrupção e duas gravações concorrentes.

Compatibilidade é requisito a demonstrar, não promessa de funcionamento em qualquer aparelho ou versão antiga.

Referências: [Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [áudio na web](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) e [área visível em dispositivos móveis](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

## Internet, QR code e premiação

- QR code aponta para URL HTTPS definitiva, com endereço escrito ao lado.
- Testar a leitura do material impresso em Android e iPhone.
- Ranking atualizado ao abrir a tela e após publicar resultado; consulta periódica moderada apenas enquanto visível é suficiente para a proposta, sem exigir conexão em tempo real.
- Falta de conexão não pode gerar uma confirmação falsa de envio.
- Partida iniciada offline fica fora da classificação proposta. Eventual reenvio de uma partida online depende de validade e verificação no servidor.
- Link compartilhável permite participação fora da feira. Presença no estande, elegibilidade e verificação de pessoa só precisam ser impostas se fizerem parte das regras.
- Se houver brindes, definir identificação, critérios, encerramento, desempate e revisão antes de implementar a competição.
