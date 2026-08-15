---
name: ana-instagram-dm
description: "Ana no Instagram DM — código pronto no branch feat/instagram-dm, aguardando só o setup na Meta (App Review + IG_ID/IG_TOKEN)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6211d21b-2057-4bb1-8cc6-30cb8c162c4c
---

Integração da Ana para responder **DM do Instagram**, com uma **persona mais técnica/médica** nos nichos (ceratocone, escleral, refrativa, catarata) — mantendo os guardrails (secretária, não diagnostica, conduz à avaliação, regras CFM). Relacionado ao [[ana-webhook-config-deps]].

**Estado (2026-07-15): CÓDIGO PRONTO no branch `feat/instagram-dm`** (NÃO no main; não deployado). Commits `7796e9d` (scaffold) e `dd81d93` (ligação):
- `instagram.js`: `sendInstagram(igsid,text)`, `parseInstagramWebhook(body)`, `IG_PERSONA_TECNICA`.
- `index.js`: desvio no `/webhook` (`if object==="instagram"` → `handleInstagram`, isolado do WhatsApp que usa object "whatsapp_business_account") + `handleInstagram()` reusando o mesmo cérebro (Anthropic + banco + [PREAGENDAMENTO]/[RECADO]). Contato do IG gravado como id sintético `ig:<IGSID>` no lugar do telefone → **sem migração de banco**.

**FALTA para ir ao ar (bloqueio externo — é com o usuário/Meta):**
1. Setup na Meta: conta IG Profissional + Página FB; adicionar produto Instagram no MESMO app da Meta; assinar webhook (campo "messages") na MESMA URL `/webhook` (mesmo VERIFY_TOKEN); **App Review** de `instagram_basic` + `instagram_manage_messages` (parte lenta, semanas).
2. Envs no Render (`/etc/secrets/.env`): `IG_ID` (id da conta IG) e `IG_TOKEN` (token da Página). Sem elas, `sendInstagram` só loga.
3. Validar com payloads reais (logs do Render) + merge do branch no main.

**Refinamentos opcionais:** coluna `channel`/`external_id` no banco (painel distinguir IG×WhatsApp melhor que pelo prefixo "ig:"); `notificarSecretaria` monta link wa.me do telefone → no IG sai inválido (conteúdo chega mesmo assim).

**Decisão pendente do usuário (estava "em estudo"):** também tinha a ideia de a Ana oferecer o link de **agendamento online do iClinic** (`https://agendarconsulta.com/perfil/dr-bruno-borges-1565692664` — 1 link cobre 3 unidades, convênios, só consulta presencial) — ficou pausado ("vamos estudar melhor antes").

**Why:** Instagram é do mesmo ecossistema Meta, reaproveita o webhook/cérebro/painel; público do IG nos nichos pede mais profundidade técnica.
