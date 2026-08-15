---
name: agenda-horizonte-e-data
description: "Incidente 29/07/2026: Ana negava datas livres (lista cortava em 8 dias) e errava dia da semana; correções em código + lição sobre reverter sob pressão"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-07-29T21:39:26.506Z
---

Incidente de 2026-07-29 (Bruno: "ela está completamente desgovernada", "perdi 2 atendimentos em 2 segundos"). Quatro queixas; **duas eram bugs reais, duas não se sustentaram nos dados**.

**BUG 1 — A Ana NEGAVA datas que estavam livres (commit `8ec9a00`, causa raiz do incidente).** `formatSlotsParaAgendar(slots, maxDias = 8)` cortava a lista injetada na **8ª jornada de atendimento**. Como só há 5 dias úteis de atendimento por semana, 8 jornadas acabam por volta de 2 semanas: um pedido para **11/08** (agenda com só 3 ocupados, praticamente vazia) caía fora e ela respondia "não há horários disponíveis" — repetiu 4× para o mesmo paciente (61 32465699969). Não era alucinação: para ela o dia não existia. Corrigido para `maxDias = 14`, cobrindo tudo o que `getAvailableSlots` gera (~15 dias corridos). **Junto disso, o HORIZONTE passou a ser injetado em código**: calcula-se a última data da lista e a Ana fica PROIBIDA de dizer "não tem vaga" para além dela — deve dizer que a agenda ainda não abriu, que a equipe entra em contato, e emitir [PREAGENDAMENTO]. Regra do Bruno, textual: *"ou fala que a equipe entra em contato, qualquer coisa, mas falar que não tem é insanidade"*. **Não ter informação ≠ não ter vaga.** Ambos os lados testados ao vivo com paciente sintético: pedido de 11/08 → "Tenho sim! Na terça-feira, 11/08... consigo às 10h00"; pedido de 25/08 → "a agenda ainda não está aberta para aquele período".

**BUG 2 — dia da semana × data (commit `b038401`, trava determinística).** Ela escreveu "o dia 11/08 é uma **segunda**-feira" (é terça) e "**sexta**-feira, 01/08" (01/08 é sábado, clínica fechada), e na mesma conversa se contradisse. Já havia regra no prompt mandando copiar o dia da semana da lista — voltou assim mesmo (é slip de geração). `corrigirDiaDaSemana(texto, slots)` roda ANTES do envio e casa os dois formatos que ela usa ("sexta-feira, 31/07" e "31/07 é uma sexta-feira"). Regra de desempate: se a DATA cai em fim de semana, quem manda é o dia da semana prometido e a data é trocada pela próxima com vaga (foi assim que "sexta, 01/08" virou "sexta, 31/07"); nos demais casos manda o calendário e corrige-se a palavra. Correções vão para `error_log` como `dia_semana_corrigido`. Nunca lança. Não toca em "R$ 200,00", "24 horas" nem "40 minutos".

**BUG 3 — alternativa após falha ia para data distante (commit `b687cd3`).** Quando o agendamento não podia ser gravado, oferecia-se a PRIMEIRA vaga da lista inteira: a paciente que pediu quinta 30/07 às 17h foi mandada para terça 04/08 **existindo 17h20 livre no mesmo dia**. Nova `alternativaMaisProxima(slots, iniPedido, minTs)` prioriza o dia pedido e, dentro dele, a hora mais próxima. Ver [[agenda-hora-token-guardrail]].

**O que NÃO era bug (verificado nos dados):** (a) *"agendou sem pegar os dados"* — os 9 agendamentos das 20h anteriores tinham nome, telefone, convênio e motivo; o caso citado (Raquel) tinha até nascimento e carteirinha, lidos por visão, e a Ana conduziu certo (a frase da secretária "não foi concluído" veio ANTES do agendamento). (b) *"ofereceu horário sem disponibilidade"* — a vaga foi ocupada no iClinic **1 minuto** depois da oferta (ofereceu 18h14, sync entrou 18h15); a trava do banco barrou, nada foi sobremarcado e a paciente foi avisada.

**LIÇÃO DE PROCESSO (a mais importante):** sob pressão eu revertei 3 commits (`074ce61`, o par manhã/tarde) **sem ter confirmado que eram a causa** — e a evidência posterior foi CONTRA: na conversa da Raquel o par manhã/tarde funcionou exatamente como projetado ("11h40 ou 15h20"). A causa real era o corte de 8 dias, sem relação. Quando o usuário estiver em pânico, **ir ao dado antes de reverter**: `error_log` (etapas `agendar_*`), timeline da conversa em `messages`, e conferir o fuso — `messages.timestamp` é **naive UTC** (somar -3h para BRT); eu errei isso duas vezes numa hora e cheguei a afirmar que existia um "agendamento fantasma" que não existia. Ver [[feedback-nao-inventar-ads]].

**PENDENTE:** trava em código contra listar 3+ horários (hoje só o revert segura, e revert não é garantia). O caminho é igual ao da data: detectar a enumeração antes do envio.

**Why:** a fonte estrutural de metade disso é a secretária lançar no iClinic — nós só sabemos até 15 min depois (e o iCal do Google ainda atrasa por conta própria). Enquanto for assim, sempre haverá janela para oferecer horário já vendido. A solução real é a equipe lançar na agenda da Ana — ver [[agenda-propria-modelo-b]].
