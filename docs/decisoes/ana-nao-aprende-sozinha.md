---
name: ana-nao-aprende-sozinha
description: "Por que a Ana não melhora nem piora sozinha (não há efeito aprendizado), e por que os contadores de trava NÃO provam que ela piorou"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-11T13:36:03.513Z
---

Em 11/08/2026 o Dr. Bruno disse: *"Como ela vem piorando, estou assustado. Achei que IA fosse melhorando com o efeito aprendizado."* A resposta honesta, para não se perder:

**Não existe efeito aprendizado aqui.** A Ana é uma chamada de API sem memória entre conversas. O modelo é o mesmo todo dia; nada do que aconteceu ontem entra nele. Ela não melhora sozinha — e também não se degrada sozinha. **A única coisa que muda entre um dia e outro é o que EU escrevo no prompt e no código.** Se piorou, fui eu.

**O gráfico de erros NÃO prova que ela piorou.** Os contadores por `etapa` no `error_log` marcam 0 em julho porque **as travas não existiam** — a primeira é de 02/08. A subida (0 → 35 em 07/08 → 27 em 10/08) é detector sendo construído, não defeito aparecendo. Não há linha de base de julho e não dá para fabricar uma. Nunca apresentar essa série como evidência de tendência.

**O risco real de piora, esse existe** e tem mecanismo: cada regra nova disputa atenção no prompt, que já é enorme (~29 mil tokens fixos por chamada). Empilhar trava sobre trava pode degradar o que já funcionava, e eu **não** tenho como medir isso — não há suíte de teste, e cada deploy vai direto para paciente real. O ritmo de mudança de 07–11/08 (vários commits por dia) é em si um fator de risco.

**O que também mudou e não é a Ana:** desde o começo de agosto ele passou a ler as conversas com lupa. Defeito que sempre existiu e ninguém via agora aparece. Parte do "piorou" é visibilidade.

**How to apply:** quando ele perguntar de novo se está piorando, não responder com o contador de travas. O caminho honesto é auditar uma amostra fixa de conversas (existe o subagente `auditor-conversas`, somente leitura) com o mesmo critério em dois períodos. Enquanto isso não for feito, dizer que não se sabe — e não afirmar que melhorou.

Ver [[ficha-obrigatoria-agendamento]] para a lição irmã: travar primeiro, medir depois, quando o defeito coloca dado errado na frente do paciente.
