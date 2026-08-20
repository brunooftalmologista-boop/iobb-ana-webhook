-- ENCAIXE — overbooking DELIBERADO da equipe (20/08/2026, ordem do Dr. Bruno)
-- JÁ APLICADA em produção via MCP em 20/08/2026. Fica versionada para histórico
-- e para reconstruir o banco do zero.
--
-- Contexto: o paciente Valdecy precisava das 17h de sexta (tinha outra consulta
-- em São Sebastião e o trânsito não dava tempo em horário posterior). A vaga
-- estava com outra paciente e NÃO havia mais nenhum horário — a decisão clínica
-- do Dr. Bruno foi encaixar. O índice appointments_slot_unico impedia gravar
-- isso: nem a equipe nem a Ana conseguiam registrar um encaixe.
--
-- O índice continua valendo para TODO agendamento normal (é ele que impede a Ana
-- de marcar em cima de alguém); passa a ignorar apenas as linhas marcadas
-- explicitamente como encaixe.
alter table appointments add column if not exists encaixe boolean not null default false;

drop index if exists appointments_slot_unico;
create unique index appointments_slot_unico
  on appointments (unidade, inicio)
  where status = any (array['reservado'::text, 'confirmado'::text])
    and encaixe is not true;

comment on column appointments.encaixe is
  'true = encaixe deliberado da equipe num horário já ocupado. Fica FORA do índice de slot único. A Ana NUNCA cria nem oferece encaixe — só a equipe.';
