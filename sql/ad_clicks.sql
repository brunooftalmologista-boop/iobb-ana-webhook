-- Tabela de atribuição de cliques de anúncios (Google Ads) → agendamentos.
-- Rode no SQL Editor do Supabase uma vez.
--
-- Fluxo: landing /lp/:tema captura o gclid e cria um token → o token viaja na
-- mensagem pré-preenchida do WhatsApp → a Ana vincula o token ao telefone/conversa
-- → a secretária marca "Agendou" no painel → export de conversões offline p/ Google.

create table if not exists ad_clicks (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,          -- token curto que viaja no [ref:...]
  gclid text,                          -- Google Click ID (auto-tagging)
  wbraid text,                         -- variantes de clique (web/iOS)
  gbraid text,
  source text,                         -- ex.: "google/ceratocone"
  phone text,                          -- preenchido quando a Ana recebe a 1ª msg
  conversation_id text,                -- id da conversa vinculada
  clicked_at timestamptz not null default now(),
  booked boolean not null default false,     -- agendamento confirmado pela secretária
  booked_at timestamptz,
  conversion_value numeric,                  -- valor da conversão (ex.: 200)
  reported boolean not null default false,   -- já exportado ao Google Ads?
  reported_at timestamptz
);

create index if not exists ad_clicks_token_idx on ad_clicks (token);
create index if not exists ad_clicks_conversation_idx on ad_clicks (conversation_id);
create index if not exists ad_clicks_phone_idx on ad_clicks (phone);
create index if not exists ad_clicks_booked_idx on ad_clicks (booked) where booked = true;
