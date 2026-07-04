-- Persistência dos pré-agendamentos concluídos pela Ana.
-- Rode no SQL Editor do Supabase uma vez.
--
-- Até então o bloco [PREAGENDAMENTO] só era extraído da resposta da Ana e enviado
-- por WhatsApp à secretária — nada ficava consultável. Com esta tabela, os números
-- admin podem perguntar à Ana pelo WhatsApp: "quantos pré-agendamentos hoje?",
-- "enviar o último pré-agendamento", "listar pré-agendamentos de hoje".
--
-- O código funciona mesmo sem rodar isto (o espelhamento à secretária continua),
-- mas as CONSULTAS admin responderão 0/erro até a tabela existir.

create table if not exists preagendamentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id text,                -- conversa de origem (quando disponível)
  patient_phone text,                  -- número do paciente (E.164 sem "+")
  nome text,
  telefone text,                       -- telefone informado no pré-agendamento
  convenio text,
  unidade text,
  periodo text,
  motivo text
);

create index if not exists preagendamentos_created_at_idx on preagendamentos (created_at desc);
create index if not exists preagendamentos_phone_idx on preagendamentos (patient_phone);
