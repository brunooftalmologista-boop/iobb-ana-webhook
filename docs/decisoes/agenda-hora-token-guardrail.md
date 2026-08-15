---
name: agenda-hora-token-guardrail
description: "Bug recorrente da Ana: horário salvo != horário dito ao paciente (prosa vs token [inicio:]) — causa, casos e a trava no código"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-07-28T21:22:45.391Z
---

Bug RECORRENTE e grave: a Ana **diz um horário ao paciente na prosa** (ex.: "às 14h40") mas **copia o token `[inicio:]` de OUTRA linha** da lista de vagas (ex.: 15:40) no bloco `[AGENDAR]` → o sistema gravava o horário ERRADO. O paciente aparece na hora que a Ana disse, a agenda tem outra. Casos reais: **Mariana** (disse 11:40 / salvou 11:20) e **Henzo Gabriel** 2026-07-25 (disse 14h40 em todas as msgs / salvou 15:40; ainda gerou "churn" = 4 create/cancel alternando 14:40↔15:40 porque cada msg do paciente reemitia [AGENDAR]).

**Trava implementada (commit `2d867ac`, 2026-07-25) em `processarAgendarDaAna` (index.js):** a função passou a receber `replyTexto` (a prosa enviada ao paciente). Regex `/(\d{1,2})\s*[h:]\s*(\d{2})\b/g` extrai os horários da prosa (testado: ignora "24 horas", "48 horas", "28/07", "R$ 200,00"; só casa HH:MM tipo 14h40/14:40). Se a prosa cita UM ÚNICO horário e ele diverge do token (comparando em America/Sao_Paulo via toLocaleTimeString), **grava a PROSA** (o que o paciente combinou) desde que seja vaga válida no MESMO dia/unidade (busca em fetchSlotsDB); senão mantém o token e sinaliza a equipe (marcarPendenciaEquipe). Roda ANTES da idempotência → também mata a churn (re-emits convergem pro mesmo horário → viram idempotentes). Tudo em try/catch, nunca quebra o agendamento. Logs: `agendar_hora_corrigida` / `agendar_hora_divergente` no error_log. Se a Ana oferece VÁRIOS horários (2+ distintos na prosa), a trava se desliga (não corrige oferta).

**Correção manual do Henzo:** movido de 15:40 → 14:40 (appointment f06b74d3) direto no banco, pois 14:40 estava livre.

**VARIANTE NOVA — HORÁRIO PROPOSTO PELO PACIENTE (2026-07-28, commit `c0deb7e`):** caso Cristiano — estava às 17:00 de hoje, escreveu "consigo chegar às 16:20" e a Ana respondeu "Consulta remarcada para hoje às 16h20". Mas 16:20 já era da Raimunda (agendada às 10:49). As travas do banco seguraram (NADA foi gravado; ele permaneceu às 17:00), mas o paciente foi informado de um horário ocupado por outra pessoa. Rastro no error_log: `agendar_hora_divergente prosa=16:20 token=16:40` + 2× `agendar_inicio_invalido`. **Causa raiz: a Ana ACEITA horário proposto pelo paciente sem conferir se está na lista injetada.** Correções: (1) PROMPT — regra crítica: procurar o horário proposto EXATO na lista; se não estiver, é PROIBIDO dizer agendado/remarcado/confirmado, deve oferecer o mais próximo que ESTÁ na lista; idem remarcação (só anunciar depois de escolher da lista; enquanto isso o agendamento antigo continua valendo). (2) CÓDIGO — nova `avisarFalhaDeAgendamento(conversationId, from, texto)` usada nos DOIS caminhos de falha (slot fora da lista e slot tomado): manda a correção dizendo explicitamente que o horário NÃO ficou reservado, **SALVA a correção no histórico** (antes ia só pro WhatsApp via trySendWhatsApp — a Ana relia a conversa, via só o "remarcado" e seguia achando que deu certo; o painel também não mostrava) e **acende `marcarPendenciaEquipe`**. Testado: paciente pedindo 14:20 (ocupado) recebeu "às 14h20 não tenho vaga disponível. O horário mais próximo que tenho nesse dia é às 17h20" e nenhum agendamento foi criado.

**Why:** paciente aparecendo na hora errada é dano real e o problema já tinha reincidido apesar do ajuste de prompt (commit 593c20a "não repetir data/hora"). O prompt sozinho não bastou — precisava de trava no código.

**How to apply:** se reincidir, checar error_log por `agendar_hora_*`; a fonte é a Ana copiar a linha errada do `[inicio:]` em formatSlotsParaAgendar (index.js:999). Ver [[agenda-propria-modelo-b]].
