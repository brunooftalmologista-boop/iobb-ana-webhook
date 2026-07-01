require("dotenv").config({ path: "/etc/secrets/.env" });
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { createClient } = require("@supabase/supabase-js");
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

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
Se o convênio estiver na lista → confirme que atendemos.
Se não estiver → diga que não atendemos e ofereça atendimento particular.
Qualquer menção a Unimed → solicite número da carteirinha ou foto.
Consulta por convênio: quando o convênio é atendido, a consulta é pelo plano — o paciente não paga o valor particular. Se houver dúvida sobre cobertura de um procedimento específico, diga que a equipe confirma na hora do agendamento. Nunca cite valor de consulta particular para quem tem convênio atendido.

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
Anel de Ferrara: R$ 8.700,00 por olho | até 5x cartão
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

### Cirurgia de catarata
O IOBB realiza cirurgia de catarata (Dr. Bruno). A indicação e o tipo de lente são sempre confirmados em avaliação presencial. Nunca prometa resultado.
Valor: R$ 5.000,00 por olho, incluindo honorários médicos, bloco cirúrgico e anestesista. A lente intraocular (LIO) é cobrada à parte — o valor depende da lente escolhida e é informado na avaliação. Quando perguntarem o valor total, explique que são os R$ 5.000,00 por olho mais a lente, definida na consulta.

### Procedimentos que NÃO realizamos (glaucoma, transplante de córnea, pterígio, plástica ocular)
O IOBB NÃO realiza essas cirurgias. Acolha com atenção, informe com honestidade que não fazemos esse procedimento e oriente a pessoa a procurar um serviço especializado nele. Se ela quiser, pode oferecer uma consulta de avaliação/segunda opinião conosco, deixando claro que a cirurgia em si não é realizada aqui. Nunca invente valores nem diga que realizamos.
Obs.: para glaucoma fazemos exames de acompanhamento (tonometria, CDPO, gonioscopia), mas não a cirurgia.

### O que levar à consulta
Documento com foto, carteirinha do convênio (se tiver), exames oculares recentes e os óculos/receita em uso, quando houver.

### Unidades e horários
Conjunto Nacional — Sala 6027, Asa Norte | segunda, quarta, sexta | Consultas 09h-18h (almoço 13h-14h)
Taguatinga Shopping — Sala 615 Torre B | terça, quinta | Consultas 10h-18h (almoço 13h-14h)
Telefone: (61) 3033-6605 | seg-sex 08h-18h (almoço 13h-14h)
Não há atendimento aos sábados, domingos e feriados. Se pedirem fim de semana, ofereça o próximo dia útil disponível.

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

### Faixa etária
A partir de 8 anos. Menor de 8 anos: encaminhar para a equipe.`;

const NUMERO_CLINICA = "5561982879853";
const NUMEROS_ADMIN = ["5561984060001", "556182879853", "5561982879853"];
let anaAtiva = true;

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

async function saveMessage(conversationId, role, content, waMessageId = null) {
  await supabase.from("messages").insert({ conversation_id: conversationId, role, content, wa_message_id: waMessageId });
  await supabase.from("conversations").update({ last_message: content, updated_at: new Date() }).eq("id", conversationId);
}

async function getConversationMessages(conversationId) {
  const { data } = await supabase.from("messages").select("role, content").eq("conversation_id", conversationId).order("timestamp", { ascending: true }).limit(20);
  return data || [];
}

async function updatePatientName(phone, name) {
  await supabase.from("patients").update({ name, updated_at: new Date() }).eq("phone", phone);
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

// Notificar clínica
async function notificarClinica(texto) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: NUMERO_CLINICA, type: "text", text: { body: texto } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch(e) {
    console.error("Erro ao notificar clínica:", e.message);
  }
}

// Enviar mensagem WhatsApp
async function sendWhatsApp(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
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

    const from = msg.from;
    let text = "";
    let mediaNotification = "";

    // Processar tipo de mensagem
    if (msg.type === "text") {
      text = msg.text.body.trim();
    } else if (msg.type === "audio") {
      console.log("Áudio recebido, transcrevendo...");
      const media = await downloadMedia(msg.audio.id);
      if (media) {
        const transcricao = await transcribeAudio(media.buffer, media.mimeType);
        if (transcricao) {
          text = `[Áudio transcrito]: ${transcricao}`;
          console.log("Transcrição:", transcricao);
        } else {
          text = "[Áudio recebido - não foi possível transcrever]";
        }
      }
    } else if (msg.type === "image") {
      text = "[Imagem recebida]";
      mediaNotification = "📷 Paciente enviou uma imagem";
    } else if (msg.type === "document") {
      const filename = msg.document?.filename || "documento";
      text = `[Documento recebido: ${filename}]`;
      mediaNotification = `📄 Paciente enviou um documento: ${filename}`;
    } else if (msg.type === "video") {
      text = "[Vídeo recebido]";
      mediaNotification = "🎥 Paciente enviou um vídeo";
    } else {
      return; // Ignorar outros tipos
    }

    console.log("Mensagem de:", from, "| Texto:", text);

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
    }

    // Salvar no banco
    const patient = await getOrCreatePatient(from);
    const conversation = await getOrCreateConversation(patient.id);
    await saveMessage(conversation.id, "user", text, msg.id);

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
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: messages.slice(-10) },
      { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );
    const reply = response.data.content[0].text;

    // Salvar resposta
    await saveMessage(conversation.id, "assistant", reply);

    // Enviar ao paciente
    await sendWhatsApp(from, reply);

    // Espelhar para clínica
    await notificarClinica(`👤 *${patient.name || from}:*\n${text}\n\n🤖 *Ana:*\n${reply}`);

  } catch(e) {
    console.error(e?.response?.data || e.message);
  }
});

// API para o painel web
app.get("/api/conversations", async (req, res) => {
  const { data } = await supabase.from("conversations").select(`*, patients(name, phone)`).order("updated_at", { ascending: false });
  res.json(data);
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

app.post("/api/send", async (req, res) => {
  const { to, message, conversationId, agent, documentUrl, documentName } = req.body;
  if (documentUrl) {
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

// Servir o painel web das secretárias
app.get("/painel", (req, res) => res.sendFile(__dirname + "/painel.html"));

app.listen(process.env.PORT || 3000, () => console.log("Ana online!"));
