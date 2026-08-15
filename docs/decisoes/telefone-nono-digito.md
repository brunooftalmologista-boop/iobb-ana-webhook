---
name: telefone-nono-digito
description: O mesmo paciente chega com 12 e 13 dígitos (nono dígito) — como comparar telefone neste projeto sem errar
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-08-12T16:57:56.354Z
---

**A Meta entrega o `from` de celular brasileiro quase sempre SEM o 9 extra** (`556182981632`), enquanto a secretária digita COM ele (`5561982981632`). É o mesmo número e comparação de string falha — em silêncio.

**Medido no banco em 12/08/2026:** 253 agendamentos sem o 9, 60 com; **5 fichas de paciente duplicadas**. Por origem: a Ana grava quase sempre sem o 9 (207×21, porque copia o que a Meta manda); a secretária fica meio a meio (46×37).

**⚠️ `normalizePhoneBR` NÃO resolve isso** — ela cuida do DDI e do tamanho, não do nono dígito. Todo lugar que comparava com ela *parecia* protegido e não estava. É a armadilha principal deste assunto.

**As duas ferramentas certas** (commit `e1bc690`, ambas logo antes de `getOrCreatePatient`):
- **`fonesBR(tel)`** → as duas grafias. Para BUSCA no banco: `.in("paciente_telefone", fonesBR(x))`, nunca `.eq()`.
- **`foneChave(tel)`** → forma canônica (sempre **sem** o 9). Para COMPARAR dois telefones em memória.

**Corrigidos nessa varredura:** `agendamentosDoPaciente` (a Ana dizia não achar a consulta que a equipe tinha marcado — 14 pacientes com consulta futura estavam nesse estado), a trava anti-duplicata em `processarAgendarDaAna` (deixava marcar duas vezes), o anexo de carteirinha, e o fluxo de CONFIRMO/remarcar do lembrete. `getOrCreatePatient` já tinha proteção via `variantePhoneBR`.

**Brecha fechada de quebra:** `variantePhoneBR` punha o 9 em QUALQUER número de 8 dígitos, inclusive fixo — o `3303-6605` da clínica virava `9 3303-6605`, um celular plausível que pode ser de outra pessoa, e a busca acharia a ficha errada. Agora só quando começa com 6-9 (era celular antes da mudança); fixo começa com 2-5.

**PENDENTE (dados, não código):** unificar as 5 fichas duplicadas e padronizar o telefone dos agendamentos já gravados. Mexe em registro de paciente — só com confirmação do Dr. Bruno e mostrando antes exatamente o que muda. O conserto do código faz o sistema *funcionar* apesar da bagunça, mas não a limpa.

Ver [[ana-webhook-config-deps]] para as envs e [[ficha-obrigatoria-agendamento]] para as outras travas de agendamento.
