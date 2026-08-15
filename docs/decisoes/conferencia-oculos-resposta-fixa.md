---
name: conferencia-oculos-resposta-fixa
description: "Conferência de óculos virou resposta FIXA sem IA (15/08/2026) — e o ponto cego das travas: elas só pegam erro quando há HORÁRIO citado"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-15T21:57:42.420Z
---

**15/08/2026** — paciente pediu conferência de óculos e a Ana se contradisse na MESMA mensagem: disse que o Conjunto Nacional atende seg/qua/sex e duas linhas depois ofereceu "terça-feira, 18/08" (dia de Taguatinga), pulando a segunda 17/08 e **sem citar Taguatinga em lugar nenhum** (o Bruno notou a omissão). A data em si estava certa — 18/08 É terça; o erro foi a UNIDADE do dia.

**PONTO CEGO REAL DAS TRAVAS:** `contradizHojeAmanha()` e `unidadeContradizOferta()` só disparam quando há **HORÁRIO** citado no texto (16h40, 10h20…), porque partem da lista de vagas. Conferência de óculos é **ordem de chegada** — só se fala em DIA. Nenhuma trava olhava para "dia sem horário". Vale checar se outros fluxos sem horário (retirada de receita, ajuste de armação, "posso passar aí?") têm o mesmo buraco.

**Solução (commit `740c4de`), sugerida pelo próprio Bruno:** *"Deveria ser mensagem pronta para quem pergunta por conferência de óculos, economiza até no API"*. Virou resposta FIXA sem IA, junto do FAQ de endereço/horário:
- `ehConferenciaOculos(texto)` — conservador: convênio, valor, sintoma, exame, cirurgia, criança na mensagem → devolve false e a IA conduz. **Pedir horário NÃO desqualifica** (explicar que não há hora marcada é a resposta certa). 18/18 nos testes.
- `textoConferenciaOculos(agora)` — as DUAS unidades, hora do MÉDICO de cada (9h CN / 10h TG) e o próximo dia de cada, calculado por `proximoDiaDaUnidade()` (usa `unidadeDoDia`, nunca deduz). Hoje só conta antes das 17h — sexta 18h devolve segunda, não "hoje".
- Mantém a guarda do FAQ: se a última fala da Ana terminou em "?", há fluxo em andamento e a IA conduz.

**Why:** resposta que nunca muda não precisa de IA — sai de graça, na hora, e não tem como errar dia nem esquecer unidade. Mesmo raciocínio da confirmação de lembrete, da cortesia e do FAQ de endereço.

**How to apply:** quando um fluxo tiver resposta sempre igual E for campeão de erro, o conserto certo é tirá-lo da IA, não escrever mais uma regra no prompt. Relacionado: [[ficha-obrigatoria-agendamento]] (travar primeiro), [[agenda-horizonte-e-data]], [[custo-api-ana]], [[documento-mestre-projeto]].
