---
name: rls-lockdown-supabase
description: Vazamento de dados de paciente via chave anon pública (RLS off) — confirmado e corrigido; pendente rotacionar as URLs secretas do iCal
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
---

**INCIDENTE + FIX (2026-07-21):** o Supabase Security Advisor acusou `rls_disabled_in_public` no projeto `pbnphvmzqdgnijxngosc` (iobb-atendimento). Investigação CONFIRMOU vazamento ATIVO: a **anon key está hardcoded no [painel.html:463](painel.html)** (pública), e as tabelas estavam abertas — `appointments`/`preagendamentos` com RLS OFF, e `conversations`/`messages`/`patients`/`settings` com política `allow_all_* USING(true)`. Teste real com a anon key (curl PostgREST) leu de fora: **356 patients, 6354 messages, 105 appointments, 23 preagendamentos, 8 settings** (settings inclui as URLs secretas do iCal). Qualquer um com o link do painel → ver-fonte → anon key → lia/editava/apagava tudo (LGPD).

**Correção aplicada (migration `lockdown_rls_patient_data`):** `alter table ... enable row level security` em appointments+preagendamentos; `drop policy allow_all_*` em conversations/messages/patients/settings. Não quebra nada porque o **servidor usa `service_role`** (SUPABASE_KEY no Render = service_role, tem BYPASSRLS) e o **painel acessa via API do backend** (não usa a anon key direto — a linha 463 é código morto/referência). Verificado pós-fix: anon key retorna `[]` em tudo; service_role conta os registros normalmente; Advisor não acusa mais ERROR (só INFO `rls_enabled_no_policy`, que é o estado seguro p/ banco só-servidor).

**PENDENTE (recomendado ao Bruno):**
1. **Rotacionar as URLs secretas do iCal** — elas ficaram expostas na tabela `settings` enquanto o buraco esteve aberto (pelo menos as horas de hoje; o resto do banco esteve exposto a vida toda do projeto). No Google Calendar de cada agenda (Conjunto e Taguatinga) → Configurações → "Redefinir/Reset" o endereço secreto no formato iCal → me mandar as URLs novas p/ regravar em settings (`ical_iclinic_cn`/`ical_iclinic_tg`). Ver [[agenda-propria-modelo-b]] e [[ana-webhook-config-deps]].
2. **Exposição pretérita (LGPD):** o banco (356 pacientes, 6354 mensagens) esteve tecnicamente acessível pela anon key durante toda a existência do projeto. Sem evidência de acesso indevido, mas é bom o Bruno saber. Anon key em si NÃO precisa rotacionar (é feita p/ ser pública QUANDO o RLS está certo — agora está).
3. Menor: `auth_leaked_password_protection` (WARN) é do Supabase Auth, que este projeto NÃO usa (login do painel é via /api/login próprio) → pode ignorar. E a anon key morta no painel.html pode ser removida por higiene (opcional; hoje é inofensiva com RLS ligado).
