# Rastreamento de conversões do Google Ads (WhatsApp → agendamento)

Mede **quais cliques de anúncio viram agendamentos reais**, fechando o ciclo:

```
Anúncio (Google) → Landing /lp/:tema (captura gclid, cria token)
   → WhatsApp com [ref:token] → Ana vincula token ↔ telefone ↔ conversa
   → Secretária marca "Agendou 📅" no painel
   → Export de conversões offline → importa no Google Ads
```

Assim o Google aprende quais campanhas/termos geram agendamento e otimiza os lances.

---

## Setup (uma vez)

### 1. Banco de dados
Rode `sql/ad_clicks.sql` no **SQL Editor do Supabase**.

### 2. Variáveis de ambiente (Render → `/etc/secrets/.env`)
| Variável | Valor | Obrigatória |
|---|---|---|
| `WA_LP_NUMBER` | Número do **WhatsApp Business da Ana** (E.164, sem "+"), ex.: `5561XXXXXXXXX` | **Sim** |
| `GOOGLE_ADS_CONVERSION_NAME` | Nome da ação de conversão no Google Ads (padrão: `Agendamento IOBB`) | Não |

> ⚠️ `WA_LP_NUMBER` **precisa ser o número que a Ana atende** (o conectado à Cloud API). Se apontar para outro número, o token não é capturado e a conversão não é atribuída. Sem a variável, cai no `NUMERO_CLINICA` como fallback.

### 3. Ação de conversão no Google Ads
1. **Metas → Conversões → + Nova ação de conversão → Importar → Outras fontes / Uploads manuais (offline).**
2. Nome: **exatamente** o mesmo de `GOOGLE_ADS_CONVERSION_NAME` (`Agendamento IOBB`).
3. Categoria: *Envio de formulário de lead* ou *Agendar* / *Contato*.
4. Valor: pode usar valor por conversão (o export manda R$ 200 por padrão; ajustável).
5. Ative o **auto-tagging**: *Configurações → Acompanhamento → Marcação automática = ATIVADA* (garante o `gclid`).

### 4. Apontar os anúncios para a landing (não para o `wa.me` direto!)
Troque a **URL final** de cada **grupo de anúncio** para a landing correspondente (mais relevante = melhor Índice de Qualidade e conversão):

| Campanha | Grupo de anúncio | URL final |
|---|---|---|
| IOBB \| Consulta DF | Águas Claras | `https://SEU-DOMINIO/lp/aguas-claras` |
| IOBB \| Consulta DF | Taguatinga | `https://SEU-DOMINIO/lp/taguatinga` |
| IOBB \| Consulta DF | Asa Norte e Brasília | `https://SEU-DOMINIO/lp/asa-norte` |
| IOBB \| Ceratocone e Esclerais | Ceratocone / Lente Escleral / Anel | `https://SEU-DOMINIO/lp/ceratocone` |

**Landings disponíveis** (todas capturam `gclid` e redirecionam para a Ana):
`/lp/consulta` (geral — fallback), `/lp/ceratocone`, `/lp/taguatinga`, `/lp/aguas-claras`, `/lp/asa-norte`.

(`SEU-DOMINIO` = a URL pública do app no Render.) O Google adiciona o `gclid` automaticamente; a landing captura, cria o token e redireciona para o WhatsApp da Ana com `[ref:token]`.

---

## Uso no dia a dia

- **Secretária:** ao confirmar um agendamento, abre a conversa no painel e clica em **📅 (Marcar agendamento)**. O painel avisa se a conversa veio de anúncio.
- **Semanal:** no painel, botão **📊 Relatório Google Ads → Baixar conversões**. Baixa `conversoes_google_ads.csv` (formato de importação offline) e marca as linhas como exportadas.
- **Importar no Google Ads:** *Metas → Conversões → Uploads → + → enviar o CSV.*

---

## Endpoints (todos autenticados, exceto a landing)

| Rota | Método | Função |
|---|---|---|
| `/lp/:tema` | GET (público) | Landing que captura `gclid` e redireciona ao WhatsApp |
| `/api/conversations/:id/booked` | POST | Marca agendamento (conversão) da conversa |
| `/api/ads/conversions.csv` | GET | Export offline. `?all=1` inclui já exportadas; `?markReported=1` marca como enviadas |

---

## Como funciona por dentro

1. `/lp/:tema` chama `registrarClique()` → grava `token + gclid` em `ad_clicks` e monta `wa.me/<WA_LP_NUMBER>?text=... [ref:TOKEN]`.
2. No `webhook`, a 1ª mensagem traz `[ref:TOKEN]`; a Ana extrai o token (removendo-o do texto) e chama `vincularClique()` → grava `phone` e `conversation_id` naquele clique.
3. Botão **📅** → `POST /booked` → marca `booked/booked_at/conversion_value` no clique daquela conversa.
4. Export → linhas `booked=true` com `gclid` viram o CSV; `markReported=1` seta `reported=true`.

---

## Caveats

- **Atribuição só existe se o clique passou pela landing** (com `gclid`). Pacientes orgânicos são marcados como agendados, mas sem conversão para o Google (não há `gclid`).
- **Janela de conversão:** importe as conversões dentro do prazo do Google (recomendado semanal).
- **Não reenvie o mesmo `gclid`** (evita contagem dupla) — por isso o `markReported=1` no download do painel.
- Se quiser reexportar tudo (ex.: reimportação), use `/api/ads/conversions.csv?all=1` manualmente.
