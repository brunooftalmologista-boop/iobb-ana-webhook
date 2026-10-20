// ===== IMPORTAÇÃO DO iCLINIC (Dr. Bruno, 20/10/2026) ==========================
// Lê o ZIP da exportação completa do iClinic (CSV: patient, event_record,
// event_scheduling… + pasta attachment/) e converte para o formato do
// prontuário (a conversão em si está em iclinic-conv.js, que o navegador
// também usa). Função PURA: não grava nada — o servidor mostra o resumo e só
// importa com o OK do médico.
const AdmZip = require("adm-zip");
const { parse } = require("csv-parse/sync");
const { converter, pyLiteral, partesRefracao } = require("./iclinic-conv");

// Entrada: o ZIP inteiro (Buffer) OU as tabelas já separadas + a lista de
// anexos: { csv: { patient, event_record, event_scheduling }, anexos: [...] }.
function analisar(entrada, rotuloOrigem) {
  const ehZip = Buffer.isBuffer(entrada);
  const zip = ehZip ? new AdmZip(entrada) : null;
  const ents = ehZip ? zip.getEntries() : [];
  const lerCsv = (txt) => parse(String(txt || "").replace(/^\uFEFF/, ""), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  const csvDe = (sufixo) => {
    if (!ehZip) { const k = sufixo.replace(/^-/, "").replace(/\.csv$/, ""); return entrada.csv && entrada.csv[k] ? lerCsv(entrada.csv[k]) : []; }
    const e = ents.find((x) => x.entryName.endsWith(sufixo) && !x.entryName.includes("/")); return e ? lerCsv(e.getData().toString("utf8")) : []; };
  const nomesAnexos = ehZip ? ents.filter((e) => e.entryName.startsWith("attachment/") && !e.isDirectory).map((e) => e.entryName) : (entrada.anexos || []);
  const r = converter({ pacientes: csvDe("-patient.csv"), registros: csvDe("-event_record.csv"), agenda: csvDe("-event_scheduling.csv"), anexos: nomesAnexos }, rotuloOrigem);
  return { zip, ...r };
}

module.exports = { analisar, pyLiteral, partesRefracao };
