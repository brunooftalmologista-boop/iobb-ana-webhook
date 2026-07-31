-- ===========================================================================
-- EVOLUÇÃO CLÍNICA (camada de apoio — NÃO é o prontuário legal)
-- ---------------------------------------------------------------------------
-- O prontuário de valor legal continua sendo o iClinic. Esta tabela guarda o
-- rascunho que o Dr. Bruno digita durante a consulta, para depois ser copiado
-- e colado lá. Motivo: a ficha já nasce preenchida com o que a Ana coletou
-- (nome, nascimento, telefone, convênio, carteirinha), evitando redigitação.
--
-- RODAR MANUALMENTE no SQL Editor do Supabase (projeto pbnphvmzqdgnijxngosc).
--
-- LGPD: dado clínico é dado pessoal SENSÍVEL. RLS fica LIGADO e SEM policies —
-- ou seja, a anon key não lê nada; só o servidor (service_role) acessa.
-- ===========================================================================

create table if not exists public.evolucoes (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null unique references public.appointments(id) on delete cascade,
  paciente_nome     text,
  paciente_telefone text,
  -- Campos estruturados (AV, refração, PIO, biomicroscopia, fundoscopia…).
  -- jsonb para o formulário evoluir sem exigir migração nova a cada campo.
  dados             jsonb not null default '{}'::jsonb,
  -- Texto final montado para colar no iClinic (guardado como foi copiado).
  texto             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Busca da consulta anterior DO MESMO paciente (botão "copiar da última").
create index if not exists evolucoes_telefone_idx
  on public.evolucoes (paciente_telefone, created_at desc);

alter table public.evolucoes enable row level security;
-- Sem policies de propósito: nenhum acesso via anon/authenticated key.
-- O servidor usa service_role, que ignora RLS.

-- updated_at automático.
create or replace function public.evolucoes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists evolucoes_touch_trg on public.evolucoes;
create trigger evolucoes_touch_trg
  before update on public.evolucoes
  for each row execute function public.evolucoes_touch();
