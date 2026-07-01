# Checklist de ativação — Ana IOBB + Google Ads

Runbook para colocar tudo no ar, na ordem. Marque conforme avança.
Referências: `PLANO_CAMPANHAS.md`, `RASTREAMENTO.md`, `sql/ad_clicks.sql`.

---

## Fase 0 — Código (já feito)
- [x] Integração, landing, rastreamento e painel commitados e no `main`.
- [ ] Confirmar que o Render fez deploy do último commit (logs sem erro no boot).
- [ ] Rodar `npm install` no deploy (adiciona `google-ads-api`) — automático no Render.

## Fase 1 — Banco de dados
- [ ] Rodar `sql/ad_clicks.sql` no **SQL Editor do Supabase** (cria a tabela de atribuição).

## Fase 2 — Variáveis de ambiente (Render → /etc/secrets/.env)
- [ ] `WA_LP_NUMBER` = número do **WhatsApp Business da Ana** (E.164 sem "+"). **Crítico.**
- [ ] `GOOGLE_ADS_CONVERSION_NAME` = `Agendamento IOBB` (ou o nome que você usará no Google).
- [ ] (Quando o Developer Token sair) `GOOGLE_ADS_*` para os relatórios reais — ver `googleAds.js`.

## Fase 3 — Google Ads: conversões
- [ ] Criar ação de conversão **Importar → Uploads manuais (offline)** com nome **igual** a `GOOGLE_ADS_CONVERSION_NAME`.
- [ ] Ativar **marcação automática (auto-tagging)** — garante o `gclid`.

## Fase 4 — Google Ads: campanhas
- [ ] Importar `negativas_iobb_google_ads.csv` (está em `~/Downloads`) — ou criar lista de negativas compartilhada.
- [ ] Importar `estrutura_campanhas_google_ads.csv` no **Editor** (2 campanhas, 6 grupos, 27 palavras-chave; entram como **Paused**).
- [ ] Adicionar os **RSAs** (textos no `PLANO_CAMPANHAS.md`) em cada grupo, com **URL final**:
  - Campanha Ceratocone/Esclerais → `https://SEU-DOMINIO/lp/ceratocone`
  - Campanha Consulta → sua página/WhatsApp de consulta (idealmente também uma `/lp/`)
- [ ] Aplicar as negativas às 2 campanhas.
- [ ] **Pausar/minimizar Performance Max**; manter **refrativa e catarata pausadas**.
- [ ] Ativar primeiro **Consulta DF**; ativar **Ceratocone** só após testar o fluxo (Fase 5).

## Fase 5 — Teste ponta a ponta (antes de gastar de verdade)
- [ ] Acessar `https://SEU-DOMINIO/lp/ceratocone?gclid=TESTE123` no celular.
- [ ] Clicar em "Falar no WhatsApp" → confere se abre a Ana com a mensagem + `[ref:...]`.
- [ ] Enviar a mensagem → conferir no Supabase que a linha em `ad_clicks` ganhou `phone`/`conversation_id`.
- [ ] No painel: a conversa deve mostrar **🎯 veio de anúncio**.
- [ ] Clicar **📅 (Marcar agendamento)** → toast confirma; cabeçalho vira "🎯 veio de anúncio (agendado ✅)".
- [ ] Na modal **📊 Relatório Google Ads → Baixar conversões** → conferir o CSV com o `gclid` de teste.
- [ ] (Opcional) Importar esse CSV de teste no Google Ads e confirmar que a conversão aparece.

## Fase 6 — Operação semanal
- [ ] Relatório: `#ADS` pelo WhatsApp admin **ou** botão 📊 no painel (automático toda segunda 08h).
- [ ] Secretárias marcam **📅** em cada agendamento confirmado.
- [ ] Semanalmente: **Baixar conversões** → importar em *Google Ads → Metas → Conversões → Uploads*.
- [ ] Revisar termos de pesquisa e adicionar novas negativas conforme surgirem.

---

## Pendências que dependem de você
- **Developer Token de produção** (acesso Basic) para os relatórios usarem dados reais — hoje em modo teste.
- Confirmar o **número real da Ana** para `WA_LP_NUMBER`.
- Definir o **domínio público** do app para as URLs `/lp/...`.

## Notas de honestidade
- O código foi validado por **revisão** (não há Node/Supabase no ambiente de dev). Os testes reais são os da Fase 5.
- Atribuição só existe para cliques que passaram pela landing (com `gclid`); pacientes orgânicos são marcados como agendados, mas sem conversão para o Google.
