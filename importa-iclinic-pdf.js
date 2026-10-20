// ===== PRONTUÁRIO ANTERIOR DO iCLINIC EM PDF → LINHA DO TEMPO (20/10/2026) ====
// O PDF que o Dr. Bruno baixa do iClinic ("imprimir prontuário") e anexa na
// ficha vira consultas na linha do tempo, como na importação do ZIP. Leitura
// do texto do PDF (pdf.js), SEM IA. Cada consulta começa com "dd/mm/aaaa - hh:mm"
// + "Consulta realizada por …"; os campos são reconhecidos pelo nome (o mesmo
// do iClinic). Função pura: o servidor mostra o resumo e só grava com o OK.
let pdfjs = null;   // carregado só quando usado (evita avisos do pdf.js no boot do servidor)
const { partesRefracao } = require("./importa-iclinic");

const ABAS = new Set(["Hipótese diagnóstica / Conduta", "Anamnese e exame oftalmológico", "Exames complementares", "Imagens e anexos",
  "Pré-exame", "Prescrição", "Documentos e atestados", "Dados pessoais", "Dados complementares", "Dados familiares", "Convênios"]);
// Campos que ocupam a linha toda (o valor vem nas linhas de baixo).
const CAMPOS = new Set([
  "Hipótese diagnóstica", "Observações", "Diagnóstico", "HD", "Conduta", "Queixa principal", "História da moléstia atual", "História pregressa",
  "Refração OD", "Refração OE", "Refração", "Adição", "Biomicroscopia", "Biomicroscopia (descrição)", "Fundoscopia", "Fundoscopia (descrição)",
  "Fundoscopia (alterações DM/HAS)", "Topografia de córnea", "Topografia de córnea (descrição)", "Microscopia especular de córnea",
  "Prontuário anterior no SASC", "Acuidade visual corrigida", "Acuidade visual para perto com correção", "Acuidade visual", "Óculos anteriores",
  "Histórico pessoal", "Histórico familiar", "HF: Histórico familiar", "Qual o motivo da consulta?", "Qual o colírio utilizado para pré-exames?",
  "Qual o colírio utilizado?", "Faz uso de lentes de contato ou óculos?", "Alguma dificuldade para enxergar?", "Faz uso de óculos?",
  "Faz uso de algum colírio?", "Fez alguma cirurgia no olho?", "Faz uso de lentes de contato ou prótese?", "Alguma queixa com relação a visão?",
  "Gonioscopia", "Duração dos sintomas", "AV SC OD", "AV SC OE", "Prescrição de óculos", "Lentes sugeridas para computador e leitura",
  "Mapeamento de retina", "Atestado padrão", "Atestado padrão com CID", "Relatório oftalmológico", "RELATÓRIO OFTALMOLÓGICO",
]);
// Campos numéricos que vêm na MESMA linha do valor ("Tonometria olho direito 12").
const NUMERICOS = [
  ["Tonometria olho direito", " mmHg"], ["Tonometria olho esquerdo", " mmHg"],
  ["Densidade endotelial estimada em olho direito", " células/mm²"], ["Densidade endotelial estimada em olho esquerdo", " células/mm²"],
  ["Paquimetria central média (olho direito)", " µm"], ["Paquimetria central média (olho esquerdo)", " µm"],
  ["Paquimetria OD (Ponto mais fino)", " µm"], ["Paquimetria OE (Ponto mais fino)", " µm"],
];
const norm = (t) => String(t || "").replace(/:\s*$/, "").replace(/^HF:\s*/, "").trim();

async function linhasDoPdf(buf) {
  pdfjs = pdfjs || require("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let t = ""; for (const it of tc.items) t += it.str + (it.hasEOL ? "\n" : "");
    const ls = t.split("\n").map((l) => l.trim()).filter(Boolean);
    // cabeçalho repetido em toda página: nome, nascimento/sexo, prontuário, médico, "Página x de y"
    const k = ls.findIndex((l, j) => j < 8 && /^Página \d+ de \d+/.test(l));
    paginas.push(k >= 0 ? ls.slice(k + 1) : ls);
  }
  return paginas.flat();
}

function analisarLinhas(ls, rotuloOrigem) {
  // ---- cadastro (antes da primeira consulta) ----
  const iCons = ls.findIndex((l, j) => /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/.test(l) && /^Consulta realizada por /.test(ls[j + 1] || ""));
  const cab = iCons >= 0 ? ls.slice(0, iCons) : ls;
  const pega = (re) => { for (const l of cab) { const m = l.match(re); if (m) return (m[1] || "").trim(); } return ""; };
  const dig = (s) => String(s || "").replace(/\D/g, "");
  const cpf = dig(pega(/^CPF:\s*([\d.\-]+)/));
  const iConv = cab.indexOf("Convênios");
  const dados = {
    nascimento: pega(/^Data de nasc\.:\s*(\d{2}\/\d{2}\/\d{4})/), sexo: pega(/^Sexo:\s*(\S.*)$/),
    cpf: cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "", rg: pega(/RG:\s*(\S+)/),
    operadora: iConv >= 0 && cab[iConv + 1] && !/^Plano:/.test(cab[iConv + 1]) ? cab[iConv + 1] : "",
    carteirinha: pega(/^Número do cartão:\s*(\S.*)$/), iclinic_prontuario: pega(/^Prontuário:\s*#?(\d+)/),
  };

  // ---- consultas ----
  const consultas = [];
  for (let j = Math.max(iCons, 0); j < ls.length; j++) {
    const m = ls[j].match(/^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2})$/);
    if (!m || !/^Consulta realizada por /.test(ls[j + 1] || "")) continue;
    let k = j + 2; const corpo = [];
    while (k < ls.length && !(/^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/.test(ls[k]) && /^Consulta realizada por /.test(ls[k + 1] || ""))) corpo.push(ls[k++]);
    const por = ls[j + 1].replace(/^Consulta realizada por /, "").trim();
    const secoes = []; let atual = null;
    const abre = (rot, val) => { atual = { rot, linhas: val ? [val] : [] }; secoes.push(atual); };
    for (const l of corpo) {
      if (ABAS.has(l)) { atual = null; continue; }
      if (l === "Evolução") { abre("Evolução"); continue; }
      if (/^Ao exame:?$/.test(l) && atual && atual.rot === "Evolução") continue;
      const num = NUMERICOS.find(([n]) => l.startsWith(n + " "));
      if (num) { abre(num[0], l.slice(num[0].length).trim() + num[1]); atual = null; continue; }
      const sem = norm(l);
      if (CAMPOS.has(l) || CAMPOS.has(sem) || CAMPOS.has(l.replace(/:$/, ""))) { abre(sem); continue; }
      if (!atual) abre("Observações");
      atual.linhas.push(l);
    }
    const uteis = secoes.filter((s) => s.linhas.length);
    if (!uteis.length) continue;   // só "Imagens e anexos" (os arquivos não vêm no PDF)
    const campos = {}, chips = [], cids = [];
    for (const s of uteis) {
      if (/^Refração (OD|OE)$/.test(s.rot)) { const o = /OD/.test(s.rot) ? "od" : "oe"; const pr = partesRefracao(s.linhas[0]); if (pr) { campos[`re-${o}-esf`] = pr.esf; campos[`re-${o}-cil`] = pr.cil; campos[`re-${o}-eixo`] = pr.eixo; } }
      if (s.rot === "Adição") campos["re-add"] = s.linhas[0];
      if (s.rot === "Diagnóstico" || s.rot === "HD") for (const d of s.linhas) { const x = d.match(/^(.+?)\s*\(([A-Z]\d{2}(?:\.\d)?)\)$/); chips.push(`hd|${(x ? x[1] : d).trim()}`); if (x) cids.push([x[2], x[1].trim()]); }
      if (s.rot === "Hipótese diagnóstica") for (const d of s.linhas) { const x = d.match(/^([A-Z]\d{2})(\d?)\s*-\s*(.+)$/); if (x) cids.push([x[1] + (x[2] ? "." + x[2] : ""), x[3].trim()]); }
    }
    if (cids.length) campos["hd-cids"] = JSON.stringify(cids);
    const texto = [`Consulta importada do iClinic (${rotuloOrigem})${/anexar exames/i.test(por) ? " — pré-exame" : ""}.`,
      ...uteis.map((s) => `${s.rot}:${s.linhas.length > 1 ? "\n" : " "}${s.linhas.join("\n")}`)].join("\n\n");
    const data_consulta = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`).toISOString();
    consultas.push({ data_consulta, texto, dados: { campos, chips, importado: "iclinic-pdf", iclinic_origem: rotuloOrigem } });
  }
  return { dados, consultas };
}

async function analisarPdf(buf, rotuloOrigem) {
  const ls = await linhasDoPdf(buf);
  if (!ls.some((l) => /^Consulta realizada por /.test(l))) { const e = new Error("Este PDF não parece o prontuário impresso do iClinic (não achei nenhuma consulta)."); e.publico = true; throw e; }
  return analisarLinhas(ls, rotuloOrigem);
}

module.exports = { analisarPdf, analisarLinhas, linhasDoPdf };
