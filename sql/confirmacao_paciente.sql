-- Confirmação de presença dada pelo PACIENTE em resposta ao lembrete da véspera.
-- Rode no SQL Editor do Supabase uma vez. (Já aplicado em pbnphvmzqdgnijxngosc.)
--
-- Por que uma coluna nova em vez de reaproveitar appointments.status: ali
-- 'confirmado' quer dizer "o horário está reservado" e é o que alimenta o índice
-- único anti-overbooking. Se a resposta do paciente escrevesse nesse campo, os
-- dois sentidos se misturariam e a trava da agenda deixaria de significar o que
-- significa. São coisas diferentes: um é o estado da vaga, o outro é o paciente
-- dizendo que vem.
--
-- ⚠️ CORREÇÃO 03/08/2026: a primeira versão deste arquivo criava a coluna
-- `confirmado_paciente_em`, mas o código (index.js) e o painel (agenda.html)
-- sempre leram `confirmado_em`. A coluna órfã ficou vazia em 295 de 295
-- agendamentos — migração morta, sem efeito nenhum. O nome correto, e único, é
-- `confirmado_em`. Achado pela auditoria de conversas.

alter table appointments
  add column if not exists confirmado_em timestamptz;

comment on column public.appointments.confirmado_em is
  'Momento em que o PACIENTE confirmou presença respondendo ao lembrete da véspera. Null = sem confirmação.';

-- Consulta típica: "quem tem consulta amanhã e ainda não confirmou" — que é
-- exatamente a lista de para quem ainda vale ligar.
create index if not exists appointments_confirmado_idx
  on appointments (inicio)
  where confirmado_em is null;

-- Remove a coluna que nunca foi usada (segura: sempre esteve vazia).
alter table appointments drop column if exists confirmado_paciente_em;
