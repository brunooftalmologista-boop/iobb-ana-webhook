---
name: funil-pos-consulta-indicacoes
description: "Funil pós-consulta (02/09/2026): o que o Dr. Bruno indica na consulta vira registro, retomada automática da Ana e número de faturamento — o maior buraco do sistema, que terminava em 'o paciente compareceu'"
metadata:
  node_type: memory
  type: project
---

**O BURACO (medido no banco em 02/09/2026, dados de agosto).** O sistema inteiro
terminava em `compareceu = true`. O que acontecia DEPOIS — o Dr. Bruno indica uma
PRK de R$ 5.990, uma lente escleral de R$ 7.800, uma catarata — não existia em
lugar nenhum: a equipe passava o orçamento de boca, o paciente ia embora "pensar",
e ninguém mais sabia dele. Nenhuma linha no banco, nenhuma pergunta possível
("quantos fecharam?", "quem ficou de responder?").

**Por que é AQUI que está o dinheiro, e não em marcar mais consulta.** Números de
agosto/2026, do Supabase:

| medida | valor |
|---|---|
| Consultas realizadas | 336 (277 compareceram, 29 faltaram, 30 sem marcação) |
| Capacidade da grade | ~454 vagas → ocupação de ~74% |
| Cancelamentos | 165, sendo 79 em menos de 24h — 40 dessas vagas nunca reocupadas |
| Agendamentos por origem | Ana 294 · secretária 229 |
| Conversas de tema caro (jul+ago) | refrativa 24 · catarata 18 · ceratocone 36 · escleral 39 = **117** |
| Dessas, quantas agendaram | **25** |

Ou seja: 92 pessoas perguntaram por procedimento de R$ 5.000 a R$ 13.000 em dois
meses e nunca sentaram na cadeira. E consulta é R$ 200 — **uma cirurgia a mais por
mês vale mais que todas as vagas que ainda sobram na semana**. Encher a agenda de
consulta é o problema que a Ana já resolveu; o que faltava era não perder de vista
quem já ouviu do médico que é candidato.

**O QUE FOI CONSTRUÍDO (commit deste branch).**

1. **`sql/indicacoes.sql`** — tabela `indicacoes`: uma linha por procedimento
   indicado, com valor esperado, situação (aberta · pausada · retornou · fechada ·
   recusada · perdida) e a cadência (toques, último, próximo). RLS ligado e sem
   policies, como `evolucoes` e `reengajamento`. **Rodar à mão no SQL Editor.**
   Enquanto não rodar, tudo degrada em silêncio (42P01 tratado em todo caminho):
   a tela some, os comandos avisam, a rotina não faz nada.
2. **Registro em dois cliques** — na agenda, no modal do agendamento, logo abaixo
   do comparecimento. É o único momento em que alguém sabe o que foi indicado:
   quem marca "Compareceu" acabou de ver o paciente sair da sala. Também dá para
   registrar pelo WhatsApp saindo da sala: `#INDICACAO 61984060001 PRK`.
3. **Retomada automática** — cadência de 2, 7, 21 e 45 dias corridos contados da
   indicação (env `INDICACAO_CADENCIA_DIAS`). Dentro da janela de 24h da Meta vai
   texto livre; fora dela, template (`#INDICACOES CRIAR`).
4. **A Ana passa a saber** — quando o paciente responde, o prompt recebe o que foi
   indicado e a data. Ela deixa de tratá-lo como paciente novo.
5. **O funil como número** — `#INDICACOES` e a tela mostram quantos estão parados e
   quanto isso representa. É o que permite responder, em três meses, se valeu.

**AS TRAVAS (a lição do projeto: regra escrita no prompt não basta).**
- Rotina **INERTE** até `settings.indicacoes_followup_enabled='true'` (`#INDICACOES
  LIGAR`). Mesmo padrão do `followup_leads_enabled` e do META_APP_SECRET.
- Nunca cutuca: quem escreveu nas últimas 24h (a Ana já está com ele), quem está em
  modo humano, quem tem consulta futura, quem se descadastrou, quem recebeu a
  campanha de reengajamento há pouco.
- Só dia útil, entre 9h e 17h.
- `proximo_toque_em` fica **no banco** — reiniciar o Render não redispara nada.
- Quem marca consulta depois da indicação vira `retornou` sozinho: a conversa
  voltou a ser presencial.
- "Agora não" → `pausada`, não `recusada`. **Pedido de tempo não é recusa** — foi o
  caso do Carlos (01/09), que pediu contato em novembro e recebeu cutucada três
  horas depois porque o filtro olhava só a última mensagem.

**CATARATA: UMA LINHA POR LIO, E O CONVÊNIO SEPARADO (Dr. Bruno, 03/09/2026).**
As duas primeiras correções que ele fez ao desenho, e as duas eram de dinheiro:

1. Eu tinha gravado catarata como **um item só, R$ 5.000** — o procedimento, sem a
   lente. Mas a LIO vai de R$ 1.800 (monofocal) a R$ 13.200 (trifocal tórica): uma
   catarata que vale R$ 18.200 apareceria no funil como R$ 5.000. Agora a lista tem
   **uma opção por LIO**, cada uma com o total POR OLHO já somado, mais um
   "LIO a definir" (R$ 5.000) para quando a lente ainda não foi escolhida.
2. **Boa parte dos planos cobre catarata.** A indicação passou a gravar o
   `convenio`, copiado do agendamento. Em paciente de convênio o valor nasce
   **vazio** — a cobertura é caso a caso e a equipe é quem sabe o que sobra para o
   paciente. O funil soma só o que o paciente paga e mostra à parte quantos casos
   de plano estão sem valor, em vez de inventar um total grande e falso.
   Refrativa segue sendo a exceção conhecida: sempre particular.

**DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO.**

- **O valor da indicação NÃO vai para o prompt da Ana.** É estimativa de funil (a
  lente é por par ou por unidade; a catarata pode estar sem LIO definida) e ela
  repetiria o número ao paciente como se fosse o preço final. A tabela de preços
  certa, com as ressalvas, já está no SYSTEM_PROMPT — é de lá que ela fala de
  dinheiro. E quando a indicação é de um paciente de CONVÊNIO, o prompt recebe uma
  linha extra proibindo citar valor particular: a regra da clínica já dizia isso, e
  aqui ela precisava valer também para a conversa que a máquina começou.
- **A Ana NÃO marca cirurgia.** A agenda dela é de consulta; cirurgia depende de
  centro cirúrgico, exames e data do médico. Quando o paciente decide fechar, ela
  emite `[RECADO]` para a equipe ligar. Deixá-la "marcar" viraria promessa de
  horário que não existe — o erro mais caro que este projeto já teve.

**LIMITE ÉTICO (CFM), escrito no prompt e no texto do toque.** A mensagem diz um
fato ("na sua consulta o Dr. Bruno indicou X") e se coloca à disposição. É proibido:
promessa de resultado, urgência inventada, "última chance", desconto. E a Ana não
avalia, não confirma e não revê indicação — dúvida clínica vai para o médico.

**COMO ATIVAR (ordem certa).**
1. Rodar `sql/indicacoes.sql` no SQL Editor do Supabase.
2. `#INDICACOES CRIAR` → cria o template na Meta (aprovação: minutos a horas).
3. `#INDICACOES TESTE` → ver no próprio número o que o paciente recebe.
4. Registrar as primeiras pela agenda (ou `#INDICACAO`) por alguns dias, com a
   rotina ainda desligada — o registro sozinho já vale, e dá para conferir a lista.
5. `#INDICACOES LIGAR` quando o texto estiver do jeito que o Dr. Bruno quer.

**O QUE MEDIR EM 90 DIAS:** `fechada` ÷ (`fechada` + `recusada` + `perdida`), e o
valor fechado. Sem alguém marcar "Fechou" na tela, o funil vira ficção — esse é o
ponto frágil do desenho, e é humano, não técnico.

[[prontuario-eletronico-futuro]] [[ana-postura-consultiva]] [[followup-leads-conversao]]
