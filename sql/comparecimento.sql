-- Comparecimento do paciente à consulta. Rode no SQL Editor do Supabase uma vez.
--
-- Por que NÃO reaproveitar appointments.status: ali 'confirmado' significa "a
-- vaga está reservada" e é o que alimenta o índice único anti-overbooking.
-- Presença é outra dimensão — o paciente veio ou não veio. Misturar as duas
-- quebraria a trava da agenda.
--
-- compareceu:  true = veio | false = faltou | null = ainda não marcado
--
-- Esta é a métrica que responde "o lembrete da véspera reduziu a falta?". Para
-- existir comparação, vale a recepção começar a marcar ANTES de o lembrete
-- entrar no ar — sem um "antes", o "depois" não prova nada.
--
-- O código funciona sem esta migração: o painel detecta a ausência das colunas,
-- avisa no log e segue mostrando a agenda, só sem a marcação de presença.

alter table appointments
  add column if not exists compareceu boolean;
alter table appointments
  add column if not exists compareceu_em timestamptz;
alter table appointments
  add column if not exists compareceu_por text;   -- e-mail de quem marcou (auditoria/LGPD)

-- Consulta típica da recepção: "consultas que já passaram e ninguém marcou".
create index if not exists appointments_comparecimento_idx
  on appointments (inicio)
  where compareceu is null;
