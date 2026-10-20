// ===== CONVERSOR iCLINIC → PRONTUÁRIO (comum ao servidor e ao navegador) =====
// Recebe as linhas já lidas dos CSV (patient, event_record, event_scheduling) e
// a lista de anexos do ZIP; devolve pacientes, consultas e anexos no formato do
// prontuário. Sem dependências: o servidor usa (importa-iclinic.js) e o
// navegador também (/prontuario/iclinic-conv.js), nas exportações de GB que
// não podem passar pelo servidor.
(function (raiz) {
const dig = (s) => String(s || "").replace(/\D/g, "");
const ult8 = (t) => dig(t).slice(-8);
const primNome = (t) => String(t || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const chavePaciente = (tel, nome) => `${ult8(tel)}|${primNome(nome)}`;
const foneBR = (t) => { const d = dig(t); if (d.length === 10 || d.length === 11) return "55" + d; if (d.length >= 12) return d; return null; };
const dmy = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const cap = (t) => { const s = String(t || "").trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };

// O iClinic grava listas e dicionários no formato do Python ("['a', 'b']",
// "{'x': None}"). Mini-leitor desse formato (strings, números, listas,
// dicionários, None/True/False).
function pyLiteral(src) {
  const s = String(src || ""); let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  function val() {
    ws(); const c = s[i];
    if (c === "[" || c === "(") { const fim = c === "[" ? "]" : ")"; i++; const out = []; ws();
      while (s[i] !== fim) { out.push(val()); ws(); if (s[i] === ",") { i++; ws(); } else if (s[i] !== fim) throw new Error("lista"); } i++; return out; }
    if (c === "{") { i++; const out = {}; ws();
      while (s[i] !== "}") { const k = val(); ws(); if (s[i] !== ":") throw new Error("dict"); i++; out[k] = val(); ws(); if (s[i] === ",") { i++; ws(); } } i++; return out; }
    if (c === "'" || c === '"') { const q = c; i++; let out = "";
      while (i < s.length && s[i] !== q) { if (s[i] === "\\" && i + 1 < s.length) { const n = s[i + 1]; out += n === "n" ? "\n" : n === "t" ? "\t" : n; i += 2; } else out += s[i++]; }
      i++; return out; }
    const m = s.slice(i).match(/^(None|True|False|-?\d+(?:\.\d+)?)/);
    if (!m) throw new Error("valor"); i += m[0].length;
    return m[1] === "None" ? null : m[1] === "True" ? true : m[1] === "False" ? false : Number(m[1]);
  }
  return val();
}
const lista = (v) => { if (Array.isArray(v)) return v; const t = String(v ?? "").trim(); if (/^[\[{(]/.test(t)) { try { return pyLiteral(t); } catch (_) { /* texto comum */ } } return t ? [t] : []; };
const semHtml = (h) => String(h || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const pack = (x) => { const t = String(x || ""); if (!t.startsWith("json::")) return null; try { return JSON.parse(t.slice(6)); } catch (_) { return null; } };

// "-4,50 -1,50x10º" → { esf, cil, eixo }
function partesRefracao(t) {
  const s = String(t || "").replace(/\s+/g, " ").trim(); if (!s) return null;
  const num = "[+-]?\\d+(?:[.,]\\d+)?";
  const m = s.match(new RegExp(`^(${num}|plano|pl)(?:\\s*(${num})\\s*(?:x|X|×)\\s*(\\d{1,3})\\s*[º°]?)?`, "i"));
  if (!m) return null;
  const f = (n) => { if (!n || /^pl/i.test(n)) return "Plano"; const v = Number(n.replace(",", ".")); return (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(2).replace(".", ","); };
  return { esf: f(m[1]), cil: m[2] ? f(m[2]) : "", eixo: m[3] ? String(Number(m[3]) || 180) : "" };
}
function textoValor(it) {
  const k = it.kind, v = it.value;
  if (k === "lt") return semHtml(v);
  if (k === "nu") return v != null && String(v).trim() !== "" ? `${v}${it.unity ? " " + it.unity : ""}` : "";
  if (k === "op") return textoOculos(v);
  let l = lista(v).map((x) => semHtml(typeof x === "string" ? x : JSON.stringify(x)).trim()).filter(Boolean);
  if (k === "db") l = l.map((d) => d.replace(/^([A-Z]\d{2})(\d)\s*-\s*/, "$1.$2 - "));   // "H186 - Ceratocone" → "H18.6 - Ceratocone"
  return l.length > 1 ? l.join("\n") : (l[0] || "");
}
function textoOculos(v) {
  let o; try { o = lista(v)[0]; } catch (_) { o = null; } if (!o || typeof o !== "object") return "";
  const linha = (pre, olho) => { const e = o[`${pre}_${olho}_spherical`], c = o[`${pre}_${olho}_cylindrical`], x = o[`${pre}_${olho}_axis`];
    return e || c ? `${e || "Plano"}${c ? " " + c : ""}${c && x != null ? " x " + x + "°" : ""}` : ""; };
  const out = [];
  for (const [pre, rot] of [["far", "Longe"], ["near", "Perto"]]) {
    const od = linha(pre, "re"), oe = linha(pre, "le");
    if (od || oe) out.push(`${rot}: olho direito ${od || "—"}; olho esquerdo ${oe || "—"}.`);
  }
  if (o.addition || o.add) out.push(`Adição: ${o.addition || o.add}.`);
  return out.join("\n");
}

// Entrada: o ZIP inteiro (Buffer) OU, para exportações grandes (GB), as tabelas
// já separadas e só a LISTA de anexos: { csv: { patient, event_record,
// event_scheduling }, anexos: ["attachment/…", …] } — os arquivos sobem depois.

function converter(ent, rotuloOrigem) {
  const pacientesCsv = ent.pacientes || [], registros = ent.registros || [], agenda = ent.agenda || [];
  if (!pacientesCsv.length || !registros.length) throw Object.assign(new Error("Este arquivo não parece uma exportação do iClinic (faltam patient.csv / event_record.csv)."), { publico: true });
  const nomesAnexos = ent.anexos || [];
  const anexosZip = new Map(nomesAnexos.map((n) => [n.slice("attachment/".length), n]));
  const problemas = [];

  // ---- pacientes ----
  const porId = new Map();
  for (const p of pacientesCsv) {
    let tel = foneBR(p.mobile_phone) || foneBR(p.home_phone) || foneBR(p.office_phone);
    if (!tel) { const a = agenda.find((s) => s.patient_id === p.patient_id && (foneBR(s.patient_mobile_phone) || foneBR(s.patient_home_phone))); if (a) tel = foneBR(a.patient_mobile_phone) || foneBR(a.patient_home_phone); }
    const nome = String(p.name || p.civil_name || "").trim();
    if (!nome) { problemas.push(`Paciente sem nome (iClinic ${p.patient_id}) — não importado.`); continue; }
    // sem telefone: entra com um marcador "iclinic-<id>" (ficha própria, achada pela busca por nome/CPF/nascimento)
    if (!tel) { tel = `iclinic-${p.patient_id}`; problemas.push(`Paciente sem telefone no iClinic (${nome.split(" ")[0]} …, iClinic ${p.patient_id}) — entra sem telefone; ache pela busca.`); }
    const conv = pack(p.healthinsurance_pack);
    const dados = {
      nome_completo: nome, cpf: dig(p.cpf).length === 11 ? dig(p.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "",
      nascimento: dmy(p.birthdate), rg: String(p.rg || "").trim(), cns: dig(p.cns),
      sexo: p.gender === "f" ? "Feminino" : p.gender === "m" ? "Masculino" : "",
      operadora: conv && conv.name && !/particular/i.test(conv.name) ? conv.name : "",
      iclinic_id: p.patient_id, iclinic_origem: rotuloOrigem,
    };
    porId.set(p.patient_id, { chave: chavePaciente(tel, nome), nome, telefone: tel, pk: p.pk, dados });
  }

  // ---- consultas ----
  const ORDEM_ABA = { "Anamnese e exame oftalmológico": 1, "Hipótese diagnóstica / Conduta": 2, "Prescrição": 3, "Documentos e atestados": 4 };
  const consultas = [];
  for (const r of registros) {
    const pac = porId.get(r.patient_id);
    if (!pac) { problemas.push(`Consulta ${r.pk} de paciente não importado — ignorada.`); continue; }
    const blocos = pack(r.eventblock_pack) || {};
    const itens = [];
    for (const [k, v] of Object.entries(blocos)) for (const it of (Array.isArray(v) ? v : [v])) if (it && typeof it === "object") itens.push({ ...it, _k: k });
    itens.sort((a, b) => (ORDEM_ABA[a.tab] || 9) - (ORDEM_ABA[b.tab] || 9) || Number(a.ordering || 0) - Number(b.ordering || 0));
    const secoes = [], campos = {}, chips = [], cids = [], anexos = [];
    for (const it of itens) {
      if (it._k === "image") {
        const caminho = String(it.image || "");
        const noZip = anexosZip.get(caminho);
        const desc = it.description && it.description !== "None" ? String(it.description).trim() : "";
        const ext = caminho.split(".").pop().toLowerCase();
        // programas/scripts não entram (segurança): só documentos e imagens de exame
        if (/^(exe|bat|cmd|com|msi|scr|vbs|js|jar|ps1|sh|dll|app|apk|lnk)$/.test(ext)) { problemas.push(`Arquivo executável (.${ext}) na consulta ${r.pk} — não importado por segurança.`); continue; }
        if (noZip) anexos.push({ zipPath: noZip, nome: `${desc ? cap(desc.toLowerCase()) : "Exame iClinic"} ${dmy(r.date)} (${anexos.length + 1}).${ext}`, obs: desc ? cap(desc.toLowerCase()) : "Exame (iClinic)" });
        else problemas.push(`Anexo citado na consulta ${r.pk} não veio no ZIP.`);
        continue;
      }
      if (it._k === "prescription_v3") {
        let p = null; try { p = pyLiteral(it.items); } catch (_) { p = null; }
        const drogas = (p && p.drugs) || [];
        if (drogas.length) secoes.push(`Prescrição de medicamentos:\n${drogas.map((d) => `${d.name || "Medicamento"}: ${semHtml(d.posology || "").replace(/\n+/g, " ")}`).join("\n")}`);
        continue;
      }
      if (it._k === "attest") { const t = semHtml(it.value); if (t) secoes.push(`${it.name || "Atestado"}:\n${t}`); continue; }
      // "HF: Histórico familiar" → "Histórico familiar"; outros ":" viram " -" (a linha do tempo usa o ":" para separar título e texto)
      const rot = String(it.name || "").replace(/:\s*$/, "").replace(/^[A-Z]{1,4}:\s*/, "").replace(/:/g, " -").trim(); if (!rot) continue;
      const val = textoValor(it); if (!val) continue;
      secoes.push(`${rot}:${val.includes("\n") ? "\n" : " "}${val}`);
      // campos que o prontuário novo usa (refração anterior, últimos diagnósticos)
      if (/^Refração (OD|OE)$/i.test(rot)) { const o = /OD/i.test(rot) ? "od" : "oe"; const pr = partesRefracao(val); if (pr) { campos[`re-${o}-esf`] = pr.esf; campos[`re-${o}-cil`] = pr.cil; campos[`re-${o}-eixo`] = pr.eixo; } }
      if (/^Adição$/i.test(rot)) campos["re-add"] = val;
      if (/^(Diagnóstico|HD)$/i.test(rot)) for (const d of lista(it.value)) { const n = cap(String(d).trim()); if (n) chips.push(`hd|${n}`); }
      if (/^Hipótese diagnóstica$/i.test(rot)) for (const d of lista(it.value)) { const m = String(d).match(/^([A-Z]\d{2})(\d?)\s*-\s*(.+)$/); if (m) cids.push([m[1] + (m[2] ? "." + m[2] : ""), m[3].trim()]); }
    }
    if (cids.length) campos["hd-cids"] = JSON.stringify(cids);
    const soAnexo = /anexar exames/i.test(r.physician_name || "");
    if (!secoes.length && !anexos.length) continue;   // registro vazio
    const conv = pack(r.healthinsurance_pack);
    const cabec = [`Consulta importada do iClinic (${rotuloOrigem})${conv && conv.name ? ` — ${conv.name}` : ""}.`,
      `Paciente: ${pac.nome}${pac.dados.nascimento ? ` (nasc. ${pac.dados.nascimento})` : ""}.`];
    const texto = [...cabec, ...(secoes.length ? secoes : [soAnexo ? "Exames anexados no iClinic." : ""])].filter(Boolean).join("\n\n");
    const ini = `${r.date}T${(r.start_time || "08:00:00").slice(0, 8)}-03:00`;
    // duração NÃO é importada: no iClinic é o tempo que a ficha ficou aberta (horas), não a consulta
    consultas.push({ iclinic_pk: r.pk, chave: pac.chave, nome: pac.nome, telefone: pac.telefone, data_consulta: new Date(ini).toISOString(),
      duracao_seg: null, texto, dados: { campos, chips, importado: "iclinic", iclinic_pk: r.pk, iclinic_origem: rotuloOrigem }, anexos });
  }
  // convênio vazio no cadastro: usa o da consulta mais recente que não seja particular
  const ultConv = new Map();
  for (const r of [...registros].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const c = pack(r.healthinsurance_pack); if (c && c.name && !/particular/i.test(c.name)) ultConv.set(r.patient_id, c.name); }
  for (const [id, p] of porId) if (!p.dados.operadora && ultConv.get(id)) p.dados.operadora = ultConv.get(id);
  const pacientes = [...porId.values()];
  return { pacientes, consultas, problemas,
    resumo: { pacientes: pacientes.length, consultas: consultas.length, anexos: consultas.reduce((n, c) => n + c.anexos.length, 0),
      periodo: consultas.length ? [consultas.map((c) => c.data_consulta).sort()[0], consultas.map((c) => c.data_consulta).sort().slice(-1)[0]] : null } };
}

const API = { converter, pyLiteral, partesRefracao, chavePaciente };
if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.IclinicConv = API;
})(typeof window !== "undefined" ? window : globalThis);
