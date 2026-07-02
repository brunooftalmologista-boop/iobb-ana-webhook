-- Anexos recebidos dos pacientes (imagem, documento, áudio, vídeo).
-- Rode no SQL Editor do Supabase uma vez.
--
-- Guarda apenas a REFERÊNCIA ao arquivo no Storage (bucket privado "anexos"),
-- nunca uma URL pública. O painel pede uma URL assinada de curta duração em
-- /api/attachment na hora de exibir. Assim os dados sensíveis (laudos, receitas)
-- ficam protegidos por LGPD e ainda são expurgados após 30 dias.

alter table messages
  add column if not exists media_path text,  -- caminho do objeto no bucket "anexos"
  add column if not exists media_type text,  -- mime-type (ex.: image/jpeg, application/pdf)
  add column if not exists media_name text;  -- nome amigável para exibir/baixar
