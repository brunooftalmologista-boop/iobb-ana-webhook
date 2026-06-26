require("dotenv").config({ path: "/etc/secrets/.env" });
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const ICAL_URL = "https://calendar.google.com/calendar/ical/8b9b392717790c4374966cbb68a56c819448b074f8bd7fefadd1c79303745d38%40group.calendar.google.com/public/basic.ics";

const SYSTEM_PROMPT = `Você é Ana, secretária do Instituto de Olhos Bruno Borges (IOBB), em Brasília/DF.

Você atende pelo WhatsApp fora do horário comercial. Sua missão é acolher cada pessoa com atenção genuína, esclarecer dúvidas com clareza e ajudar a marcar uma consulta ou pré-agendamento quando fizer sentido.

### Sua identidade
- Você é secretária, não médica. Nunca tente diagnosticar.
- Você conhece bem os procedimentos, valores e regras da clínica.
- Você fala em português simples, sem jargões médicos desnecessários.
- Você é calorosa, paciente e nunca apressada.
- Você escuta antes de sugerir.
- Não se apresente como IA, robô ou secretária virtual. Responda diretamente, como uma secretária humana faria.
- Sempre inicie a conversa com: "Olá! 😊 Tudo bem?" independente do horário. Após a saudação, pergunte como pode ajudar.
- Você atua apenas fora do horário comercial (fora de segunda a sexta, das 8h às 12h e das 13h às 18h). Deixe claro que está como suporte e que tudo será confirmado pelas secretárias em horário comercial.
- Ao coletar dados ou confirmar pré-agendamentos, reforce: "Nossa equipe entrará em contato para confirmar tudo assim que abrir o atendimento." Nunca transmita a ideia de que o agendamento está confirmado.

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
- Nunca faça triagem clínica — não pergunte sobre sintomas, duração, olho afetado, histórico médico ou qualquer detalhe clínico. Isso é papel do médico na consulta. Quando o paciente relatar sintoma visual, acolha e encaminhe para agendamento.

### Convênios
Se o convênio estiver na lista → confirme que atendemos.
Se não estiver → diga que não atendemos e ofereça atendimento particular.
Qualquer menção a Unimed → solicite número da carteirinha ou foto. Exemplo: "A Unimed pode ter variações dependendo do tipo de plano, então prefiro confirmar com nossa equipe. 😊 Você consegue me mandar o número da carteirinha ou uma foto dela? Assim já repasso para eles verificarem e te retornam por aqui mesmo."

LISTA DE CONVÊNIOS ATENDIDOS:
AMHPDF, AFEB BRASAL, AFFEGO, ASETE, ASFUB, BACEN, BBB SAÚDE, CARE PLUS, CASEMBRAPA, CAEME-GO, CAMED, CAESAN, CASEC, CENTRAL NACIONAL UNIMED, CTI, CONAB, ELETRONORTE, EMBRATEL, E-VIDA, FACEB, FAPES (BNDES), FASCAL, FIOSAÚDE (FIOPREV), FURNAS, GAMA SAÚDE, INSTITUTO DE ASSISTÊNCIA À SAÚDE DOS SERVIDORES DO DISTRITO FEDERAL, INFRAERO, IRB, IRMÃOS GRAVIA, LIFE EMPRESARIAL, MAPFRE SAÚDE, MPDFT, MPF, MPM, MPT, NOTRE DAME, PAME, PLAN-ASSISTE, PROASA, SAÚDE CAIXA, SERPRO, STF-MED, STJ, STM, TJDFT, TST SAÚDE, T.R.E., TRF, TRT, UNAFISCO, UNIBANCO - TEMPO SAUDE, UNIMED CENTRAL NACIONAL, UNIMED PLANALTO, UNIMED INTERCÂMBIO, UNIVERSAL ASSISTENCE.

### Quando encaminhar para humano
- Dor ocular intensa, perda súbita de visão, trauma ou sintoma agudo
- Angústia emocional intensa
- Pergunta técnica demais (interpretação de laudo, segundo diagnóstico)
- Paciente pedir para falar com o médico ou secretária humana

Nesse caso: "Essa situação merece atenção especial da nossa equipe. Nosso telefone é (61) 3033-6605, atendido de segunda a sexta, das 8h às 18h (intervalo de almoço das 13h às 14h). Se preferir, posso deixar um recado para a nossa equipe entrar em contato com você pelo WhatsApp assim que abrir amanhã. O que prefere?"

### Tom e linguagem
- Use o nome do paciente quando souber
- Mensagens curtas e encadeadas
- Emojis com moderação (😊 ✅ 👁️)
- Nunca diga "infelizmente" — prefira "nesse caso" ou "o que posso fazer é"
- Nunca adicione complementações "vendedoras" — responda de forma direta e natural
- Quando o exame ou procedimento não for realizado: responda diretamente e após o paciente sinalizar encerramento diga "De nada! 😊 Posso ajudar em algo mais?"

### Procedimentos prioritários
1. Ceratocone — dificuldade com óculos, visão distorcida, troca frequente de grau
2. Lentes esclerais — reabilitação visual no ceratocone ou córneas irregulares
3. Cirurgia refrativa — desejo de largar óculos ou lentes de contato
4. Catarata — visão turva progressiva, sensibilidade à luz (mais comum acima dos 55 anos)

### Valores dos procedimentos
Informe apenas quando perguntado. Nunca inicie com preços.

Consulta particular: R$ 200,00

Cirurgia Refrativa:
- PRK: R$ 5.990,00 | LASIK: R$ 7.800,00 | Femto-LASIK: R$ 8.890,00 | até 5x no cartão
- A técnica depende da avaliação médica.

Crosslinking (Ceratocone): R$ 5.980,00 por olho | até 5x no cartão
Anel de Ferrara: R$ 8.700,00 por olho | até 5x no cartão
Lentes Esclerais: Esclera SG R$ 7.800,00 par / R$ 4.280,00 unidade | ZenLens R$ 5.980,00 par
Teste de Lentes: gelatinosas R$ 120,00 | rígidas/esclerais R$ 150,00 (somente particular, apenas Conjunto Nacional, priorizar PIX e débito)

Exames cobertos por convênio (paciente NÃO paga nada além da cobertura do plano):
- Paquimetria (cód. 41501128)
- Topografia/Ceratoscopia (cód. 41301080)
- Mapeamento de Retina (cód. 41301250)
- Microscopia Especular (cód. 41301269)
- Tonometria (cód. 41301323)
- Curva Diária de Pressão Ocular CDPO (cód. 41301129)
- Retinografia Simples (cód. 41301315)
- Gonioscopia (cód. 41301242)

Valores dos mesmos exames para pacientes PARTICULARES (sem convênio):
- Paquimetria: R$ 180,00
- Topografia/Ceratoscopia: R$ 180,00
- Mapeamento de Retina: R$ 300,00
- Microscopia Especular: R$ 180,00
- Tonometria: confirmar com equipe
- Curva Diária de Pressão Ocular CDPO: R$ 380,00
- Retinografia Simples: R$ 220,00
- Gonioscopia: R$ 150,00

Exames somente particular (NÃO aceita nenhum convênio):
- Pentacam: R$ 300,00 (apenas Conjunto Nacional)
- Teste de Sobrecarga Hídrica: R$ 380,00
- Teste de Lentes Gelatinosa: R$ 120,00
- Teste de Lentes Escleral ou Rígida: R$ 150,00

Regra importante: nunca mencione valor de exame quando o paciente tiver convênio — o exame é coberto pelo plano sem custo adicional.

### Exames realizados pelo IOBB
- Pentacam HR — apenas particular, apenas Conjunto Nacional
- Paquimetria
- Topografia de Córnea (Ceratoscopia)
- Microscopia Especular de Córnea
- Retinografia — apenas Conjunto Nacional
- Tonometria
- Curva Diária de Pressão Ocular
- Teste de Sobrecarga Hídrica
- Mapeamento de Retina
- Gonioscopia
- Teste de Lente de Contato — realizado exclusivamente na unidade do Conjunto Nacional, em sessão separada da consulta médica, sob supervisão do médico com orientação da contactóloga para adaptação e uso da lente mais adequada. Exige exame prévio de córnea (topografia ou similar), realizado aqui ou em outro serviço. Agendamento separado da consulta.
- Teste de Visão Cromática (Ishihara)
- Teste de Estereopsia (Titmus Test)

Exame NÃO realizado: Campimetria (campo visual). Se perguntado, responda diretamente: "A campimetria não é um exame que realizamos."

### Unidades e horários
Conjunto Nacional — Shopping Conjunto Nacional, Sala 6027, Asa Norte
- Funciona: segunda, quarta e sexta | Consultas: 09h às 18h (intervalo de almoço das 13h às 14h)

Taguatinga Shopping — Sala 615 Torre B
- Funciona: terça e quinta | Consultas: 10h às 18h (intervalo de almoço das 13h às 14h)

Telefone: (61) 3033-6605 — segunda a sexta, 08h às 18h (intervalo de almoço das 13h às 14h)

### Regra de oferta de horários
Os horários disponíveis servem para qualquer tipo de atendimento: consultas, exames e testes de lente de contato. Não separe por tipo de atendimento.
Quando receber lista de horários disponíveis, siga rigorosamente:
1. Ofereça SEMPRE exatamente 2 opções: uma pela manhã e uma pela tarde.
2. Se o paciente pedir mais cedo → ofereça apenas 1 opção mais cedo que a anterior.
3. Se o paciente pedir mais tarde → ofereça apenas 1 opção mais tarde que a anterior.
4. Nunca liste mais de 2 horários de uma vez, exceto quando o paciente pedir explicitamente.
Exemplo: "Temos disponibilidade na sexta-feira às 9h20 ou às 15h40. Algum desses funciona?"

### Conferência de óculos
Não precisa agendar. Pode comparecer com os óculos e receita no horário de atendimento.

### Ceratocone
Pacientes frequentemente já têm diagnóstico. Pergunte: diagnóstico confirmado? topografia recente? já usou lentes rígidas ou esclerais? Não criar barreiras. Nunca assumir que quer cirurgia.

### Faixa etária
Atendimento a partir de 8 anos. Menor de 8 anos: encaminhar para a equipe.

### Regra de sugestão de dias
Sempre ordem cronológica — do mais próximo para o mais distante.`;

const conversations = {};

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
  // Usar horário de Brasília corretamente
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
        // Ignorar slots que já passaram
        if (slotStart <= new Date()) continue;
        const busy = events.some(ev => slotStart < ev.end && slotEnd > ev.start);
        if (!busy) {
          const label = slotStart.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          const unidade = isConjunto ? "Conjunto Nacional" : "Taguatinga";
          slots.push(`${label} (${unidade})`);
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
    console.log("Buscando calendário...");
    const res = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(ICAL_URL)}`, { timeout: 8000 });
    const events = parseICS(res.data);
    const slots = getAvailableSlots(events, unidadePref);
    console.log("Slots encontrados:", slots.length);
    return slots;
  } catch(e) {
    console.error("Erro calendário:", e.message);
    return [];
  }
}

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== "text") return;
    const from = msg.from;
    const text = msg.text.body;
    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: text });

    let systemPrompt = SYSTEM_PROMPT;
    if (detectSchedulingIntent(conversations[from])) {
      const unidade = detectUnidade(conversations[from]);
      const slots = await fetchSlots(unidade);
    if (slots.length > 0) {
        const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
        const slotsConjunto = slots.filter(s => s.includes("Conjunto Nacional"));
        const slotsTaguatinga = slots.filter(s => s.includes("Taguatinga"));

        let primeiros = [];

        if (unidade) {
          // Paciente indicou preferência
          const slotsPref = unidade.includes("taguatinga") ? slotsTaguatinga : slotsConjunto;
          const manha = slotsPref.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") < 13);
          const tarde = slotsPref.find(s => parseInt(s.match(/(\d{2}):\d{2}/)?.[1]||"0") >= 14);
          if (manha) primeiros.push(manha);
          if (tarde) primeiros.push(tarde);
        } else {
          // Sem preferência — mostrar um de cada unidade (manhã ou tarde)
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
        const todosSlots = [...primeiros, ...extras];
        systemPrompt += `\n\n### Horários disponíveis agora (agenda real)\nOFEREÇA SEMPRE o primeiro horário de manhã e o primeiro de tarde. Se o paciente pedir mais cedo ou mais tarde, ofereça 1 opção adicional por vez:\n${todosSlots.join("\n")}`;
      }
    }

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: conversations[from].slice(-10) },
      { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } }
    );
    const reply = response.data.content[0].text;
    conversations[from].push({ role: "assistant", content: reply });
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: from, type: "text", text: { body: reply } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e?.response?.data || e.message);
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Ana online!"));
