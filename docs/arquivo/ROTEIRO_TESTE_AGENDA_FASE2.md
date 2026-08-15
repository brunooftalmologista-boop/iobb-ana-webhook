# Roteiro de teste — Fase 2 (a Ana marca sozinha)

Guia para o **dia do go-live**. Mande as mensagens pela conversa de WhatsApp com a
Ana (de um número de teste, não de um paciente real) e confira cada item.

---

## ✅ Antes de começar (pré-requisitos)

- [ ] `sql/agenda.sql` rodado no Supabase (tabela `appointments` existe)
- [ ] Deploy da branch `feat/agenda-propria` no Render concluído
- [ ] **Data de corte com o iClinic resolvida** — a agenda tem horários realmente livres, e os compromissos já existentes do iClinic foram bloqueados (senão a Ana oferece horário já ocupado no iClinic)
- [ ] Painel aberto no ícone **🗓️** para ver os agendamentos aparecendo
- [ ] Avise a equipe que os próximos contatos daquele número são **teste**
- [ ] Dica: teste fora do horário de pico

> Se quiser ver o que a Ana está enxergando de vagas antes de testar, abra
> `GET /api/diag/agenda` (pelo painel logado) — mostra as vagas dos próximos dias.

---

## Teste 1 — Agendamento feliz (o principal)

Mande **uma mensagem por vez**, esperando a Ana responder:

1. `Oi, gostaria de marcar uma consulta`
2. *(Ana pergunta unidade/convênio)* → `Particular, no Conjunto Nacional`
3. *(Ana deve OFERECER UM horário: "Tenho [dia] às [hora]… pode ser?")*
4. `Pode sim`
5. *(Ana confirma: "Agendado para… ✅")*

**Conferir:**
- [ ] A Ana ofereceu **um horário real** (bate com a agenda), não inventado
- [ ] Ofereceu **um por vez** (não despejou uma lista)
- [ ] Depois do "pode sim", **confirmou**
- [ ] **Nenhum** texto técnico tipo `[AGENDAR]` ou `[inicio:…]` apareceu na conversa
- [ ] No painel 🗓️, o horário aparece **ocupado**, com **"via Ana"**
- [ ] Clicando no agendamento: nome, telefone, convênio e motivo (**Consulta**) certos

---

## Teste 2 — Recusar e pedir outro

1. Comece a marcar (como no Teste 1) até a Ana oferecer um horário
2. `Esse não dá, tem outro?`
   - [ ] Ana oferece o **próximo** horário livre (não repete o mesmo, não inventa)
3. `Prefiro de manhã`
   - [ ] Ana oferece um horário **da manhã** que esteja livre

---

## Teste 3 — Águas Claras / unidade

1. `Vocês atendem em Águas Claras?`
   - [ ] Ana confirma que **sim** (Taguatinga Shopping)
2. `Queria marcar lá`
   - [ ] Ana oferece horário de **terça ou quinta** (dias do Taguatinga)

---

## Teste 4 — Motivo específico (Retorno / Cirurgia)

1. `Quero marcar meu retorno`
   - [ ] No painel, o motivo do agendamento aparece **"Retorno"** (não "Consulta")
2. *(outra conversa)* `Quero fazer a avaliação para a cirurgia de catarata`
   - [ ] Motivo aparece **"Avaliação de cirurgia"**
   - [ ] A Ana **NÃO** perguntou "qual exame?" nem listou exames

---

## Teste 5 — Convênio

1. `Vocês atendem Bradesco Saúde?` → Ana confirma; marque normalmente
   - [ ] No painel, convênio aparece **"Bradesco Saúde"**
2. `Tenho Unimed`
   - [ ] Ana pede a carteirinha, **mas NÃO trava** o agendamento (segue e marca)

---

## Teste 6 — Sem vaga (fallback)

Difícil forçar de propósito, mas se pedir uma unidade/período **sem vaga**:
- [ ] A Ana **NÃO inventa** horário
- [ ] Ela cai no **pré-agendamento** ("a equipe confirma o horário exato") em vez de marcar

---

## Teste 7 — Veio de anúncio → conversão (opcional)

Se iniciar a conversa por um link de anúncio (`/lp/…` com `[ref:…]`):
- [ ] Ao concluir o agendamento, a conversão é marcada (aparece no relatório de Ads 📊)

---

## 🚩 O que NUNCA deve acontecer (bandeiras vermelhas)

- Ana mostrar `[AGENDAR]`, `[PREAGENDAMENTO]` ou `[inicio:…]` ao paciente
- Ana **inventar** um horário que não existe na agenda
- **Dois pacientes no mesmo horário/unidade** (overbooking)
- Ana dizer **"não tenho acesso à agenda"**

---

## Se algo der errado

- Me manda o **print da conversa** + o horário/unidade envolvidos
- Nos logs do Render, procure por `[Agendar]` e `[Espelho] Detecção…` — mostram se a
  Ana emitiu o bloco e se o agendamento gravou
- `GET /api/diag/agenda` mostra as vagas que a Ana está enxergando
