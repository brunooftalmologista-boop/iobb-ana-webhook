---
name: custo-api-ana
description: "Onde vai o dinheiro da API da Ana (medido em 05/08/2026), o que já foi otimizado e o que foi recusado por risco"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-13T22:44:10.012Z
---

Análise feita em **05/08/2026** com dado real (CSV do console da Anthropic, 01–05/08). Modelo: claude-sonnet-4-6.

**A conta:** US$ 31 em 5 dias → projeção de **US$ 261/mês (~R$ 1.410)**. Por conversa **~R$ 2,35**; por agendamento, amortizado sobre as ~11 conversas que não fecham, **~R$ 26** — contra R$ 89/agendamento dos anúncios em julho. É barato, e essa comparação é o que importa quando surgir a pergunta de novo.

**Onde o dinheiro está** (e é o oposto do que os tokens sugerem):

| | % dos tokens | % do custo |
|---|---:|---:|
| Entrada SEM cache (a lista de vagas) | 25% | **55%** |
| Gravação de cache | 10% | 27% |
| Leitura de cache | 65% | 15% |
| As respostas da Ana | 0,3% | **3%** |

Duas conclusões que evitam trabalho errado:

- **O que a Ana escreve é irrelevante no custo (3%).** Enxugar a prosa dela não economiza nada. O que custa é *quantas vezes* ela responde — cada chamada são ~29 mil tokens fixos (persona + agenda), independente do tamanho da resposta.
- ~~**O cache já roda com 87% de aproveitamento. NÃO mexer no TTL**~~ — **ERRADO a partir de 12/08, ver a seção do TTL abaixo.** A conclusão valia enquanto gravação de cache era 27% da conta; quando virou 70%, se inverteu.

**Feito em 05/08:** agrupamento de mensagens (`ANA_DEBOUNCE_MS`, 12s) — a Ana espera o paciente terminar de escrever em vez de responder cada fragmento. Era o maior corte (R$ 290–580/mês) e o único que também melhora o atendimento. Ver [[agenda-horizonte-e-data]] para o contexto do dia.

**Pendente, risco baixo:** compactar a lista de vagas agrupando por dia mas **mantendo o carimbo ISO** por linha (~R$ 157/mês, parser do `[AGENDAR]` intocado) e cachear o bloco da agenda (~R$ 200/mês, é o 2º marcador de cache — cabem 4, usamos 1).

**Recusado, e por quê:**

- **Encurtar o horizonte da agenda de 14 para 7 dias** (~R$ 210/mês): 7 dias corridos são 5 dias úteis, e o incidente de 04/08 aconteceu com um corte em *8*. R$ 210/mês é uma consulta e meia — dois pacientes perdidos no mês já viram prejuízo.
- **Trocar o ISO por referência curta** (+R$ 119/mês): mexe no parser que grava consulta de verdade. Errar ali não custa token, custa paciente na hora errada.

**Como verificar deploy:** `GET /version` devolve o commit no ar (`RENDER_GIT_COMMIT`). Existe porque eu já anunciei "deploy pronto" checando `/agenda == 200`, que respondia pelo processo **antigo**.

---

## TTL do cache — a conclusão de 05/08 se inverteu (12/08/2026)

Fatura real de 01–12/08 cruzada com o volume de mensagens do banco:

| | 01–04/08 | 05–12/08 |
|---|---|---|
| custo por mensagem de paciente | US$ 0,0492 | US$ 0,0516 (**+4,9%**) |
| entrada SEM cache | 55,4% | **15,5%** |
| **gravação de cache** | 26,8% | **69,7%** |

**O conserto de 05/08 funcionou** (entrada sem cache caiu de 55% para 15%), **mas a conta subiu**, porque gravação de cache virou o dominante. Prompt de ~27.500 tokens × US$ 3,75/M = **US$ 0,10 por gravação**, e o cache estava **frio em 41–55% das chamadas** — o TTL de 5 min expira entre um paciente e outro, e todo deploy esfria tudo. Custo/dia subiu de 0,041 para 0,060 por mensagem entre 03 e 12/08, acompanhando meus dias de edição.

**Tentativa (commit `f6af7f1`): TTL de 1 hora — ⚠️ NÃO SE PAGOU no 1º dia.** Eu estimei ~70 gravações/dia caindo para ~15 e economia de US$ 120–160/mês. **Medido em 13/08: as gravações caíram 48% (2.274.117 → 1.184.389 tokens), não 80%; e como o preço unitário dobra, o custo da gravação caiu só 25% (US$ 9,46 → 7,11). Por mensagem ficou 12,5% MAIS CARO: US$ 0,0508 (12/08, 5 min) → US$ 0,0571 (13/08, 1h).**
**Por que a estimativa errou:** são **dois** blocos cacheados, não um — a persona (~27.500 tokens, estável) e a lista de vagas (~5.400 tokens, que muda a cada conversa). O segundo é regravado de qualquer forma, então o TTL não o alcança. Dividir o gasto de gravação por "27.500 tokens" para contar gravações foi errado desde o começo.
**Preços validados** contra a fatura em dólar de 11/08 (calculado = cobrado, US$ 12,94): sem cache 3,00 · gravação 5m 3,75 · gravação 1h 6,00 · leitura 0,30 · saída 15,00 (US$/M tokens).
**Em aberto:** 2º dia de medição em 14/08 (13/08 teve movimento 32% menor, base fraca). Critério combinado: se US$/msg ficar acima de ~0,051, reverter com `ANA_CACHE_TTL=5m` no Render. `ANA_CACHE_TTL=5m` reverte sem deploy. Degradação em 2 degraus no 400: cai para 5 min **antes** de cair para "sem cache" (perder o caching inteiro multiplica a chamada por ~10).

**Why (a lição, que é maior que o TTL):** eu defendi "não mexer no TTL" por uma semana com um cálculo que tinha deixado de valer no dia em que o outro conserto mudou a composição da conta. **Recomendação de otimização tem prazo de validade — remedir a composição depois de cada mudança, não só o total.**

**Revisão do prompt — medida em 12/08, e NÃO recomendada por ora:** gordura de texto é só ~2% (frases repetidas 485 chars, narrativas de incidente 978, justificativas 292). O peso real são **26,7% de seções de assunto específico** (catarata, ceratocone, lentes, refrativa, exames) pagas em toda mensagem, e **9,8% de exemplos de fala** — estes NÃO cortar, é o que muda comportamento (ver [[ana-resposta-modelo-horarios]]; regra abstrata sozinha não funcionou). Carregar as seções por assunto economizaria ~27% do prompt, mas se a detecção falhar a Ana responde catarata sem as regras de catarata — improvisa em vez de admitir. Só reabrir se a fatura pós-TTL não cair.

---

## Egress do Supabase (10/08/2026) — e uma otimização que quebrou o painel

O Supabase avisou que a cota de **egress de 5,5 GB** estourou, carência até **08/09/2026**. O banco tem ~6 MB: **não é volume, é repetição**. Medido nos logs da API (`get_logs`, serviço `api` — todas as chamadas vêm com user-agent `node`, ou seja, passam pelo app no Render, não direto do navegador):

- `/api/conversations` é chamado pelo painel **a cada 5s** e fazia `select=*,patients(...)` **sem limite** (826 conversas) + varredura da tabela `ad_clicks` inteira (1.218 linhas). ~330 KB por poll, ~1,8 GB por dia de expediente com UM painel aberto. **É a causa principal.**
- A Ana lia a agenda **duas vezes por turno** de agendamento (montar a lista + validar antes de gravar). **Já corrigido** por cache de 10s em `fetchSlotsDB` (commit `33225ae`), invalidado em toda gravação e cancelamento — esse continua no ar e funcionando.

**⚠️ MEDIDO EM 11/08: só METADE foi resolvida.** Nos logs da API, `ad_clicks` caiu mesmo para 1 chamada/minuto (o cache pegou), mas `/api/conversations` continua com `select=*` sem limite a cada 5s: **878 conversas = 362 KB por chamada = ~2,0 GB/dia com UM painel aberto** — três dias de painel estouram a cota mensal de 5,5 GB sozinhos. O peso está em `last_message` (118 KB do total); cortar colunas salva ~17%, não resolve.

**Conserto no ar em 11/08 (commit `362eb2e`) e ✅ VERIFICADO em 12/08 com o painel aberto:** numa janela de 64s houve **19 chamadas da assinatura e ZERO da consulta cara** (antes eram ~12/min dela). De ~2,0 GB/dia para a casa de 70 MB/dia. Antes de refazer a consulta cara, o servidor pede uma **assinatura barata** da tabela (total de linhas + `updated_at` mais recente, ~40 bytes) e, se nada mudou, devolve a última resposta guardada em memória. Mensagem nova faz PATCH em `conversations.updated_at` → assinatura muda → painel recebe no mesmo tempo de sempre. Assumir/liberar/encerrar **não** tocam em `updated_at` (a tabela não tem trigger), então um middleware derruba o cache em qualquer request não-GET sob `/api`. TTL de 60s como rede de segurança. Só resultado bom vai ao cache (falha não congela lista vazia). **É só servidor — o painel não mudou uma linha.** Lógica testada com stub antes de subir (8/8).
**O consumidor seguinte, corrigido em 12/08 (commit `0e7c5d1`… ver `git log`):** com um chat aberto, `/api/conversations/:id/messages` baixava TODAS as mensagens da conversa a cada 3s, sem limite — 6,5 KB numa conversa de 15 mensagens (59 MB/dia), 37 KB na mais longa do banco, de 84 (344 MB/dia). Pior: **cresce sozinho**, porque conversa de paciente só aumenta. Mesmo desenho (assinatura = nº de mensagens + timestamp da última), com uma diferença importante: a assinatura **não** enxerga mudança que não mexe na timestamp, em especial a marcação de **falha de entrega** — que é justamente o que a secretária precisa ver. Por isso há invalidação explícita em `saveMessage` e no retorno de status da Meta, além do middleware que limpa tudo em qualquer POST do painel. O `team_flag` ficou **fora** do cache de propósito (é o efeito colateral que o painel espera de toda abertura).

**Padrão que funciona para egress neste projeto:** assinatura barata antes da consulta cara + invalidação explícita nos pontos de escrita + TTL só como rede de segurança + **só servidor, nunca mexer no painel junto**. E testar a lógica com stub antes de subir — as duas vezes que isso foi feito o resultado bateu com a produção; a vez que não foi (10/08) derrubou a lista da equipe.

**Correção abaixo (parcial), 10/08 à noite (commit `94bfec8`):** o mapa de origem de anúncio passou a ficar **em memória por 60s**. O painel pede a lista a cada 5s, então são 12 varreduras por minuto trocadas por UMA — corte de ~92% na consulta que era metade do egress, com a resposta ao painel idêntica. Confirmado por ele: lista inteira e conversas de anúncio marcadas.

**Duas tentativas erradas antes de acertar, e as duas lições:**

1. **`.in()` com os 826 ids voltava 400 em 100% das chamadas** — a URL estoura o limite do PostgREST. O `try/catch` engolia o erro: o painel abria, a lista estava completa, e as marcações de anúncio sumiam **em silêncio**. Eu perguntei "a lista está inteira?", ele confirmou, e eu quase dei por encerrado. **Verificar que a tela abre não é verificar que funciona — olhar o STATUS das chamadas nos logs (`get_logs`, serviço `api`) é obrigatório quando existe catch.**
2. A tentativa anterior (abaixo) quebrou a tela por mexer no front-end junto.

**⚠️ A primeira correção do painel foi REVERTIDA (`a056217`).** Eu tinha posto teto de 200 linhas no endpoint e feito o `painel.html` mandar `?since=` mesclando por id. A lista de conversas da equipe **colapsou para 1 conversa** e as secretárias ficaram sem trabalhar. Revertido servidor + painel juntos.

**Why (a lição de processo):** mudei o painel E o endpoint no mesmo commit e não testei **com o painel aberto** — testei que compilava e que o endpoint devolvia 401 sem login, o que não prova nada sobre a tela. Todas as outras correções daquele dia foram testadas contra mensagem real; essa não, e subiu assim mesmo.

**How to apply na próxima tentativa:** refazer **só no servidor**, mantendo a resposta byte-compatível com o que o painel espera hoje (nada de `since`, nada de teto que reduza a lista visível). O ganho é menor, mas não tem como quebrar a tela. Se um dia mexer no painel, testar com ele aberto antes de considerar pronto. Hipótese não confirmada do colapso para 1: se a primeira carga falha e a seguinte já vem filtrada por `since`, a mesclagem parte de um array vazio.
