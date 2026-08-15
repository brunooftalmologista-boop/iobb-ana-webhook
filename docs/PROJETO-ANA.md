# Projeto Ana — o documento-mestre

**Ana** é a secretária virtual do Instituto de Olhos Bruno Borges (IOBB), Brasília/DF.
Atende pacientes pelo WhatsApp da clínica, responde dúvidas, informa valores e **marca,
remarca e desmarca consultas de verdade** numa agenda própria.

Este documento é o ponto de partida para entender o projeto inteiro. Foi escrito para o
Dr. Bruno (dono do projeto, sem formação técnica) e para qualquer pessoa técnica que
venha a trabalhar nele. Quando algo aqui contradisser o código, **o código vale** — e
este documento deve ser corrigido.

> Última revisão completa: **15/08/2026**.

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
                     · error_log, api_custos, settings
       ▲
       │ (leitura)
  PAINEL (painel.html) — as secretárias acompanham e assumem conversas
  AGENDA (agenda.html) — visão da agenda para transferência ao prontuário
```

| peça | onde | acesso |
|---|---|---|
| Código | github.com/brunooftalmologista-boop/iobb-ana-webhook | conta GitHub do Bruno |
| Servidor | Render — serviço `iobb-ana-webhook` (deploy automático a cada push) | dashboard.render.com |
| Banco | Supabase — projeto `iobb-atendimento` (`pbnphvmzqdgnijxngosc`) | supabase.com/dashboard |
| WhatsApp | Meta Business — templates em WhatsApp Manager → Modelos de mensagem | business.facebook.com |
| IA | Anthropic — chave `iobb-ana-2` (console.anthropic.com → uso e fatura) | conta do Bruno |
| Google Ads | conta `451-429-2857` (MCC "IOBB Admin" `732-549-0192`) | bruno.oftalmologista@gmail.com |
| Site | iobb.com.br — **Cloudflare Pages**, HTML estático. NÃO há fonte "original": o deploy é um zip com os arquivos na raiz (ver docs/DOMINIO-IOBB.md) | Cloudflare do Bruno |
| Painel | https://iobb-ana-webhook.onrender.com/painel (login individual por secretária) | senhas via env no Render |

**Verificar o que está no ar:** `https://iobb-ana-webhook.onrender.com/version` mostra o
commit, há quanto tempo o processo roda e o estado das principais configurações.

---

## 2. O fluxo de um atendimento

1. Paciente escreve no WhatsApp → Meta chama o webhook no Render.
2. **Agrupamento** (`ANA_DEBOUNCE_MS`, 20 s): a Ana espera o paciente terminar de digitar
   antes de responder — várias mensagens seguidas viram UMA resposta.
3. Casos que **não** gastam IA: confirmação de lembrete ("Confirmo" → texto fixo),
   cortesia pós-confirmação ("obrigada" → texto fixo), FAQ de endereço/horário,
   números mudos (espelho), conversa assumida por secretária (`status = human`).
4. Nos demais, o app monta o prompt (persona fixa + agenda de vagas + data/hora
   calculada) e chama a API da Anthropic.
5. A resposta passa pelas **travas** (seção 5). Se reprovada, é reescrita; se a
   reescrita mentir sobre a agenda, o código responde com uma vaga real.
6. Blocos técnicos invisíveis ao paciente executam ações:
   `[AGENDAR]` grava consulta · `[CANCELAR]` desmarca · `[PREAGENDAMENTO]` e
   `[RECADO]` notificam a equipe · `[CARTEIRINHA]` anexa convênio/número à ficha.
7. Tudo é espelhado para o WhatsApp do Bruno (e números extras em `WA_ESPELHO_EXTRA`).

**A agenda é nossa** (tabela `appointments` no Supabase), com trava anti-overbooking no
banco. Grade de 20 em 20 min; sem 13h00–13h40 (almoço), sem 12h40 e 17h40.

- **Conjunto Nacional** (Asa Norte): segundas, quartas e sextas — médico das 9h às 18h.
- **Taguatinga Shopping** (Águas Claras): terças e quintas — médico das 10h às 18h.
- Recepção abre 8h nas duas. Fim de semana não há atendimento.

---

## 3. Regras de negócio (decididas pelo Dr. Bruno — não deduzir, não flexibilizar)

As regras vivem no `SYSTEM_PROMPT` dentro do `index.js` (~96 mil caracteres). Resumo do
que NÃO está escrito em nenhum outro lugar:

**Agendamento**
- Ficha obrigatória para marcar: **nome completo + data de nascimento + particular ou
  convênio (qual)**. Unimed exige também o **número** da carteirinha. Sem isso a trava
  do código impede o `[AGENDAR]`.
- Um horário por vez na oferta (nunca "cardápio") — exceção: N pacientes = N horários.
- Idade mínima **8 anos, categórico**. Não encaminhar para fora.
- Mesmo dia: pode no particular e na maioria dos convênios. Exceções (não marcam para
  HOJE, só de amanhã em diante): Unimed (todas), Casec, Codevasf, Care Plus, Life
  Empresarial.
- Conferência de óculos / ajuste de armação / retirada de receita: **ordem de chegada,
  proibido ocupar vaga** — mesmo que o paciente peça horário.
- Teste de lente de contato avulso (sem consulta): só para quem já consultou no IOBB
  **ou** tem exame oftalmológico de até 3 meses (de qualquer serviço — trazer no dia).
  Sempre particular (R$ 120 gelatinosa / R$ 150 rígida ou escleral), só no Conjunto.

**Convênios**
- Lista completa de atendidos: no SYSTEM_PROMPT ("LISTA DE CONVÊNIOS ATENDIDOS").
- **Unimed por produto**: Central Nacional (= Unimed Nacional/CNU), Planalto,
  Intercâmbio e Seguros Unimed são atendidas; sub-plano no cartão (PME, Ideal etc.)
  não muda nada. **Unimed regional de outra cidade/estado (João Pessoa, Fortaleza,
  Amparo…) NÃO se marca direto** — recado para a equipe verificar intercâmbio.
- **Nunca atendidos:** Quality/Quallity/Qualyty e **SulAmérica** (nenhuma variação).
- Plan-Assiste = MPF/MPDFT/MPM/MPT (e MPU). Qualicorp é administradora → perguntar a
  operadora.
- A cirurgia refrativa é sempre particular. Cirurgia coberta por convênio: não citar o
  valor particular a quem tem o convênio.

**Valores (agosto/2026)**
- Consulta particular R$ 200 (na refrativa a avaliação já inclui os exames, inclusive
  Pentacam; nos demais temas, exames complementares são à parte).
- Refrativa: PRK/TransPRK R$ 5.990 · **LASIK R$ 7.800** · Femto-LASIK R$ 8.890.
- Crosslinking R$ 5.980/olho · Anel de Ferrara R$ 8.700/olho.
- Catarata: R$ 5.000/olho + lente (tabela de LIOs no prompt; monofocal esférica é a
  coberta por convênio).
- Lentes esclerais: Esclera SG R$ 7.800 par · ZenLens R$ 5.980 par.
- **Tudo parcela em até 5x no cartão SEM JUROS — inclusive as lentes.**
- A Ana nunca sugere forma de pagamento ("priorizamos PIX" é proibido).
- Não realizamos capsulotomia YAG. Vendemos lente de contato (a compra é na clínica).

**Site (iobb.com.br)** — os preços da página /refrativa devem bater com os da Ana.
O preço aparece em DOIS lugares lá: o FAQ e os cards "Quanto custa".

---

## 4. Operação — o que o Bruno consegue fazer sozinho

**Comandos por WhatsApp** (mandar do seu número para o da clínica):
- `#ANA ON` / `#ANA OFF` / `#ANA STATUS` — liga/desliga a Ana. Com OFF, leads de
  anúncio continuam atendidos (`ANA_SEMPRE_ATIVA_SOURCES`).
- `#LEMBRETES` — mostra quem recebe o lembrete da véspera (sem enviar) e QUAL template
  está em uso · `#LEMBRETES TESTAR` — manda o template só para você · `#LEMBRETES
  CONFIRMAR` — dispara agora.
- `#CUSTOS` — gasto da API somado do banco (`api_custos`).
- `#AUDITORIA` — auditoria das conversas do dia.
- `#ADS…` — relatórios e conversões do Google Ads.
- `#HUMANO <número>` (modo humano por conversa é feito pelo painel; número do
  espelho/teste: ver env `WA_NUMEROS_MUDOS`).

**Variáveis no Render** (Environment — mudam comportamento SEM deploy):
| variável | efeito | valor atual |
|---|---|---|
| `PAINEL_JANELA_HORAS` | lista do painel mostra só os últimos N h (pendências e busca não são afetadas) | 96 |
| `WA_ESPELHO_EXTRA` | números extras que recebem o espelho | 5561992997639 |
| `ANA_CACHE_TTL` | `5m` volta o cache do prompt para 5 min | (1h, padrão) |
| `ANA_DEBOUNCE_MS` | espera antes de responder | 20000 |
| `WA_LEMBRETE_TEMPLATE_NAME/LANG` | template do lembrete da véspera (o dos botões Confirmo/Remarcar/Desmarcar exige template aprovado na Meta) | conferir na Meta |
| `LEMBRETE_HORA` | hora do disparo do lembrete | 17 |
| `ANA_UNIDADE_PREFERIDA` | unidade sugerida quando o paciente não escolheu | — |

**Se algo quebrar:**
1. `curl -s https://iobb-ana-webhook.onrender.com/version` — o commit no ar é o esperado?
2. `#ANA OFF` para a Ana enquanto se investiga (equipe atende pelo painel).
3. Reverter é `git revert <commit>` + push (qualquer sessão do Claude faz).
4. Logs do banco: Supabase → Logs. Erros de comportamento: tabela `error_log`.

**Regra de ouro dos deploys:** cada push reinicia o Render e esfria o cache do prompt
(encarece as chamadas por ~1 h). Mudanças não urgentes sobem **fora do expediente**.

---

## 5. Como o sistema se defende (as travas)

A lição central do projeto: **regra escrita no prompt não basta** — o modelo erra sob
pressão. Toda regra crítica tem uma trava determinística no código, que REGENERA a
resposta (nunca remenda texto). Se a regeneração mentir sobre a agenda, o código
responde sozinho com uma vaga real. Principais:

- ficha incompleta → não deixa `[AGENDAR]` (insiste 2×, depois avisa a equipe);
- vários horários no texto (fora o caso de N pacientes);
- "hoje/amanhã" que contradiz o calendário ou a agenda real;
- unidade × dia trocados; exame na unidade errada; dia da semana errado (corrige);
- vaga mais cedo ignorada; preço sem oferta de horário; convênio não atendido;
- horário do `[AGENDAR]` fora da lista de vagas → não grava e oferece alternativa;
- anti-duplicata e anti-overbooking (índice único no banco).

Tudo que dispara fica registrado em `error_log` (coluna `etapa`). O `#AUDITORIA` e o
subagente `auditor-conversas` leem esses registros.

**Telefone brasileiro tem DUAS grafias** (com e sem o 9º dígito — a Meta entrega sem).
Qualquer comparação usa `fonesBR()` / `foneChave()`; nunca comparar string crua.

---

## 6. Custos (medidos, não estimados)

- **API da Ana** (Anthropic): ~US$ 0,034/mensagem em 14/08 → **~US$ 190/mês** no volume
  atual. Já foi projetado em US$ 261 no início de agosto. Cada linha da fatura é
  gravada por chamada na tabela `api_custos` (`#CUSTOS` soma).
- Otimizações ativas: cache do prompt com TTL 1 h · bloco estável da agenda cacheado ·
  histórico da conversa cacheado · agrupamento 20 s · confirmação/cortesia/FAQ sem IA ·
  reescritas reaproveitando cache.
- **Supabase**: egress caiu de ~2 GB/dia para ~60 MB/dia (assinatura barata antes da
  consulta cara + janela do painel + caches). Cota 5,5 GB/mês — agosto estourou por
  causa do período ANTES dos consertos; setembro projeta ~25% da cota.
- WhatsApp: conversas de serviço são gratuitas; templates (lembrete) têm custo por
  disparo. O espelho para números extras exige que o número escreva à clínica a cada
  24 h (regra da Meta) — o Bruno manda um "oi" diário do 99299.

---

## 7. Histórico e decisões — onde procurar o "porquê"

1. **`git log`** — 400+ commits com mensagens longas explicando cada mudança e o
   incidente que a motivou. É a fonte mais rica. Ex.: `git log --oneline --since=2026-08-10`.
2. **`docs/DECISOES.md`** — diário condensado das decisões de negócio e dos incidentes
   (cópia versionada das anotações de memória do Claude).
3. **`docs/DOMINIO-IOBB.md`** — tudo do site, landing pages e Cloudflare.
4. **`docs/arquivo/`** — documentos históricos de julho (ativação, campanhas, testes).
   Retratos da época; não descrevem o sistema atual.

**Convenção de testes:** toda mensagem de teste no WhatssApp começa com
`[TESTE - ignorar]`; pacientes sintéticos usam telefones `55619900…` e são ignorados
pelos lembretes/follow-up. Cancelar agendamentos de teste depois.

---

## 8. Pendências conhecidas (15/08/2026)

- Template de lembrete com botões: código pronto; falta confirmar aprovação na Meta e
  apontar `WA_LEMBRETE_TEMPLATE_NAME`.
- Rotacionar as URLs secretas do iCal (LGPD — pendente desde julho).
- 5 fichas de paciente duplicadas por grafia de telefone (decisão: não mesclar por ora).
- `ad_clicks` ainda varre a tabela toda a cada 60 s (segundo maior item do egress atual;
  baixa prioridade).
- Ads: URLs de anúncio antigas apontando para onrender.com / páginas inexistentes;
  conferir "Incluir em Conversões" da ação Agendamento IOBB.
- Site diz que menores de 8 anos podem "confirmar com a equipe"; a regra real é 8+
  categórico — corrigir na próxima edição do site.
