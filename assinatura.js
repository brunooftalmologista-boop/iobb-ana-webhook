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
// Revisadas com o Dr. Bruno em 22/10/2026 (as antigas eram de mais de 10 anos atrás).
const RECOMENDA_PACIENTE = [
  "Faça seus óculos na ótica de sua preferência e traga-os para conferência antes de usá-los.",
  "Esta receita vale apenas para óculos: não serve para lentes de contato.",
  "Nos primeiros 15 dias de uso é normal um período de adaptação (leve tontura, dor de cabeça, sensação de chão desnivelado).",
  "Se o desconforto continuar após esse período, agende uma revisão sem custo.",
  "As lentes bifocais e multifocais exigem maior período de adaptação: use-as o tempo todo nos primeiros dias, pois isso acelera a adaptação, e, para enxergar degraus, abaixe a cabeça em vez de só os olhos.",
  "Faça revisão oftalmológica anual: após os 40 anos aumentam doenças silenciosas, como o glaucoma.",
  "Guarde esta receita: a ótica e o consultório podem precisar dela.",
];
const RECOMENDA_OTICA = [
  "A distância nasopupilar deve ser medida separadamente para cada olho, com pupilômetro ou sistema digital de medição.",
  "A altura do centro óptico deve ser aferida tanto para longe como para correção de perto; em multifocais, medir a altura com a armação já ajustada ao rosto.",
  "Manter a curva base da lente anterior sempre que possível.",
  "Para cada 2° de ângulo pantoscópico, descer 1 mm o centro óptico em relação ao centro pupilar (3 a 5 mm é o ideal). A armação deve ter ângulo pantoscópico de 7° a 12° e distância ao vértice habitual (12 a 14 mm).",
  "Em lentes personalizadas (free-form), informar ao laboratório DNP, altura, ângulo pantoscópico, distância ao vértice e curvatura da armação.",
  "Em casos de cilindros maiores que 2 dioptrias, indicar armações com a menor distância ao vértice possível.",
  "Em multifocais, manter as marcações de fábrica até a conferência no consultório.",
  "Dúvidas sobre a receita: contatar o consultório antes de confeccionar as lentes.",
];

// ===== MOLDURA DOS DOCUMENTOS (visual único, 22/10/2026) =========================
// Todos os PDFs assinados (receitas, pedido, atestado, laudo) usam o mesmo desenho:
// logo + dados do médico com filete azul no topo, título espaçado, cartão do paciente,
// assinatura com o cartão verde de verificação e rodapé discreto com o endereço.
const AZUL = "#1f4e79", CINZA = "#3d4852", FUNDO = "#f2f5f8", VERDE = "#2e9e45";
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const dataExtenso = (d) => { const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${+m[1]} de ${MESES[+m[2] - 1]} de ${m[3]}` : String(d || ""); };
function novaPagina(doc) { doc.addPage({ size: "A4", margins: { top: mm(16), bottom: mm(22), left: mm(20), right: mm(20) } }); }
function cabecalho(doc, data, via) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right, top = mm(13);
  doc.image(LOGO, L, top, { width: mm(46) });
  doc.font("GT").fontSize(13).fillColor(AZUL).text("Dr. Bruno O. Borges", L, top, { width: W, align: "right" });
  doc.font("G6").fontSize(9.5).fillColor(CINZA).text("Médico Oftalmologista · CRM-DF 17877 · RQE 9314", { width: W, align: "right" })
    .text("(61) 3033-6605 · (61) 98406-0001", { width: W, align: "right" });
  const yR = top + mm(17);
  doc.moveTo(L, yR).lineTo(L + W, yR).lineWidth(1.4).strokeColor(AZUL).stroke();
  doc.font("G6").fontSize(10.5).fillColor(CINZA).text(`Brasília, ${dataExtenso(data)}`, L, yR + 7, { width: W, align: "right" });
  if (via) doc.font("G8").fontSize(10).fillColor(AZUL).text(String(via).toUpperCase(), L, yR + 7, { characterSpacing: 0.8, lineBreak: false });
  doc.fillColor("#000"); doc.x = L; doc.y = yR + mm(11);
}
function tituloDoc(doc, titulo) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  doc.font("GT").fontSize(15).fillColor(AZUL).text(String(titulo).toUpperCase(), L, doc.y, { width: W, align: "center", characterSpacing: 1.8 });
  const y = doc.y + 4; doc.moveTo(L + W / 2 - mm(14), y).lineTo(L + W / 2 + mm(14), y).lineWidth(1).strokeColor(AZUL).stroke();
  doc.fillColor("#000"); doc.x = L; doc.y = y + mm(5);
}
// Cartão do paciente: nome à esquerda; à direita, o que houver (idade, sexo, convênio…).
function blocoPaciente(doc, nome, extras = []) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right, y = doc.y;
  const dir = extras.filter(Boolean), h = dir.length > 2 ? 46 : 38;
  doc.roundedRect(L, y, W, h, 5).fill(FUNDO);
  doc.font("G6").fontSize(8).fillColor(CINZA).text("PACIENTE", L + 12, y + 7, { characterSpacing: 1.2, lineBreak: false });
  doc.font("G8").fontSize(13).fillColor("#000").text(String(nome || "").toUpperCase(), L + 12, y + 17, { width: W * 0.62, lineBreak: false, ellipsis: true });
  dir.forEach((t, i) => doc.font("G6").fontSize(10).fillColor(CINZA).text(t, L + W * 0.5, y + 8 + i * 12.5, { width: W * 0.5 - 12, align: "right", lineBreak: false }));
  doc.fillColor("#000"); doc.x = L; doc.y = y + h + mm(5);
}
function rodape(doc) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const { x, y } = doc, mb = doc.page.margins.bottom, yr = doc.page.height - mm(15);
  doc.page.margins.bottom = 0;
  doc.moveTo(L, yr).lineTo(L + W, yr).lineWidth(0.5).strokeColor("#c9d3dc").stroke();
  doc.font("G6").fontSize(8.5).fillColor(CINZA)
    .text("Instituto de Olhos Bruno Borges · Shopping Conjunto Nacional, sala 6017 · Brasília - DF · (61) 3033-6605 · (61) 98406-0001", L, yr + 5, { width: W, align: "center", lineBreak: false });
  doc.fillColor("#000"); doc.page.margins.bottom = mb; doc.x = x; doc.y = y;
}
// Assinatura: nome e registro centralizados + cartão verde de verificação (sem traço:
// o documento é assinado digitalmente; o titular do certificado fica só na assinatura).
function assinatura(doc, quando, rqe, selo) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const sobra = doc.page.height - doc.page.margins.bottom - doc.y;
  if (sobra < mm(40)) { novaPagina(doc); doc.y = doc.page.margins.top + mm(10); }
  else doc.y += Math.min(mm(10), sobra - mm(40));   // aperta o respiro antes de mandar a assinatura sozinha para outra folha
  doc.font("G8").fontSize(12.5).fillColor("#000").text("Dr. Bruno O. Borges", L, doc.y, { width: W, align: "center" });
  doc.font("G6").fontSize(10.5).fillColor(CINZA).text("Médico Oftalmologista", { width: W, align: "center" })
    .text(rqe ? "CRM-DF 17877 · RQE 9314" : "CRM-DF 17877", { width: W, align: "center" });
  const cw = mm(122), ch = 34, cx = L + (W - cw) / 2, cy = doc.y + mm(5);
  doc.roundedRect(cx, cy, cw, ch, 8).fillAndStroke("#eef8f1", VERDE);
  const r = 9, ox = cx + 12 + r, oy = cy + ch / 2;
  doc.circle(ox, oy, r).fill(VERDE);
  doc.moveTo(ox - 4, oy).lineTo(ox - 1, oy + 3.4).lineTo(ox + 4.6, oy - 3.4).lineWidth(1.8).strokeColor("#fff").stroke();
  doc.font("G8").fontSize(10.5).fillColor(VERDE).text(`${selo || "Assinado digitalmente"} · ICP-Brasil`, ox + r + 8, cy + 6, { width: cw - 2 * r - 30, lineBreak: false });
  doc.font("G6").fontSize(8.5).fillColor(CINZA).text(`Em ${quando}. Confira a assinatura em validar.iti.gov.br`, ox + r + 8, cy + 19, { width: cw - 2 * r - 30, lineBreak: false });
  doc.fillColor("#000").strokeColor("#000"); doc.x = L; doc.y = cy + ch + 6;
}

function corpoOculos(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  tituloDoc(doc, d.titulo);   // paciente vai na linha da data (cabecalho): a receita de óculos é a mais cheia
  const cols = [W * 0.34, W * 0.66 / 3, W * 0.66 / 3, W * 0.66 / 3], h = 20;
  const linhas = [["", "ESFÉRICO", "CILÍNDRO", "EIXO"], ...d.linhas];
  if (d.adicao) linhas.push(["ADIÇÃO", d.adicao]);
  let y = doc.y;
  for (const [i, ln] of linhas.entries()) {
    let x = L;
    if (i === 0) doc.rect(L, y, W, h).fill(FUNDO).fillColor("#000");
    doc.strokeColor("#9fb0c0");
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
  if (d.sugestao) { doc.font("G6").fontSize(11.5).text(d.sugestao, L, doc.y, { width: W }); doc.moveDown(0.8); }
  if (d.observacao) { doc.font("G8").fontSize(11.5).text("Observação: ", L, doc.y, { continued: true }).font("G6").text(d.observacao, { width: W }); doc.moveDown(0.8); }
  // A receita de óculos tem de caber em UMA folha com a assinatura: a letra das
  // recomendações diminui (10 → 8,5) até caber no espaço que sobrou.
  const livre = doc.page.height - doc.page.margins.bottom - doc.y - mm(45);
  const alt = (fs) => { doc.font("G6").fontSize(fs); return [...RECOMENDA_PACIENTE, ...RECOMENDA_OTICA].reduce((t, x) => t + doc.heightOfString(x, { width: W - 12 }), 0) + 2 * 11.5 * 1.6; };
  const fs = [11, 10.5, 10, 9.5, 9].find((f) => alt(f) <= livre) || 9;
  doc.font("G8").fontSize(11.5).text("IMPORTANTE — RECOMENDAÇÕES PARA O PACIENTE:", L, doc.y, { characterSpacing: 0.4 });
  doc.font("G6").fontSize(fs).list(RECOMENDA_PACIENTE, { bulletRadius: 1.6, textIndent: 10, width: W });
  doc.moveDown(0.4);
  doc.font("G8").fontSize(11.5).text("RECOMENDAÇÕES PARA AS ÓTICAS:", L, doc.y, { characterSpacing: 0.4 });
  doc.font("G6").fontSize(fs).list(RECOMENDA_OTICA, { bulletRadius: 1.6, textIndent: 10, width: W });
  doc.moveDown(0.6);
  doc.font("G8").fontSize(11.5).text(`Data da próxima consulta: ${d.proxima}`, L, doc.y);
}
// A receita vem agrupada pela via (o prontuário já ordena); sem via = colírio.
const viaDe = (m) => String((m && m.via) || "oftálmico");
const usoDe = (m) => "USO " + viaDe(m).toUpperCase();
function corpoColirios(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  tituloDoc(doc, "Receituário");
  blocoPaciente(doc, d.nome, d.duas_vias ? [`Idade: ${d.idade_txt || (d.idade != null ? d.idade + " anos" : "________")}`, `Sexo: ${d.sexo || "________"}`] : []);
  d.meds.forEach((m, i) => {
    if (i === 0 || viaDe(m) !== viaDe(d.meds[i - 1])) {
      if (i) doc.moveDown(0.4);
      doc.font("G8").fontSize(10.5).fillColor(AZUL).text(usoDe(m), L, doc.y, { characterSpacing: 1 }); doc.fillColor("#000");
      doc.moveDown(0.5);
    }
    const y = doc.y;
    doc.font("G8").fontSize(12).text(`${i + 1}.`, L, y, { width: mm(7) });
    doc.font("G8").fontSize(12).text(m.med, L + mm(7), y, { width: W - mm(45) });
    const yFim = doc.y;
    if (m.qtd) doc.font("G6").fontSize(11).fillColor(CINZA).text(m.qtd, L + W - mm(36), y + 1, { width: mm(36), align: "right" }).fillColor("#000");
    doc.font("G6").fontSize(11.5).text(m.pos, L + mm(7), Math.max(yFim, doc.y) + 2, { width: W - mm(7) });
    doc.moveDown(0.9);
  });
}

const AZUL_LAUDO = AZUL;
function cabeLaudo(doc, need) { if (doc.y + need > doc.page.height - doc.page.margins.bottom - mm(8)) { novaPagina(doc); doc.y = doc.page.margins.top + mm(4); } }
function tabelaLaudo(doc, t) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right, n = t.cab.length;
  const fr = n === 4 ? [0.36, 0.16, 0.16, 0.32] : n === 3 ? [0.44, 0.2, 0.36] : [0.6, 0.4];
  const ws = fr.map((f) => f * W), pad = 4, fs = 8.6;
  const alt = (cells, font) => Math.max(...cells.map((c, i) => doc.font(font).fontSize(fs).heightOfString(String(c ?? ""), { width: ws[i] - 2 * pad }))) + 2 * pad;
  const linha = (cells, y, h, o) => { let x = L; cells.forEach((c, i) => {
    if (o.fill) doc.rect(x, y, ws[i], h).fill(o.fill);
    if (o.borda) doc.rect(x, y, ws[i], h).lineWidth(0.5).strokeColor("#c9ced4").stroke();
    doc.fillColor(o.cor?.[i] || o.txt || "#222").font(o.font).fontSize(fs).text(String(c ?? ""), x + pad, y + pad, { width: ws[i] - 2 * pad });
    x += ws[i]; }); doc.fillColor("#000"); };
  const hc = alt(t.cab, "Helvetica-Bold"), h1 = t.linhas.length ? alt(t.linhas[0], "Helvetica") : 0;
  cabeLaudo(doc, 16 + hc + h1);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(AZUL_LAUDO).text(t.titulo || "", L, doc.y, { width: W }); doc.moveDown(0.2);
  let y = doc.y; linha(t.cab, y, hc, { fill: AZUL_LAUDO, txt: "#fff", font: "Helvetica-Bold" }); y += hc;
  t.linhas.forEach((cells, r) => {
    const fonts = (t.alt?.[r] || []).map((a) => a ? "Helvetica-Bold" : "Helvetica");
    const h = alt(cells, "Helvetica-Bold");
    if (y + h > doc.page.height - doc.page.margins.bottom - mm(8)) { novaPagina(doc); y = doc.page.margins.top + mm(4); linha(t.cab, y, hc, { fill: AZUL_LAUDO, txt: "#fff", font: "Helvetica-Bold" }); y += hc; }
    let x = L; cells.forEach((c, i) => {
      if (r % 2) doc.rect(x, y, ws[i], h).fill("#f4f6f8");
      doc.rect(x, y, ws[i], h).lineWidth(0.5).strokeColor("#c9ced4").stroke();
      const vermelho = !!(t.alt?.[r]?.[i]);
      doc.fillColor(vermelho ? "#b02a2a" : "#222").font(vermelho ? "Helvetica-Bold" : (fonts[i] || "Helvetica")).fontSize(fs).text(String(c ?? ""), x + pad, y + pad, { width: ws[i] - 2 * pad });
      x += ws[i]; });
    y += h; });
  doc.fillColor("#000"); doc.x = L; doc.y = y + 8;
}
const semMu = (x) => String(x ?? "").replace(/\u03bc/g, "\u00b5");
function corpoLaudo(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  tituloDoc(doc, String(d.titulo || "Laudo").replace(/^LAUDO DE /i, "Laudo de "));
  blocoPaciente(doc, d.nome, [`CPF: ${d.cpf || "não informado"}`, `Nascimento: ${d.nascimento || "não informado"}${d.idade != null ? ` (${d.idade} anos)` : ""}${d.sexo ? ` · ${d.sexo}` : ""}`, d.data_exame ? `Exame realizado em ${d.data_exame}` : ""]);
  if (d.metodo) { doc.moveDown(0.4); doc.text(semMu(d.metodo), { width: W }); }
  doc.moveDown(0.6);
  for (const b of d.blocos || []) {
    if (b.tipo === "h2") { cabeLaudo(doc, 60); doc.moveDown(0.4); doc.font("Helvetica-Bold").fontSize(11.5).fillColor(AZUL_LAUDO).text(b.texto, L, doc.y, { width: W }); doc.fillColor("#000"); doc.moveDown(0.3); }
    else if (b.tipo === "tabela" && Array.isArray(b.cab) && Array.isArray(b.linhas)) tabelaLaudo(doc, { ...b, titulo: semMu(b.titulo), cab: b.cab.map(semMu), linhas: b.linhas.map((l) => l.map(semMu)) });
  }
  cabeLaudo(doc, 70);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(AZUL_LAUDO).text("IMPRESSÃO DIAGNÓSTICA", L, doc.y, { width: W });
  doc.font("Helvetica").fontSize(10).fillColor("#000").text(semMu(d.impressao), L, doc.y + 2, { width: W, align: "justify" });
}
function imagensLaudo(doc, imagens) {
  const lista = (imagens || []).slice(0, 8);
  for (let i = 0; i < lista.length; i++) {
    if (i % 2 === 0) { novaPagina(doc); doc.y = doc.page.margins.top; if (i === 0) { doc.font("Helvetica-Bold").fontSize(11.5).fillColor(AZUL_LAUDO).text("IMAGENS DO EXAME"); doc.moveDown(0.4); } }
    const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
    const hDisp = (doc.page.height - doc.page.margins.bottom - mm(8) - doc.page.margins.top) / 2 - 24;
    const im = lista[i]; let buf;
    try { buf = Buffer.from(String(im.b64 || "").replace(/^data:image\/\w+;base64,/, ""), "base64"); } catch (_) { continue; }
    if (!buf.length) continue;
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(AZUL_LAUDO).text(String(im.leg || ""), L, y0, { width: W }); doc.fillColor("#000");
    try { doc.image(buf, L, doc.y + 2, { fit: [W, hDisp], align: "center", valign: "top" }); } catch (_) {}
    doc.x = L; doc.y = y0 + hDisp + 24;
  }
}
// Receita de lentes de contato gelatinosas: lente escolhida, tabela por olho (colunas de
// cilindro/eixo e adição só quando há) e orientações de uso.
function corpoLentes(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  tituloDoc(doc, "Receita de lentes de contato");
  blocoPaciente(doc, d.nome, []);
  doc.font("G8").fontSize(11.5).fillColor("#000").text("Lente: ", L, doc.y, { continued: true }).font("G6").text(`${d.lente || ""}${d.generica ? "" : " · gelatinosa"}`, { width: W });
  doc.moveDown(0.6);
  const temCB = d.tem_cb !== false;   // sem marca e sem CB/diâmetro: a tabela fica só com os graus
  const cab = ["", "ESFÉRICO", ...(d.tem_cil ? ["CILINDRO", "EIXO"] : []), ...(d.tem_add ? ["ADIÇÃO"] : []), ...(temCB ? ["CB", "DIÂM."] : [])];
  const lin = (r) => [r[0], r[1] || "—", ...(d.tem_cil ? [r[2] || "—", r[3] || "—"] : []), ...(d.tem_add ? [r[4] || "—"] : []), ...(temCB ? [r[5] || "—", r[6] || "—"] : [])];
  const n = cab.length, w0 = W * 0.27, wi = (W - w0) / (n - 1), h = 22;
  let y = doc.y;
  [cab, ...(d.linhas || []).map(lin)].forEach((ln, i) => {
    if (i === 0) doc.rect(L, y, W, h).fill(FUNDO).fillColor("#000");
    let x = L; ln.forEach((t, j) => { const cw = j ? wi : w0;
      doc.lineWidth(0.8).strokeColor("#9fb0c0").rect(x, y, cw, h).stroke();
      doc.font(i === 0 || j === 0 ? "G8" : "G6").fontSize(i === 0 ? 10 : 11.5).fillColor("#000").text(String(t ?? ""), x + (j ? 0 : 6), y + (i === 0 ? 7 : 6), { width: cw - (j ? 0 : 12), align: j ? "center" : "left", lineBreak: false });
      x += cw; });
    y += h; });
  doc.strokeColor("#000"); doc.x = L; doc.y = y + mm(6);
  if ((d.orientacoes || []).length) {
    doc.font("G8").fontSize(11.5).text("ORIENTAÇÕES DE USO:", L, doc.y, { characterSpacing: 0.4 });
    doc.font("G6").fontSize(10).list(d.orientacoes, { bulletRadius: 1.6, textIndent: 10, width: W });
  }
}
function corpoAtestado(doc, d) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  doc.moveDown(0.8);
  tituloDoc(doc, String(d.titulo || "Atestado médico"));
  doc.moveDown(0.8);
  String(d.texto || "").split(/\n{2,}/).forEach((par) => {
    doc.font("G6").fontSize(12.5).text(par.replace(/\n/g, " ").trim(), L, doc.y, { width: W, align: "justify", lineGap: 5 });
    doc.moveDown(1);
  });
  doc.moveDown(1.5);
}
function corpoPedido(doc, d, exames) {
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  tituloDoc(doc, "Solicitação de exames");
  blocoPaciente(doc, d.nome, [d.idade != null ? `${d.idade} anos` : "", d.convenio ? `Convênio: ${d.convenio}` : "", d.carteirinha ? `Carteirinha: ${d.carteirinha}` : ""]);
  doc.font("G6").fontSize(12).text("Solicito:", L, doc.y);
  doc.moveDown(0.4);
  exames.forEach((e, i) => {
    const y = doc.y;
    doc.font("G8").fontSize(12).text(`${i + 1}. ${e}`, L + mm(3), y, { width: W - mm(45) });
    const yFim = doc.y;
    doc.font("G6").text(d.olho || "Ambos os olhos", L + W - mm(42), y, { width: mm(42), align: "right" });
    doc.y = Math.max(yFim, doc.y);
    const j = d.justificativas && d.justificativas[e];
    if (j) doc.font("G6").fontSize(11).text(`Justificativa: ${j}`, L + mm(8), doc.y + 2, { width: W - mm(8) }).fontSize(12);
    doc.moveDown(0.5);
  });
  if (d.indicacao) { doc.moveDown(0.5); doc.font("G8").fontSize(11.5).text("Indicação clínica: ", L, doc.y, { continued: true }).font("G6").text(d.indicacao, { width: W }); }
}

async function documentoAssinado(tipo, d, cert) {
  const agora = new Date();
  const quando = agora.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const titulos = { oculos: "Receita de óculos", colirios: "Receita", pedido: "Pedido de exames", laudo: "Laudo", lentes: "Receita de lentes de contato", atestado: /DECLARA/.test(String(d.titulo)) ? "Declaração" : "Atestado" };
  const doc = new PDFDocument({ size: "A4", autoFirstPage: false, pdfVersion: "1.7",
    info: { Title: `${titulos[tipo] || "Documento"} - ${d.nome}`, Author: "Dr. Bruno O. Borges - CRM 17877", Creator: "IOBB - prontuário" } });
  // Texto em Helvetica (23/10/2026: Garamond ficava pequena e clara no papel); Garamond só no
  // título e no nome do médico (GT). Helvetica padrão é WinAnsi: o "−" (U+2212) vira "-".
  doc.registerFont("G6", "Helvetica"); doc.registerFont("G8", "Helvetica-Bold"); doc.registerFont("GT", FONTE_NEGRITO);
  const _text = doc.text.bind(doc), _h = doc.heightOfString.bind(doc), winAnsi = (t) => typeof t === "string" ? t.replace(/\u2212/g, "-").replace(/\u2192/g, "->") : t;
  doc.text = (t, ...r) => _text(winAnsi(t), ...r); doc.heightOfString = (t, ...r) => _h(winAnsi(t), ...r);
  const partes = []; doc.on("data", (c) => partes.push(c));
  const fim = new Promise((ok, falha) => { doc.on("end", ok); doc.on("error", falha); });
  doc.on("pageAdded", () => rodape(doc));
  const paginas = [];   // [via, desenha]
  if (tipo === "colirios") (d.duas_vias ? ["1ª via · farmácia", "2ª via · paciente"] : [""]).forEach(via => paginas.push([via, () => { corpoColirios(doc, d); assinatura(doc, quando, false, "Assinada digitalmente"); }]));
  else if (tipo === "oculos") paginas.push([`Paciente: ${d.nome}`, () => { corpoOculos(doc, d); assinatura(doc, quando, false, "Assinada digitalmente"); }]);
  else if (tipo === "pedido") (d.separado ? d.exames.map(e => [e]) : [d.exames]).forEach(lista => paginas.push(["", () => { corpoPedido(doc, d, lista); assinatura(doc, quando, true, "Assinado digitalmente"); }]));
  else if (tipo === "laudo") paginas.push(["", () => { corpoLaudo(doc, d); assinatura(doc, quando, true, "Assinado digitalmente"); imagensLaudo(doc, d.imagens); }]);
  else if (tipo === "lentes") paginas.push(["", () => { corpoLentes(doc, d); assinatura(doc, quando, false, "Assinada digitalmente"); }]);
  else if (tipo === "atestado") paginas.push(["", () => { corpoAtestado(doc, d); assinatura(doc, quando, true, "Assinado digitalmente"); }]);
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
