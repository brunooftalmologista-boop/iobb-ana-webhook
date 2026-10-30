// ===== PRONTUÁRIO COMPLETO EM PDF (Dr. Bruno, 30/10/2026) =====================
// Cópia para entregar ao paciente: histórico inteiro + exames realizados, num
// arquivo só, assinado com o certificado A1 do médico. A assinatura vem por último
// para cobrir tudo; assinar antes e juntar depois invalidaria o documento.
// Roda numa worker thread: decodificar dezenas de imagens e juntar PDFs de até 80 MB
// no processo principal seguraria o webhook da Ana e os lembretes até terminar.
// Sem IA, sem API paga.
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const crypto = require("crypto");
const { PDFDocument, PDFName, StandardFonts, rgb } = require("pdf-lib");
const { PNG } = require("pngjs");
const { SignPdf } = require("@signpdf/signpdf");
const { P12Signer } = require("@signpdf/signer-p12");
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib");
const { SUBFILTER_ETSI_CADES_DETACHED } = require("@signpdf/utils");
const { textoDoProntuario, limpaTexto } = require("./assinatura");

const A4 = [595.28, 841.89], MARGEM = 42, TOPO_LEGENDA = 16, RODAPE = 30;
const AZUL = rgb(0.122, 0.306, 0.475), CINZA = rgb(0.4, 0.44, 0.48);

// O tipo vem dos primeiros bytes: há exame do iClinic gravado como octet-stream.
function tipoDoArquivo(b) {
  if (b.length > 8 && b.subarray(0, 1024).includes("%PDF")) return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  return null;
}
// BMP do iClinic (1.100 exames): PDF não tem esse formato, vira PNG. Só o que os
// aparelhos geram (8, 24 e 32 bits sem compressão); o resto cai em "não incluído".
function bmpParaPng(b) {
  const inicio = b.readUInt32LE(10), dib = b.readUInt32LE(14), w = b.readInt32LE(18), hBruto = b.readInt32LE(22);
  const bits = b.readUInt16LE(28), comp = b.readUInt32LE(30), h = Math.abs(hBruto);
  if (!w || !h || w > 12000 || h > 12000 || ![8, 24, 32].includes(bits) || (comp !== 0 && !(comp === 3 && bits === 32))) throw new Error("BMP não suportado");
  const png = new PNG({ width: w, height: h }), passo = Math.floor((bits * w + 31) / 32) * 4, paleta = 14 + dib;
  for (let y = 0; y < h; y++) {
    const lin = inicio + (hBruto > 0 ? h - 1 - y : y) * passo;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const p = bits === 8 ? paleta + b[lin + x] * 4 : lin + x * (bits / 8);
      png.data[o] = b[p + 2]; png.data[o + 1] = b[p + 1]; png.data[o + 2] = b[p]; png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
// Lê cada exame antes de escrever a lista: quem falhar aqui vai para "não incluído"
// em vez de aparecer como anexado. Arquivo repetido (mesmo conteúdo) entra uma vez.
async function prepararExames(exames, etapa) {
  const prontos = [], fora = [], vistos = new Set();
  for (const [i, x] of exames.entries()) {
    etapa(`Lendo exame ${i + 1} de ${exames.length}…`);
    const buf = Buffer.from(x.buf);
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    if (vistos.has(hash)) continue;
    vistos.add(hash);
    const tipo = tipoDoArquivo(buf), item = { data: x.data, rotulo: x.rotulo };
    if (!tipo) { fora.push({ ...item, motivo: "formato que não pode ser juntado ao PDF" }); continue; }
    try {
      if (tipo === "pdf") {
        const pdf = await PDFDocument.load(buf);
        // Sem as anotações: a assinatura de um laudo já assinado viria junto, e um
        // campo de assinatura antigo no meio do arquivo confunde o validador.
        pdf.getPages().forEach(p => p.node.delete(PDFName.of("Annots")));
        prontos.push({ ...item, tipo, pdf });
      } else prontos.push({ ...item, tipo, buf: tipo === "bmp" ? bmpParaPng(buf) : buf });
    } catch (e) {
      fora.push({ ...item, motivo: /encrypt/i.test(e.message) ? "arquivo protegido por senha" : "arquivo que não abriu" });
    }
  }
  return { prontos, fora };
}
// Paisagem (a maioria das telas de exame) em meia folha; retrato ocupa a folha toda.
function novaFolhaDeImagem(doc) { const page = doc.addPage(A4); return { page, y: A4[1] - MARGEM, livre: 2 }; }
async function colocarImagem(doc, x, folha, negrito) {
  const img = x.tipo === "jpg" ? await doc.embedJpg(x.buf) : await doc.embedPng(x.buf);
  const deitada = img.width >= img.height, ocupa = deitada ? 1 : 2;
  if (!folha || folha.livre < ocupa) folha = novaFolhaDeImagem(doc);
  const larg = A4[0] - 2 * MARGEM, alto = (A4[1] - 2 * MARGEM - RODAPE) * (ocupa / 2) - TOPO_LEGENDA - 8;
  const esc = Math.min(larg / img.width, alto / img.height), w = img.width * esc, h = img.height * esc;
  folha.page.drawText(limpaTexto(`${x.data ? `${x.data} · ` : ""}${x.rotulo}`).slice(0, 100), { x: MARGEM, y: folha.y - 10, size: 9, font: negrito, color: AZUL });
  folha.page.drawImage(img, { x: MARGEM + (larg - w) / 2, y: folha.y - TOPO_LEGENDA - h, width: w, height: h });
  folha.y -= TOPO_LEGENDA + alto + 8; folha.livre -= ocupa;
  return folha;
}
async function montar({ paciente, consultas, exames, indisponiveis, cert }, etapa = () => {}) {
  const { prontos, fora } = await prepararExames(exames, etapa);
  const naoIncluidos = [...(indisponiveis || []), ...fora];
  etapa("Montando as consultas…");
  const texto = await textoDoProntuario({ ...paciente, consultas, exames: prontos.map(({ data, rotulo }) => ({ data, rotulo })), fora: naoIncluidos });
  const doc = await PDFDocument.load(texto);
  const nomeRodape = limpaTexto(paciente.nome);
  const rodapes = doc.getPages().map(() => "Instituto de Olhos Bruno Borges · (61) 3033-6605");
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  let folha = null;
  for (const [i, x] of prontos.entries()) {
    etapa(`Juntando exame ${i + 1} de ${prontos.length}…`);
    const legenda = `${nomeRodape} · Exame${x.data ? ` de ${x.data}` : ""}`;
    if (x.tipo === "pdf") {
      folha = null;
      const paginas = await doc.copyPages(x.pdf, x.pdf.getPageIndices());
      paginas.forEach(p => { doc.addPage(p); rodapes.push(legenda); });
    } else {
      const antes = doc.getPageCount();
      folha = await colocarImagem(doc, x, folha, negrito);
      if (doc.getPageCount() > antes) rodapes.push(legenda);
    }
  }
  const fonte = await doc.embedFont(StandardFonts.Helvetica), total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const { x, y, width } = p.getMediaBox();
    p.drawText(rodapes[i].slice(0, 110), { x: x + 24, y: y + 12, size: 7, font: fonte, color: CINZA });
    p.drawText(`Página ${i + 1} de ${total}`, { x: x + width - 74, y: y + 12, size: 7, font: fonte, color: CINZA });
  });
  etapa("Assinando…");
  await pdflibAddPlaceholder({
    pdfDoc: doc, reason: "Documento médico assinado digitalmente", contactInfo: "IOBB - (61) 3033-6605",
    name: cert.titular, location: "Brasília - DF", signatureLength: 16384, subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  const semAssinatura = Buffer.from(await doc.save({ useObjectStreams: false }));
  const pdf = await new SignPdf().sign(semAssinatura, new P12Signer(Buffer.from(cert.pfx), { passphrase: cert.senha }));
  return { pdf, nExames: prontos.length, fora: naoIncluidos, paginas: total };
}

function gerarProntuarioCompleto(entrada, etapa = () => {}) {
  return new Promise((ok, falha) => {
    const w = new Worker(__filename, { workerData: entrada });
    w.on("message", (m) => {
      if (m.etapa) etapa(m.etapa);
      else if (m.erro) falha(new Error(m.erro));
      else ok({ ...m, pdf: Buffer.from(m.pdf) });
    });
    w.on("error", falha);
    w.on("exit", (c) => { if (c) falha(new Error(`worker saiu com código ${c}`)); });
  });
}

if (!isMainThread && workerData?.paciente) {
  montar(workerData, (etapa) => parentPort.postMessage({ etapa }))
    .then((r) => parentPort.postMessage(r))
    .catch((e) => parentPort.postMessage({ erro: e.message }));
}

module.exports = { gerarProntuarioCompleto, montar, tipoDoArquivo, bmpParaPng };
