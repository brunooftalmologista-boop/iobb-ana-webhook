---
name: ficha-obrigatoria-agendamento
description: "Regra inegociável do Dr. Bruno: a Ana NUNCA marca sem nome completo, nascimento e particular/convênio (com carteirinha e convênio conferido na lista)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-11T12:03:02.535Z
---

**Ordem do Dr. Bruno, 11/08/2026, textual: "SEMPRE".** A Ana não emite `[AGENDAR]` sem TODOS estes campos preenchidos:

1. **Nome completo** (nome + sobrenome — só o primeiro nome não serve)
2. **Data de nascimento**
3. **Particular OU convênio** — e, sendo convênio, **qual**, conferido contra a lista de atendidos

**Carteirinha NÃO é obrigatória para marcar** (ajuste dele no mesmo dia), com **uma exceção: Unimed**, onde o *número* é pré-requisito porque a liberação junto à operadora depende dele. Nos demais planos basta saber qual é o convênio — a equipe confere a cobertura depois; a Ana continua pedindo o cartão por cortesia ao concluir, sem travar. Um `[CARTEIRINHA]` com `numero: por foto` **não** satisfaz a Unimed: é justamente o caso em que ninguém sabe o número.

E a mensagem de confirmação enviada logo após marcar tem de trazer todos esses campos para o paciente conferir.

**Why:** cinco pacientes em quatro dias entraram na agenda com `convenio: -` (Iolanda, Domingos, Sônia e mais um). A recepção só descobria com o paciente na frente — e aí ou ele é cobrado errado, ou descobre ali que o plano não é atendido, ou a consulta atrasa. Quando ele viu a lista, a reação foi *"Isso é gravíssimo"* e *"Uma mensagem resolve? PQP"* — ou seja: contatar paciente depois não é conserto, o conserto é a Ana não deixar acontecer.

**O erro de processo que causou isso (meu, não da Ana):** em 07/08 eu detectei o problema, escolhi só **marcar na observação** e "medir a frequência por uns dias antes de decidir entre reforçar o prompt ou travar". Os cinco casos aconteceram **durante a medição**. Quando o defeito coloca dado errado na frente de um paciente, **trava primeiro e mede depois** — o custo de perguntar uma vez a mais é uma frase; o de não perguntar é o paciente no balcão. Vale como regra geral, não só para este caso.

**How to apply (implementado no commit `912cc09`):**

- `fichaIncompleta(registros, reply, messages)` roda no bloco de travas do `index.js` e devolve a lista do que falta; `instrucaoFichaCompleta()` manda a Ana pedir **tudo de uma vez** e não emitir o bloco.
- **Insiste DUAS vezes** (as outras travas tentam uma só). Se ainda passar incompleta, a mensagem segue — o paciente não pode ficar sem resposta — mas registra `ficha_incompleta_persistiu` e notifica a clínica.
- `CONVENIOS_ATENDIDOS` é extraído **do próprio SYSTEM_PROMPT** por regex ("LISTA DE CONVÊNIOS ATENDIDOS:"), não copiado. Se mexer no formato dessa linha do prompt, a validação desliga sozinha (com `console.error`) em vez de travar tudo. 86 variantes carregadas; parênteses viram alternativas ("CASEC (CODEVASF)" vale pelos dois).
- O match do convênio é **generoso de propósito** (substring nos dois sentidos): falso positivo deixa passar um agendamento, falso negativo trava um legítimo. Mesma lógica em `numeroCarteirinhaConhecido` (aceita número do bloco `[CARTEIRINHA]` ou digitado na conversa). O fluxo da Unimed já morreu uma vez por pedir o cartão e parar — ver [[ana-resposta-modelo-horarios]], caso 2.
- `resumoDaFicha()` anexa os dados **à mesma mensagem** de confirmação, montados pelo sistema a partir do que vai ser gravado — não do que a Ana lembrou de repetir. A persona manda ela **não** repetir a lista, para não duplicar.

Convênios que **não** atendemos e já geraram agendamento errado: Quality/Quallity/Qualyty — ver [[convenios-nomes-equivalencias]]. Contexto das travas determinísticas em geral: [[agenda-hora-token-guardrail]].
