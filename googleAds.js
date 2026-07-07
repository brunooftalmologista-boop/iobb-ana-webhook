// ============================================================================
// Integração Google Ads → Ana IOBB
// Analisa as campanhas ativas da conta IOBB, identifica oportunidades de
// melhoria e envia um relatório semanal pelo WhatsApp.
//
// MODO TESTE x PRODUÇÃO
// - Enquanto o Developer Token de produção não estiver aprovado (ou faltar
//   qualquer credencial), o módulo roda em MODO TESTE com dados SIMULADOS.
// - Assim que GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_REFRESH_TOKEN existirem
//   nas env vars, ele passa a consultar a Google Ads API real — sem mudar
//   nada no código. Force o modo teste com GOOGLE_ADS_TEST_MODE=true.
//
// Credenciais esperadas (env):
//   GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN,
//   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID (sem traços: 4514292857),
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID (opcional, se acesso via MCC)
// ============================================================================

const TZ = "America/Sao_Paulo";

// Número que recebe o relatório (WhatsApp, formato E.164 sem "+")
const REPORT_NUMBER = process.env.GOOGLE_ADS_REPORT_NUMBER || "5561982879853";

// ---------------------------------------------------------------------------
// Objetivos de negócio da IOBB e como reconhecê-los pelo nome da campanha.
// targetCpa = custo por conversão de referência (R$) para sinalizar exagero.
// ---------------------------------------------------------------------------
const GOALS = [
  {
    key: "consulta",
    label: "🩺 Agendamento de consultas",
    noun: "agendamentos",
    targetCpa: 80,
    keywords: ["consulta", "agendamento", "agendar", "oftalmo", "rotina", "checkup", "check-up", "exame de vista", "oftalmologista"],
    createTip: 'Criar campanha de Pesquisa para "oftalmologista em Brasília / Asa Norte / Taguatinga" com extensão de chamada e clique-para-WhatsApp, direcionando ao pré-agendamento da Ana.',
  },
  {
    key: "refrativa",
    label: "👁️ Cirurgia refrativa",
    noun: "interessados em refrativa",
    targetCpa: 400,
    keywords: ["refrativa", "lasik", "prk", "femto", "miopia", "astigmatismo", "livre de óculos", "cirurgia a laser", "laser"],
    createTip: 'Criar campanha de Pesquisa para "cirurgia de miopia / LASIK / PRK em Brasília" com página explicando PRK/LASIK/Femto e faixa de valores, CTA para avaliação.',
  },
  {
    key: "escleral",
    label: "🔵 Lentes esclerais / ceratocone",
    noun: "casos de ceratocone",
    targetCpa: 250,
    keywords: ["ceratocone", "escleral", "esclerais", "lente de contato", "lentes rígidas", "crosslinking", "anel de ferrara", "zenlens"],
    createTip: 'Criar campanha para "tratamento de ceratocone / lente escleral em Brasília" — nicho de alta intenção; destacar referência em ceratocone e avaliação com contactóloga.',
  },
  {
    key: "catarata",
    label: "🌫️ Cirurgia de catarata",
    noun: "avaliações de catarata",
    targetCpa: 300,
    keywords: ["catarata", "facectomia", "lente intraocular", "lio"],
    createTip: 'Criar campanha para "cirurgia de catarata em Brasília" segmentando 55+, destacando avaliação e lentes intraoculares.',
  },
];

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------
const brl = n => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = n => `${((n || 0) * 100).toFixed(1).replace(".", ",")}%`;
const int = n => Math.round(n || 0).toLocaleString("pt-BR");

function isTestMode() {
  if (process.env.GOOGLE_ADS_TEST_MODE === "true") return true;
  return !process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_REFRESH_TOKEN;
}

// Explica em texto por que estamos (ou não) em modo teste — para log e relatório.
function testModeReason() {
  if (process.env.GOOGLE_ADS_TEST_MODE === "true") return "GOOGLE_ADS_TEST_MODE=true força o modo teste";
  const missing = [];
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) missing.push("GOOGLE_ADS_REFRESH_TOKEN");
  return missing.length ? `faltando credencial(is): ${missing.join(", ")}` : "credenciais presentes";
}

// Mascara um ID/segredo para logar sem vazar (mostra só os últimos 4).
function mask(v) {
  if (!v) return "(vazio)";
  const s = String(v);
  return s.length <= 4 ? "****" : "…" + s.slice(-4);
}

// Estado do último fetch para o relatório saber a origem dos dados.
// source: "real" | "mock-teste" | "mock-fallback"
let lastFetchDiag = { source: null, error: null, count: 0, reason: null };
let lastApiError = null;

// Extrai a mensagem/código úteis de um erro da google-ads-api (GoogleAdsFailure),
// que traz um array `errors` com { error_code: {<tipo>: <valor>}, message }.
function describeAdsError(e) {
  const lines = [];
  const errs = e?.errors || e?.failure?.errors;
  if (Array.isArray(errs) && errs.length) {
    for (const er of errs) {
      let code = "";
      const ec = er.error_code || er.errorCode;
      if (ec && typeof ec === "object") {
        const k = Object.keys(ec).find(key => ec[key] != null && ec[key] !== "UNSPECIFIED" && ec[key] !== "UNKNOWN");
        if (k) code = `${k}=${ec[k]}`;
      }
      lines.push([code, er.message].filter(Boolean).join(": "));
    }
  }
  if (!lines.length) {
    if (e?.message) lines.push(e.message);
    if (e?.code != null) lines.push(`grpc_code=${e.code}`);
  }
  const requestId = e?.request_id || e?.requestId || e?.metadata?.request_id ||
    (typeof e?.metadata?.get === "function" ? e.metadata.get("request-id")?.[0] : undefined);
  return { text: lines.join(" | ") || "erro desconhecido", requestId };
}

function classifyGoal(campaign) {
  const name = (campaign.name || "").toLowerCase();
  for (const g of GOALS) {
    if (g.keywords.some(k => name.includes(k))) return g.key;
  }
  return "outros";
}

function goalMeta(key) {
  return GOALS.find(g => g.key === key) || { key: "outros", label: "📁 Outras campanhas", noun: "conversões", targetCpa: null };
}

// ---------------------------------------------------------------------------
// Análise de UMA campanha → métricas derivadas + recomendações priorizadas
// severity: 3 = crítico, 2 = importante, 1 = ajuste fino
// ---------------------------------------------------------------------------
function analyzeCampaign(c) {
  const cost = c.costMicros / 1e6;
  const cpa = c.conversions > 0 ? cost / c.conversions : null;
  const convRate = c.clicks > 0 ? c.conversions / c.clicks : 0;
  const goal = classifyGoal(c);
  const target = goalMeta(goal).targetCpa;
  const noun = goalMeta(goal).noun;
  const recs = [];

  if (c.conversions === 0 && cost >= 100) {
    recs.push({ severity: 3, text: `sem conversões com ${brl(cost)} investido — verifique o acompanhamento de conversões (clique-no-WhatsApp/ligação) e revise as palavras-chave; pause termos sem retorno.` });
  }
  if (cpa !== null && target && cpa > target * 1.3) {
    recs.push({ severity: 2, text: `custo por conversão alto (${brl(cpa)} vs. meta ~${brl(target)}) — ajuste lances/segmentação e adicione palavras-chave negativas genéricas.` });
  }
  if (c.channel === "SEARCH" && c.ctr < 0.03 && c.impressions > 500) {
    recs.push({ severity: 2, text: `CTR baixo (${pct(c.ctr)}) — teste novos títulos/descrições e ative extensões (chamada, local, sitelinks).` });
  }
  if (c.searchBudgetLostIS > 0.10) {
    recs.push({ severity: 2, text: `perdendo ${pct(c.searchBudgetLostIS)} das impressões por ORÇAMENTO — aumente o orçamento diário para captar mais ${noun}.` });
  }
  if (c.searchRankLostIS > 0.25) {
    recs.push({ severity: 1, text: `perdendo ${pct(c.searchRankLostIS)} das impressões por RANKING — melhore o Índice de Qualidade (relevância do anúncio + página de destino) ou eleve lances.` });
  }
  if (convRate < 0.02 && c.clicks > 50) {
    recs.push({ severity: 1, text: `taxa de conversão baixa (${pct(convRate)}) — leve o clique para a página/CTA certos, com clique-para-WhatsApp da Ana.` });
  }

  return { campaign: c, goal, cost, cpa, convRate, recs };
}

// ---------------------------------------------------------------------------
// Monta o texto do relatório a partir das análises
// ---------------------------------------------------------------------------
function buildReport(campaigns) {
  const analyses = campaigns.map(analyzeCampaign);

  // Totais do período
  const totalCost = analyses.reduce((s, a) => s + a.cost, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpr = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0);
  const ctr = totalImpr > 0 ? totalClicks / totalImpr : 0;
  const cpa = totalConv > 0 ? totalCost / totalConv : null;

  // Período (últimos 7 dias)
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400000);
  const d = x => x.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });

  const L = [];
  L.push("📊 *Relatório semanal — Google Ads IOBB*");
  L.push(`🗓️ Período: ${d(start)} a ${d(end)} (7 dias)`);
  // Banner de origem dos dados (baseado no último fetch).
  if (lastFetchDiag.source === "mock-fallback") {
    L.push("⚠️ _FALHA NA API do Google Ads — mostrando dados SIMULADOS (fallback)._");
    L.push(`❌ _Erro: ${lastFetchDiag.error?.text || "desconhecido"}${lastFetchDiag.error?.requestId ? ` (request_id=${lastFetchDiag.error.requestId})` : ""}_`);
  } else if (lastFetchDiag.source === "mock-teste" || (lastFetchDiag.source === null && isTestMode())) {
    L.push(`🧪 _MODO TESTE — dados simulados (${lastFetchDiag.reason || testModeReason()}). Troque/complete as credenciais para dados reais._`);
  } else if (lastFetchDiag.source === "real") {
    L.push("🟢 _Dados REAIS da conta (Google Ads API)._");
  }
  L.push("");
  L.push("*Resumo geral*");
  L.push(`• Investimento: ${brl(totalCost)}`);
  L.push(`• Impressões: ${int(totalImpr)} | Cliques: ${int(totalClicks)} (CTR ${pct(ctr)})`);
  L.push(`• Conversões: ${int(totalConv)}${cpa !== null ? ` | Custo/conversão: ${brl(cpa)}` : ""}`);
  L.push("");

  // Seção por objetivo
  L.push("*Por objetivo:*");
  for (const g of GOALS) {
    const items = analyses.filter(a => a.goal === g.key);
    L.push("");
    if (items.length === 0) {
      L.push(`${g.label} — ⚠️ *sem campanha ativa*`);
      L.push(`   💡 ${g.createTip}`);
      continue;
    }
    L.push(g.label);
    for (const a of items) {
      const c = a.campaign;
      L.push(`   • "${c.name}": ${brl(a.cost)} | ${int(c.clicks)} cliques | CTR ${pct(c.ctr)} | ${int(c.conversions)} conv${a.cpa !== null ? ` | CPA ${brl(a.cpa)}` : ""}`);
      for (const r of a.recs.sort((x, y) => y.severity - x.severity)) {
        L.push(`     💡 ${r.text}`);
      }
      if (a.recs.length === 0) L.push("     ✅ desempenho saudável, manter e escalar aos poucos.");
    }
  }

  // Outras campanhas (não classificadas nos 4 objetivos)
  const outros = analyses.filter(a => a.goal === "outros");
  if (outros.length) {
    L.push("");
    L.push("📁 Outras campanhas");
    for (const a of outros) {
      const c = a.campaign;
      L.push(`   • "${c.name}": ${brl(a.cost)} | ${int(c.conversions)} conv`);
    }
  }

  // Top oportunidades (ordenadas por severidade)
  const allRecs = analyses.flatMap(a => a.recs.map(r => ({ ...r, name: a.campaign.name })));
  allRecs.sort((x, y) => y.severity - x.severity);
  const coverageGaps = GOALS.filter(g => !analyses.some(a => a.goal === g.key));
  if (allRecs.length || coverageGaps.length) {
    L.push("");
    L.push("*🎯 Principais oportunidades:*");
    let n = 1;
    for (const g of coverageGaps) {
      L.push(`${n++}. Criar campanha para *${g.label.replace(/^[^ ]+ /, "")}* (nenhuma ativa hoje).`);
    }
    for (const r of allRecs.slice(0, Math.max(0, 6 - coverageGaps.length))) {
      L.push(`${n++}. [${r.name}] ${r.text}`);
    }
  }

  L.push("");
  L.push("_Análise automática da Ana. Ajustes finos e criação de campanha devem ser validados por quem gerencia a conta._");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Dados SIMULADOS (modo teste) — exercitam todas as recomendações e a lacuna
// de cobertura (não há campanha de lentes esclerais/ceratocone).
// ---------------------------------------------------------------------------
function mockCampaigns() {
  return [
    {
      id: "1001", name: "Consulta Oftalmológica - Brasília", channel: "SEARCH",
      impressions: 8200, clicks: 420, ctr: 0.0512, costMicros: 1180 * 1e6,
      conversions: 22, avgCpcMicros: 2.81 * 1e6,
      searchImpressionShare: 0.62, searchBudgetLostIS: 0.18, searchRankLostIS: 0.20,
    },
    {
      id: "1002", name: "Cirurgia Refrativa LASIK/PRK", channel: "SEARCH",
      impressions: 5400, clicks: 130, ctr: 0.0241, costMicros: 980 * 1e6,
      conversions: 2, avgCpcMicros: 7.54 * 1e6,
      searchImpressionShare: 0.40, searchBudgetLostIS: 0.05, searchRankLostIS: 0.35,
    },
    {
      id: "1003", name: "Catarata - Avaliação", channel: "SEARCH",
      impressions: 3100, clicks: 88, ctr: 0.0284, costMicros: 620 * 1e6,
      conversions: 0, avgCpcMicros: 7.05 * 1e6,
      searchImpressionShare: 0.48, searchBudgetLostIS: 0.08, searchRankLostIS: 0.22,
    },
    // Sem campanha de ceratocone/lentes esclerais → gera recomendação de cobertura.
  ];
}

// ---------------------------------------------------------------------------
// Consulta REAL à Google Ads API (lazy-require: só carrega a lib em produção
// e nunca derruba o app se a lib faltar ou a chamada falhar).
// ---------------------------------------------------------------------------
async function fetchRealCampaigns() {
  let GoogleAdsApi;
  try {
    ({ GoogleAdsApi } = require("google-ads-api"));
  } catch (e) {
    console.error("[GoogleAds] Pacote 'google-ads-api' não instalado — rode `npm i google-ads-api`. Detalhe:", e.message);
    return null;
  }
  try {
    // Sanidade das credenciais antes de chamar (evita erro genérico da lib).
    const required = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
      lastApiError = { text: `credenciais ausentes: ${missing.join(", ")}`, requestId: undefined };
      console.error("[GoogleAds] ❌ Não posso chamar a API — " + lastApiError.text);
      return null;
    }
    console.log(
      `[GoogleAds] Tentando chamada REAL — customer_id=${mask(process.env.GOOGLE_ADS_CUSTOMER_ID)} ` +
      `login_customer_id=${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? mask(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) : "(nenhum)"} ` +
      `dev_token=${mask(process.env.GOOGLE_ADS_DEVELOPER_TOKEN)} refresh_token=${mask(process.env.GOOGLE_ADS_REFRESH_TOKEN)}`
    );
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });
    const customer = client.Customer({
      customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    });
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.cost_micros,
        metrics.average_cpc,
        metrics.conversions,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date DURING LAST_7_DAYS
    `);
    lastApiError = null;
    console.log(`[GoogleAds] ✅ API REAL respondeu com sucesso: ${rows.length} campanha(s) ENABLED nos últimos 7 dias.`);
    return rows.map(r => ({
      id: String(r.campaign.id),
      name: r.campaign.name,
      channel: r.campaign.advertising_channel_type === 2 || r.campaign.advertising_channel_type === "SEARCH" ? "SEARCH" : String(r.campaign.advertising_channel_type),
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      ctr: Number(r.metrics.ctr || 0),
      costMicros: Number(r.metrics.cost_micros || 0),
      conversions: Number(r.metrics.conversions || 0),
      avgCpcMicros: Number(r.metrics.average_cpc || 0),
      searchImpressionShare: Number(r.metrics.search_impression_share || 0),
      searchBudgetLostIS: Number(r.metrics.search_budget_lost_impression_share || 0),
      searchRankLostIS: Number(r.metrics.search_rank_lost_impression_share || 0),
    }));
  } catch (e) {
    const d = describeAdsError(e);
    lastApiError = d;
    console.error(`[GoogleAds] ❌ Falha na chamada REAL à API: ${d.text}` + (d.requestId ? ` (request_id=${d.requestId})` : ""));
    try {
      // Dump bruto (limitado) para diagnóstico fino no log do Render.
      console.error("[GoogleAds] Erro bruto:", JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 2000));
    } catch (_) {}
    return null;
  }
}

async function fetchCampaigns() {
  if (isTestMode()) {
    lastFetchDiag = { source: "mock-teste", error: null, count: 0, reason: testModeReason() };
    console.log(`[GoogleAds] Modo TESTE (dados simulados) — motivo: ${lastFetchDiag.reason}.`);
    return mockCampaigns();
  }
  const real = await fetchRealCampaigns();
  if (!real) {
    lastFetchDiag = { source: "mock-fallback", error: lastApiError, count: 0, reason: "chamada real falhou" };
    console.error("[GoogleAds] ⚠️ Consulta real falhou — usando dados simulados como FALLBACK. Erro: " +
      (lastApiError?.text || "desconhecido"));
    return mockCampaigns();
  }
  lastFetchDiag = { source: "real", error: null, count: real.length, reason: null };
  return real;
}

// ---------------------------------------------------------------------------
// Envio pelo WhatsApp (divide em partes se passar do limite)
// ---------------------------------------------------------------------------
async function sendLongWhatsApp(sendWhatsApp, to, text, limit = 3500) {
  if (text.length <= limit) { await sendWhatsApp(to, text); return; }
  const lines = text.split("\n");
  let buf = "";
  for (const ln of lines) {
    if ((buf + "\n" + ln).length > limit) {
      await sendWhatsApp(to, buf);
      buf = ln;
    } else {
      buf = buf ? buf + "\n" + ln : ln;
    }
  }
  if (buf) await sendWhatsApp(to, buf);
}

// ---------------------------------------------------------------------------
// Ponto de entrada: gera e envia o relatório
// deps = { supabase, sendWhatsApp }
// ---------------------------------------------------------------------------
async function runWeeklyReport(deps) {
  const { sendWhatsApp } = deps;
  try {
    const campaigns = await fetchCampaigns();
    const report = buildReport(campaigns);
    await sendLongWhatsApp(sendWhatsApp, REPORT_NUMBER, report);
    console.log(`[GoogleAds] Relatório enviado para ${REPORT_NUMBER} (modo ${isTestMode() ? "TESTE" : "PRODUÇÃO"}).`);
    return report;
  } catch (e) {
    console.error("[GoogleAds] Erro ao gerar/enviar relatório:", e.message);
    try { await sendWhatsApp(REPORT_NUMBER, "⚠️ Não consegui gerar o relatório do Google Ads agora. Verifique os logs."); } catch (_) {}
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agendador semanal: toda segunda-feira, a partir das 08h (Brasília).
// Persiste a data do último envio em settings (ads_last_report) para não
// duplicar em reinícios do servidor. Verifica a cada 30 min.
// ---------------------------------------------------------------------------
async function getLastRun(supabase) {
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", "ads_last_report").single();
    return data?.value || null;
  } catch (_) { return null; }
}
async function setLastRun(supabase, value) {
  try { await supabase.from("settings").upsert({ key: "ads_last_report", value }); } catch (_) {}
}

function startScheduler(deps) {
  const { supabase } = deps;
  const check = async () => {
    try {
      const now = new Date();
      const brasilia = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
      const dow = brasilia.getDay();   // 0 = domingo, 1 = segunda
      const hour = brasilia.getHours();
      const today = now.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
      if (dow !== 1 || hour < 8) return;
      const last = await getLastRun(supabase);
      if (last === today) return;
      console.log("[GoogleAds] Disparando relatório semanal automático...");
      await runWeeklyReport(deps);
      // Rede de segurança: reprocessa conversões pendentes que não subiram no
      // envio em tempo real (ex.: API fora do ar no momento do "Agendou").
      try {
        const up = await uploadClickConversions(deps);
        console.log(`[GoogleAds] Rede de segurança de conversões: ${up.uploaded} enviada(s), ${up.failed} falha(s), ${up.pending} pendente(s).`);
      } catch (e) {
        console.error("[GoogleAds] Rede de segurança de conversões falhou:", e.message);
      }
      await setLastRun(supabase, today);
    } catch (e) {
      console.error("[GoogleAds] Scheduler:", e.message);
    }
  };
  setInterval(check, 30 * 60 * 1000);
  check(); // checa uma vez no startup
  console.log(`[GoogleAds] Agendador semanal ativo (segunda 08h ${TZ}) — modo ${isTestMode() ? "TESTE" : "PRODUÇÃO"}.`);
}

// ===========================================================================
// UPLOAD DE CONVERSÕES OFFLINE → Google Ads (fecha o ciclo de rastreamento)
//
// Fluxo completo:
//   landing /lp/:tema captura gclid → token viaja no [ref:...] da msg do WhatsApp
//   → Ana vincula token ao telefone/conversa → secretária clica "Agendou" no
//   painel (booked=true) → ESTE módulo envia a conversão offline ao Google Ads
//   (UploadClickConversions) e marca reported=true para não duplicar.
//
// Requer as MESMAS credenciais do relatório + a ação de conversão "Agendamento
// IOBB" criada na conta (tipo "Importar de cliques"). O resource name da ação é
// resolvido automaticamente pelo NOME (GOOGLE_ADS_CONVERSION_NAME) — sem hardcode.
// ===========================================================================

// Nome da ação de conversão a procurar na conta (env vence o default).
const CONVERSION_NAME = (process.env.GOOGLE_ADS_CONVERSION_NAME || "Agendamento IOBB").trim();
// Valor padrão da conversão quando a linha não tem conversion_value.
const CONVERSION_DEFAULT_VALUE = Number(process.env.GOOGLE_ADS_CONVERSION_VALUE || 200);

// Cria o objeto Customer da google-ads-api reaproveitando as env vars.
// Lança erro claro se faltar credencial (nunca derruba o app — quem chama trata).
function buildCustomer() {
  let GoogleAdsApi;
  try {
    ({ GoogleAdsApi } = require("google-ads-api"));
  } catch (e) {
    throw new Error("pacote 'google-ads-api' não instalado (rode `npm i google-ads-api`)");
  }
  const required = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error("credenciais ausentes: " + missing.join(", "));
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });
  return client.Customer({
    customer_id: String(process.env.GOOGLE_ADS_CUSTOMER_ID).replace(/-/g, ""),
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/-/g, "") : undefined,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });
}

// Formata uma data no padrão exigido pela API: "yyyy-MM-dd HH:mm:ss+HH:mm"
// (data/hora no fuso da conta + offset explícito). Ex.: "2026-07-07 14:30:00-03:00".
function formatConversionDateTime(date, tz = TZ) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const g = t => (p.find(x => x.type === t) || {}).value;
  // Offset real do fuso naquela data (Brasil hoje = -03:00, sem horário de verão).
  let offset = "-03:00";
  try {
    const on = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(date).find(x => x.type === "timeZoneName")?.value;
    if (on) {
      const raw = on.replace("GMT", "").replace("UTC", "").trim(); // "-03:00" ou "" p/ UTC
      offset = raw === "" ? "+00:00" : raw;
    }
  } catch (_) {}
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}${offset}`;
}

// Lista todas as ações de conversão da conta (para descoberta/diagnóstico).
async function listConversionActions() {
  const customer = buildCustomer();
  const rows = await customer.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.resource_name,
      conversion_action.status,
      conversion_action.type
    FROM conversion_action
    ORDER BY conversion_action.name
  `);
  return rows.map(r => ({
    id: String(r.conversion_action.id),
    name: r.conversion_action.name,
    resourceName: r.conversion_action.resource_name,
    status: r.conversion_action.status,
    type: r.conversion_action.type,
  }));
}

// Resolve (e memoiza) o resource name da ação "Agendamento IOBB" pelo NOME.
let cachedConversionActionRN = null;
async function resolveConversionActionResourceName(customer) {
  if (cachedConversionActionRN) return cachedConversionActionRN;
  const c = customer || buildCustomer();
  const rows = await c.query(`
    SELECT conversion_action.name, conversion_action.resource_name, conversion_action.status
    FROM conversion_action
  `);
  const wanted = CONVERSION_NAME.toLowerCase();
  const match =
    rows.find(r => (r.conversion_action.name || "").trim().toLowerCase() === wanted) ||
    rows.find(r => (r.conversion_action.name || "").toLowerCase().includes(wanted));
  if (!match) {
    const nomes = rows.map(r => `"${r.conversion_action.name}"`).join(", ") || "(nenhuma)";
    throw new Error(`ação de conversão "${CONVERSION_NAME}" não encontrada na conta. Disponíveis: ${nomes}. Ajuste GOOGLE_ADS_CONVERSION_NAME.`);
  }
  cachedConversionActionRN = match.conversion_action.resource_name;
  console.log(`[AdsConv] Ação de conversão resolvida: "${match.conversion_action.name}" → ${cachedConversionActionRN}`);
  return cachedConversionActionRN;
}

// Envia ao Google Ads todas as conversões pendentes (booked=true, reported=false,
// gclid != null) e marca as enviadas com sucesso como reported=true.
// deps = { supabase, dryRun? }. Retorna um resumo estruturado.
async function uploadClickConversions(deps) {
  const { supabase, dryRun = false } = deps;
  const result = {
    ok: false, mode: isTestMode() ? "test" : "prod",
    pending: 0, uploaded: 0, failed: 0, conversionAction: null,
    error: null, details: [], dryRun: !!dryRun,
  };

  if (isTestMode()) {
    result.error = `MODO TESTE (${testModeReason()}) — upload de conversões desabilitado.`;
    console.log("[AdsConv] " + result.error);
    return result;
  }

  // 1) Buscar pendentes.
  let pend;
  try {
    const { data, error } = await supabase.from("ad_clicks")
      .select("id, gclid, booked_at, clicked_at, conversion_value")
      .eq("booked", true).eq("reported", false).not("gclid", "is", null);
    if (error) throw new Error(error.message);
    pend = (data || []).filter(r => r.gclid);
  } catch (e) {
    result.error = "falha ao ler ad_clicks: " + e.message;
    console.error("[AdsConv] ❌ " + result.error);
    return result;
  }
  result.pending = pend.length;
  if (!pend.length) {
    result.ok = true;
    console.log("[AdsConv] Nenhuma conversão pendente para enviar.");
    return result;
  }

  // 2) Cliente + resource name da ação de conversão.
  let customer, actionRN;
  try {
    customer = buildCustomer();
    actionRN = await resolveConversionActionResourceName(customer);
  } catch (e) {
    result.error = e.message;
    console.error("[AdsConv] ❌ " + result.error);
    return result;
  }
  result.conversionAction = actionRN;

  // 3) Montar as conversões (índice alinhado com `pend`).
  const conversions = pend.map(r => ({
    gclid: r.gclid,
    conversion_action: actionRN,
    conversion_date_time: formatConversionDateTime(new Date(r.booked_at || r.clicked_at)),
    conversion_value: Number(r.conversion_value ?? CONVERSION_DEFAULT_VALUE),
    currency_code: "BRL",
  }));

  // 4) Enviar (partial_failure: sucessos passam mesmo se algumas linhas falharem).
  let response;
  try {
    response = await customer.conversionUploads.uploadClickConversions({
      customer_id: String(process.env.GOOGLE_ADS_CUSTOMER_ID).replace(/-/g, ""),
      conversions,
      partial_failure: true,
      validate_only: !!dryRun,
    });
  } catch (e) {
    const d = describeAdsError(e);
    result.error = d.text + (d.requestId ? ` (request_id=${d.requestId})` : "");
    console.error("[AdsConv] ❌ Falha total no upload: " + result.error);
    return result;
  }

  // 5) Determinar sucesso por índice. Com partial_failure, os results das linhas
  // que falharam voltam vazios (sem gclid); as bem-sucedidas ecoam o gclid.
  // Tolerante a snake_case/camelCase (depende do parser da lib/gRPC).
  const results = response?.results || [];
  const pfErr = response?.partial_failure_error || response?.partialFailureError;
  const pfMsg = pfErr?.message || "";
  const okIds = [];
  // Sem partial_failure_error, o contrato da API garante que TODAS passaram.
  // Com erro parcial, distinguimos vencedoras (result ecoa os campos) das que
  // falharam (result vazio).
  const allSucceeded = !pfErr;
  pend.forEach((r, i) => {
    const res = results[i] || {};
    const success = allSucceeded || !!(res.gclid || res.conversion_date_time || res.conversionDateTime || res.conversion_action || res.conversionAction);
    const gshort = (r.gclid || "").slice(0, 14) + "…";
    if (success) {
      result.uploaded++;
      okIds.push(r.id);
      result.details.push({ ok: true, gclid: r.gclid, msg: "enviada" });
      console.log(`[AdsConv] ✅ ${gshort} enviada (${conversions[i].conversion_date_time}, ${conversions[i].conversion_value} BRL).`);
    } else {
      result.failed++;
      result.details.push({ ok: false, gclid: r.gclid, msg: pfMsg || "recusada pela API" });
      console.error(`[AdsConv] ❌ ${gshort} recusada${pfMsg ? ": " + pfMsg : ""}.`);
    }
  });

  // 6) Marcar as enviadas como reported (a não ser em dry-run/validate_only).
  if (okIds.length && !dryRun) {
    try {
      await supabase.from("ad_clicks").update({ reported: true, reported_at: new Date() }).in("id", okIds);
    } catch (e) {
      console.error("[AdsConv] ⚠️ Enviei ao Google mas falhei ao marcar reported:", e.message);
      result.error = (result.error ? result.error + " | " : "") + "enviado, mas falha ao marcar reported: " + e.message;
    }
  }

  result.ok = result.failed === 0;
  console.log(`[AdsConv] Concluído: ${result.uploaded} enviada(s), ${result.failed} falha(s) de ${result.pending} pendente(s)${dryRun ? " [DRY-RUN]" : ""}.`);
  return result;
}

// Monta um resumo curto do upload para envio pelo WhatsApp (comando #ADSCONV).
function buildConversionUploadSummary(r) {
  if (!r) return "⚠️ Upload de conversões: sem resultado.";
  const L = [];
  L.push("📤 *Upload de conversões — Google Ads IOBB*");
  if (r.mode === "test") { L.push(`🧪 _${r.error || "MODO TESTE — nada enviado."}_`); return L.join("\n"); }
  if (r.dryRun) L.push("🧪 _DRY-RUN (validate_only) — nada foi contabilizado._");
  L.push(`📋 Pendentes: ${r.pending}`);
  L.push(`✅ Enviadas: ${r.uploaded}`);
  if (r.failed) L.push(`❌ Falhas: ${r.failed}`);
  if (r.conversionAction) L.push(`🎯 Ação: ${r.conversionAction}`);
  if (r.error) L.push(`⚠️ ${r.error}`);
  return L.join("\n");
}

module.exports = {
  runWeeklyReport, startScheduler, buildReport, analyzeCampaign, isTestMode, REPORT_NUMBER,
  uploadClickConversions, buildConversionUploadSummary, listConversionActions,
  resolveConversionActionResourceName,
};
