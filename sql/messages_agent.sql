-- Autor da mensagem humana (quem respondeu pelo painel ou por comando).
-- Rode no SQL Editor do Supabase uma vez.
--
-- Sem esta coluna o painel rotula toda mensagem humana como "Secretária".
-- Com ela, cada bolha mostra o autor real — em especial "Dr. Bruno (WhatsApp)"
-- para mensagens disparadas por comando admin (#ENVIAR/#MSG), dando às
-- secretárias o histórico de quem falou com o paciente.
--
-- O código funciona mesmo sem rodar isto (saveMessage reinsere só o básico se a
-- coluna não existir), mas aí o rótulo de autor não é gravado.

alter table messages
  add column if not exists agent text;  -- nome do autor da mensagem humana
