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
   iobb.com.br/painel
   ```

   > `iobb.com.br/painel` serve o painel das secretárias (mesmo app no Render). Não
   > precisa de mudança de código: o CORS do backend é `*` e o login usa token
   > Bearer (não cookie), então o painel servido de iobb.com.br chama a API no
   > Render normalmente. O painel continua protegido por login (Supabase).

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

---

# Auditoria das landing pages — 07/08/2026

**Correção importante do que estava registrado antes:** as páginas em
`iobb.com.br/<tema>` **não são** as do app no Render servidas por proxy. São
páginas **diferentes**, de outro projeto no Cloudflare Pages. Medido pelo título
e pelo tamanho: `iobb.com.br/aguas-claras` tem 542 KB, `onrender.com/lp/aguas-claras`
tem 20 KB, e os títulos não batem. Quem editar `landings/*.html` neste
repositório **não altera** o que está no domínio.

## Quantas existem, e onde

> ⚠️ **ATUALIZADO EM 22/08/2026.** O site foi otimizado e republicado: as páginas
> saíram de ~540 KB (imagens em base64 embutidas) para 34–55 KB, com as fotos em
> arquivos WebP na pasta `/img/`. O site inteiro caiu de **4,2 MB para 653 KB (−84%)**.
> A `/escleral` virou pasta (`escleral/index.html`); as demais seguem arquivos soltos.
> Existe um `_redirects` com `/* /index.html 200` (mantém o comportamento antigo de
> caminho desconhecido cair na home). **O Dr. Bruno PUBLICA** arrastando o zip no
> Cloudflare Pages — o zip precisa ter os arquivos na RAIZ, sem pasta-invólucro.
> Correções de conteúdo aplicadas no mesmo dia: papéis do Dr. Bruno × contatóloga
> (a adaptação é dele; ela ensina colocação e cuidados) e os DOIS modelos de lente
> escleral com preço (ZenLens R$ 5.980 o par · Esclera SG R$ 7.800 o par / R$ 4.280
> a unidade, em até 5x sem juros). Grafia correta: **contatóloga**, sem "c".

**No domínio (Cloudflare, fora deste repositório):**
`/refrativa` · `/catarata` · `/ceratocone` · `/escleral` · `/aguas-claras` ·
`/asa-norte` · `/taguatinga` · `/consulta` — mais a home.
`/exames`, `/cirurgias`, `/convenios` e `/contato` **não existem**: devolvem a home.

**Neste repositório (`landings/*.html`, servidas em `/lp/<tema>` pelo Render):**
as mesmas 7, menos catarata. `/escleral` também responde sem o `/lp/`.

## Comparação de conteúdo

| | iobb.com.br | onrender `/lp/` |
|---|---|---|
| Tamanho do texto | 980–2.532 palavras | 749–969 palavras |
| Preços | **sim, e corretos** | **nenhum preço** |
| Convênio/Unimed na refrativa | sim | **não menciona** |
| Rastreio `[ref:token]` + número da Ana | sim | sim |

Preços conferidos contra a base da Ana e **todos corretos**: consulta R$ 200,
teste de lente rígida/escleral R$ 150, ZenLens R$ 5.980 o par, PRK/LASIK R$ 5.990,
Femto-LASIK R$ 8.890. Dias por unidade corretos (Conjunto seg/qua/sex, Taguatinga
ter/qui). Exames inclusos corretos, inclusive a nuance de a refrativa incluir o
Pentacam e as demais não.

## ⚠️ Conflito em aberto: idade mínima

O site diz *"Atendem crianças? **Sim. Para menores de 8 anos, o agendamento é
confirmado com a nossa equipe**"*. A regra que a Ana segue é que **8 anos é mínimo
categórico** — ela recusa. Enquanto os anúncios não apontarem para essas páginas o
risco é baixo; depois da migração, pai de criança de 6 anos lê "sim, atendemos" num
anúncio pago, escreve, e ouve não. **Falta o Dr. Bruno decidir qual das duas vale.**

## Recomendação

Apontar todos os anúncios para `iobb.com.br` e aposentar as URLs `onrender.com`
nos anúncios — o domínio aparece na URL do anúncio, e "iobb-ana-webhook.onrender.com"
num resultado de busca de clínica médica derruba credibilidade. As do domínio também
são mais completas e têm preço.

Em 07/08 ainda havia **R$ 822 gastos** em URLs do onrender: `/lp/aguas-claras`
(171 cliques), `/lp/asa-norte` (166), `/lp/escleral` (11), `/lp/ceratocone` (10),
`/escleral` (5), `/lp/refrativa` (2). Todas funcionam e rastreiam — não há clique
perdido, é duplicidade.

**Também apareceram cliques pagos em páginas que não existem** (caem na home):
`copia-convenios-3` (55 cliques, 54 com gclid), `cirurgias` (7), `home` (7),
`copia-contato` (5), `exames` (4), `copia-ceratocone-1` (2), `copia-exames` (1).
Vale caçar esses anúncios no painel do Google Ads.

`/taguatinga` está órfã: último clique em 15/07, enquanto `/aguas-claras` recebeu 453.
