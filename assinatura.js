// ===== ASSINATURA DIGITAL (Dr. Bruno, 20/10/2026) ============================
// Receitas e pedidos de exame em PDF já assinados com o certificado A1 (ICP-
// Brasil) do médico — como o iClinic faz. Sem IA, sem API: o próprio servidor
// monta o PDF (pdfkit) e assina (PAdES, ETSI.CAdES.detached) com o .pfx.
// O .pfx e a senha ficam no banco CRIPTOGRAFADOS (AES-256-GCM). A chave vem da
// env CERT_KEY; sem ela, é derivada da chave do Supabase do servidor (trocar
// essa chave = cadastrar o certificado de novo). Quem envia o arquivo e a
// senha é o médico, na tela do prontuário — nunca passa por conversa.
const crypto = require("crypto");
const path = require("path");
const forge = require("node-forge");
const PDFDocument = require("pdfkit");
const { SignPdf } = require("@signpdf/signpdf");
const { P12Signer } = require("@signpdf/signer-p12");
const { pdfkitAddPlaceholder } = require("@signpdf/placeholder-pdfkit");
const { SUBFILTER_ETSI_CADES_DETACHED } = require("@signpdf/utils");

const TZ = "America/Sao_Paulo";
const ASSETS = path.join(__dirname, "assets");
const FONTE = path.join(ASSETS, "fonts", "EBGaramond-SemiBold.ttf");
const FONTE_NEGRITO = path.join(ASSETS, "fonts", "EBGaramond-ExtraBold.ttf");
const LOGO = path.join(ASSETS, "logo-receita.png");
const mm = (v) => v * 72 / 25.4;

/* ---------------- cofre do certificado ---------------- */
function chave(segredoReserva) {
  const base = process.env.CERT_KEY || segredoReserva;
  if (!base) throw new Error("sem chave para proteger o certificado");
  return crypto.createHash("sha256").update(`iobb-certificado-v1|${base}`).digest();
}
function cifrar(obj, segredo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(segredo), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64");
}
function decifrar(txt, segredo) {
  const b = Buffer.from(txt, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(segredo), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}

// Abre o .pfx com a senha e devolve quem é o titular. Erra com mensagem clara
// se a senha estiver errada, se não houver chave privada ou se estiver vencido.
function lerCertificado(pfx, senha) {
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), senha); }
  catch (_) { const e = new Error("Não consegui abrir o certificado: confira a senha e se o arquivo é o .pfx/.p12."); e.publico = true; throw e; }
  const chaves = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  if (!chaves.length || !chaves[0].key) { const e = new Error("O arquivo não tem a chave privada (precisa ser o certificado A1 completo, .pfx)."); e.publico = true; throw e; }
  const pub = forge.pki.setRsaPublicKey(chaves[0].key.n, chaves[0].key.e);
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map(b => b.cert).filter(Boolean);
  const meu = certs.find(c => c.publicKey && c.publicKey.n && c.publicKey.n.equals(pub.n)) || certs[0];
  if (!meu) { const e = new Error("O arquivo não tem o certificado."); e.publico = true; throw e; }
  const cn = (meu.subject.getField("CN") || {}).value || "";
  const [nome, cpf] = String(cn).split(":");
  const emissor = (meu.issuer.getField("CN") || {}).value || "";
  const validade = meu.validity.notAfter;
  if (validade.getTime() < Date.now()) { const e = new Error(`Este certificado venceu em ${validade.toLocaleDateString("pt-BR", { timeZone: TZ })}.`); e.publico = true; throw e; }
  return { titular: nome || cn, cpf_final: cpf ? String(cpf).slice(-3) : null, emissor, validade: validade.toISOString(), cadeia: certs.length };
}

/* ---------------- montagem dos documentos ---------------- */
const RECOMENDA_PACIENTE = [
  "Não deixe de conferir seus óculos com o médico oftalmologista antes de usá-los.",
  "Esta receita é adequada apenas para montagem de óculos.",
  "Nos 15 primeiros dias de uso efetivo é normal sentir tonturas, cefaléias, desníveis, etc.",
  "Se contudo, após esse período, ainda sentir algo, solicite uma revisão sem qualquer ônus.",
  "As lentes bifocais e multifocais exigem maior período de adaptação, cuidado ao subir e descer degraus.",
  "Um exame de vista é sempre oportuno antes de seu filho começar a estudar.",
  "Depois dos 40 anos, seja mais frequente ao consultório do seu oftalmologista.",
  "Faça seus óculos na ótica de sua preferência, trazendo-os depois para serem conferidos.",
];
const RECOMENDA_OTICA = [
  "A distância nasopupilar deve ser medida separadamente para cada olho e com pupilômetro.",
  "A altura do centro óptico deve ser aferida tanto para longe como para correção de perto.",
  "A curva base da prescrição anterior deve ser sempre mantida.",
  "Para cada 2º graus de ângulo pantoscópico descer 1 mm do centro óptico da lente com relação ao centro pupilar ( 3 a 5 mm é o ideal ). A armação deve ter um ângulo pantoscópico correto ( 7º a 12º graus ) e a distância ao vértice deve ser a habitual ( 1,5 cm ).",
  "Em casos de cilindros maiores que 2 dioptrias, indicar armações com a menor distância ao vértice possível.",
  "Sr. Óptico favor manter as marcas originais de fábrica em caso de multifocais.",
];

function novaPagina(doc) { doc.addPage({ size: "A4", margins: { top: mm(16), bottom: mm(18), left: mm(20), right: mm(20) } }); }
function cabecalho(doc, data, via) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  if (via) doc.font("G6").fontSize(10).text(via, L, mm(10), { width: W, align: "right" });
  doc.image(LOGO, L + W - mm(48.6), mm(16), { width: mm(48.6) });
  doc.font("G6").fontSize(11.5).text(`Brasília, ${data}.`, L, mm(16) + mm(14), { width: W - mm(55) });
  doc.y = mm(16) + mm(30); doc.x = L;
}
// Rodapé em toda página. Desenhado com a margem de baixo zerada (senão o
// pdfkit acha que o texto passou do fim da página e abre outra) e devolvendo
// o cursor para onde estava.
function rodape(doc) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const { x, y } = doc, mb = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("G6").fontSize(8.5).fillColor("#000")
    .text("Instituto de Olhos Bruno Borges · Shopping Conjunto Nacional, sala 6017 · Brasília - DF · (61) 3033-6605 / (61) 98406-0001", L, doc.page.height - mm(12), { width: W, align: "center", lineBreak: false });
  doc.page.margins.bottom = mb; doc.x = x; doc.y = y;
}
function assinatura(doc, carimbo, rqe) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  if (doc.y > doc.page.height - mm(62)) { novaPagina(doc); }
  doc.y += mm(14);
  const xl = L + W / 2 - mm(35);
  doc.moveTo(xl, doc.y).lineTo(xl + mm(70), doc.y).lineWidth(0.8).strokeColor("#000").stroke();
  doc.y += mm(2);
  doc.font("G6").fontSize(11).text("Dr. Bruno O. Borges", L, doc.y, { width: W, align: "center" })
    .text("Médico Oftalmologista", { width: W, align: "center" })
    .text(rqe ? "CRM: 17877 - RQE: 9314" : "CRM: 17877", { width: W, align: "center" });
  doc.moveDown(0.6);
  doc.fontSize(8.5).text(carimbo, L, doc.y, { width: W, align: "center" });
}

function corpoOculos(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  doc.font("G6").fontSize(12.5).text(`Nome: ${d.nome}`, L, doc.y);
  doc.moveDown(1.2);
  doc.font("G8").fontSize(15).text(d.titulo, L, doc.y, { width: W, align: "center", characterSpacing: 0.8 });
  doc.moveDown(0.8);
  const cols = [W * 0.34, W * 0.66 / 3, W * 0.66 / 3, W * 0.66 / 3], h = 22;
  const linhas = [["", "ESFÉRICO", "CILÍNDRO", "EIXO"], ...d.linhas];
  if (d.adicao) linhas.push(["ADIÇÃO", d.adicao]);
  let y = doc.y;
  for (const [i, ln] of linhas.entries()) {
    let x = L;
    if (ln.length === 2) {   // adição ocupa as três colunas
      doc.rect(x, y, cols[0], h).stroke(); doc.rect(x + cols[0], y, W - cols[0], h).stroke();
      doc.font("G8").fontSize(11.5).text(ln[0], x + 6, y + 6, { width: cols[0] - 12 });
      doc.font("G6").text(ln[1], x + cols[0], y + 6, { width: W - cols[0], align: "center" });
    } else {
      ln.forEach((t, j) => {
        doc.lineWidth(0.8).rect(x, y, cols[j], h).stroke();
        doc.font(i === 0 || j === 0 ? "G8" : "G6").fontSize(11.5).text(String(t || ""), x + (j === 0 ? 6 : 0), y + 6, { width: cols[j] - (j === 0 ? 12 : 0), align: j === 0 ? "left" : "center" });
        x += cols[j];
      });
    }
    y += h;
  }
  doc.y = y + mm(5); doc.x = L;
  doc.font("G6").fontSize(11.5).text(d.sugestao, L, doc.y, { width: W });
  doc.moveDown(0.8);
  doc.font("G8").fontSize(11.5).text("IMPORTANTE", L, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.3).text("RECOMENDAÇÕES PARA O PACIENTE:", { characterSpacing: 0.4 });
  doc.font("G6").fontSize(10).list(RECOMENDA_PACIENTE, { bulletRadius: 1.6, textIndent: 10, width: W });
  doc.moveDown(0.5);
  doc.font("G8").fontSize(11.5).text("RECOMENDAÇÕES PARA AS ÓTICAS:", L, doc.y, { characterSpacing: 0.4 });
  doc.font("G6").fontSize(10).list(RECOMENDA_OTICA, { bulletRadius: 1.6, textIndent: 10, width: W });
  doc.moveDown(0.8);
  doc.font("G8").fontSize(11.5).text(`Data da próxima consulta: ${d.proxima}`, L, doc.y);
}
function corpoColirios(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  doc.font("G6").fontSize(12.5).text(`Nome: ${d.nome}`, L, doc.y);
  if (d.duas_vias) doc.text(`Idade: ${d.idade != null ? d.idade + " anos" : "________"}     Sexo: ${d.sexo || ""}`);
  doc.moveDown(1.2);
  doc.font("G8").fontSize(15).text("RECEITUÁRIO", L, doc.y, { width: W, align: "center", characterSpacing: 0.8 });
  doc.moveDown(0.8);
  doc.font("G8").fontSize(11.5).text("USO OFTÁLMICO", L, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.6);
  d.meds.forEach((m, i) => {
    const y = doc.y;
    doc.font("G8").fontSize(12).text(`${i + 1}. ${m.med}`, L, y, { width: W - mm(35) });
    const yFim = doc.y;
    if (m.qtd) doc.font("G6").text(m.qtd, L + W - mm(35), y, { width: mm(35), align: "right" });
    doc.font("G6").fontSize(11.5).text(m.pos, L + mm(5), Math.max(yFim, doc.y) + 2, { width: W - mm(5) });
    doc.moveDown(0.9);
  });
}
function corpoPedido(doc, d, exames) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  doc.font("G6").fontSize(12.5).text(`Nome: ${d.nome}${d.idade != null ? `     Idade: ${d.idade} anos` : ""}`, L, doc.y);
  if (d.convenio) doc.text(`Convênio: ${d.convenio}${d.carteirinha ? `     Carteirinha: ${d.carteirinha}` : ""}`);
  doc.moveDown(1.2);
  doc.font("G8").fontSize(15).text("SOLICITAÇÃO DE EXAMES", L, doc.y, { width: W, align: "center", characterSpacing: 0.8 });
  doc.moveDown(0.8);
  doc.font("G6").fontSize(12).text("Solicito:", L, doc.y);
  doc.moveDown(0.4);
  exames.forEach((e, i) => {
    const y = doc.y;
    doc.font("G8").fontSize(12).text(`${i + 1}. ${e}`, L + mm(3), y, { width: W - mm(45) });
    const yFim = doc.y;
    doc.font("G6").text(d.olho || "Ambos os olhos", L + W - mm(42), y, { width: mm(42), align: "right" });
    doc.y = Math.max(yFim, doc.y); doc.moveDown(0.5);
  });
  if (d.indicacao) { doc.moveDown(0.5); doc.font("G8").fontSize(11.5).text("Indicação clínica: ", L, doc.y, { continued: true }).font("G6").text(d.indicacao, { width: W }); }
}

// Monta o PDF, reserva o espaço da assinatura e assina com o .pfx.
async function documentoAssinado(tipo, d, cert) {
  const agora = new Date();
  const quando = agora.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const carimbo = `Documento assinado digitalmente com certificado ICP-Brasil de ${cert.titular} em ${quando}. Confira a assinatura em validar.iti.gov.br.`;
  const titulos = { oculos: "Receita de óculos", colirios: "Receita", pedido: "Pedido de exames" };
  const doc = new PDFDocument({ size: "A4", autoFirstPage: false, pdfVersion: "1.7",
    info: { Title: `${titulos[tipo] || "Documento"} - ${d.nome}`, Author: "Dr. Bruno O. Borges - CRM 17877", Creator: "IOBB - prontuário" } });
  doc.registerFont("G6", FONTE); doc.registerFont("G8", FONTE_NEGRITO);
  const partes = []; doc.on("data", (c) => partes.push(c));
  const fim = new Promise((ok, falha) => { doc.on("end", ok); doc.on("error", falha); });
  doc.on("pageAdded", () => rodape(doc));
  const paginas = [];   // [via, desenha]
  if (tipo === "oculos") paginas.push(["", () => { corpoOculos(doc, d); assinatura(doc, carimbo, false); }]);
  else if (tipo === "colirios") (d.duas_vias ? ["1ª via — farmácia", "2ª via — paciente"] : [""]).forEach(via => paginas.push([via, () => { corpoColirios(doc, d); assinatura(doc, carimbo, false); }]));
  else if (tipo === "pedido") (d.separado ? d.exames.map(e => [e]) : [d.exames]).forEach(lista => paginas.push(["", () => { corpoPedido(doc, d, lista); assinatura(doc, carimbo, true); }]));
  else throw new Error("tipo de documento desconhecido");
  for (const [via, desenha] of paginas) { novaPagina(doc); cabecalho(doc, d.data, via); desenha(); }
  // (a v4 já fecha a assinatura e o widget; fechar de novo duplica o ByteRange)
  pdfkitAddPlaceholder({
    pdf: doc, pdfBuffer: Buffer.from([]), reason: "Documento médico assinado digitalmente",
    contactInfo: "IOBB - (61) 3033-6605", name: cert.titular, location: "Brasília - DF",
    signatureLength: 16384, subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  doc.end();
  await fim;
  const pdf = Buffer.concat(partes);
  const signer = new P12Signer(cert.pfx, { passphrase: cert.senha });
  return await new SignPdf().sign(pdf, signer);
}

module.exports = { cifrar, decifrar, lerCertificado, documentoAssinado };
