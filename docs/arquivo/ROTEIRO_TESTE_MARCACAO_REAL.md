# Roteiro de teste — Ana marcando de verdade (pós-sync iClinic)

Antes de começar:
- [ ] No **Render → Environment**, `ANA_MARCA_SOZINHA` **não** pode estar `0` (remova a variável ou ponha `1`). Salvar → serviço reinicia.
- [ ] Mandar as mensagens de um WhatsApp **que não seja** o número da clínica (usa teu celular pessoal).
- [ ] Ter o **painel aberto** (🗓️ Agenda) na unidade que for testar, pra ver o horário aparecer bloqueado (em vermelho = feito pela Ana).

> Dica: se não quiser "sujar" a agenda real, faça o teste e no fim **cancele o agendamento no painel** (o "x").

---

## Teste 1 — Marcação normal (o caminho feliz)
Envie, uma msg por vez:

1. `Oi, queria marcar uma consulta`
2. `Conjunto Nacional`  *(ou "Taguatinga")*
3. Ana deve **perguntar a data de nascimento**. Responda: `15/03/1990`
4. Ana deve **oferecer um horário real** (um de cada vez). Responda: `pode ser`
5. Ana pede nome/telefone/convênio se faltar. Responda com dados fictícios: `João Teste, particular`

**Esperado:**
- ✅ Ana **confirma o agendamento** ("agendado para dia X às Y") — NÃO diz "a equipe entra em contato".
- ✅ No **painel**, o horário aparece **bloqueado em vermelho** (tag "Ana"), com nome/telefone/nascimento nas observações.
- ✅ Chega a **notificação pra secretária** com os dados (inclui 🎂 nascimento).

Se ela disser "a equipe entrará em contato" nesse caminho normal → auto-marcação ainda está OFF (checar `ANA_MARCA_SOZINHA` no Render).

---

## Teste 2 — Trava de segurança: encaixe / horário anterior
Depois que a Ana oferecer um horário, responda:

- `Não tem nada mais cedo?` ou `Consegue um encaixe hoje?`

**Esperado:** Ana **não força**; responde algo como *"vou pedir pra equipe entrar em contato o mais breve possível"* (pré-agendamento como rede de segurança). Nada é marcado de forma errada.

---

## Teste 3 — Idade mínima (8 anos)
1. `Quero marcar para meu filho`
2. Ana pergunta nascimento. Responda uma data que dê **menos de 8 anos**, ex.: `10/01/2022`

**Esperado:** Ana informa educadamente que **só atende a partir dos 8 anos** e não agenda.

---

## Teste 4 — Não oferecer horário já ocupado no iClinic
1. Olhe no **iClinic** um horário **ocupado** de amanhã/depois (ex.: Conjunto 10:00).
2. Peça pra Ana marcar e veja os horários que ela oferece.

**Esperado:** aquele horário **não** aparece na oferta da Ana (o sync bloqueou). *(Se marcarem algo novo no iClinic agora, espere até 15 min pro sync pegar.)*

---

## Se algo der errado
- Ana não oferece horário nenhum → me avisa a **unidade** e o **dia**; eu checo as vagas no banco.
- Ana oferece horário que no iClinic está ocupado → me diz **qual** (unidade + dia + hora) que eu confiro o sync.
- Qualquer msg estranha → me manda o **print/transcrição** que eu ajusto o prompt.

Ao terminar os testes, **cancele no painel** os agendamentos fictícios que criou.
