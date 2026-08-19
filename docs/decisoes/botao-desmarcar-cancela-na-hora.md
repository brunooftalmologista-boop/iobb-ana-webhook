---
name: botao-desmarcar-cancela-na-hora
description: "Botão Desmarcar do lembrete cancela na hora, sem pedir confirmação (18/08/2026) — segurar vaga custa mais que cancelamento indevido"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-18T13:02:04.181Z
---

**Decisão do Dr. Bruno (18/08/2026, commit `1fb9374`):** o toque no botão **Desmarcar** do lembrete da véspera **cancela imediatamente**, libera a vaga e responde com texto fixo ("quando quiser remarcar, é só me chamar") — sem IA e **sem perguntar "confirma?"**.

**Why (a razão dele, confirmada por dados no mesmo dia):** pedir confirmação parecia proteger contra toque acidental, mas fazia o oposto — muita gente toca e não responde à pergunta, e aí *"o horário fica preso"*. Ninguém percebe até a cadeira ficar vazia. **Segurar vaga custa mais que cancelamento indevido**, que o paciente desfaz mandando uma mensagem.

**A prova, na primeira rodada com botões (13 lembretes → 13 toques, 11 Confirmo + 2 Desmarcar):**
- **Meyre** tocou às 09h34, a Ana perguntou "confirma?", ela **nunca respondeu**; alguém cancelou na mão e às **09h56 a Paola marcou exatamente aquele 11h40** pela Ana. **22 minutos** entre abrir e reocupar — a vaga tinha demanda represada.
- **Maria da Cruz**: a pergunta gerou confusão e a vaga do 17h00 ficou presa mesmo assim (ver abaixo).

**Exceção mantida:** 2+ consultas no MESMO telefone e MESMO dia (família) — o toque não diz de quem é, então a Ana pergunta **QUAL** (não mais "tem certeza?": a intenção já está dada). **Texto livre também cancela na hora desde 18/08 (commit `60b086a`)**: `cancelamentoExplicito()` + `cancelarPorTextoLivre()`, com as mesmas guardas (frase inequívoca ≤120 chars; pergunta/condicional/remarcação ficam com a Ana; só `origem='ana'`; só quando há exatamente UMA consulta ativa; só em modo bot). Motivo: a paciente Iara escreveu "Cancela, por favor" e a vaga ficou presa 24 h — o lembrete da véspera chegou a sair no dia seguinte para a consulta que ela pedira para cancelar. Rótulos em `BOTOES_LEMBRETE = ["Confirmo","Desmarcar","Remarcar"]`; template `lembrete_consulta_botoes` (settings `lembrete_template`), no ar desde 16/08.

**🐛 BUG SEPARADO DESCOBERTO NO MESMO CASO (pendente):** a Ana disse à paciente *"Os dois horários de amanhã estão cancelados"* e emitiu `[CANCELAR]` de **apenas um** — a consulta da Maria da Cruz (18/08 17h00, Taguatinga) seguiu `confirmado` com a paciente já avisada de que não viria. **Falta uma trava**: se a resposta AFIRMA cancelamento, o código deve conferir se o `[CANCELAR]` correspondente saiu para cada consulta citada — do mesmo tipo das travas de horário, mas para ação executada × ação prometida.

**How to apply:** o caminho fica em `registrarRespostaAoLembrete(conv, patient, from, texto, intencaoBotao)`; `intencaoBotao` vem do webhook (`msg.type === "button"`). Relacionado: [[painel-envio-secretaria-24h]], [[ficha-obrigatoria-agendamento]], [[conferencia-oculos-resposta-fixa]] (mesmo princípio: resposta que nunca muda sai da IA), [[documento-mestre-projeto]].
