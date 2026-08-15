---
name: followup-leads-conversao
description: Follow-up automático de leads pagos frios (recuperação de conversão) — INERTE até ativar settings.followup_leads_enabled; e o bug da coluna event
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
---

**Follow-up de leads frios (2026-07-24, commit 112d879).** Recurso de RECUPERAÇÃO DE CONVERSÃO: envia UMA mensagem gentil para LEAD PAGO (tem ad_click) que engajou e NÃO agendou, ficou quieto 3–20h (dentro da janela de 24h da Meta), a Ana falou por último, status ainda 'bot', sem recusa explícita. Seleção pela função SQL `leads_frios_followup()` (migration `add_event_to_messages_and_followup`); marca `messages.event='followup'` p/ nunca repetir. Scheduler a cada 30 min (`startFollowUp`).

**INERTE por padrão** — só ENVIA de verdade quando `settings.followup_leads_enabled = 'true'`. Para ativar: `update settings set value='true' where key='followup_leads_enabled'` (ou insert se não existir). Para desligar: value='false'. Mesmo padrão do META_APP_SECRET (deploy seguro, ativa quando o Bruno quiser).

**POR QUÊ (dados de 2026-07-23):** a Ana já converte ~50% na conversa e a landing de refrativa (landings/refrativa.html) já é profissional/completa (Dr. Bruno CRM-DF 17877 RQE 9314, credenciais, unidades, prova social). O gargalo real é clique→conversa (~6%, e parte é SUBCONTAGEM da atribuição via [ref:token]). Então o maior lastro em CÓDIGO é recuperar quem falou e sumiu. Baseline por campanha: Águas Claras 219 cliques→13 conversas→6 agend (46%); Refrativa 31→2→1 (50%); Asa Norte 159→6→0; Escleral 82→3→0. Ver [[ads-performance-analise-jul2026]].

**BUG CORRIGIDO no caminho:** a `public.messages` NÃO tinha coluna `event` (a `event` que aparecia no schema era da `realtime.messages`, tabela do Supabase). Por isso a marca `delivery_failed:...` do tratamento de statuses de entrega (a "bolha vermelha de não entregue" no painel, commit 868f042) NUNCA gravava — o `update({event})` falhava calado. Coluna `event text` adicionada em public.messages na mesma migration → agora a bolha de falha de entrega e o follow-up funcionam. [[painel-envio-secretaria-24h]]

**Ganhos da Ana na refrativa (2026-07-24, commit 47148e1):** bloco de CONVERSÃO no SYSTEM_PROMPT — enquadrar a avaliação como passo barato (R$200 c/ exames), oferecer HORÁRIO CONCRETO (usa o mesmo-dia do particular), quebrar receio em 1 linha, sem pressionar. [[agenda-propria-modelo-b]]
