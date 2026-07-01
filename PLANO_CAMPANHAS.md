# Plano de campanhas — IOBB (conservador e eficiente)

Baseado no relatório de termos de pesquisa de **1–30 de junho de 2026**.
Objetivo: captar pacientes de **alta intenção** com **orçamento controlado** e **bom ROI**,
sem investir pesado. Refrativa e catarata ficam **pausadas**.

---

## Panorama por objetivo (junho/2026)

| Tema | Termos | Cliques | Custo | CPC méd. | Conversões |
|---|---|---|---|---|---|
| **Consulta/geral (geo DF)** | 851 | 434 | R$ 1.460 | **R$ 3,36** | **67** ✅ |
| Ceratocone | 221 | 35 | R$ 230 | R$ 6,58 | ~1 |
| Lente escleral/rígida | 61 | 10 | R$ 79 | R$ 7,87 | 1 |
| Anel/crosslinking | 35 | 4 | R$ 17 | R$ 4,18 | 0 |
| Refrativa | 21 | 1 | R$ 5 | — | 0 |
| Catarata | 16 | 0 | R$ 0 | — | 0 |

---

## Por que refrativa e catarata gastavam sem converter

Em junho **já estavam pausadas** (refrativa: 1 clique/R$ 5; catarata: 0/R$ 0), então o gasto
que motivou a pausa não está neste arquivo. Mas o mix de termos revela o porquê — três causas
combinadas:

1. **Concorrência cara (principal):** são as categorias mais disputadas e mais "pesquisa de
   preço" da oftalmologia. Termos dominados por `...valor`, `quanto custa...`. Hospitais grandes
   dão lances altos; o paciente compara várias clínicas.
2. **Público de baixa qualidade / errado:** catarata é quase toda `limpeza de lente de catarata`
   (pós-operados atrás de YAG barato, não cirurgia primária); refrativa tem muitos
   `quem tem ceratocone pode fazer cirurgia refrativa` (público errado) e concorrente de fora.
3. **Rastreamento incompleto (amplificador):** no account inteiro os procedimentos convertem ~0
   apesar de tráfego on-target, enquanto consulta converte 67× com o mesmo pixel — leads reais
   de cirurgia não eram contados. Corrigido pela landing `/lp/` + conversões offline (ver
   `RASTREAMENTO.md`).

**Veredito:** leilão caro + público price-shopper, com rastreamento quebrado piorando a leitura.

---

## Recomendação

Focar em **dois vencedores** comprovados/estratégicos e manter refrativa/catarata pausadas:

1. **⭐ Consulta geo (Águas Claras/Taguatinga/Asa Norte)** — CPC R$ 3,36 e **67 conversões
   reais**. Espinha dorsal de ROI. Águas Claras fez ~21 conversões a ~R$ 14 de CPA.
2. **Ceratocone/escleral** — volume baixo (limita gasto naturalmente = conservador), **alto valor
   por paciente** (crosslinking R$ 5.980 + esclerais R$ 5.980+) e **pouca concorrência
   especializada** (IOBB é referência).

Refrativa/catarata: reativar só **depois** que as conversões offline estiverem medindo
agendamentos — e mesmo assim como experimento pequeno, exato e qualificado por preço.

---

## Termos de alta intenção e baixa concorrência

**Consulta geo (baixo CPC, já convertem):**
`oftalmologista águas claras` (12 conv), `oftalmologista taguatinga` (9 conv),
`exame de vista taguatinga`, `exame de vista águas claras`, `oftalmologista asa norte`,
`clínica oftalmológica taguatinga`.

**Ceratocone/escleral (nicho, alto valor):**
`lente escleral` (converteu 1×), `quanto custa uma lente escleral`,
`lente escleral para ceratocone preço`, `ceratocone brasília`, `cirurgia ceratocone preço`,
`crosslinking corneano`, `avaliação da histerese corneana`, `anel de ferrara valor`.
Alto CPC mas vale pelo LTV: `especialista em ceratocone df`, `médico especialista em ceratocone`.

**Evitar (informacional, baixa intenção):** `ceratocone tem cura`, `o que é lente escleral`.

---

## Estrutura enxuta (2 campanhas, ~R$ 45/dia)

Só **Pesquisa**, só correspondência **exata** e **de frase**. **Pausar/minimizar Performance Max**
(caixa-preta; "451 conversões a R$ 2,62" suspeitas de ações fracas).

### Campanha 1 — Consulta DF (espinha dorsal) · R$ 25–30/dia
- Grupo **Águas Claras**: `[oftalmologista águas claras]`, `"oftalmologista aguas claras"`, `[exame de vista águas claras]`
- Grupo **Taguatinga**: `[oftalmologista taguatinga]`, `"oftalmologista em taguatinga"`, `"exame de vista taguatinga"`
- Grupo **Asa Norte/Brasília**: `[oftalmologista asa norte]`, `[clínica oftalmológica asa norte]`, `"oftalmologista brasília"`
- **Lance:** Manual CPC (ou Maximizar cliques com **CPC máx. R$ 4,50**). Raio/segmentação no DF.

### Campanha 2 — Ceratocone & Lentes Esclerais (nicho de alto valor) · R$ 15–20/dia
- Grupo **Ceratocone**: `[ceratocone brasília]`, `"especialista em ceratocone"`, `[crosslinking]`, `"cirurgia ceratocone preço"`
- Grupo **Lente Escleral**: `"lente escleral"`, `[lente escleral preço]`, `"lente para ceratocone"`, `"quanto custa uma lente escleral"`
- Grupo **Anel**: `"anel de ferrara"`, `[anel de ferrara valor]`
- **Destino:** `/lp/ceratocone` (captura gclid). **Lance:** Manual CPC, **CPC máx. R$ 10** nos gerais e até **R$ 20** em `especialista em ceratocone`.

**Regra de ouro:** comece **manual**. Só migre para Maximizar conversões / tCPA depois que as
conversões offline estiverem entrando (senão o Smart Bidding otimiza para dados quebrados).
Aplique as negativas de `negativas_iobb_google_ads.csv` nas duas campanhas.

Total: **~R$ 45/dia (~R$ 1.350/mês)** — muito abaixo dos ~R$ 213/dia anteriores, e controlado.

---

## Textos de anúncio (RSA — títulos ≤ 30, descrições ≤ 90, sem promessas)

### Consulta (grupo Águas Claras / geo)
Títulos: Oftalmologista em Brasília · Atendemos Águas Claras · Consulta Oftalmológica ·
Asa Norte e Taguatinga · Agende pelo WhatsApp · Atendimento Humanizado · Convênios e Particular ·
Exames no Mesmo Dia
Descrições: "Consulta oftalmológica completa em Brasília. Agende pelo WhatsApp, sem burocracia." ·
"Asa Norte e Taguatinga. Diversos convênios e particular. Fale com a gente hoje."

### Ceratocone
Títulos: Especialista em Ceratocone · Ceratocone em Brasília · Crosslinking e Anel ·
Lentes para Ceratocone · Avaliação Especializada · Referência em Ceratocone ·
Tratamento Individualizado · Agende pelo WhatsApp
Descrições: "Ceratocone tem tratamento: crosslinking, anel e lentes especiais em Brasília." ·
"Avaliação com especialista e contactóloga. Agende sua consulta pelo WhatsApp."

### Lentes Esclerais
Títulos: Lentes Esclerais Brasília · Lente Escleral Ceratocone · Adaptação c/ Contactóloga ·
Lentes de Contato Especiais · Rígidas e Esclerais · Agende sua Avaliação
Descrições: "Adaptação de lentes esclerais e rígidas para ceratocone. Avaliação especializada." ·
"Contactóloga experiente em Brasília. Fale pelo WhatsApp e agende sua consulta."

---

## Arquivos relacionados
- `estrutura_campanhas_google_ads.csv` — estrutura (campanhas/grupos/palavras-chave/lances) p/ Editor
- `negativas_iobb_google_ads.csv` — palavras-chave negativas
- `RASTREAMENTO.md` — conversões offline (mede agendamento real)
