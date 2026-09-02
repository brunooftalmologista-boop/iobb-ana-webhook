-- ===========================================================================
-- INDICAÇÕES — O FUNIL DEPOIS DA CONSULTA
-- ---------------------------------------------------------------------------
-- O sistema inteiro terminava em "o paciente compareceu". O que acontece
-- DEPOIS — o Dr. Bruno indica uma PRK de R$ 5.990, uma lente escleral de
-- R$ 7.800, uma catarata — não existia em lugar nenhum: a equipe passava o
-- orçamento de boca, o paciente ia embora "pensar", e ninguém mais sabia dele.
--
-- POR QUE ISSO É O MAIOR BURACO DE FATURAMENTO (números de agosto/2026):
--   · 336 consultas realizadas — a agenda gira bem;
--   · em jul+ago, 117 conversas falaram de refrativa/catarata/ceratocone/
--     escleral e só 25 viraram agendamento;
--   · UMA cirurgia a mais por mês vale mais que todas as consultas que ainda
--     cabem na agenda vazia.
-- Marcar consulta a Ana já sabe fazer. O que faltava era lembrar do paciente
-- que já ouviu "você é candidato" e ainda não decidiu.
--
-- O QUE ESTA TABELA É: a memória do que foi indicado a cada paciente, e a fila
-- de quem precisa ser retomado. Uma linha por procedimento indicado (o mesmo
-- paciente pode ter duas: catarata OD e catarata OE, por exemplo).
--
-- O QUE ELA NÃO É: prontuário. Aqui não entra diagnóstico, exame nem conduta
-- clínica — só o que a clínica precisa para não perder o paciente de vista.
-- O campo `observacoes` é administrativo ("prefere fazer depois das férias").
--
-- RODAR MANUALMENTE no SQL Editor do Supabase (projeto pbnphvmzqdgnijxngosc).
--
-- LGPD: procedimento indicado a uma pessoa identificada é dado de SAÚDE. RLS
-- LIGADO e SEM policies — só o servidor (service_role) acessa. Mesmo padrão de
-- evolucoes.sql e reengajamento.sql.
-- ===========================================================================

create table if not exists public.indicacoes (
  id                uuid primary key default gen_random_uuid(),
  -- A consulta em que a indicação nasceu. ON DELETE SET NULL: se o agendamento
  -- for apagado, a indicação continua valendo — ela é sobre o paciente, não
  -- sobre a linha da agenda.
  appointment_id    uuid references public.appointments(id) on delete set null,
  -- Chave canônica do telefone (foneChave): a MESMA de marketing_optout e
  -- reengajamento, para o descadastro e as buscas casarem nas duas grafias do
  -- nono dígito. Sem isso, metade dos pacientes não é encontrada.
  fone_chave        text not null,
  paciente_telefone text not null,
  paciente_nome     text,
  -- Texto livre porque a lista de procedimentos muda (a ZenLens entrou em
  -- agosto). O que padroniza é a tela, não o banco.
  procedimento      text not null,
  olho              text,                    -- OD | OE | AO | null
  -- Ticket esperado. Preenchido automaticamente pela tabela de preços do
  -- código quando quem registra não digita nada — é o que faz o "#INDICACOES"
  -- mostrar quanto dinheiro está parado no funil.
  valor             numeric,

  -- aberta    → indicada, ninguém decidiu ainda (a fila de retomada é esta)
  -- pausada   → ele pediu para deixar para depois ("Agora não"): continua no
  --             funil, à vista da equipe, mas a máquina não cutuca mais
  -- retornou  → o paciente marcou consulta depois da indicação (automático):
  --             a conversa voltou a ser presencial, a máquina para de cutucar
  -- fechada   → fez o procedimento / comprou a lente
  -- recusada  → disse não (motivo em `motivo`)
  -- perdida   → a cadência acabou e ele nunca respondeu
  status            text not null default 'aberta',
  motivo            text,
  observacoes       text,

  -- Cadência: quantos toques já foram dados e quando cai o próximo. Guardar o
  -- PRÓXIMO no banco (em vez de calcular na hora) é o que impede o servidor de
  -- reiniciar e mandar tudo de novo — foi assim que o follow-up de leads
  -- garantiu "uma mensagem por conversa, para sempre".
  toques            int not null default 0,
  ultimo_toque_em   timestamptz,
  proximo_toque_em  timestamptz,
  -- Quando o paciente respondeu a um toque. Enquanto ele estiver conversando,
  -- a máquina se cala: quem conduz é a Ana (ou a equipe), não o robô.
  respondeu_em      timestamptz,

  criado_por        text,                    -- e-mail do painel, ou "whatsapp"
  fechada_em        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A fila da rotina: "quem está aberta e já passou da hora do próximo toque".
create index if not exists indicacoes_fila_idx
  on public.indicacoes (status, proximo_toque_em)
  where status = 'aberta';

-- Busca pelo paciente (injeção no prompt da Ana e tela da equipe).
create index if not exists indicacoes_fone_idx
  on public.indicacoes (fone_chave, status);

-- Anti-duplicata: a mesma consulta não registra o mesmo procedimento duas
-- vezes (dois cliques no botão, ou o Dr. Bruno registrando de novo pelo
-- WhatsApp o que a equipe já pôs pela tela). Índice parcial porque
-- appointment_id pode ser nulo (indicação registrada só pelo telefone).
create unique index if not exists indicacoes_sem_duplicata_idx
  on public.indicacoes (appointment_id, lower(procedimento))
  where appointment_id is not null;

alter table public.indicacoes enable row level security;
-- Sem policies de propósito: nenhum acesso via anon/authenticated key.

-- updated_at automático (mesmo trigger de evolucoes).
create or replace function public.indicacoes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists indicacoes_touch_trg on public.indicacoes;
create trigger indicacoes_touch_trg
  before update on public.indicacoes
  for each row execute function public.indicacoes_touch();

-- Liga a rotina de retomada. Nasce DESLIGADA de propósito: o deploy sobe
-- inerte, e o Dr. Bruno ativa quando tiver visto o texto que o paciente
-- recebe (#INDICACOES TESTE). Mesmo padrão de followup_leads_enabled.
insert into public.settings (key, value)
values ('indicacoes_followup_enabled', 'false')
on conflict (key) do nothing;
