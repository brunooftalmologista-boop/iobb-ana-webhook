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
  const now = new Date();
  const slots = [];
  for (let d = 1; d <= 14; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
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
        const slotStart = new Date(day.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + `T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00-03:00`);
        const slotEnd = new Date(slotStart.getTime() + 20 * 60000);
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
    const res = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(ICAL_URL)}`);
    const events = parseICS(res.data);
    return getAvailableSlots(events, unidadePref);
  } catch {
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

    let systemPrompt = process.env.SYSTEM_PROMPT;
    if (detectSchedulingIntent(conversations[from])) {
      const unidade = detectUnidade(conversations[from]);
      const slots = await fetchSlots(unidade);
      if (slots.length > 0) {
        systemPrompt += `\n\n### Horários disponíveis agora (agenda real)\nUse esses horários ao oferecer opções ao paciente. Ofereça no máximo 2 por vez:\n${slots.slice(0, 10).join("\n")}`;
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
