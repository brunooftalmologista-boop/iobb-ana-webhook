-- ===========================================================================
-- DESCADASTRO DE MARKETING (opt-out)
-- ---------------------------------------------------------------------------
-- A Meta exige que mensagem de categoria MARKETING pare de chegar quando o
-- paciente pede — e quem manda campanha sem honrar isso perde qualidade do
-- número, que é o MESMO número que atende os pacientes ativos.
--
-- Nasceu do template de reengajamento anual (pacientes que consultaram em
-- ago/set de 2025 e não voltaram): ele tem um botão "Parar promoções" que,
-- sem esta tabela, chegava à Ana como mensagem comum e ela respondia
-- oferecendo horário — o oposto do que o paciente pediu.
--
-- ⚠️ Isto NÃO bloqueia o lembrete da véspera: aquele é UTILIDADE, o paciente
-- tem hora reservada e precisa ser avisado. Só o disparo de marketing
-- (enviarTemplateMarketing) consulta esta tabela.
--
-- RODAR MANUALMENTE no SQL Editor do Supabase (projeto pbnphvmzqdgnijxngosc).
--
-- LGPD: RLS LIGADO e SEM policies — a anon key não lê nada; só o servidor
-- (service_role) acessa. Mesmo padrão de evolucoes.sql.
-- ===========================================================================

create table if not exists public.marketing_optout (
  -- Chave canônica do telefone (foneChave no index.js): 55 + DDD + 8 dígitos,
  -- SEM o nono. O mesmo paciente chega como 556182608068 ou 5561992608068
  -- conforme a Meta entrega — a forma canônica faz o descadastro valer nas
  -- duas grafias, senão ele receberia a campanha de novo pela outra.
  fone_chave  text primary key,
  telefone    text,
  nome        text,
  -- 'botao_template' (tocou em "Parar promoções"), 'texto' (escreveu o pedido)
  -- ou 'manual' (equipe registrou a pedido do paciente por telefone/balcão).
  origem      text not null default 'paciente',
  created_at  timestamptz not null default now()
);

alter table public.marketing_optout enable row level security;
-- Sem policies de propósito: nenhum acesso via anon/authenticated key.
