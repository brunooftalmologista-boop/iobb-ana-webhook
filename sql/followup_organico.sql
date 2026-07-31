-- ===========================================================================
-- FOLLOW-UP DE LEADS FRIOS — AMPLIADO PARA O ORGÂNICO (2026-07-31)
-- ---------------------------------------------------------------------------
-- Antes: só recebia retomada quem tinha clique de anúncio registrado
-- (`exists ad_clicks`). Em julho isso deu 26 mensagens para ~400 candidatos —
-- 683 conversas no mês, das quais 409 tiveram 3+ mensagens do paciente e
-- morreram sem agendamento nem pré-agendamento.
--
-- A mensagem é GRATUITA nos dois lados: é texto fixo (não passa pela IA) e vai
-- dentro da janela de 24h da Meta (por isso a faixa de 3-20h, que NÃO pode ser
-- alargada além de 24h — fora dela a Meta recusa texto livre, erro 131047).
--
-- O que MUDA: cai a exigência de anúncio.
-- O que ENTRA de proteção nova:
--   1. exclui números de teste (55619900%);
--   2. exige ao menos 2 mensagens do paciente — quem só disse "oi" e sumiu não
--      recebe cutucada;
--   3. amplia o opt-out para quem cancelou/desmarcou (não faz sentido oferecer
--      "dar sequência" a quem acabou de desmarcar).
--
-- O que CONTINUA igual: só conversa em modo bot, só quando a última mensagem foi
-- da Ana (o paciente é que sumiu), UM follow-up por conversa para sempre, nunca
-- para quem já tem agendamento, e nunca para quem pediu para não receber.
-- ===========================================================================

create or replace function public.leads_frios_followup()
returns table(conversation_id uuid, phone text, name text)
language sql
stable
as $function$
  select c.id, p.phone, p.name
  from public.conversations c
  join public.patients p on p.id = c.patient_id
  where c.status = 'bot'
    and p.phone is not null
    and p.phone not like '55619900%'                     -- números de teste
    and (select count(*) from public.messages m
         where m.conversation_id = c.id and m.role = 'user') >= 2
    and (select m.role from public.messages m where m.conversation_id = c.id order by m.timestamp desc limit 1) = 'assistant'
    and (select max(m.timestamp) from public.messages m where m.conversation_id = c.id and m.role in ('user','human'))
          between (now() at time zone 'utc') - interval '20 hours'
              and (now() at time zone 'utc') - interval '3 hours'
    and not exists (select 1 from public.messages m where m.conversation_id = c.id and m.event = 'followup')
    and not exists (select 1 from public.appointments ap where ap.conversation_id = c.id::text and ap.status <> 'cancelado')
    and lower(coalesce((select m.content from public.messages m
          where m.conversation_id = c.id and m.role in ('user','human')
          order by m.timestamp desc limit 1),''))
        !~ '(n[aã]o quero|sem interesse|nao tenho interesse|j[aá] (resolvi|agendei|marquei)|parar de receber|n[aã]o me mand|desinscrev|cancelar|desmarcar|cancela a)'
  limit 20;
$function$;
