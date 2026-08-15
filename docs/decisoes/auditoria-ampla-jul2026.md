---
name: auditoria-ampla-jul2026
description: "Auditoria ampla do projeto Ana (2026-07-22): 89 achados em 7 domínios, plano P0/P1/P2 e o artifact com tudo. O que ainda falta corrigir."
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
---

**Auditoria completa do projeto (2026-07-22)** feita com 7 revisores paralelos (segurança, entrega WhatsApp, agendamento, confiabilidade, prompt/Q&A, painel, ads). Relatório consolidado no artifact: https://claude.ai/code/artifact/1e5d00be-d51b-40e4-b3ec-ebebfe71a74f (89 achados: 13 críticos, 27 altos, 34 médios, 15 baixos). Fonte HTML em scratchpad/auditoria-ana.html (republicar mesmo path mantém a URL).

**P0 — TODOS APLICADOS E DEPLOYADOS em 2026-07-22 (commit c916f6d):**
1. ✅ /api/send agora seta `status:"human"` → a Ana para de responder por cima. Painel: cabeçalho "Você está atendendo (Ana pausada)" + botão "Devolver à Ana" (🤖↩︎, chama /release). O envio reflete o modo na hora. [[painel-envio-secretaria-24h]]
2. ⚠️ CÓDIGO no ar, mas INERTE até o Bruno criar a env `META_APP_SECRET` no Render (App Secret da Meta): webhook valida X-Hub-Signature-256 (HMAC do rawBody) só quando a env existe — deploy não quebra o recebimento. FALTA o Bruno setar a env p/ ativar a proteção contra mensagens/comandos forjados.
3. ✅ syncCalendarioIClinic: se o corpo não tiver BEGIN:VCALENDAR/VEVENT (URL expirada → HTML 200), NÃO apaga os bloqueios (return antes do delete). [[rls-lockdown-supabase]]
4. ✅ SYSTEM_PROMPT: bandeiras de urgência de retina (cortina/sombra, flashes, moscas súbitas, visão dupla) na lista de urgência + exceção à regra de não-triagem.

**P1 — TODOS APLICADOS E DEPLOYADOS em 2026-07-22 (commits 2edffea, 3569049, d223cb2):**
- ✅ process.on unhandledRejection/uncaughtException (não derruba mais o serviço).
- ✅ Log de erros PERSISTIDO: tabela `error_log` + `registrarErro()`; já grava o fallback da Anthropic e o [AGENDAR] inválido. Tabelas criadas via migration `observabilidade_e_dedupe` (RLS ligado).
- ✅ Dedupe DURÁVEL: tabela `processed_events` (PK + 23505), `jaProcessado()` async substitui o Set em memória → não responde mais 2× após redeploy.
- ✅ Sem PII em log: `maskFone()` mascara telefone; conteúdo/transcrição fora do log.
- ✅ Senha `iobb1980` removida (default vazio; era código morto).
- ✅ Validação do [AGENDAR]: `processarAgendarDaAna` recarrega `fetchSlotsDB(unidade)` e só grava se o `inicio` bater com um slot vigente (grade/dia/unidade/buffer 24h); senão oferece a próxima e loga em error_log. Normaliza a unidade para o enum.
- ✅ Conversões Google Ads: `marcarConversaoAgendada` prefere o clique com gclid/wbraid/gbraid (não mais só o mais recente); `uploadClickConversions` (googleAds.js) envia cliques com wbraid/gbraid também. Expurgo periódico de processed_events (7d) e error_log (30d).
- PENDENTE relacionado (não feito): CSV de conversões (/api/ads/conversions.csv) segue só gclid — canal manual de fallback; a dupla-contagem CSV×API (Ads#3 da auditoria) não foi tratada.

**P2 — APLICADOS em 2026-07-22 (commits c74f028, 5b05806, bf6dedd, 1b5f892):**
- ✅ Prompt caching: SYSTEM_PROMPT vira bloco com cache_control ephemeral; parte dinâmica separada. BLINDADO: se a chamada com system em blocos der 400, refaz sem caching (registra cache_control_400) → paciente nunca fica sem resposta. NÃO deu pra testar o caminho ao vivo (sem tráfego no horário) — MONITORAR error_log (etapa anthropic_fallback / cache_control_400); se aparecer, revert commit c74f028.
- ✅ Modelo em env: `ANA_MODEL` (readEnv) nos 4 pontos.
- ✅ Timeouts na Meta: 15s nos envios, 15/20s + limite 25MB no downloadMedia.
- ✅ Prompt (P2b): avaliação de refrativa/ceratocone/lente prefere Conjunto (Pentacam só lá); catarata não mostra R$5.000 a convênio; exames só-particulares podem ter valor informado a convênio; ceratocone limita a 1 pergunta (não-triagem); idade uniformizada; menor de 8 sempre [PREAGENDAMENTO]; motivo "Avaliação de cirurgia" no fluxo refrativa; negativas sem "infelizmente"; teleconsulta oferece registrar preferência.
- ✅ Painel (P2c): removida anon key morta do painel.html; viewport libera zoom no celular.
- PENDENTE P2 (não feito): [AGENDAR] multi-paciente (#2, precisa de code+prompt — a guarda de idempotência bloqueia 2º [AGENDAR]; DEFERIDO); remoção do modal morto da Ana no painel; saudação repetida (#15); acompanhante (#13); e as melhorias que dependem das 8 decisões do Bruno.

**Decisões de conteúdo do Bruno — RESOLVIDAS e aplicadas em 2026-07-23 (commit 6a4cee5):** (1) Pentacam INCLUÍDO nos R$200 da avaliação de refrativa; (2) refrativa em gestante/diabético/<18 = "avaliado na consulta" (Ana não afirma nem descarta); (3) duração da consulta = mantido vago ("varia conforme os exames"); (4) aceita DINHEIRO; (5) convênio guia/autorização/carência = a equipe confirma no agendamento; (6) Tonometria INCLUÍDA na consulta (não cobrada à parte); (7) local das cirurgias = centro cirúrgico Eye Laser, Asa Sul (consulta/avaliação nas unidades Conjunto/Taguatinga); (8) "sempre-ativa" = MANTER respondendo leads pagos mesmo com Ana OFF.

**Já corrigido em 22/07 (não re-reportar):** RLS religado; detectUnidade só do paciente; idempotência [AGENDAR]; lente de contato 24h/48h; /api/send mostra falha + statuses de entrega; sync iClinic ligado. Ver [[agenda-propria-modelo-b]] e [[painel-envio-secretaria-24h]].
