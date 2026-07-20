-- Agenda própria da clínica — FONTE ÚNICA de agendamento (Modelo B: mestre).
-- Rode no SQL Editor do Supabase uma vez.
--
-- Substitui a leitura do iCal público (só-leitura, atrasado, sem trava) por uma
-- agenda no próprio banco: as secretárias veem/marcam pelo painel e, na Fase 2, a
-- Ana LÊ os horários livres e MARCA de verdade — tudo no mesmo lugar.
--
-- A TRAVA ANTI-OVERBOOKING é o índice único parcial abaixo: no máximo um
-- agendamento ATIVO por (unidade, inicio). Se a Ana e a secretária tentarem o
-- mesmo horário ao mesmo tempo, o Postgres aceita UM e rejeita o outro de forma
-- atômica (código 23505) — não é "torcer para não colidir".
--
-- O código funciona só depois desta tabela existir. Sem ela, os endpoints
-- /api/agenda/* respondem erro e a aba Agenda do painel fica vazia.

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  unidade text not null,                       -- 'Conjunto Nacional' | 'Taguatinga'
  inicio timestamptz not null,                 -- início do horário (instante; Brasília gravada como UTC)
  fim timestamptz not null,                    -- fim do horário (inicio + duração do slot)
  status text not null default 'confirmado',   -- 'reservado' (hold) | 'confirmado' | 'cancelado'
  paciente_nome text,
  paciente_telefone text,
  convenio text,                               -- convênio ou 'particular'
  motivo text,                                 -- Consulta | <um dos exames> | Avaliação de cirurgia
  observacoes text,                            -- observações livres da secretária
  origem text,                                 -- 'ana' | 'secretaria'
  conversation_id text,                        -- conversa da Ana (fecha atribuição de Ads)
  criado_por text,                             -- email da secretária que marcou (auditoria/LGPD)
  hold_expira_em timestamptz,                  -- validade do hold enquanto a Ana conversa (só p/ 'reservado')
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trava única: 'cancelado' não ocupa. Um 'reservado' vencido ainda ocuparia o
-- índice — por isso a aplicação (criarAgendamento) cancela holds vencidos do
-- mesmo slot ANTES de inserir. A checagem final de duplicidade é sempre do banco.
create unique index if not exists appointments_slot_unico
  on appointments (unidade, inicio)
  where status in ('reservado', 'confirmado');

create index if not exists appointments_inicio_idx on appointments (inicio);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists appointments_conversation_idx on appointments (conversation_id);
