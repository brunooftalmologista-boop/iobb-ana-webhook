-- ===========================================================================
-- FILA DE REENGAJAMENTO (campanha de revisão anual)
-- ---------------------------------------------------------------------------
-- Pacientes que consultaram e NÃO voltaram — a primeira safra é ago/set de
-- 2025, extraída do relatório "Paciente para retorno" do iClinic (Conjunto
-- Nacional e Taguatinga Shopping) antes de a assinatura acabar.
--
-- Por que uma tabela e não uma planilha: o disparo é em LOTES ao longo de
-- dias (número frio em massa derruba a qualidade do WhatsApp da clínica, que
-- é o mesmo que atende os pacientes ativos). Entre um lote e outro é preciso
-- saber, sem depender de arquivo aberto na máquina de alguém, quem já
-- recebeu, quem foi bloqueado por descadastro e quem falhou.
--
-- RODAR MANUALMENTE no SQL Editor do Supabase (projeto pbnphvmzqdgnijxngosc).
--
-- LGPD: nome + telefone + histórico de consulta é dado pessoal (e o vínculo
-- com uma clínica oftalmológica é dado de saúde). RLS LIGADO e SEM policies —
-- só o servidor (service_role) acessa. Mesmo padrão de evolucoes.sql.
-- ===========================================================================

create table if not exists public.reengajamento (
  campanha        text not null default 'revisao_anual_2025',
  -- Chave canônica do telefone (foneChave): a MESMA de marketing_optout, para
  -- o descadastro casar com a fila nas duas grafias do nono dígito.
  fone_chave      text not null,
  telefone        text not null,          -- E.164, pronto para a Meta
  nome            text,
  primeiro_nome   text,                   -- vai como {{1}} no template
  convenio        text,
  unidade         text,
  ultima_consulta date,
  mes_referencia  text,                   -- "setembro de 2025" → {{2}}
  -- pendente | enviado | descadastrado | ja_agendado | falhou
  status          text not null default 'pendente',
  enviado_em      timestamptz,
  erro            text,
  created_at      timestamptz not null default now(),
  primary key (campanha, fone_chave)
);

-- A fila sai pela consulta mais RECENTE primeiro: quem veio em setembro
-- responde melhor que quem veio em agosto, e o lote inicial é o termômetro
-- para decidir se vale continuar.
create index if not exists reengajamento_fila_idx
  on public.reengajamento (campanha, status, ultima_consulta desc);

alter table public.reengajamento enable row level security;
-- Sem policies de propósito: nenhum acesso via anon/authenticated key.
