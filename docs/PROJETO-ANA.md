# Projeto Ana — o documento-mestre

**Ana** é a secretária virtual do Instituto de Olhos Bruno Borges (IOBB), Brasília/DF.
Atende pacientes pelo WhatsApp da clínica, responde dúvidas, informa valores e **marca,
remarca e desmarca consultas de verdade** numa agenda própria.

Este documento é o ponto de partida para entender o projeto inteiro. Foi escrito para o
Dr. Bruno (dono do projeto, sem formação técnica) e para qualquer pessoa técnica que
venha a trabalhar nele. Quando algo aqui contradisser o código, **o código vale** — e
este documento deve ser corrigido.

> Última revisão completa: **15/08/2026, fim do dia**. Tudo abaixo reflete o sistema
> COMO ESTÁ HOJE. O que é histórico está marcado como histórico.

---

## 1. O mapa das peças

```
Paciente (WhatsApp)
      │
      ▼
Meta (WhatsApp Business API)
      │  webhook
      ▼
┌─────────────────────────────────────────────┐
│  index.js — app Node/Express no RENDER      │
│  · persona e regras da Ana (SYSTEM_PROMPT)  │
│  · travas determinísticas                   │
│  · agenda, lembretes, follow-up, espelho    │
└──────┬───────────────┬──────────────────────┘
       │               │
       ▼               ▼
  API da Anthropic   SUPABASE (Postgres)
  (claude-sonnet)    · patients, conversations, messages
                     · appointments (a AGENDA)
                     · error_log, api_custos, settings, ad_clicks
       ▲
       │ (leitura)
  PAINEL (painel.html) — as secretárias acompanham e assumem conversas
  AGENDA (agenda.html) — visão da agenda p/ transferência ao prontuário
```

| peça | onde | acesso |
|---|---|---|
| Código | github.com/brunooftalmologista-boop/iobb-ana-webhook | conta GitHub do Bruno |
| Servidor | Render — serviço `iobb-ana-webhook` (deploy automático a cada push; segredos no Secret File `/etc/secrets/.env`, que tem prioridade sobre as variáveis do painel) | dashboard.render.com |
| Banco | Supabase — projeto `iobb-atendimento` (`pbnphvmzqdgnijxngosc`) | supabase.com/dashboard |
| WhatsApp | Meta Business — templates em WhatsApp Manager → Modelos de mensagem | business.facebook.com |
| IA | Anthropic — modelo claude-sonnet-4-6, chave `iobb-ana-2` (console.anthropic.com) | conta do Bruno |
| Áudio | OpenAI Whisper transcreve os áudios dos pacientes (`OPENAI_KEY`) | conta do Bruno |
| Google Ads | conta `451-429-2857` (MCC "IOBB Admin" `732-549-0192`) | bruno.oftalmologista@gmail.com |
| Site (fonte) | **`site/` neste repositório** — espelho do publicado, desde 22/08. Cuidador: agente `site-landings` | — |
| Site | iobb.com.br — **Cloudflare Pages**, HTML estático; deploy = zip com arquivos na raiz. Um Worker roteia os paths de landing (`/lp/*` etc.) para o app no Render. Detalhes: docs/DOMINIO-IOBB.md | Cloudflare do Bruno |
| Painel | https://iobb-ana-webhook.onrender.com/painel — login individual por secretária (Supabase Auth; senhas via env `PANEL_PW_<NOME>`) | — |
| Agenda | https://iobb-ana-webhook.onrender.com/agenda (mesma sessão do painel) | — |

**O que está no ar agora:** `https://iobb-ana-webhook.onrender.com/version` — commit,
uptime e estado das configurações principais (janela do painel, espelho, TTL).

---

## 2. O fluxo de um atendimento

1. Paciente escreve → Meta chama o webhook no Render.
2. **Agrupamento** (`ANA_DEBOUNCE_MS`, 20 s): a Ana espera o paciente terminar de
   digitar; várias mensagens seguidas viram UMA resposta. Fotos enviadas logo antes de
   um texto ficam num depósito de 3 min e são lidas pelo turno que responde.
3. Casos que **não** gastam IA (resposta fixa do código):
   - "Confirmo" após o lembrete → confirma no banco e responde texto fixo;
   - cortesia depois da confirmação ("obrigada", "ok, obrigada", "👍") → despedida fixa;
   - FAQ de endereço/como chegar e horário de funcionamento;
   - **conferência de óculos / ajuste de armação** → texto fixo com as DUAS
     unidades e o próximo dia de cada uma calculado pelo código;
   - números mudos (espelho) → ignorados; conversa em modo humano → só espelha à equipe.
4. Nos demais, monta o prompt em três blocos cacheados (persona fixa · parte estável da
   agenda · histórico) + um bloco volátil (data/hora arredondada a 15 min, contexto do
   turno) e chama a Anthropic.
5. A resposta passa pelas **travas** (seção 6). Reprovada → reescrita (que passa pelas
   travas de novo); se a reescrita mentir sobre a agenda, o código responde com uma
   vaga real; nas travas de horário a reescrita recebe uma "vaga âncora" verificada.
6. Blocos técnicos invisíveis executam ações: `[AGENDAR]` grava consulta ·
   `[CANCELAR]` desmarca · `[PREAGENDAMENTO]` e `[RECADO]` notificam a equipe ·
   `[CARTEIRINHA]` anexa convênio/número à ficha do agendamento.
7. Tudo é espelhado ao WhatsApp do Bruno e aos números em `WA_ESPELHO_EXTRA`.

**Rotinas automáticas** (rodam sozinhas no servidor):
- **Lembrete da véspera** (`LEMBRETE_HORA`, 17h): mensagem a cada paciente do dia
  seguinte, via template com botões (`lembrete_consulta_botoes`, no ar desde 16/08;
  rótulos `Confirmo · Desmarcar · Remarcar`, definidos em `BOTOES_LEMBRETE`).
  O que cada toque faz:
  - **Confirmo** → grava a confirmação e responde com texto fixo lido do banco. Sem IA.
  - **Desmarcar** → **cancela na hora**, libera a vaga e responde com texto fixo
    convidando a remarcar. Sem IA. Não pede confirmação: pedir deixava o horário
    preso quando o paciente não respondia (decisão do Dr. Bruno, 17/08). Exceção:
    2+ consultas no mesmo telefone e mesmo dia (família) — aí a Ana pergunta qual.
  - **Remarcar** → avisa a equipe e a Ana oferece um horário concreto. Usa IA.
- **Follow-up de leads frios** (a cada 30 min, liga/desliga em
  `settings.followup_leads_enabled`): reengaja quem parou NO MEIO de uma escolha há
  3–20 h. Não persegue quem agradeceu/encerrou/já tem consulta (por qualquer via).
- **Sync iClinic — DESATIVADO (19/08)**: o iClinic foi descontinuado; a agenda da
  Ana é a ÚNICA. O sync (`settings.sync_iclinic_enabled=false`) não roda desde
  04/08. Sobraram 12 retornos futuros de origem iClinic, legítimos, sem telefone
  vinculado — a equipe pode adicionar o telefone pelo painel para a Ana geri-los.
- **Cobrança de recado** (`COBRANCA_RECADO_HORAS`, 4h): recado da Ana sem NENHUMA
  resposta humana na conversa em 4h úteis → alerta no número principal, uma vez
  por recado. Nasceu do lead de lente perdido em 03/08 num "a equipe entrará em
  contato" que ninguém cobrou.
- **Resumo diário à equipe** (`RESUMO_DIARIO_HORA`, 19h): agenda de amanhã, quem
  confirmou, quem precisa de ligação.
- **Auditoria diária** (`AUDITORIA_HORA`): varre as conversas do dia atrás de falhas.
- **Verificação de entrega**: mensagens recusadas pela Meta (janela de 24 h) ficam
  visíveis no painel em vez de "parecer enviadas".

**A agenda é nossa e é a ÚNICA** (tabela `appointments`; o iClinic foi desligado),
com trava anti-overbooking no banco. **Encaixe** (desde 20/08): a equipe pode
marcar deliberadamente em cima de um horário ocupado gravando a coluna
`encaixe = true` — essas linhas ficam fora do índice de slot único. A Ana **nunca**
cria nem oferece encaixe; para ela o horário continua ocupado. Migração:
`sql/encaixe.sql`. Desde 19/08 a Ana pode **remarcar e cancelar
qualquer consulta** vinculada ao telefone do paciente — inclusive as marcadas pela
equipe (o espelho avisa toda alteração).
Grade de 20 em 20 min; sem 13h00–13h40 (almoço), sem 12h40 e 17h40.

- **Conjunto Nacional** (Asa Norte): seg/qua/sex — médico das 9h às 18h.
- **Taguatinga Shopping** (Águas Claras): ter/qui — médico das 10h às 18h.
- Recepção abre 8h nas duas. Fim de semana não há atendimento.
- Endereços completos e "como chegar" estão no prompt (seções ENDEREÇOS COMPLETOS e
  COMO CHEGAR) e a Ana os informa na confirmação de todo agendamento.

---

## 3. Regras de negócio (decididas pelo Dr. Bruno — não deduzir, não flexibilizar)

**Agendamento**
- Ficha obrigatória para marcar: **nome completo + data de nascimento + particular ou
  convênio (qual)** — só isso. Trava no código impede `[AGENDAR]` sem esses três, e a
  confirmação enviada ao paciente traz os dados gravados para ele conferir.
  **A carteirinha NÃO é condição para marcar em nenhum convênio** (26/08/2026): sempre
  pedida, nunca travando.
- Um horário por vez na oferta (nunca "cardápio") — exceção: N pacientes = N horários
  (família no mesmo WhatsApp; o lembrete/confirmação também tratam o grupo junto).
- Idade mínima **8 anos, categórico**. Não encaminhar para fora; só registrar pedido
  de exceção se o paciente insistir.
- **Mesmo dia: TODOS**, particular e convênio, sem exceção (Dr. Bruno, 21/08).
  NENHUM plano exige antecedência — a lista de exceções foi esvaziada (a Unimed saiu
  em 19/08 e o restante em 21/08). É proibido dizer que um convênio "precisa de 24 h",
  "exige liberação prévia" ou "verificação de cobertura antes": a verificação é feita
  pela equipe DEPOIS, com o horário já reservado, e nunca é assunto do paciente.
- Conferência de óculos / ajuste de armação / retirada de receita: **ordem de chegada,
  proibido ocupar vaga** — mesmo que o paciente peça horário. Informar o horário do
  MÉDICO (9h CN / 10h TG), não o da recepção, e **sempre as DUAS unidades**. Desde
  15/08 isso é resposta fixa do código, sem IA (ver seção 2).
- Teste de lente de contato avulso (sem consulta): só para quem já consultou no IOBB
  **ou** tem exame oftalmológico de até 3 meses (de qualquer serviço — trazer no dia).
  Sempre particular (R$ 120 gelatinosa / R$ 150 rígida ou escleral), só no Conjunto.
  Quem não se encaixa faz a consulta primeiro. Aceitar a palavra do paciente.
- Exame avulso com pedido de outro médico: pode, sem consulta prévia aqui.
- **Retorno: 30 dias, só para quem pagou particular** (Dr. Bruno, 28/08/2026). Um
  retorno sem custo dentro de 30 dias corridos da consulta; depois disso é consulta
  nova (R$ 200). Convênio segue as regras do plano — a equipe confirma, a Ana não
  afirma prazo. **Conferência de óculos NÃO é retorno**: não consome o prazo e não
  tem data limite (o paciente traz os óculos quando ficarem prontos).
  A conta dos 30 dias é do CÓDIGO, não do modelo: quando o paciente fala em retorno,
  o sistema lê a última consulta dele e injeta o veredito pronto (dentro/fora, dias
  corridos, forma de atendimento).
  **Quando ela fala:** dentro do prazo, só se perguntarem (marca e segue, sem citar
  valor). **Fora do prazo, avisa mesmo sem perguntarem** — uma linha discreta no meio
  da mensagem, junto da oferta de horário: quem pede "retorno" supõe que não vai
  pagar, e descobrir os R$ 200 na recepção é o caso da Marcia (21/08) de novo.
- Ana nunca diz "vou reservar" antes de emitir o bloco; nunca repete data/hora depois
  de confirmado (risco de errar ao repetir); corrigir um dado não é remarcar.
- **Falar com uma pessoa:** quando o paciente pede humano/secretária/equipe, oferecer
  os DOIS caminhos — telefone **(61) 3033-6605** e **WhatsApp da equipe (61) 99299-7639**
  (regra do Dr. Bruno, 18/08) — e ainda deixar o `[RECADO]`: oferecer contato não
  substitui o recado. Exceção: em sintoma agudo, orientar o TELEFONE primeiro (mais
  rápido que mensagem).

**Convênios**
- Lista de ATENDIDOS (a fonte é o prompt; cópia de 15/08 — se divergir, vale o prompt):
  AMHPDF, AFEB BRASAL, AFFEGO, ASETE, ASFUB, BACEN, BBB SAÚDE, CARE PLUS, CASEMBRAPA,
  CAEME-GO, CAMED, CAESAN, CASEC (CODEVASF), CTI, CONAB, ELETRONORTE, EMBRATEL,
  E-VIDA (hoje LUMINAR SAÚDE), FACEB, FAPES (BNDES), FASCAL, FIOSAÚDE (FIOPREV),
  FURNAS, INFRAERO, IRB, IRMÃOS GRAVIA, LIFE EMPRESARIAL, MAPFRE SAÚDE,
  MPDFT, MPF, MPM, MPT, NOTRE DAME, OMINT, PAME, PLAN-ASSISTE, PROASA, PRÓ-SAÚDE (CÂMARA DOS
  DEPUTADOS), PRÓ-SOCIAL, SAÚDE CAIXA, SERPRO, SIS SENADO, STF-MED, STM, TJDFT,
  TST SAÚDE, T.R.E., TRF, TRT, UNAFISCO, UNIBANCO-TEMPO SAÚDE, UNIMED (ver regra),
  UNIVERSAL ASSISTENCE.
- **UNIMED: TODAS são atendidas** (Dr. Bruno, 25/08/2026 — revoga a regra "por produto"
  de 14/08, que eu tinha inventado e que custou 5 agendamentos). Central Nacional
  (= "Unimed Nacional"/CNU), Planalto, Intercâmbio, Seguros Unimed **e as REGIONAIS de
  qualquer cidade/estado** (Curitiba, Uberlândia, Fesp, João Pessoa, Fortaleza…).
  Sub-plano no cartão (PME, Ideal, Enfermaria…) não muda nada. Agenda direto; a
  carteirinha serve para a EQUIPE pedir a guia, nunca para decidir se marca.
- **Nunca atendidos** (confirmado pelo Dr. Bruno em 25/08, escolhidos por VOLUME DE
  PROCURA medido nas conversas — ~180 perguntas em 2 meses): Quality/Quallity/Qualyty,
  **SulAmérica, Bradesco, Amil, CASSI, ASSEFAZ, GEAP, GDF Saúde (INAS-DF/IASES-DF),
  SESC, Porto Seguro, Hapvida**. Não é lista exaustiva — o que define o que ACEITAMOS
  é a lista de atendidos; estes estão escritos só para a Ana negar rápido e seguir
  para o particular. Servem também de **negativa no Google Ads**.
- **STJ e GAMA SAÚDE saíram dos atendidos em 26/08/2026** (Dr. Bruno). Caso diferente
  dos de cima: estes estavam ERRADAMENTE listados como atendidos no prompt, no painel,
  na agenda, no site e nas landings desde o início — ou seja, a clínica anunciava dois
  planos que não atende. Removidos dos cinco lugares e acrescentados aos não atendidos.
  ⚠️ Os demais tribunais **continuam atendidos**: STF-MED, STM, TST Saúde, TJDFT, TRF,
  TRT, T.R.E., SIS Senado. Só o STJ saiu. "Gama" é o PLANO, não a cidade do DF.
- Plan-Assiste cobre MPF/MPDFT/MPM/MPT (e MPU). Qualicorp é administradora →
  perguntar qual a operadora. Nome parcial/duvidoso: não negar — confirmar.
- Carteirinha: **sempre pedir** (foto ou número) a todo paciente de convênio, para
  anexar ao agendamento e a equipe solicitar a autorização — e **NUNCA travar o
  atendimento por ela**, em nenhum plano, Unimed inclusive (Dr. Bruno, 26/08/2026;
  removeu a última exceção, que era o número da Unimed). O pedido vai na mesma
  mensagem da oferta/confirmação do horário; sem resposta, marca do mesmo jeito.
  Se o paciente manda o cartão perguntando "vocês atendem?", a Ana LÊ na hora e
  responde do que está impresso.
- Proibido voltar atrás numa aceitação já comunicada (salvo não-atendido/regional).
- Cirurgia refrativa é sempre particular. Cirurgia coberta pelo convênio (ex.:
  catarata): não citar o valor particular a quem tem o convênio.

**Valores (15/08/2026)**
| item | valor |
|---|---|
| Consulta particular | R$ 200 (refrativa: avaliação já inclui exames, inclusive Pentacam; demais temas: exames complementares à parte) |
| PRK / TransPRK | R$ 5.990 |
| **LASIK** | **R$ 7.800** (atualizado 12/08 — site corrigido em FAQ **e** cards) |
| Femto-LASIK | R$ 8.890 |
| Crosslinking | R$ 5.980 / olho |
| Anel de Ferrara | R$ 8.700 / olho |
| Catarata (procedimento) | R$ 5.000 / olho + lente |
| LIOs: monofocal R$ 1.800 · tórica R$ 3.600 · Eyhance R$ 4.200 · Eyhance Toric R$ 5.400 · EDOF R$ 9.800 · EDOF tórica R$ 11.200 · Trifocal R$ 12.000 · Trifocal tórica R$ 13.200 (por olho; monofocal esférica é a coberta por convênio) | |
| Lentes esclerais (3 modelos) | Esclera SG R$ 7.800 par / R$ 4.280 unidade · **ZenLens** R$ 7.800 par / R$ 4.280 unidade (mesmo valor da SG) · **Zen RC** R$ 5.980 par. ⚠️ Zen RC e ZenLens são lentes DIFERENTES, não é renomeação |
| Lente rígida gás permeável (corneana) | a partir de R$ 2.500 o par — **só informar se o paciente perguntar** (18/08); não confundir com a escleral |
| Teste de lente | R$ 120 gelatinosa · R$ 150 rígida/escleral (só particular, só Conjunto) |
| Exames avulsos | Pentacam R$ 300 · Sobrecarga Hídrica R$ 380 · Paquimetria/Topografia R$ 180 (tabela completa no prompt) |

- **Tudo parcela em até 5x no cartão SEM JUROS — inclusive as lentes esclerais.**
- **Não há desconto na consulta** (regra de 18/08): os R$ 200 são fixos — sem valor
  social, sem condição para idoso/estudante/servidor/indicação/família. A Ana não
  oferece desconto nem diz que "vai verificar com a equipe"; responde sem
  constrangimento e segue para o horário na mesma mensagem.
- A Ana nunca sugere forma de pagamento ("priorizamos PIX" é proibido — removido 12/08).
- Não realizamos capsulotomia YAG. Vendemos lente de contato (compra na clínica).
- Postura consultiva nos 4 temas de valor (refrativa, ceratocone, lentes, catarata):
  informar valores diretamente, abrir pelo benefício, sempre fechar com UM horário.

---

## 4. Operação — o que o Bruno faz sozinho

**Comandos por WhatsApp** (do seu número para o da clínica; lista completa):
| comando | o que faz |
|---|---|
| `#ANA ON` / `#ANA OFF` / `#ANA STATUS` | liga/desliga/consulta a Ana (OFF não afeta leads de anúncio — `ANA_SEMPRE_ATIVA_SOURCES`) |
| `#LEMBRETES` | prévia do lembrete da véspera + template em uso (não envia) |
| `#LEMBRETES TESTAR` | manda o template só para você (testa aprovação na Meta) |
| `#LEMBRETES CONFIRMAR` | dispara os lembretes agora |
| `#CUSTOS` | gasto da API somado (tabela `api_custos`) |
| `#AUDITORIA` | auditoria das conversas do dia |
| `#TRAFEGO` | tráfego das landing pages |
| `#ORIGEM` / `#ORIGENS` | de onde vieram as conversas |
| `#ADS` / `#ADS RELATORIO` | relatório do Google Ads |
| `#ADSCONV` (+`TESTE`) | sobe conversões offline para o Ads |
| `#ADSHISTORICO` (+`TESTE`/`CONFIRMAR`) | conversões retroativas |
| `#CRIARCERATOCONE` / `#CRIARESCLERAL` / `#CRIARCATARATA` / `#CRIARCOMBINADA` (+`TESTE`/`CONFIRMAR`) | criam campanhas no Ads (nascem pausadas) |
| `#PAUSARCERATOCONE` / `#PAUSARSEPARADAS` | pausam campanhas |
| `#ENVIAR <número> <msg>` / `#MSG` | manda mensagem pelo número da clínica |

**Variáveis no Render** (Environment — mudam comportamento SEM deploy). As de
operação do dia a dia:
| variável | efeito | atual |
|---|---|---|
| `PAINEL_JANELA_HORAS` | lista do painel só com os últimos N h (pendências e busca não são afetadas) | 96 |
| `WA_ESPELHO_EXTRA` | números extras que recebem o espelho (precisam escrever à clínica 1×/dia — regra da Meta; falha 3× avisa o Bruno) | 5561992997639 |
| `WA_NUMEROS_MUDOS` | números que a Ana nunca responde (os do espelho já entram sozinhos) | — |
| `ANA_CACHE_TTL` | `5m` volta o cache do prompt para 5 min | 1h (padrão) |
| `ANA_DEBOUNCE_MS` | espera antes de responder (agrupamento) | 20000 |
| `WA_LEMBRETE_TEMPLATE_NAME` / `_LANG` | template do lembrete da véspera | conferir na Meta |
| `LEMBRETE_HORA` | hora do lembrete | 17 |
| `RESUMO_DIARIO_HORA` | hora do resumo à equipe (`off` desliga) | 19 |
| `AUDITORIA_HORA` / `AUDITORIA_DESTINO` | auditoria diária | — |
| `ANA_UNIDADE_PREFERIDA` | unidade sugerida quando o paciente não escolheu | — |
| `ANA_SEMPRE_ATIVA_SOURCES` | origens atendidas mesmo com #ANA OFF | refrativa, IG/FB |
| `ANA_ANTECEDENCIA_HORAS` | antecedência mínima de oferta | — |
| `ANA_MARCA_SOZINHA` | Ana grava agendamento (Fase 2 da agenda) | on |
| `ANA_MODEL` | modelo da Anthropic | claude-sonnet-4-6 |

Técnicas (mexer só sabendo o que faz): `ANTHROPIC_KEY`, `OPENAI_KEY`, `SUPABASE_URL/KEY`,
`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`, `META_APP_SECRET`, `WA_WABA_ID`,
`ICAL_ICLINIC_CN/TG`, `WA_SECRETARIA_NUMBER/TEMPLATE_*`, `WA_TEMPLATE_NAME/LANG`,
`WA_LP_NUMBER`, `GOOGLE_ADS_*`, `PANEL_PASSWORD`/`PANEL_PW_<NOME>`, `ADMIN_PASSWORD`,
`ANA_ADMIN_PIN`.

**Chaves em `settings` no Supabase** (liga/desliga sem deploy): `ai_enabled` (o #ANA
mexe aqui) · `followup_leads_enabled` · `sync_iclinic_enabled` · `agenda_horarios_extras`.

**Se algo quebrar:**
1. `https://iobb-ana-webhook.onrender.com/version` — o commit no ar é o esperado?
2. `#ANA OFF` enquanto se investiga (equipe atende pelo painel).
3. Reverter = `git revert <commit>` + push (qualquer sessão do Claude faz).
4. Comportamento errado da Ana: tabela `error_log` (coluna `etapa`). Infra: Logs do
   Supabase e do Render.

**Regra de ouro dos deploys:** cada push reinicia o Render e esfria o cache do prompt.
Mudança não urgente sobe **fora do expediente**. Urgência de paciente ignora a regra.

**Convenção de testes:** mensagens começam com `[TESTE - ignorar]`; pacientes
sintéticos usam telefones `55619900…` (ignorados por lembrete/follow-up). Cancelar os
agendamentos de teste depois.

---

## 5. O painel da equipe

- Lista de conversas (últimas 96 h + toda pendência; busca alcança TUDO pelo servidor).
- Assumir/devolver conversa (a Ana silencia na hora; "modo humano" por conversa).
- Enviar mensagem, iniciar conversa nova (respeita a janela de 24 h da Meta — fora
  dela, só template; falha de entrega fica visível).
- Marcar "agendou" (fecha conversão do Ads), encerrar/reabrir conversa.
- Anexos dos pacientes (fotos/PDF/áudio com transcrição) ficam no chat do painel.

**Na agenda (`/agenda`), além de marcar, remarcar e cancelar:**
- **🚫 Bloquear** (botão na barra de cima) — fecha o dia inteiro ou uma faixa de
  horário: feriado, congresso, cirurgia, médico fora. Também dá para bloquear
  UM horário só, pelo botão que aparece ao clicar numa vaga livre.
  O bloqueio some da agenda da Ana e da grade; para reabrir, clique nele e
  **Liberar horário**. Horário com paciente marcado **nunca** é fechado por
  cima — a tela lista quem precisa ser remarcado antes.
  Feriados já bloqueados: **07/09, 12/10 e 02/11 de 2026**.

---

## 6. Como o sistema se defende (as travas)

Lição central do projeto: **regra escrita no prompt não basta.** Toda regra crítica
tem trava determinística que REGENERA a resposta (nunca remenda texto). A reescrita
passa pelas travas de novo; se ainda mentir sobre a agenda, o código responde sozinho
com uma vaga real. O recheque só barra MENTIRA (fato), nunca estilo — regra de estilo
reprovada 2× segue, para não destruir resposta legítima (ex.: casal = 2 horários).

- ficha incompleta → bloqueia `[AGENDAR]` (insiste 2×, depois avisa a equipe);
- vários horários no texto (exceção: N pacientes);
- "hoje/amanhã" contradizendo o calendário ou a agenda real;
- unidade × dia trocados · exame na unidade errada · dia da semana errado (corrige);
- vaga mais cedo ignorada · preço sem oferta de horário · verbete de dicionário;
- preço da consulta dito sem saber se é particular ou convênio → refaz
  enquadrando ("no particular é R$ 200,00") e perguntando do plano na mesma
  mensagem (quem tem plano atendido não paga — e desiste achando que vai pagar);
- vazamento de instrução interna · convênio não atendido/regional;
- `[AGENDAR]` com horário fora da lista → não grava, oferece alternativa;
- remarcação: ofereceu horário antes de perguntar o dia/turno → refaz perguntando
  (quem pede para remarcar já disse que o horário que tem não serve; repetir o
  horário DELE não conta como oferta);
- prosa × token divergentes → vale a PROSA (o que o paciente leu);
- anti-duplicata e anti-overbooking (índice único no banco);
- re-emissão de `[AGENDAR]` sem mudança → ignorada (não duplica).

Tudo registrado em `error_log`. **Telefone BR tem duas grafias** (com/sem o 9º dígito;
a Meta entrega sem) — comparações usam `fonesBR()`/`foneChave()`, nunca string crua.

---

## 7. Custos (medidos, não estimados)

- **API da Ana**: ~US$ 0,034/mensagem (14/08) → **~US$ 190/mês** no volume atual
  (projeção era US$ 261 no início de agosto, com muito menos regra). Cada chamada é
  gravada em `api_custos`; `#CUSTOS` soma. TTL do cache = 1 h (decidido 14/08 com dois
  dias de fatura; `ANA_CACHE_TTL=5m` reverte).
- Otimizações ativas: 3 blocos de cache (persona/agenda/histórico) · relógio
  arredondado a 15 min fora do bloco cacheado · agrupamento 20 s · confirmação,
  cortesia e FAQ sem IA · follow-up com mira estreita · reescritas reaproveitando
  cache + vaga âncora.
- **Supabase**: egress de ~2 GB/dia para ~60 MB/dia (assinatura barata antes da
  consulta cara, janela do painel, caches, `ad_clicks` 60 s). Cota 5,5 GB/mês; agosto
  estourou pelo período ANTES dos consertos (carência até 08/09); setembro projeta
  ~25% da cota.
- WhatsApp: conversa de serviço é grátis; template pago por disparo.

---

## 8. Linha do tempo — do zero até agora

| período | o que aconteceu |
|---|---|
| **24/06** | Nasce o webhook: Ana responde WhatsApp com IA, prompt inicial. |
| **fim de jun–início de jul** | Persona cresce (30 perguntas simuladas); valores e convênios entram; painel das secretárias; transcrição de áudio. |
| **jul (1ª quinzena)** | Campanhas Google Ads (refrativa etc.); landing pages; rastreamento gclid → conversão offline; templates da Meta. |
| **21/07** | **Incidente RLS**: dados de paciente expostos por anon key com RLS desligado — corrigido no dia; painel passa a login individual. |
| **20–27/07** | **Agenda própria (Modelo B)**: tabela `appointments` vira fonte única; Ana marca sozinha; sync iClinic via iCal; anti-overbooking. Regras de negócio ditadas (idade 8+, endereço na confirmação, antecedência de convênio, 1 horário por vez). |
| **28/07–04/08** | Guerra às alucinações de data/horário: travas de dia-da-semana, unidade×data, prosa×token; incidente do horizonte de 8 dias; migração do site para iobb.com.br. |
| **05/08** | Análise de custo com fatura real (US$ 261/mês projetado); **agrupamento de mensagens** (20 s); cache da agenda; postura consultiva no prompt. |
| **08–12/08** | **Egress do Supabase estoura** (painel baixava a lista inteira a cada 5 s): assinatura barata + janela de 96 h + caches = −97%. Ficha obrigatória vira trava dura. Espelho para nº extra. TTL 1 h. LASIK R$ 7.800 (site + Ana). Nono dígito consertado em todas as buscas. |
| **13/08** | Lembrete com botões (código); cortesia sem IA; follow-up com mira estreita; conferência de óculos não ocupa vaga; medidor `api_custos` + FAQ sem IA + cache do histórico (sessões paralelas). |
| **14/08** | Agenda lotada expõe invenção de horários → recheque da reescrita; **incidente do recheque** (destruiu 5 respostas certas de um casal) → recheque só barra mentira; Unimed por produto (João Pessoa não); SulAmérica nunca; TTL confirmado com 2 dias de fatura. |
| **15/08** | Descoberto que a foto da carteirinha **morria no agrupamento** (texto logo depois cancelava o turno da imagem) → depósito de 3 min resolve; documento-mestre criado; docs reorganizados. |

O detalhe de cada passo está nas mensagens dos ~400 commits (`git log`) e em
`docs/decisoes/`.

---

## 9. Histórico e decisões — onde procurar o "porquê"

1. **`git log`** — a fonte mais rica; cada commit explica o incidente que o motivou.
2. **`docs/decisoes/`** — as anotações de decisão/incidente do Claude, com data.
   ⚠️ **São retratos da época**: algumas conclusões foram REVISTAS depois (ex.: "toda
   Unimed é atendida", de 11/08, caiu em 14/08; "não mexer no TTL", de 05/08, caiu em
   12/08). Em dúvida, vale ESTE documento e o código.
3. **`docs/DOMINIO-IOBB.md`** — site, landing pages, Cloudflare, Worker.
4. **`docs/arquivo/`** — documentos de julho (ativação, campanhas, testes). Históricos.

---

## 10. Pendências conhecidas (15/08/2026)

- Template de lembrete com botões: falta confirmar aprovação na Meta e apontar
  `WA_LEMBRETE_TEMPLATE_NAME` (testar com `#LEMBRETES TESTAR`).
- Rotacionar as URLs secretas do iCal (LGPD — pendente desde julho).
- Levantar carteirinhas perdidas pelo bug do agrupamento (05–15/08) p/ repescagem.
- 5 fichas de paciente duplicadas por grafia de telefone (decisão: não mesclar).
- `ad_clicks` ainda varre a tabela toda a cada 60 s (baixa prioridade).
- Ads: URLs antigas apontando para onrender.com/páginas inexistentes; conferir
  "Incluir em Conversões" da ação Agendamento IOBB.
- **Site mostra 2 das 3 esclerais** (22/08): a página `/escleral` no ar tem Zen RC e
  Esclera SG, mas **falta a ZenLens** (R$ 7.800 par / R$ 4.280 unidade). A Ana já
  informa as três corretamente. O Dr. Bruno optou por não refazer o zip agora —
  retomar quando for mexer no site de novo.
- Site: menores de 8 anos ("confirma com a equipe") contradiz a regra real (8+
  categórico) — corrigir na próxima edição.
- Instagram DM: código pronto no branch `feat/instagram-dm`, aguardando App Review da
  Meta + IG_ID/IG_TOKEN.
- Futuro desejado (não começar sem o Bruno pedir): prontuário eletrônico próprio
  integrado a Ana + agenda + painel.
