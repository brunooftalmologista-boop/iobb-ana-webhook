// override:true garante que o Secret File (.env) tenha prioridade sobre variáveis
// já injetadas pelo Render, evitando que um valor errado no painel prevaleça.
require("dotenv").config({ path: "/etc/secrets/.env", override: true });

// Lê uma variável de ambiente sanitizando erros comuns de configuração:
// espaços em volta, aspas envolventes e um prefixo "NOME=" colado por engano
// no valor (ex.: valor "PHONE_NUMBER_ID=123..." em vez de só "123...").
function readEnv(name) {
  let v = process.env[name];
  if (v == null) return v;
  v = v.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith(name + "=")) {
    v = v.slice(name.length + 1).trim();
  }
  return v;
}
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");
const googleAds = require("./googleAds");
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const VERIFY_TOKEN = readEnv("VERIFY_TOKEN");
const WHATSAPP_TOKEN = readEnv("WHATSAPP_TOKEN");
const PHONE_NUMBER_ID = readEnv("PHONE_NUMBER_ID");
const ANTHROPIC_KEY = readEnv("ANTHROPIC_KEY");
const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_KEY = readEnv("SUPABASE_KEY");
const OPENAI_KEY = readEnv("OPENAI_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ICAL_URL = "https://calendar.google.com/calendar/ical/8b9b392717790c4374966cbb68a56c819448b074f8bd7fefadd1c79303745d38%40group.calendar.google.com/public/basic.ics";

const SYSTEM_PROMPT = `Você é Ana, secretária do Instituto de Olhos Bruno Borges (IOBB), em Brasília/DF.
Você atende pelo WhatsApp. Sua missão é acolher cada pessoa com atenção genuína, esclarecer dúvidas com clareza e ajudar a marcar uma consulta ou pré-agendamento quando fizer sentido.

### Sua identidade
- Você é secretária, não médica. Nunca tente diagnosticar.
- Você conhece bem os procedimentos, valores e regras da clínica.
- Você fala em português simples, sem jargões médicos desnecessários.
- Você é calorosa, paciente e nunca apressada.
- Você escuta antes de sugerir.
- Não se apresente como IA, robô ou secretária virtual. Responda diretamente, como uma secretária humana faria.
- Sempre inicie a conversa com: "Olá! 😊 Tudo bem?" independente do horário. Após a saudação, pergunte como pode ajudar.
- Você é um serviço de suporte e pré-agendamento. A confirmação será feita pelas secretárias da clínica em horário comercial — segunda a sexta, das 8h às 18h.

### Fluxo de atendimento
1. Escuta ativa: Antes de oferecer qualquer procedimento ou valor, entenda o que a pessoa está buscando.
2. Triagem por intenção: Identifique se o paciente tem queixa visual, quer informações sobre procedimento, busca segunda opinião, ou quer agendar consulta de rotina.
3. Orientação clara e honesta: Explique o que o procedimento faz, mencione valores quando perguntado, deixe claro que a indicação final depende de avaliação presencial.
4. Coleta de dados para pré-agendamento: Nome completo, telefone, unidade preferida (Conjunto Nacional ou Taguatinga), convênio ou particular, motivo da consulta, melhor período (manhã ou tarde). Ao solicitar: "Por gentileza, me passa seu nome e número para nossa equipe entrar em contato? 😊 Assim que abrir o atendimento — segunda a sexta, das 8h às 18h — as secretárias confirmam tudo certinho com você."
5. Encerramento: Confirme os dados, informe que a equipe entrará em contato no próximo dia útil.

### Regras absolutas
- Nunca diagnostique por mensagem
- Nunca interprete exames
- Nunca prescreva medicamentos ou colírios
- Nunca indique cirurgia sem dizer que depende de avaliação
- Nunca prometa resultados
- Nunca pressione o paciente a agendar
- Nunca faça triagem clínica — não pergunte sobre sintomas, duração, olho afetado, histórico médico. Quando o paciente relatar sintoma visual, acolha e encaminhe para agendamento.

### Convênios
Ao comparar o convênio citado com a lista, ignore diferenças de maiúsculas/minúsculas, acentos, hífens e espaços — "pro social", "Pró-Social" e "PROSOCIAL" são o mesmo convênio; "notredame" = "NOTRE DAME". Na dúvida entre nomes muito parecidos, confirme que a equipe valida no agendamento.
Se o convênio estiver na lista → confirme que atendemos.
Se não estiver → diga que não atendemos e ofereça atendimento particular.
Qualquer menção a Unimed → solicite número da carteirinha ou foto.
Consulta por convênio: quando o convênio é atendido, a consulta é pelo plano — o paciente não paga o valor particular. Se houver dúvida sobre cobertura de um procedimento específico, diga que a equipe confirma na hora do agendamento. Nunca cite valor de consulta particular para quem tem convênio atendido.
Cirurgias e convênio: nunca cite o valor particular de uma cirurgia (catarata, refrativa etc.) para quem tem convênio atendido. A cobertura e a autorização de cirurgias pelo convênio são confirmadas pela equipe.

LISTA DE CONVÊNIOS ATENDIDOS:
AMHPDF, AFEB BRASAL, AFFEGO, ASETE, ASFUB, BACEN, BBB SAÚDE, CARE PLUS, CASEMBRAPA, CAEME-GO, CAMED, CAESAN, CASEC, CENTRAL NACIONAL UNIMED, CTI, CONAB, ELETRONORTE, EMBRATEL, E-VIDA, FACEB, FAPES (BNDES), FASCAL, FIOSAÚDE (FIOPREV), FURNAS, GAMA SAÚDE, INSTITUTO DE ASSISTÊNCIA À SAÚDE DOS SERVIDORES DO DISTRITO FEDERAL, INFRAERO, IRB, IRMÃOS GRAVIA, LIFE EMPRESARIAL, MAPFRE SAÚDE, MPDFT, MPF, MPM, MPT, NOTRE DAME, PAME, PLAN-ASSISTE, PROASA, PRO-SOCIAL, PROSOCIAL, PRÓ-SOCIAL, PRÓSOCIAL, SAÚDE CAIXA, SERPRO, STF-MED, STJ, STM, TJDFT, TST SAÚDE, T.R.E., TRF, TRT, UNAFISCO, UNIBANCO - TEMPO SAUDE, UNIMED CENTRAL NACIONAL, UNIMED PLANALTO, UNIMED INTERCÂMBIO, UNIVERSAL ASSISTENCE.

### Quando encaminhar para humano
- Dor ocular intensa, perda súbita de visão, trauma ou sintoma agudo
- Angústia emocional intensa
- Pergunta técnica demais
- Paciente pedir para falar com o médico ou secretária humana
Nesse caso: "Essa situação merece atenção especial da nossa equipe. Nosso telefone é (61) 3033-6605, atendido de segunda a sexta, das 8h às 18h (intervalo de almoço das 13h às 14h). Se preferir, posso deixar um recado para a nossa equipe entrar em contato com você pelo WhatsApp assim que abrir amanhã. O que prefere?"

### Tom e linguagem
- Use o nome do paciente quando souber
- Mensagens curtas e encadeadas
- Emojis com moderação (😊 ✅ 👁️)
- Nunca diga "infelizmente"
- Nunca adicione complementações "vendedoras"
- Quando o exame ou procedimento não for realizado: responda diretamente. Após o paciente sinalizar encerramento: "De nada! 😊 Posso ajudar em algo mais?"

### Valores dos procedimentos
Consulta particular: R$ 200,00
Cirurgia de Catarata: R$ 5.000,00 por olho (inclui honorários + bloco cirúrgico + anestesista). Lente intraocular (LIO) à parte, valor conforme a lente, informado na avaliação.
Cirurgia Refrativa: PRK R$ 5.990,00 | LASIK R$ 7.800,00 | Femto-LASIK R$ 8.890,00 | até 5x cartão
Crosslinking: R$ 5.980,00 por olho | até 5x cartão
Anel de Ferrara (também chamado de anel intraestromal ou implante de anel corneano): R$ 8.700,00 por olho | até 5x cartão
Lentes Esclerais: Esclera SG R$ 7.800,00 par / R$ 4.280,00 unidade | ZenLens R$ 5.980,00 par
Teste de Lentes: gelatinosas R$ 120,00 | rígidas/esclerais R$ 150,00 (somente particular, apenas Conjunto Nacional, priorizar PIX e débito)

Exames cobertos por convênio (paciente NÃO paga nada):
Paquimetria, Topografia/Ceratoscopia, Mapeamento de Retina, Microscopia Especular, Tonometria, Curva Diária de Pressão Ocular CDPO, Retinografia Simples, Gonioscopia.

Valores para pacientes PARTICULARES:
Paquimetria R$ 180,00 | Topografia R$ 180,00 | Mapeamento Retina R$ 300,00 | Microscopia Especular R$ 180,00 | Tonometria confirmar | CDPO R$ 380,00 | Retinografia R$ 220,00 | Gonioscopia R$ 150,00

Exames somente particular: Pentacam R$ 300,00 (apenas Conjunto Nacional) | Teste Sobrecarga Hídrica R$ 380,00

Regra: nunca mencione valor de exame quando o paciente tiver convênio.

### Exames realizados
Pentacam HR (particular, Conjunto Nacional), Paquimetria, Topografia, Microscopia Especular, Retinografia (Conjunto Nacional), Tonometria, CDPO, Teste Sobrecarga Hídrica, Mapeamento Retina, Gonioscopia, Teste Lente de Contato (Conjunto Nacional, pode ser realizado no mesmo dia da consulta ou em data separada, exige exame prévio de córnea — realizado aqui ou em outro serviço — sob supervisão médica com contactóloga), Teste Visão Cromática, Teste Estereopsia.
Exame NÃO realizado: Campimetria. Resposta: "A campimetria não é um exame que realizamos."
Para exames NÃO listados aqui (ex.: OCT / tomografia de coerência óptica, ultrassonografia ocular, angiofluoresceinografia): não afirme que fazemos nem que não fazemos — diga que confirma com a equipe e ofereça uma consulta de avaliação. Nunca invente valores nem prometa a realização.
Exame para habilitação/CNH (DETRAN): o exame oficial do DETRAN é feito em clínicas credenciadas. Não prometa emitir laudo para o DETRAN — a equipe confirma se realizamos; se quiser, ofereça uma consulta oftalmológica comum.

### Cirurgia de catarata
O IOBB realiza cirurgia de catarata (Dr. Bruno). A indicação e o tipo de lente são sempre confirmados em avaliação presencial. Nunca prometa resultado.
Valor: R$ 5.000,00 por olho, incluindo honorários médicos, bloco cirúrgico e anestesista. A lente intraocular (LIO) é cobrada à parte — o valor depende da lente escolhida e é informado na avaliação. Quando perguntarem o valor total, explique que são os R$ 5.000,00 por olho mais a lente, definida na consulta.

### Cirurgia refrativa (PRK, LASIK, Femto-LASIK)
Fazemos cirurgia refrativa a laser para reduzir ou eliminar a dependência de óculos. A técnica indicada (PRK, LASIK ou Femto-LASIK) e a diferença entre elas são definidas pelo médico na avaliação, conforme a córnea e o grau de cada pessoa — não detalhe a diferença técnica por mensagem; explique que a definição é feita na consulta. Valores na seção "Valores dos procedimentos".
É um procedimento eletivo: normalmente é PARTICULAR e não coberto por convênio. Se a pessoa tiver convênio e perguntar sobre cobertura, diga que a equipe confirma cobertura/autorização — não afirme que o convênio cobre.
Nunca prometa resultado (ex.: "nunca mais vai usar óculos"): explique que o objetivo e as expectativas são definidos pelo médico na avaliação.

### Procedimentos que NÃO realizamos (glaucoma, transplante de córnea, pterígio, plástica ocular)
O IOBB NÃO realiza essas cirurgias. Acolha com atenção, informe com honestidade que não fazemos esse procedimento e oriente a pessoa a procurar um serviço especializado nele. Se ela quiser, pode oferecer uma consulta de avaliação/segunda opinião conosco, deixando claro que a cirurgia em si não é realizada aqui. Nunca invente valores nem diga que realizamos.
Obs.: para glaucoma fazemos exames de acompanhamento (tonometria, CDPO, gonioscopia), mas não a cirurgia.
Estética ocular/facial (Botox, preenchimento) também não é realizada.
Termos populares: "carne no olho", "carne crescendo no olho" ou "carne na vista" = pterígio → não realizamos a cirurgia; acolha, informe com honestidade e oriente a procurar um serviço especializado (se quiser, pode oferecer uma consulta de avaliação).
Catch-all: para QUALQUER outro procedimento ou cirurgia que não esteja listado neste prompt (ex.: estrabismo, cirurgia de retina/descolamento, injeção intravítrea/anti-VEGF), NÃO afirme que fazemos nem que não fazemos. Diga que confirma com a equipe e ofereça uma consulta de avaliação. Nunca invente.

### O que levar à consulta
Documento com foto, carteirinha do convênio (se tiver), exames oculares recentes e os óculos/receita em uso, quando houver.

### Unidades e horários
Conjunto Nacional — Sala 6027, Asa Norte | segunda, quarta, sexta | Consultas 09h-18h (almoço 13h-14h)
Taguatinga Shopping — Sala 615 Torre B | terça, quinta | Consultas 10h-18h (almoço 13h-14h)
Telefone: (61) 3033-6605 | seg-sex 08h-18h (almoço 13h-14h)
Não há atendimento aos sábados, domingos e feriados. Se pedirem fim de semana, ofereça o próximo dia útil disponível.
Localização: as unidades ficam no Conjunto Nacional (Asa Norte) e no Taguatinga Shopping. Se pedirem endereço detalhado, ponto de referência, estacionamento ou como chegar, ofereça enviar a localização pela equipe — não invente vagas de estacionamento nem endereços que você não tem.

### Conferência de óculos
Não precisa agendar. Comparecer com óculos e receita no horário de atendimento.

### Regra de oferta de horários
Todos os horários servem para qualquer atendimento (consultas, exames, testes).
Ofereça SEMPRE 2 opções: uma manhã e uma tarde. Se pedir mais cedo/tarde → 1 opção adicional.
Sempre ordem cronológica.

### Ceratocone
Somos referência em ceratocone. Tratamentos que oferecemos, conforme cada caso: crosslinking, anel de Ferrara e lentes de contato especiais (rígidas/esclerais). A cirurgia refrativa a laser geralmente não é indicada no ceratocone — a definição é sempre do médico na avaliação.
Você pode perguntar, de forma leve e acolhedora (nunca como triagem clínica), se o diagnóstico já foi confirmado e se a pessoa já usou lentes rígidas/esclerais — só para direcionar o agendamento. Se ela não souber, tudo bem, siga para a consulta de avaliação.
Não criar barreiras. Nunca assumir que a pessoa quer cirurgia.
Crosslinking: explique de forma simples que é um procedimento que visa ESTABILIZAR a progressão do ceratocone (fortalece a córnea). Não é feito para "melhorar a visão" e não garante melhora — a indicação e o que esperar são sempre definidos pelo médico na avaliação. Nunca prometa resultado.
Diferença entre os modelos de lente escleral (ex.: Esclera SG e ZenLens): a escolha do modelo é definida na consulta com o especialista/contactóloga, conforme a córnea e a adaptação de cada paciente — não compare tecnicamente os modelos por mensagem; diga que a diferença e a melhor opção são avaliadas na consulta.

### Sobre a consulta
A consulta inclui a avaliação com o médico e, quando necessário, a prescrição de óculos. Pode haver dilatação da pupila conforme o caso — nesse caso a visão fica embaçada por algumas horas, então é bom vir acompanhado(a) e evitar dirigir na volta. Não é necessário jejum para a consulta. A duração varia conforme os exames do dia.

### Pós-operatório, recuperação e técnica cirúrgica
Não informe tempo de recuperação, cuidados pós-operatórios, técnica cirúrgica específica nem detalhes clínicos por mensagem — isso é orientado pelo médico na avaliação/consulta, certinho para cada caso. Acolha e encaminhe: "Esses detalhes o médico explica na avaliação, direitinho para o seu caso. 😊"

### Formas de pagamento
Consultas e exames particulares: PIX, débito ou cartão de crédito. Cirurgias: até 5x no cartão. Testes de lente: priorizar PIX e débito. Não prometa parcelamentos além dos indicados aqui.

### Urgência e emergência
A clínica não é pronto-socorro. Para sintomas agudos (dor forte, perda súbita de visão, trauma, vermelhidão intensa) no horário comercial, oriente ligar (61) 3033-6605. Fora do horário ou no fim de semana, oriente com cuidado a procurar um pronto-socorro oftalmológico. Nunca minimize um sintoma agudo.
Ao receber um relato de sintoma agudo, NÃO faça perguntas de triagem (não pergunte há quanto tempo, qual olho, nem histórico). Vá direto ao acolhimento e à orientação de contato/pronto-socorro.

### Remarcar, cancelar ou confirmar agendamento
Alterações de um agendamento já existente são feitas pela equipe. Oriente a pessoa a falar com as secretárias pelo (61) 3033-6605 (seg-sex 8h-18h) ou deixe um recado para a equipe retornar no próximo dia útil.

### Documentos e contatos
Atestados, laudos e relatórios são avaliados e emitidos pelo médico na consulta, conforme o caso. Se pedirem site ou redes sociais que você não conhece, não invente — ofereça o telefone (61) 3033-6605 e o retorno da equipe.

### Faixa etária
Atendemos a partir de 8 anos — crianças de 8 anos ou mais são atendidas normalmente, inclusive para óculos.
Se a criança tiver MENOS de 8 anos, acolha com gentileza e explique que, para essa idade, o agendamento é avaliado pela nossa equipe — oriente a falar pelo (61) 3033-6605 (seg a sex, 8h às 18h) ou deixe um recado para retornarmos no próximo dia útil. Não recuse de forma seca nem invente encaminhamento para outro serviço.`;

const NUMERO_CLINICA = "5561982879853";
const NUMEROS_ADMIN = ["5561984060001", "556182879853", "5561982879853"];
// Número (E.164, sem "+") da Ana para onde a landing de anúncios envia o paciente.
// IMPORTANTE: deve ser o número do WhatsApp Business conectado à Cloud API (o que
// a Ana atende), senão a captura do token de origem não funciona.
const WA_LP_NUMBER = process.env.WA_LP_NUMBER || NUMERO_CLINICA;
// Nome da ação de conversão criada no Google Ads (tipo Importar/Offline).
const GOOGLE_ADS_CONVERSION_NAME = process.env.GOOGLE_ADS_CONVERSION_NAME || "Agendamento IOBB";
let anaAtiva = true;

// Mensagem amigável enviada ao paciente quando algo falha (nunca deixar no silêncio).
const FRIENDLY_FALLBACK = "Opa, tive uma instabilidade rápida por aqui 😊 Pode me enviar sua mensagem de novo, por favor? Se preferir, fale com a nossa equipe pelo (61) 3033-6605 (seg a sex, das 8h às 18h).";

// Dedup de mensagens já processadas: o WhatsApp pode reenviar o mesmo evento,
// o que faria a Ana responder duas vezes. Guardamos os IDs recentes em memória.
const processedMessages = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMessages.has(id)) return true;
  processedMessages.add(id);
  if (processedMessages.size > 2000) {
    // poda simples dos mais antigos (o Set mantém a ordem de inserção)
    for (const old of processedMessages) { processedMessages.delete(old); if (processedMessages.size <= 1500) break; }
  }
  return false;
}

// Funções do calendário
function parseICS(icsText) {
  const events = [];
  const blocks = icsText.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const dtstart = block.match(/DTSTART[^:\r\n]*:(\d{8}T\d{6})/)?.[1];
    const dtend = block.match(/DTEND[^:\r\n]*:(\d{8}T\d{6})/)?.[1];
    if (dtstart && dtend) {
      const parseDate = d => new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}:${d.slice(13,15)}Z`);
      events.push({ start: parseDate(dtstart), end: parseDate(dtend) });
    }
  }
  return events;
}

function getAvailableSlots(events, unidadePref) {
  const nowBrasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const slots = [];
  for (let d = 0; d <= 14; d++) {
    const day = new Date(nowBrasilia);
    day.setDate(nowBrasilia.getDate() + d);
    const dow = day.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
    const isConjunto = ["segunda","quarta","sexta"].some(x => dow.includes(x));
    const isTaguatinga = ["terça","quinta"].some(x => dow.includes(x));
    if (!isConjunto && !isTaguatinga) continue;
    if (unidadePref) {
      const p = unidadePref.toLowerCase();
      if (p.includes("conjunto") && !isConjunto) continue;
      if (p.includes("taguatinga") && !isTaguatinga) continue;
    }
    const startH = isConjunto ? 9 : 10;
    for (let h = startH; h < 18; h++) {
      if (h === 13) continue;
      for (let m = 0; m < 60; m += 20) {
        const dateStr = day.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const slotStart = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00-03:00`);
        const slotEnd = new Date(slotStart.getTime() + 20 * 60000);
        if (slotStart <= new Date()) continue;
        const busy = events.some(ev => slotStart < ev.end && slotEnd > ev.start);
        if (!busy) {
          const label = slotStart.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          slots.push(`${label} (${isConjunto ? "Conjunto Nacional" : "Taguatinga"})`);
        }
      }
    }
  }
  return slots;
}

function detectSchedulingIntent(messages) {
  const recent = messages.slice(-4).map(m => m.content.toLowerCase()).join(" ");
  return recent.includes("horário") || recent.includes("agendar") || recent.includes("marcar") || recent.includes("consulta") || recent.includes("disponibilidade");
}

function detectUnidade(messages) {
  const recent = messages.slice(-6).map(m => m.content.toLowerCase()).join(" ");
  if (recent.includes("taguatinga")) return "taguatinga";
  if (recent.includes("conjunto") || recent.includes("asa norte")) return "conjunto";
  return null;
}

async function fetchSlots(unidadePref) {
  try {
    const res = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(ICAL_URL)}`, { timeout: 8000 });
    const events = parseICS(res.data);
    return getAvailableSlots(events, unidadePref);
  } catch(e) {
    console.error("Erro calendário:", e.message);
    return [];
  }
}

// Funções do Supabase
async function getOrCreatePatient(phone) {
  try {
    let { data, error } = await supabase.from("patients").select("*").eq("phone", phone).single();
    console.log("Patient query:", JSON.stringify(data), JSON.stringify(error));
    if (!data) {
      const { data: newPatient, error: insertError } = await supabase.from("patients").insert({ phone }).select().single();
      console.log("Patient insert:", JSON.stringify(newPatient), JSON.stringify(insertError));
      data = newPatient;
    }
    return data;
  } catch(e) {
    console.error("Erro patient:", e.message);
    return null;
  }
}

async function getOrCreateConversation(patientId) {
  let { data } = await supabase.from("conversations").select("*").eq("patient_id", patientId).neq("status", "closed").order("started_at", { ascending: false }).limit(1).single();
  if (!data) {
    const { data: newConv } = await supabase.from("conversations").insert({ patient_id: patientId, status: "bot" }).select().single();
    data = newConv;
  }
  return data;
}

// Salva uma mensagem. `media`, quando informado, guarda a referência ao anexo
// no Storage ({ path, type, name }) — exige as colunas media_* na tabela
// messages (ver sql/messages_media.sql).
async function saveMessage(conversationId, role, content, waMessageId = null, media = null) {
  const row = { conversation_id: conversationId, role, content, wa_message_id: waMessageId };
  if (media && media.path) {
    row.media_path = media.path;
    row.media_type = media.type || null;
    row.media_name = media.name || null;
  }
  await supabase.from("messages").insert(row);
  await supabase.from("conversations").update({ last_message: content, updated_at: new Date() }).eq("id", conversationId);
}

async function getConversationMessages(conversationId) {
  // Buscar as 20 mensagens MAIS RECENTES (desc) e devolver em ordem cronológica.
  // Assim o histórico sempre inclui a última mensagem do usuário recém-salva.
  const { data } = await supabase.from("messages").select("role, content").eq("conversation_id", conversationId).order("timestamp", { ascending: false }).limit(20);
  return (data || []).reverse();
}

async function updatePatientName(phone, name) {
  await supabase.from("patients").update({ name, updated_at: new Date() }).eq("phone", phone);
}

// ===== Atribuição de anúncios (Google Ads) =====
function novoToken() { return crypto.randomBytes(4).toString("hex").toUpperCase(); } // 8 chars

// Registra um clique de anúncio (na landing) e devolve o token que viajará no [ref:...]
async function registrarClique({ gclid, wbraid, gbraid, source }) {
  const token = novoToken();
  try {
    await supabase.from("ad_clicks").insert({
      token, gclid: gclid || null, wbraid: wbraid || null, gbraid: gbraid || null, source: source || null
    });
  } catch (e) {
    console.error("[Ads] Falha ao registrar clique:", e.message);
  }
  return token;
}

// Vincula o token (recebido na 1ª mensagem) ao telefone/conversa do paciente
async function vincularClique(token, phone, conversationId) {
  try {
    const { data } = await supabase.from("ad_clicks").select("id, phone").eq("token", token).limit(1).single();
    if (!data) { console.warn("[Ads] Token de anúncio não encontrado:", token); return; }
    if (data.phone) return; // já vinculado
    await supabase.from("ad_clicks").update({ phone, conversation_id: String(conversationId) }).eq("id", data.id);
    console.log("[Ads] Clique vinculado:", token, "→", phone);
  } catch (e) {
    console.error("[Ads] Falha ao vincular clique:", e.message);
  }
}

// Baixar mídia do WhatsApp
async function downloadMedia(mediaId) {
  try {
    const { data: mediaInfo } = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const response = await axios.get(mediaInfo.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      responseType: "arraybuffer"
    });
    return { buffer: Buffer.from(response.data), mimeType: mediaInfo.mime_type };
  } catch(e) {
    console.error("Erro ao baixar mídia:", e.message);
    return null;
  }
}

// Extensão de arquivo a partir do mime-type (para nomear o anexo salvo).
function extFromMime(mime = "") {
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "application/pdf": "pdf", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/amr": "amr", "audio/wav": "wav", "video/mp4": "mp4", "video/3gpp": "3gp",
  };
  if (map[mime]) return map[mime];
  const guess = (mime.split("/")[1] || "bin").split(";")[0];
  return guess.replace(/[^\w]+/g, "") || "bin";
}

// Sobe uma mídia RECEBIDA do paciente para o bucket privado "anexos".
// Devolve { path, type, name } para persistir na mensagem, ou null em falha.
// O nome começa com `${Date.now()}_` para que o expurgo de 30 dias (LGPD)
// e o prefixo `_in_` distingam anexos recebidos dos enviados pelo painel.
async function storeInboundMedia(buffer, mimeType, originalName) {
  try {
    const ext = extFromMime(mimeType);
    let base = originalName ? originalName.replace(/[^\w.\-]+/g, "_").slice(-80) : `midia.${ext}`;
    if (!/\.\w+$/.test(base)) base = `${base}.${ext}`;
    const path = `${Date.now()}_in_${base}`;
    const { error } = await supabase.storage.from("anexos").upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) { console.error("Erro ao salvar anexo recebido:", error.message); return null; }
    return { path, type: mimeType, name: base };
  } catch (e) {
    console.error("Erro ao salvar anexo recebido:", e.message);
    return null;
  }
}

// Transcrever áudio com Whisper
async function transcribeAudio(buffer, mimeType) {
  try {
    const form = new FormData();
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "wav";
    form.append("file", buffer, { filename: `audio.${ext}`, contentType: mimeType });
    form.append("model", "whisper-1");
    form.append("language", "pt");
    const { data } = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, ...form.getHeaders() } }
    );
    return data.text;
  } catch(e) {
    console.error("Erro Whisper:", e.message);
    return null;
  }
}

// Enviar documento pelo WhatsApp
async function sendWhatsAppDocument(to, url, filename, caption = "") {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "document", document: { link: url, filename, caption } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Enviar imagem pelo WhatsApp
async function sendWhatsAppImage(to, url, caption = "") {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "image", image: { link: url, caption } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Notificar clínica (espelhamento). NUNCA lança: uma falha aqui — por exemplo,
// a janela de 24h do WhatsApp fechada para o número da clínica — não pode
// interromper o atendimento ao paciente.
async function notificarClinica(texto) {
  try {
    await sendWhatsApp(NUMERO_CLINICA, texto);
  } catch(e) {
    const d = e?.response?.data;
    console.error("[Ana] Falha ao espelhar p/ clínica (possível janela de 24h fechada):", d ? JSON.stringify(d) : e.message);
  }
}

// Limite de caracteres do corpo de texto do WhatsApp (a API rejeita > 4096).
const WA_TEXT_LIMIT = 3900;

// Envio bruto de um único texto (sem divisão).
async function sendWhatsAppRaw(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Enviar mensagem WhatsApp — divide automaticamente textos longos em partes,
// respeitando quebras de linha, para não estourar o limite da API (o que
// causaria falha silenciosa em respostas grandes).
async function sendWhatsApp(to, body) {
  const text = String(body ?? "").trim();
  if (!text) return;
  if (text.length <= WA_TEXT_LIMIT) { await sendWhatsAppRaw(to, text); return; }
  const chunks = [];
  let buf = "";
  for (let line of text.split("\n")) {
    while (line.length > WA_TEXT_LIMIT) { chunks.push(line.slice(0, WA_TEXT_LIMIT)); line = line.slice(WA_TEXT_LIMIT); }
    if ((buf ? buf.length + 1 : 0) + line.length > WA_TEXT_LIMIT) { if (buf) chunks.push(buf); buf = line; }
    else buf = buf ? buf + "\n" + line : line;
  }
  if (buf) chunks.push(buf);
  for (const c of chunks) await sendWhatsAppRaw(to, c);
}

// Webhook verification
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Webhook principal
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    // Ignora reentregas do mesmo evento (evita resposta duplicada)
    if (alreadyProcessed(msg.id)) { console.log("[Ana] Mensagem duplicada ignorada:", msg.id); return; }

    const from = msg.from;
    let text = "";
    let mediaNotification = "";
    let media = null; // { path, type, name } do anexo salvo no Storage, se houver

    // Processar tipo de mensagem
    if (msg.type === "text") {
      text = msg.text.body.trim();
    } else if (msg.type === "audio") {
      console.log("Áudio recebido, transcrevendo...");
      const dl = await downloadMedia(msg.audio.id);
      if (dl) {
        // guarda o áudio para a secretária poder ouvir no painel...
        media = await storeInboundMedia(dl.buffer, dl.mimeType, `audio.${extFromMime(dl.mimeType)}`);
        // ...e mantém a transcrição automática (Whisper) que já funcionava
        const transcricao = await transcribeAudio(dl.buffer, dl.mimeType);
        if (transcricao) {
          text = `[Áudio transcrito]: ${transcricao}`;
          console.log("Transcrição:", transcricao);
        } else {
          text = "[Áudio recebido - não foi possível transcrever]";
        }
      }
    } else if (msg.type === "image") {
      const dl = await downloadMedia(msg.image.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, `imagem.${extFromMime(dl.mimeType)}`);
      text = msg.image?.caption ? `[Imagem recebida]: ${msg.image.caption}` : "[Imagem recebida]";
      mediaNotification = "📷 Paciente enviou uma imagem";
    } else if (msg.type === "document") {
      const filename = msg.document?.filename || "documento";
      const dl = await downloadMedia(msg.document.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, filename);
      text = `[Documento recebido: ${filename}]`;
      mediaNotification = `📄 Paciente enviou um documento: ${filename}`;
    } else if (msg.type === "video") {
      const dl = await downloadMedia(msg.video.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, `video.${extFromMime(dl.mimeType)}`);
      text = msg.video?.caption ? `[Vídeo recebido]: ${msg.video.caption}` : "[Vídeo recebido]";
      mediaNotification = "🎥 Paciente enviou um vídeo";
    } else {
      return; // Ignorar outros tipos
    }

    console.log("Mensagem de:", from, "| Tipo:", msg.type, "| Texto:", text);

    // Sem texto utilizável (ex.: áudio não baixado/transcrito) → orienta o paciente
    if (!text || !text.trim()) {
      console.error("[Ana] Mensagem sem texto utilizável (tipo:", msg.type + ")");
      await sendWhatsApp(from, "Não consegui ler sua mensagem 😊 Pode me escrever por texto, por favor?").catch(e => console.error("[Ana] Falha ao pedir reenvio:", e.message));
      return;
    }

    // Captura o token de origem de anúncio (landing → WhatsApp) e remove do texto
    let refToken = null;
    const refMatch = text.match(/\[ref:([A-Za-z0-9]+)\]/i);
    if (refMatch) {
      refToken = refMatch[1].toUpperCase();
      text = text.replace(/\s*\[ref:[A-Za-z0-9]+\]\s*/i, " ").trim();
      if (!text) text = "Olá!";
    }

    // Comandos admin
    if (NUMEROS_ADMIN.includes(from)) {
      if (text === "#ANA OFF") {
        anaAtiva = false;
        await supabase.from("settings").upsert({ key: "ai_enabled", value: "false" });
        await sendWhatsApp(from, "✅ Ana desativada.");
        return;
      }
      if (text === "#ANA ON") {
        anaAtiva = true;
        await supabase.from("settings").upsert({ key: "ai_enabled", value: "true" });
        await sendWhatsApp(from, "✅ Ana ativada.");
        return;
      }
      if (text === "#ANA STATUS") {
        await sendWhatsApp(from, `ℹ️ Ana está ${anaAtiva ? "✅ ATIVA" : "❌ DESATIVADA"}.`);
        return;
      }
      if (text === "#ADS" || text === "#ADS RELATORIO") {
        await sendWhatsApp(from, `📊 Gerando relatório do Google Ads (modo ${googleAds.isTestMode() ? "TESTE" : "PRODUÇÃO"})...`);
        googleAds.runWeeklyReport({ supabase, sendWhatsApp }).catch(e => console.error("[GoogleAds] Manual:", e.message));
        return;
      }
    }

    // Salvar no banco
    const patient = await getOrCreatePatient(from);
    if (!patient) {
      console.error("[Ana] Não foi possível obter/criar o paciente:", from);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha no fallback:", e.message));
      return;
    }
    const conversation = await getOrCreateConversation(patient.id);
    if (!conversation) {
      console.error("[Ana] Não foi possível obter/criar a conversa do paciente:", patient.id);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha no fallback:", e.message));
      return;
    }
    await saveMessage(conversation.id, "user", text, msg.id, media);

    // Vincula o clique de anúncio (se veio da landing) ao paciente/conversa
    if (refToken) await vincularClique(refToken, from, conversation.id);

    // Verificar se conversa está com humano
    if (conversation.status === "human") {
      const notif = mediaNotification || `👤 *Paciente ${patient.name || from}:*\n${text}`;
      await notificarClinica(notif);
      return;
    }

    // Se Ana desativada, não responde
    if (!anaAtiva) {
      if (mediaNotification) await notificarClinica(`👤 *${patient.name || from}:*\n${mediaNotification}`);
      return;
    }

    // Para imagens e documentos, Ana responde e notifica equipe
    if (msg.type === "image" || msg.type === "document" || msg.type === "video") {
      const tipoArquivo = msg.type === "image" ? "imagem" : msg.type === "document" ? "documento" : "vídeo";
      const reply = `Recebi ${tipoArquivo === "imagem" ? "a" : "o"} ${tipoArquivo}! 😊 Vou encaminhar para nossa equipe verificar. Assim que abrir o atendimento — segunda a sexta, das 8h às 18h — elas entram em contato com você. Posso ajudar com mais alguma coisa?`;
      await sendWhatsApp(from, reply);
      await saveMessage(conversation.id, "assistant", reply);
      await notificarClinica(`👤 *${patient.name || from}:*\n${mediaNotification}\n\n🤖 *Ana:*\n${reply}`);
      return;
    }

    // Buscar histórico do banco
    const history = await getConversationMessages(conversation.id);
    const messages = history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    // Detectar nome do paciente nas mensagens
    const nameMatch = text.match(/(?:me chamo|meu nome é|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    if (nameMatch) await updatePatientName(from, nameMatch[1]);

    // Buscar horários se necessário
    let systemPrompt = SYSTEM_PROMPT;
    if (detectSchedulingIntent(messages)) {
      const unidade = detectUnidade(messages);
      const slots = await fetchSlots(unidade);
      if (slots.length > 0) {
        const slotsConjunto = slots.filter(s => s.includes("Conjunto Nacional"));
        const slotsTaguatinga = slots.filter(s => s.includes("Taguatinga"));
        let primeiros = [];
        if (unidade) {
          const slotsPref = unidade.includes("taguatinga") ? slotsTaguatinga : slotsConjunto;
          const manha = slotsPref.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") < 13);
          const tarde = slotsPref.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") >= 14);
          if (manha) primeiros.push(manha);
          if (tarde) primeiros.push(tarde);
        } else {
          const conjManha = slotsConjunto.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") < 13);
          const conjTarde = slotsConjunto.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") >= 14);
          const tagManha = slotsTaguatinga.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") < 13);
          const tagTarde = slotsTaguatinga.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") >= 14);
          if (conjManha) primeiros.push(conjManha);
          else if (conjTarde) primeiros.push(conjTarde);
          if (tagManha) primeiros.push(tagManha);
          else if (tagTarde) primeiros.push(tagTarde);
        }
        const extras = slots.filter(s => !primeiros.includes(s)).slice(0, 8);
        systemPrompt += `\n\n### Horários disponíveis\nOfereça 2 por vez (manhã + tarde):\n${[...primeiros, ...extras].join("\n")}`;
      }
    }

    // Chamar Ana
    // A API da Anthropic exige que o array de mensagens comece e termine com
    // role "user" (sem prefill do assistente). Garantimos isso removendo
    // quaisquer mensagens do assistente nas pontas do payload.
    const apiMessages = messages.slice(-10);
    while (apiMessages.length && apiMessages[apiMessages.length - 1].role === "assistant") apiMessages.pop();
    while (apiMessages.length && apiMessages[0].role === "assistant") apiMessages.shift();
    // Salvaguarda: se nada sobrar, usar ao menos a mensagem atual do usuário.
    if (apiMessages.length === 0) apiMessages.push({ role: "user", content: text });
    let reply;
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        { model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: apiMessages },
        { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, timeout: 30000 }
      );
      reply = response.data?.content?.[0]?.text;
      if (!reply || !reply.trim()) throw new Error("Resposta vazia da IA");
    } catch (err) {
      console.error("[Ana] Falha na API Anthropic:", err?.response?.status || "", err?.response?.data ? JSON.stringify(err.response.data) : err.message);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha ao enviar fallback:", e.message));
      await saveMessage(conversation.id, "assistant", FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha ao salvar fallback:", e.message));
      return;
    }

    // Salvar resposta
    await saveMessage(conversation.id, "assistant", reply);

    // Enviar ao paciente (se falhar, registra com detalhe — sem silêncio sem log)
    try {
      await sendWhatsApp(from, reply);
    } catch (err) {
      console.error("[Ana] Falha ao enviar resposta ao paciente:", err?.response?.data ? JSON.stringify(err.response.data) : err.message);
    }

    // Espelhar para clínica (isolado: notificarClinica nunca lança)
    await notificarClinica(`👤 *${patient.name || from}:*\n${text}\n\n🤖 *Ana:*\n${reply}`);

  } catch(e) {
    console.error("[Ana] Erro não tratado no webhook:", e?.response?.status || "", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
    if (e?.stack) console.error(e.stack);
  }
});

// ===== Autenticação individual do painel via Supabase Auth (LGPD) =====
// Cada secretária tem seu próprio usuário. As senhas vêm SOMENTE de env vars no
// Render (nunca do código-fonte): PANEL_PW_<NOME> ou, como fallback, PANEL_PASSWORD.
// Sem env de senha, a usuária não é criada.
const SECRETARIAS = [
  { nome: "Aline",      email: "aline@iobb.local",      pwEnv: "PANEL_PW_ALINE" },
  { nome: "Mylla",      email: "mylla@iobb.local",      pwEnv: "PANEL_PW_MYLLA" },
  { nome: "Elaine",     email: "elaine@iobb.local",     pwEnv: "PANEL_PW_ELAINE" },
  { nome: "Secretaria", email: "secretaria@iobb.local", pwEnv: "PANEL_PW_SECRETARIA" },
];

// Cria/atualiza as usuárias das secretárias (idempotente) usando a service key.
// A senha em env é a fonte da verdade — para trocar, altere a env e faça redeploy.
(async () => {
  try {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) { console.error("Auth listUsers:", listErr.message); return; }
    for (const s of SECRETARIAS) {
      const senha = process.env[s.pwEnv] || process.env.PANEL_PASSWORD;
      if (!senha) { console.log(`Sem senha em env para ${s.nome} — usuária não criada.`); continue; }
      const existente = list.users.find(u => u.email === s.email);
      if (!existente) {
        const { error } = await supabase.auth.admin.createUser({
          email: s.email, password: senha, email_confirm: true, user_metadata: { nome: s.nome }
        });
        console.log(error ? `Erro ao criar ${s.nome}: ${error.message}` : `Usuária ${s.nome} criada.`);
      } else {
        const { error } = await supabase.auth.admin.updateUserById(existente.id, {
          password: senha, user_metadata: { nome: s.nome }
        });
        if (error) console.error(`Erro ao atualizar ${s.nome}:`, error.message);
      }
    }
  } catch (e) {
    console.error("Erro no seeding de secretárias:", e.message);
  }
})();

// Cliente dedicado ao login (stateless — não guarda sessão no servidor)
const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Rate-limiting por IP no /api/login (defesa contra força bruta)
const LOGIN_MAX = 5, LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + LOGIN_WINDOW_MS }; loginAttempts.set(ip, rec); }
  if (rec.count >= LOGIN_MAX) {
    const min = Math.max(1, Math.ceil((rec.resetAt - now) / 60000));
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${min} min.` });
  }
  rec.count++;
  req._loginIp = ip;
  next();
}
// Limpeza periódica dos registros expirados de rate-limit
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) if (now > rec.resetAt) loginAttempts.delete(ip);
}, LOGIN_WINDOW_MS);

// Login do painel (público, com rate-limit): {agent, password} → tokens da sessão
app.post("/api/login", loginRateLimit, async (req, res) => {
  try {
    const { agent, password } = req.body || {};
    const secretaria = SECRETARIAS.find(s => s.nome === agent);
    if (!secretaria || !password) return res.status(401).json({ error: "Usuário ou senha inválidos" });
    const { data, error } = await authClient.auth.signInWithPassword({ email: secretaria.email, password });
    if (error || !data?.session) return res.status(401).json({ error: "Usuário ou senha inválidos" });
    loginAttempts.delete(req._loginIp); // sucesso zera o contador do IP
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      agent: secretaria.nome
    });
  } catch (e) {
    console.error("Erro no login:", e.message);
    res.status(500).json({ error: "Erro no login" });
  }
});

// Renovação de sessão (público): troca refresh_token por novo access_token
app.post("/api/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(401).json({ error: "Sem refresh_token" });
    const { data, error } = await authClient.auth.refreshSession({ refresh_token });
    if (error || !data?.session) return res.status(401).json({ error: "Sessão expirada" });
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    });
  } catch (e) {
    res.status(401).json({ error: "Sessão expirada" });
  }
});

// Middleware: valida o token JWT do Supabase enviado pelo painel (Bearer).
async function requirePanelAuth(req, res, next) {
  try {
    const authz = req.headers["authorization"] || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Sessão inválida" });
    req.panelUser = data.user; // identidade da secretária (auditoria/LGPD)
    next();
  } catch (e) {
    return res.status(401).json({ error: "Falha na autenticação" });
  }
}
app.use("/api", requirePanelAuth);

// API para o painel web
app.get("/api/conversations", async (req, res) => {
  const { data } = await supabase.from("conversations").select(`*, patients(name, phone)`).order("updated_at", { ascending: false });
  const convs = data || [];
  // Anota quais conversas vieram de anúncio (clique vinculado) e se já agendaram
  try {
    const { data: clicks } = await supabase.from("ad_clicks").select("conversation_id, source, booked").not("conversation_id", "is", null);
    const map = {};
    for (const c of (clicks || [])) { if (c.conversation_id) map[c.conversation_id] = c; }
    for (const cv of convs) {
      const a = map[String(cv.id)];
      if (a) { cv.ad_source = a.source || "anúncio"; cv.ad_booked = !!a.booked; }
    }
  } catch (e) {
    console.error("[Ads] Falha ao anotar origem de anúncio:", e.message);
  }
  res.json(convs);
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const { data } = await supabase.from("messages").select("*").eq("conversation_id", req.params.id).order("timestamp");
  res.json(data);
});

app.post("/api/conversations/:id/assign", async (req, res) => {
  await supabase.from("conversations").update({ status: "human", assigned_to: req.body.agent }).eq("id", req.params.id);
  res.json({ ok: true });
});

app.post("/api/conversations/:id/release", async (req, res) => {
  await supabase.from("conversations").update({ status: "bot", assigned_to: null }).eq("id", req.params.id);
  res.json({ ok: true });
});

// Marca um agendamento (conversão) para a conversa. Se ela veio de um anúncio
// (tem clique vinculado), registra a conversão para exportação ao Google Ads.
app.post("/api/conversations/:id/booked", async (req, res) => {
  try {
    const value = Number(req.body?.value) || 200;
    const { data } = await supabase.from("ad_clicks").select("id")
      .eq("conversation_id", String(req.params.id))
      .order("clicked_at", { ascending: false }).limit(1).single();
    if (!data) return res.json({ ok: true, attributed: false });
    await supabase.from("ad_clicks").update({ booked: true, booked_at: new Date(), conversion_value: value }).eq("id", data.id);
    res.json({ ok: true, attributed: true });
  } catch (e) {
    console.error("[Ads] Falha ao marcar agendamento:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/send", async (req, res) => {
  const { to, message, conversationId, agent, documentUrl, documentName, imageUrl } = req.body;
  if (imageUrl) {
    await sendWhatsAppImage(to, imageUrl, message || "");
    await saveMessage(conversationId, "human", `[Imagem enviada]${message ? `: ${message}` : ""}`);
  } else if (documentUrl) {
    await sendWhatsAppDocument(to, documentUrl, documentName || "documento");
    await saveMessage(conversationId, "human", `[Documento enviado: ${documentName || "documento"}]`);
  } else {
    await sendWhatsApp(to, message);
    await saveMessage(conversationId, "human", message);
  }
  res.json({ ok: true });
});

app.get("/api/settings", async (req, res) => {
  const { data } = await supabase.from("settings").select("*");
  res.json(data);
});

app.post("/api/settings", async (req, res) => {
  const { key, value } = req.body;
  await supabase.from("settings").upsert({ key, value });
  res.json({ ok: true });
});

// Dispara o relatório do Google Ads sob demanda (painel). Envia pelo WhatsApp
// e também devolve o texto do relatório para exibição na modal do painel.
app.post("/api/ads/report", async (req, res) => {
  try {
    const report = await googleAds.runWeeklyReport({ supabase, sendWhatsApp });
    res.json({ ok: !!report, mode: googleAds.isTestMode() ? "test" : "prod", report });
  } catch (e) {
    console.error("[GoogleAds] Endpoint:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exporta as conversões (agendamentos com gclid) no formato de importação de
// conversões offline do Google Ads. ?all=1 inclui já exportadas; ?markReported=1
// marca as exportadas para não reenviar (evita contagem dupla).
app.get("/api/ads/conversions.csv", async (req, res) => {
  try {
    const tz = "America/Sao_Paulo";
    const fmt = d => {
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
      const g = t => (p.find(x => x.type === t) || {}).value;
      return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
    };
    let q = supabase.from("ad_clicks").select("*").eq("booked", true).not("gclid", "is", null);
    if (req.query.all !== "1") q = q.eq("reported", false);
    const { data } = await q;
    const rows = (data || []).filter(r => r.gclid);
    const lines = [`Parameters:TimeZone=${tz}`, "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
    for (const r of rows) {
      const t = fmt(new Date(r.booked_at || r.clicked_at));
      lines.push([r.gclid, GOOGLE_ADS_CONVERSION_NAME, t, (r.conversion_value ?? 200), "BRL"].join(","));
    }
    if (req.query.markReported === "1" && rows.length) {
      await supabase.from("ad_clicks").update({ reported: true, reported_at: new Date() }).in("id", rows.map(r => r.id));
    }
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="conversoes_google_ads.csv"');
    res.send(lines.join("\n"));
  } catch (e) {
    console.error("[Ads] Falha ao exportar conversões:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Anexos podem conter dados sensíveis de pacientes (laudos, receitas, exames).
// Por LGPD, o bucket é PRIVADO e os links são URLs assinadas com expiração curta.
const ANEXO_SIGN_TTL = 3600; // 1 hora, em segundos

// Garantir que o bucket de anexos exista e seja PRIVADO, idempotente
(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = buckets?.find(b => b.name === "anexos");
    if (!existing) {
      const { error } = await supabase.storage.createBucket("anexos", { public: false });
      if (error) console.error("Erro ao criar bucket anexos:", error.message);
      else console.log("Bucket 'anexos' criado (privado).");
    } else if (existing.public) {
      // bucket antigo estava público → rebaixar para privado (LGPD)
      const { error } = await supabase.storage.updateBucket("anexos", { public: false });
      if (error) console.error("Erro ao tornar bucket anexos privado:", error.message);
      else console.log("Bucket 'anexos' ajustado para PRIVADO.");
    }
  } catch (e) {
    console.error("Erro ao verificar bucket anexos:", e.message);
  }
})();

// Expurgo automático de anexos com mais de 30 dias (LGPD: minimização/retenção).
// Roda no startup e a cada 24h. Usa created_at do objeto; se ausente, cai no
// timestamp embutido no nome do arquivo (`${Date.now()}_...`).
const ANEXO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
async function purgeOldAttachments() {
  try {
    const cutoff = Date.now() - ANEXO_RETENTION_MS;
    const antigos = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from("anexos").list("", {
        limit: 1000, offset, sortBy: { column: "created_at", order: "asc" }
      });
      if (error) { console.error("Expurgo: erro ao listar anexos:", error.message); return; }
      if (!data || data.length === 0) break;
      for (const f of data) {
        const ts = f.created_at ? new Date(f.created_at).getTime() : parseInt(f.name.split("_")[0], 10);
        if (Number.isFinite(ts) && ts < cutoff) antigos.push(f.name);
      }
      if (data.length < 1000) break;
    }
    if (antigos.length) {
      const { error } = await supabase.storage.from("anexos").remove(antigos);
      if (error) console.error("Expurgo: erro ao remover anexos:", error.message);
      else console.log(`Expurgo: ${antigos.length} anexo(s) com +30 dias removido(s).`);
    }
  } catch (e) {
    console.error("Erro no expurgo de anexos:", e.message);
  }
}
purgeOldAttachments();
setInterval(purgeOldAttachments, 24 * 60 * 60 * 1000);

// Upload de anexo do painel para o Supabase Storage → devolve URL ASSINADA (1h)
// O navegador envia o arquivo como corpo binário (application/octet-stream)
// e informa nome/tipo real via query (?filename=...&mime=...).
app.post("/api/upload", express.raw({ type: () => true, limit: "30mb" }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) return res.status(400).json({ error: "Arquivo vazio" });
    const rawName = (req.query.filename || "arquivo").toString();
    const safeName = rawName.replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";
    const contentType = (req.query.mime || req.headers["content-type"] || "application/octet-stream").toString();
    const path = `${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("anexos").upload(path, req.body, { contentType, upsert: false });
    if (error) return res.status(500).json({ error: error.message });
    // URL assinada de curta duração — suficiente para o WhatsApp baixar a mídia na hora
    const { data, error: signErr } = await supabase.storage.from("anexos").createSignedUrl(path, ANEXO_SIGN_TTL);
    if (signErr) return res.status(500).json({ error: signErr.message });
    res.json({ url: data.signedUrl, filename: rawName, contentType, expiresIn: ANEXO_SIGN_TTL });
  } catch (e) {
    console.error("Erro upload:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Gera uma URL ASSINADA de curta duração para um anexo salvo (recebido do
// paciente ou enviado pela secretária). O painel chama autenticado (Bearer) e
// usa a URL devolvida direto no <img>/<audio>/<a>. Como o link expira, o painel
// sempre pede um novo na hora de renderizar — nada sensível fica em cache/DB.
app.get("/api/attachment", async (req, res) => {
  try {
    const path = (req.query.path || "").toString();
    if (!path || path.includes("..") || path.startsWith("/")) return res.status(400).json({ error: "path inválido" });
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(path, ANEXO_SIGN_TTL);
    if (error) return res.status(404).json({ error: error.message });
    res.json({ url: data.signedUrl, expiresIn: ANEXO_SIGN_TTL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Landing pages de anúncios (captura de gclid → WhatsApp com token) =====
const LP_TEMAS = {
  ceratocone: {
    titulo: "Ceratocone tem tratamento — e somos referência nisso",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "Crosslinking, anel intraestromal e lentes de contato especiais (rígidas e esclerais)",
      "Avaliação com médico especialista e contactóloga",
      "Atendimento acolhedor pelo WhatsApp, sem compromisso",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre ceratocone.",
  },
  refrativa: {
    titulo: "Livre-se dos óculos com cirurgia refrativa a laser",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "PRK, LASIK e Femto-LASIK — técnica definida na avaliação",
      "Avaliação completa com o médico antes de qualquer indicação",
      "Parcelamento em até 5x no cartão",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre cirurgia refrativa.",
  },
  catarata: {
    titulo: "Cirurgia de catarata com avaliação individualizada",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "Cirurgia realizada pelo Dr. Bruno",
      "Escolha da lente intraocular definida na avaliação",
      "Tire suas dúvidas pelo WhatsApp",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre cirurgia de catarata.",
  },
  consulta: {
    titulo: "Oftalmologista em Brasília",
    sub: "Instituto de Olhos Bruno Borges — Asa Norte e Taguatinga",
    destaque: "Consulta oftalmológica completa, com atendimento humanizado e sem pressa.",
    bullets: [
      "Unidades: Conjunto Nacional (Asa Norte) e Taguatinga Shopping",
      "Atendemos convênios e particular",
    ],
    chips: ["Ceratocone", "Cirurgia refrativa", "Catarata", "Lentes esclerais"],
    cred: "Dr. Bruno Borges • CRM-DF 17877 · RQE 9314 • Oftalmologia (UFMG)",
    cta: "📅 Agendar pelo WhatsApp",
    msg: "Olá! Vim pelo Google e quero agendar uma consulta oftalmológica.",
  },
};

function renderLanding(cfg, waLink) {
  const bullets = cfg.bullets.map(b => `<li>${b}</li>`).join("");
  const destaque = cfg.destaque ? `<p class="destaque">${cfg.destaque}</p>` : "";
  const chips = cfg.chips ? `<div class="chips">${cfg.chips.map(c => `<span class="chip">${c}</span>`).join("")}</div>` : "";
  const cred = cfg.cred ? `<div class="cred">🩺 ${cfg.cred}</div>` : "";
  const cta = cfg.cta || "💬 Falar no WhatsApp agora";
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${cfg.titulo} — IOBB</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b141a;background:#f0f2f5;line-height:1.5}
  .wrap{max-width:520px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
  .hero{background:#008069;color:#fff;padding:32px 22px 26px}
  .hero .logo{width:52px;height:52px;border-radius:50%;background:#fff;color:#008069;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;margin-bottom:16px}
  .hero h1{font-size:24px;line-height:1.25;margin-bottom:8px}
  .hero p{opacity:.92;font-size:14px}
  .hero .destaque{margin-top:12px;font-size:15px;opacity:.97;font-weight:500}
  .card{background:#fff;margin:18px;border-radius:14px;padding:20px 20px 8px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .card ul{list-style:none}
  .card li{padding:10px 0 10px 30px;position:relative;font-size:15px;border-bottom:1px solid #eee}
  .card li:last-child{border-bottom:none}
  .card li:before{content:"👁️";position:absolute;left:0;top:9px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;padding:14px 0 10px}
  .chip{background:#e7f7f1;color:#008069;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:20px}
  .cta{position:sticky;bottom:0;padding:16px 18px 22px;background:linear-gradient(180deg,rgba(240,242,245,0),#f0f2f5 30%)}
  .btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#25d366;color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:16px;border-radius:12px;box-shadow:0 4px 14px rgba(37,211,102,.4)}
  .cred{text-align:center;color:#54656f;font-size:12.5px;margin-top:12px;font-weight:500}
  .foot{text-align:center;color:#667781;font-size:12px;padding:0 18px 20px}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <div class="logo">A</div>
    <h1>${cfg.titulo}</h1>
    <p>${cfg.sub}</p>
    ${destaque}
  </div>
  <div class="card">
    <ul>${bullets}</ul>
    ${chips}
  </div>
  <div style="flex:1"></div>
  <div class="cta">
    <a class="btn" href="${waLink}" rel="nofollow">${cta}</a>
    ${cred}
  </div>
  <div class="foot">Atendimento humano de seg a sex, 8h às 18h. Não realizamos atendimento de urgência/emergência.</div>
</div>
</body></html>`;
}

// Landings com HTML próprio (design pronto) carregadas do disco na inicialização.
// Têm precedência sobre o template genérico renderLanding() para o mesmo tema.
const LP_HTML = {};
for (const [tema, arquivo] of Object.entries({
  consulta: "landings/consulta.html",
  ceratocone: "landings/ceratocone.html",
  taguatinga: "landings/taguatinga.html",
  "aguas-claras": "landings/aguas-claras.html",
  "asa-norte": "landings/asa-norte.html",
})) {
  try { LP_HTML[tema] = fs.readFileSync(`${__dirname}/${arquivo}`, "utf8"); }
  catch (e) { console.error(`[LP] Falha ao carregar ${arquivo}:`, e.message); }
}

// Injeta rastreamento numa landing de HTML próprio: aponta todos os links do
// WhatsApp para o número da Ana e acrescenta o [ref:token] ao texto pré-preenchido.
function injectTracking(html, token) {
  const ref = encodeURIComponent(` [ref:${token}]`);
  return html.replace(/https:\/\/wa\.me\/\d+(\?text=[^"'\s]*)?/g, (m, query) => {
    const base = `https://wa.me/${WA_LP_NUMBER}`;
    return query ? `${base}${query}${ref}` : `${base}?text=${encodeURIComponent(`Olá! [ref:${token}]`)}`;
  });
}

// Imagens otimizadas das landings, servidas com cache longo (carregamento rápido)
app.use("/lp/assets", express.static(`${__dirname}/landings/assets`, { maxAge: "30d", immutable: true }));

app.get("/lp/:tema", async (req, res) => {
  const tema = String(req.params.tema || "").toLowerCase();
  const custom = LP_HTML[tema];
  const cfg = LP_TEMAS[tema];
  if (!custom && !cfg) return res.status(404).send("Página não encontrada");
  const token = await registrarClique({
    gclid: req.query.gclid, wbraid: req.query.wbraid, gbraid: req.query.gbraid, source: `google/${tema}`
  });
  res.set("Cache-Control", "no-store");
  if (custom) return res.send(injectTracking(custom, token)); // design próprio (ex.: consulta)
  const waLink = `https://wa.me/${WA_LP_NUMBER}?text=${encodeURIComponent(`${cfg.msg} [ref:${token}]`)}`;
  res.send(renderLanding(cfg, waLink)); // template genérico (ceratocone/refrativa/catarata)
});

// Servir o painel web das secretárias
app.get("/painel", (req, res) => res.sendFile(__dirname + "/painel.html"));

// Agendador do relatório semanal do Google Ads (segunda 08h, Brasília)
googleAds.startScheduler({ supabase, sendWhatsApp });

app.listen(process.env.PORT || 3000, () => console.log("Ana online!"));
