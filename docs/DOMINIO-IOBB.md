# Conectar as landing pages ao domínio iobb.com.br

Objetivo: os anúncios do Google Ads apontam para URLs limpas no domínio da clínica
(ex.: `https://iobb.com.br/aguas-claras`), **sem derrubar o site institucional** que
já está no ar em `iobb.com.br`.

## Arquitetura (por que Cloudflare no meio)

Um domínio só aponta para **um** servidor. O site institucional está num servidor;
as landings da Ana estão no app do Render (outro servidor). Como o `iobb.com.br`
já passa pela **Cloudflare**, usamos ela como "porteiro":

```
                         ┌─────────────────────────────────────────┐
  iobb.com.br  ──────►   │              CLOUDFLARE                  │
  (paciente / Google)    │  path = /aguas-claras, /ceratocone,     │
                         │         /taguatinga, /asa-norte,        │
                         │         /refrativa, /consulta, /lp/*    │──►  Render (app da Ana)
                         │              ▼ (Worker)                 │     serve a landing + tracking
                         │  qualquer outro path  ──────────────────│──►  Site institucional (origem atual)
                         └─────────────────────────────────────────┘
```

Só os paths de landing são desviados para o Render. Todo o resto (home, blog, etc.)
continua no site institucional, intacto.

> As landings também respondem sob `/lp/...` (ex.: `iobb.com.br/lp/aguas-claras`).
> As URLs limpas na raiz são um atalho mais bonito para os anúncios; ambas funcionam.

---

## Passo A — Cloudflare (a parte que conecta o domínio)

1. **Confirme que o registro DNS do `iobb.com.br` está com o nuvem LARANJA (proxied)**
   no painel da Cloudflare (DNS → Records). Sem o proxy laranja, o Worker não atua.

2. **Crie o Worker.** Workers → Create Worker → cole o conteúdo de
   [`cloudflare-worker-iobb.js`](cloudflare-worker-iobb.js) → Deploy.
   (Plano gratuito da Cloudflare cobre de sobra: 100k requisições/dia.)

3. **Ligue o Worker aos paths de landing** (Worker → Settings → Triggers → Routes).
   Adicione **uma rota para cada path** (e as versões `www.` se o site usa www):

   ```
   iobb.com.br/lp/*
   iobb.com.br/aguas-claras
   iobb.com.br/taguatinga
   iobb.com.br/asa-norte
   iobb.com.br/ceratocone
   iobb.com.br/refrativa
   iobb.com.br/consulta
   iobb.com.br/escleral
   iobb.com.br/catarata
   ```

   > ⚠️ **Só adicione os slugs que você realmente vai usar.** Cada slug nesta lista
   > passa a ser servido pelo Render — se o site institucional já tiver uma página
   > `iobb.com.br/consulta`, por exemplo, ela ficaria "coberta" pela landing.
   > Confira a lista contra o menu/páginas do site antes de ligar.

   `iobb.com.br/lp/*` cobre os arquivos estáticos das landings (CSS/imagens em
   `/lp/assets/...`) e as URLs antigas — **não remova essa rota.**

### Alternativa sem Worker (Origin Rules)
Se preferir não usar Worker: Rules → **Origin Rules** com um filtro por *URI Path*
(os mesmos paths acima) e as ações **Host Header** = `iobb-ana-webhook.onrender.com`
e **Resolve Override (DNS)** = `iobb-ana-webhook.onrender.com`. O Worker é mais
previsível (evita erros de TLS/SNI), então é a opção recomendada.

---

## Passo B — Render (variáveis de ambiente do app)

No painel do Render → serviço `iobb-ana-webhook` → **Environment**:

| Variável | Valor | Para quê |
|---|---|---|
| `GOOGLE_ADS_LP_BASE_URL` | `https://iobb.com.br` | URL final das campanhas criadas pelo app (captura do `gclid`). |
| `WA_LP_NUMBER` | número da Ana no WhatsApp Cloud API (só dígitos, ex.: `5561982879853`) | número para onde as landings mandam o paciente. **Tem que ser o número conectado à Cloud API**, senão o `[ref:token]` não vincula a conversa. |
| `GOOGLE_ADS_CONVERSION_NAME` | `Agendamento IOBB` (ou o nome exato da ação no Google Ads) | nome da conversão no CSV de importação offline. |

Salvar dispara um redeploy. **Não precisa cadastrar `iobb.com.br` como domínio
customizado no Render** — a Cloudflare já manda o Host certo (onrender.com).

---

## Passo C — Google Ads

1. **Auto-tagging ligado:** Configurações → Acompanhamento → *Marcação automática = ATIVADA*
   (garante o `gclid` na URL).
2. **URL final de cada grupo de anúncio** (ver tabela em `ATIVACAO.md` / `RASTREAMENTO.md`):
   - Águas Claras → `https://iobb.com.br/aguas-claras`
   - Taguatinga → `https://iobb.com.br/taguatinga`
   - Asa Norte e Brasília → `https://iobb.com.br/asa-norte`
   - Ceratocone / Escleral / Anel → `https://iobb.com.br/ceratocone`
   - Fallback amplo → `https://iobb.com.br/consulta`
3. **Conversão offline:** Metas → Conversões → *Importar → Uploads manuais (offline)*,
   nome batendo com `GOOGLE_ADS_CONVERSION_NAME`. O CSV sai no painel da Ana
   (📊 Relatório Google Ads → Baixar conversões).

---

## Passo D — Teste ponta a ponta

1. Abra `https://iobb.com.br/ceratocone?gclid=TESTE123` no celular → a landing deve carregar
   (com CSS/imagens ok — confirma que `/lp/*` está roteado).
2. Confirme que `https://iobb.com.br` (home) e as páginas do site institucional continuam normais.
3. Clique em "Falar no WhatsApp" → abre a Ana com a mensagem + `[ref:...]`.
4. No Supabase, a linha em `ad_clicks` do token deve ganhar `phone`/`conversation_id`.
5. No painel, a conversa mostra **🎯 veio de anúncio**; ao marcar 📅 agendamento, o CSV
   de conversões traz o `gclid` de teste.

---

## Observações / necessidades eventuais

- **SEO (duplicação):** as landings de bairro (`consulta`, `aguas-claras`, `asa-norte`)
  não têm `canonical` nem `noindex`. Como são páginas de tráfego pago, o ideal é
  marcá-las `noindex` **ou** adicionar `<link rel="canonical">` para evitar que o
  Google as trate como conteúdo duplicado do site institucional. Me avise se quiser
  que eu implemente isso (precisa de uma env com a URL pública para montar o canonical).
- **www vs raiz:** se o site institucional responde em `www.iobb.com.br`, duplique
  as rotas do Worker com `www.` também.
- **Número do WhatsApp:** os HTMLs das landings têm números `wa.me` fixos, mas o app
  reescreve todos para `WA_LP_NUMBER` em tempo de resposta — o que vale é a env.
