---
name: ads-iobb-domain-migration
description: "Estado da migração das landing pages/URLs do Google Ads para iobb.com.br — o que foi corrigido, o que ficou pendente, e como retomar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6211d21b-2057-4bb1-8cc6-30cb8c162c4c
  modified: 2026-08-12T16:21:42.992Z
---

Migração das landing pages e URLs do Google Ads para o domínio **iobb.com.br** (via Cloudflare na frente do site institucional). Contexto de código: ver [[ana-webhook-config-deps]]; runbook em `docs/DOMINIO-IOBB.md`.

**Domínio / Cloudflare (feito pelo usuário):** o Cloudflare encaminha só os paths de landing para o app no Render (`iobb-ana-webhook.onrender.com`), mantendo o resto no site institucional. Páginas roteadas/confirmadas no ar: `/consulta`, `/catarata`, `/ceratocone`, `/refrativa`, `/taguatinga`, `/aguas-claras`, `/asa-norte` (também respondem sob `/lp/...`). **NÃO estão roteadas**: `/escleral` e `/clinica/...` (embora o app tenha rota `/escleral`). O subdomínio antigo `tratamentos.iobb.com.br` está MORTO (DNS não resolve).

## Como editar o site institucional (12/08/2026)

**É Cloudflare Pages servindo HTML estático autocontido** (imagens em base64, nada externo). NÃO é Wix — eu afirmei isso uma vez a partir de um `grep -i wix` que casou com lixo de base64; a página não tem marcador de plataforma nenhum. **Não existe fonte "original" guardada**: o que há são cópias baixadas do ar (`~/Downloads/IOBB_site_ATUAL.zip`, de 27/07 e já desatualizado — faltam seções que hoje estão no ar). O jeito que funciona: baixar as 9 páginas de `iobb.com.br` com `curl`, aplicar a mudança, montar o zip **com os arquivos na RAIZ** (pasta embrulhando publica o site dentro dela) + o `_redirects` (`/agenda` e `/painel` → Render), e o Dr. Bruno sobe em Pages → Create deployment. Ele fez o deploy e funcionou.

Detalhes que atrapalham a conferência: o Cloudflare embaralha o e-mail (`__cf_email__`) **com chave nova a cada request**, então a home nunca bate byte a byte; e `cf-cache-status: DYNAMIC` engana — para ver o resultado, usar `?cb=$RANDOM`, e no navegador dele é `Cmd+Shift+R`.

**⚠️ Preço na página de refrativa fica em DOIS lugares**, escritos de formas diferentes: o FAQ (`PRK e TransPRK: R$ 5.990 · LASIK: … · Femto-LASIK: …`) e os três cards da seção "Quanto custa" (`<div class="tec">LASIK</div> … <div class="val"><small>R$</small> 7.800</div>`). **Why:** procurei a string `LASIK: R$ 5.990` e só achei o FAQ — no card o "R$" está em tag separada do número. Pior: ao conferir, usei uma varredura que deduplicava os valores, então 3 ocorrências de "5.990" viraram "1" no meu relatório e eu declarei tudo certo. O Dr. Bruno viu na primeira olhada. **How to apply: contar OCORRÊNCIAS, nunca listar valores distintos; e olhar a página renderizada antes de afirmar que está correto.**

**Conta Google Ads:** IOBB = `451-429-2857` (a operacional; "IOBB Admin" 732-549-0192 é o MCC). ~131 anúncios no total. Todas as campanhas estão **PAUSADAS** (nada gastando). Login: bruno.oftalmologista@gmail.com.

**Migração de URL final feita em 2026-07-15 (verificado pelo href):**
- Ceratocone (`[SEARCH] Ceratocone` + `[SEARCH] Ceratocone CPC`, todos os grupos incl. Lente Escleral) → `https://iobb.com.br/ceratocone`
- `IOBB | Refrativa` → `https://iobb.com.br/refrativa`
- `Consulta Asa Norte` → `https://iobb.com.br/asa-norte`; `Consulta Águas Claras` → `https://iobb.com.br/aguas-claras`
- Campanha antiga `IOBB 5` (~100 anúncios de texto expandido, formato descontinuado) → deixada intacta apontando para a home `www.iobb.com.br`.

**PENDENTE (usuário decide o destino depois):** anúncios ainda no subdomínio morto `tratamentos.iobb.com.br`:
- Campanha `[SEARCH] IOBB` — grupos "Clínica Oftalmológica" e "Clínica Asa Norte" → `tratamentos.iobb.com.br/clinica/...` (sugestão: geral→/consulta, Asa Norte→/asa-norte).
- Verificar também `IOBB | Lentes Esclerais` e `IOBB | Ceratocone e Esclerais` (apareceram na varredura; href não confirmado) — escleral deve ir para `/ceratocone` (não há página /escleral roteada).

**Outros pendentes pedidos pelo usuário:** (1) criar campanha de **catarata** → `iobb.com.br/catarata` (falta orçamento/dia, região, palavras-chave; criar pausada). (2) setar `GOOGLE_ADS_LP_BASE_URL=https://iobb.com.br` no Render (o usuário não deu; teria evitado o retrabalho — as URLs erradas vieram de campanhas criadas quando a base era o subdomínio/onrender).

**API auth do Google Ads (RESOLVIDO 2026-07-15):** o relatório semanal vinha com dados SIMULADOS (fallback) por `invalid_grant` — o `GOOGLE_ADS_REFRESH_TOKEN` tinha expirado/sido revogado. Regeneramos com `node generate-refresh-token.js` (roda local no Mac do usuário; pede CLIENT_ID/SECRET, abre navegador, imprime o token) e atualizamos no **Secret File `/etc/secrets/.env`** do Render — atenção: as credenciais GOOGLE_ADS_* ficam nesse arquivo `.env` (seção "Secret Files"), NÃO na aba "Environment Variables" da UI do Render (lá só há ANTHROPIC_KEY, GOOGLE_ADS_LP_BASE_URL, PHONE_NUMBER_ID, SYSTEM_PROMPT, VERIFY_TOKEN, WHATSAPP_TOKEN). Relatório voltou a mostrar "🟢 Dados REAIS". App OAuth confirmado **"Em produção"** (Google Auth Platform → Público-alvo → Status de publicação) → o refresh token **NÃO expira** pela regra dos 7 dias; conserto estável. NÃO clicar em "Voltar para o teste" (reintroduz a expiração). Assunto do `invalid_grant` = RESOLVIDO.

**Painel em iobb.com.br/painel (2026-07-15):** decidido mover o painel das secretárias p/ `iobb.com.br/painel` também. NÃO precisa mudar código — backend tem CORS `*` (index.js:34) e login por token Bearer (não cookie), então o painel servido de iobb.com.br chama a API no Render normal. Falta só o usuário adicionar a rota `iobb.com.br/painel` no Worker do Cloudflare (runbook docs/DOMINIO-IOBB.md atualizado). Painel segue protegido por login Supabase.

**Why:** as landings novas ficam no iobb.com.br; anúncios antigos apontavam para `tratamentos.iobb.com.br` (morto) e para `iobb-ana-webhook.onrender.com/lp/...` (feio).

**How to apply (retomar a varredura):** na conta IOBB → Anúncios → selecionar todos → Editar → **Alterar anúncios** → **Localizar e substituir**, campo **"Em" = URL final** (cuidado: reseta para "Títulos" toda vez). Fazer find→replace por padrão de path (o replace afeta só quem casa a string). A tela "Confirme sua identidade" aparece de forma intermitente ao Aplicar — **só o usuário pode passar** (2FA); não dá pra automatizar.

---

**ATUALIZAÇÃO 2026-07-23 — CORREÇÃO DO MODELO DE ROTEAMENTO (testado ao vivo, INVALIDA a memória antiga):** `iobb.com.br` e o app da Ana (`iobb-ana-webhook.onrender.com`) são **DOIS SITES DIFERENTES**. Ao contrário do que dizia esta memória, o Cloudflare NÃO encaminha os paths de landing para o app rastreado. Testado por fetch:
- `iobb.com.br/ceratocone` → página do **SITE INSTITUCIONAL** (hero "…diagnóstico preciso", botões "Agendar avaliação"/"Verificar convênio") — NÃO é a landing da Ana.
- `iobb.com.br/aguas-claras` → idem, institucional ("Oftalmologista em Águas Claras").
- `iobb.com.br/lp/<tema>` → home institucional.
- `iobb-ana-webhook.onrender.com/lp/<tema>` e `/<tema>` → landings RASTREADAS da Ana (gclid→WhatsApp→ad_clicks→upload de conversão). É o ÚNICO host onde o rastreio funciona.

**Consequência:** a "migração das URLs de anúncio p/ iobb.com.br" das sessões antigas NUNCA funcionou no nível do Cloudflare — apontar campanha p/ iobb.com.br perde o rastreio do app (cai no institucional). É o que quebrou a escleral (CANO 2 de [[ads-performance-analise-jul2026]]): repontada p/ iobb.com.br em ~15/jul → sem rastreio desde 16/jul, ~R$580/mês no ralo. As outras campanhas ainda rastreiam porque continuam no onrender (nunca foram realmente movidas).

**Conserto escleral:** trocar URL final da campanha p/ `https://iobb-ana-webhook.onrender.com/lp/escleral` (confirmado servindo a landing correta). PENDENTE confirmar no account a URL final atual de cada campanha (ceratocone/escleral) — é o dado que falta.

**PENDÊNCIA reaberta:** o objetivo de servir as landings sob iobb.com.br exige rotear de fato os paths no Worker do Cloudflare (o app já serve `/lp/<tema>` e `/<tema>`), OU decidir que os anúncios ficam no onrender. Enquanto não roteado, o host de rastreio é o onrender. As Routes do Worker ficam SÓ no painel Cloudflare (não no repo); o runbook `docs/DOMINIO-IOBB.md` já LISTA `iobb.com.br/escleral` entre as rotas sugeridas, mas meu teste ao vivo mostra que a rota de `/ceratocone` NÃO está ativa (serve o institucional) — logo as Routes provavelmente não foram aplicadas. Confirmar no painel.

**PLATAFORMA do site institucional: NUNCA foi registrada em chat/repo/runbook.** Em 2026-07-23 eu chutei "Wix" (pelo padrão de URL `copia-lentes-de-contato` e pela página não abrir por fetch) e o usuário corrigiu — NÃO afirmar plataforma sem o usuário dizer. Para publicar landing no domínio, o caminho é agnóstico de plataforma: adicionar a Route no Worker Cloudflare.

**Landing de escleral criada (2026-07-23, commit e574199):** `landings/escleral.html` — dedicada, conversão, no design system lp.css; registrada em LP_HTML → servida em `/escleral` e `/lp/escleral`. Atalho p/ parar o sangramento sem Cloudflare: apontar a campanha "IOBB | Lentes Esclerais" para `https://iobb-ana-webhook.onrender.com/escleral`. Verificada renderizando (hero + todas as seções; read_page + assets OK).

**Código desta sessão (mergeado na main, commit 72e1ad4):** specs trocadas de `${base}/lp/<tema>` p/ path limpo `${base}/<tema>`. ATENÇÃO: isso só ajuda se `GOOGLE_ADS_LP_BASE_URL` apontar p/ o onrender; se apontar p/ iobb.com.br, cai no institucional (sem rastreio). Revisar o alvo de base antes de recriar campanha via API. + hero da landing de ceratocone reescrito (direto-resposta) — no ar no onrender.

**⚠️ CORREÇÃO (07/08/2026):** o registro acima diz que o Cloudflare encaminha os paths de landing para o app no Render e que as páginas "também respondem sob /lp/...". **Isso não vale mais** — ou nunca valeu para todos os temas. Medido em 07/08: `iobb.com.br/aguas-claras` tem 542 KB e `onrender.com/lp/aguas-claras` tem 20 KB, com títulos diferentes. São **páginas distintas, de projetos distintos**. Editar `landings/*.html` neste repositório **NÃO altera** o que está no domínio. `/escleral` responde no domínio (o registro dizia que não estava roteado).

**Auditoria completa das landings está em `docs/DOMINIO-IOBB.md`** (versionada no repo, acessível a qualquer sessão): quais páginas existem em cada lado, comparação de conteúdo, preços conferidos contra a base da Ana, e os cliques pagos indo para páginas inexistentes (`copia-convenios-3` com 55 cliques é o pior). Recomendação: apontar os anúncios para iobb.com.br e aposentar as URLs onrender (R$ 822 gastos nelas até 07/08).

**PENDENTE DE DECISÃO DO BRUNO:** o site diz que atende menores de 8 anos "com confirmação da equipe"; a regra da Ana é 8 anos categórico. Resolver antes de migrar os anúncios, senão anúncio pago vira frustração.
