---
name: egress-supabase-conserto
description: Cota de egress do Supabase estourou em 08/08/2026; consertos confirmados nos logs em 10/08; sobrou o poll de mensagens do chat aberto
metadata: 
  node_type: memory
  type: project
  originSessionId: 8d1ef19a-c26f-477f-8c91-b81540d24799
  modified: 2026-08-10T13:33:40.009Z
---

A cota de **egress de 5,5 GB** do Supabase estourou em 08/08/2026 (carência até 08/09/2026) — não era volume de dados (o banco tem ~6 MB), era repetição de poll. Projeto da Ana: `pbnphvmzqdgnijxngosc` (`iobb-atendimento`) — nunca usar outro ID, um ID errado devolve `MCP error -32600: You do not have permission`, que **parece** token expirado e não é.

**Verificado nos logs da API em 10/08/2026** (janela de 51 s com a Ana atendendo, portanto pior caso): os três consertos pegaram. `/api/conversations` veio com `limit=200` + `updated_at=gt.` em 100% das chamadas; `ad_clicks` virou `conversation_id=in.(...)` e só é consultado quando o poll devolve conversa; a duplicata de `appointments`+`settings` por turno da Ana sumiu (cache de 10 s do `fetchSlotsDB`). Nenhuma chamada com user-agent de navegador — o painel React da Netlify não fala direto com o Supabase.

**O que sobrou como maior consumidor:** com um chat aberto, o painel refaz `messages?select=*` da thread **inteira** a cada 3 s, sem `since` e sem limite (`painel.html` → `GET /api/conversations/:id/messages`). Thread média 3,3 kB, maior 21 kB, ~15–20 polls/min → ordem de 100 MB num expediente com um chat aberto. É o mesmo padrão do bug original, só que menor. Secundário: `requirePanelAuth` chama `supabase.auth.getUser()` a cada requisição de `/api` (~38 chamadas/min), dá para cachear o token por ~60 s.

**Limite da medição:** os logs do MCP só devolvem ~100 linhas (dezenas de segundos), então frequência eu meço, GB eu não. O número real de egress só sai no Usage Dashboard do Supabase — pedir print ao Dr. Bruno para fechar a conta.

Relacionado: [[custo-api-ana.md]] (custo da API da Ana, outro eixo do mesmo aperto), [[ana-webhook-config-deps.md]].
