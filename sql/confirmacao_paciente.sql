-- Confirmação de presença dada pelo PACIENTE em resposta ao lembrete da véspera.
-- Rode no SQL Editor do Supabase uma vez.
--
-- Por que uma coluna nova em vez de reaproveitar appointments.status: ali
-- 'confirmado' quer dizer "o horário está reservado" e é o que alimenta o índice
-- único anti-overbooking. Se a resposta do paciente escrevesse nesse campo, os
-- dois sentidos se misturariam e a trava da agenda deixaria de significar o que
-- significa. São coisas diferentes: um é o estado da vaga, o outro é o paciente
-- dizendo que vem.
--
-- O código funciona mesmo sem rodar isto: a gravação falha soft (log em
-- "[Lembrete][Confirmação]") e o paciente continua recebendo a resposta pronta.
-- Sem a coluna, porém, o #LEMBRETES não consegue mostrar quem já confirmou —
-- que é justamente a lista de para quem ainda vale ligar.

alter table appointments
  add column if not exists confirmado_paciente_em timestamptz;

-- Consulta típica: "quem tem consulta amanhã e ainda não confirmou".
create index if not exists appointments_confirmado_paciente_idx
  on appointments (inicio)
  where confirmado_paciente_em is null;
