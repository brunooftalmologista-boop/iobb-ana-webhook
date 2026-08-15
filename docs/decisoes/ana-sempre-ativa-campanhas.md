---
name: ana-sempre-ativa-campanhas
description: Exceções ao
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
---

Decisão do Bruno (2026-07-20): o liga/desliga global `#ANA OFF` **não** deve barrar leads de campanha — eles são atendidos pela Ana 100% do tempo. O resto segue o toggle normal.

**Como funciona (index.js):**
- Constante `ANA_SEMPRE_ATIVA_SOURCES` (env no Render, padrão `"refrativa,meta/"`) — lista de substrings; se o `ad_clicks.source` da conversa casar qualquer uma, a Ana responde mesmo com `#ANA OFF`.
- `conversaSempreAtiva(conversationId)` checa isso no gate `if (!anaAtiva)` do webhook.
- **Google Ads** (landing `/lp/refrativa`) → source `google/refrativa` → casa "refrativa". ✅
- **Instagram/Facebook** (Click-to-WhatsApp, objeto `referral`, sem gclid) → `registrarLeadMeta()` grava um ad_click com source `meta/<tipo>` → casa "meta/". Cobre TODOS os leads de anúncio do IG/FB (escolha do Bruno). Isso também passou a **rastrear os leads do IG como conversão** (antes nem entravam na contagem).
- O **"assumir" humano por conversa** (secretária pega a conversa no painel → status "human") continua com prioridade: pausa a Ana mesmo para esses leads.

**Para ajustar:** mudar a env `ANA_SEMPRE_ATIVA_SOURCES` no Render (ex.: tirar `meta/` para desligar o sempre-ativo do IG; adicionar `catarata` para incluir a campanha de catarata). Casa por substring no source.

Commits: cc72eb9 (refrativa/Google), daad6e7 (IG/FB + rastreio). Relacionado a [[ads-performance-analise-jul2026]].
