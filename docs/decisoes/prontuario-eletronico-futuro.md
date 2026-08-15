---
name: prontuario-eletronico-futuro
description: "Intenção do Bruno (2026-07-26): desenvolver futuramente um prontuário eletrônico próprio integrado ao ecossistema Ana/agenda — adiado de propósito p/ um segundo momento"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-07-26T19:37:41.805Z
---

**PROJETO INICIADO em 2026-07-26** — o Bruno trouxe um escopo de 28 páginas (PDF em ~/Downloads/escopoprontuarioiobb.md*, texto extraído em scratchpad/escopo_prontuario.txt — escopo denso: regulatório CFM/ANVISA/LGPD, DICOM/Orthanc, ditado, fases 0-7) e pediu pra "ajustar e aprimorar". Entreguei: **`~/Downloads/ESCOPO_PRONTUARIO_V2_AJUSTES.md`** (adendo v2) + **`~/Downloads/EMAILS_FASE0_PRONTUARIO.md`** (7 e-mails do caminho crítico: Oculus/iClinic/Zeiss/Heidelberg/3 prontuários de mercado). CORREÇÕES FACTUAIS QUE FIZ AO ESCOPO: (1) ele assume stack NestJS+Prisma+React+Socket.IO que NÃO existe — o real é Express monolito index.js + Supabase + HTML vanilla; (2) VERIFIQUEI: Supabase é **sa-east-1 São Paulo** (banco já no Brasil!) Postgres 17; (3) transferências internacionais JÁ existentes: Anthropic (msgs de pacientes), OpenAI Whisper (áudios), Render (região a confirmar). RECOMENDAÇÃO ARQUITETURAL dada: serviço novo ao lado (schema Postgres `prontuario` no MESMO projeto Supabase SP), Ana intocada, sem service_role no prontuário (RLS por papel médico/técnico/recepção), append-only via triggers. Aprimoramentos propostos: ditado entra CEDO como gerador de texto p/ colar no iClinic (padrão /agenda, sem esperar nível 2); normalizador de refração como 1º código (lib pura testável); harness de benchmark de transcrição. DECISÕES PENDENTES DO BRUNO: horas/semana (bloqueia cronograma), política de áudio, envio dos e-mails, segundo desenvolvedor.

**Why:** o ciclo atual tem uma emenda manual (agenda própria → iClinic via copiar/colar). Um prontuário próprio eliminaria o iClinic, o sync iCal e a dupla digitação — a tabela `appointments` já seria a fonte única de agendamento, e a conversa da Ana viraria histórico clínico-administrativo do paciente.

**How to apply (quando ele retomar):** já existe meio caminho de infra — Supabase com `patients`, `conversations`, `messages`, `appointments`, auth de secretária (requirePanelAuth/JWT), painel web. O que um MVP precisaria: tabela de registros clínicos (evolução/prescrição por consulta, imutável/auditável), controle de acesso médico vs secretária, e MUITO cuidado regulatório — prontuário é guarda de 20 anos, LGPD dado sensível de saúde, requisitos CFM/SBIS (assinatura digital ICP-Brasil p/ eliminar papel, NGS2). Vale também reaproveitar o skill existente `receita-oculos-iobb` (gera receita a partir de prontuário). Antes de codar: discutir escopo mínimo (evolução + receita + anexos?) e se substitui ou convive com o iClinic.
