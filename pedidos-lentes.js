/* Pedidos de lentes de contato (Dr. Bruno, 22/10/2026) — tela da equipe na /agenda.
   Lista com filtro e busca, resumo do que falta receber, e ficha do pedido: paciente,
   lente e graus por olho, quantidade, fornecedor e nº do pedido nele, valor total,
   pagamentos (sinal, restante…), situação e histórico. Valores visíveis a toda a equipe.
   Uso: PedidosLentes.abrir()  ·  PedidosLentes.novo({paciente_nome, paciente_tel, lente, olhos, consulta_id}) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  const dataHoraBR = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const foneBR = (t) => { const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const SIT = { a_encomendar: "A encomendar", encomendado: "Encomendado", chegou: "Chegou na clínica", avisado: "Paciente avisado", entregue: "Entregue" };
  const COR = { a_encomendar: "#9a5b00", encomendado: "#1f4e79", chegou: "#0a7d55", avisado: "#6b3fa0", entregue: "#5b6670" };
  const FORMAS = ["PIX", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Transferência", "Outro"];
  const pago = (p) => (p.pagamentos || []).reduce((s, x) => s + Number(x.valor || 0), 0);
  const falta = (p) => Math.max(0, Math.round((Number(p.valor_total || 0) - pago(p)) * 100) / 100);
  const num = (p) => "#" + String(p.numero || "").padStart(4, "0");

  async function api(path, opts = {}) {
    const r = await fetch(path, { method: opts.method || "GET", headers: { Authorization: "Bearer " + (localStorage.getItem("iobb_at") || ""), ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (!r.ok || d.error) throw new Error(d.error || (r.status === 401 ? "Sessão expirada: entre de novo." : `Erro ${r.status}`));
    return d;
  }

  const css = `
.pl-bg{position:fixed;inset:0;background:rgba(11,20,26,.55);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
.pl-bg.show{display:flex}
.pl{background:#fff;color:#122a3f;border-radius:14px;width:min(940px,100%);padding:20px 22px;box-shadow:0 12px 40px rgba(5,20,40,.3);font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.pl h3{margin:0;font-size:18px} .pl .topo{display:flex;align-items:center;gap:10px;margin-bottom:10px} .pl .x{margin-left:auto;border:0;background:none;font-size:22px;cursor:pointer;color:#5b6670}
.pl .barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.pl input,.pl select,.pl textarea{padding:8px 10px;border:1px solid #cfd8e0;border-radius:8px;font:inherit;color:#122a3f;background:#fff;min-width:0}
.pl textarea{width:100%;resize:vertical}
.pl .b{padding:8px 14px;border-radius:8px;border:1px solid #cfd8e0;background:#fff;cursor:pointer;font:inherit;font-weight:600}
.pl .b.pri{background:#00a884;border-color:#00a884;color:#fff} .pl .b.perigo{color:#b42318;border-color:#f2b8b5}
.pl .resumo{font-size:13.5px;color:#5b6670;margin:2px 0 10px} .pl .resumo b{color:#122a3f}
.pl .lista{display:grid;gap:6px}
.pl .item{display:grid;grid-template-columns:62px 1.3fr 1.4fr 140px 130px;gap:10px;align-items:center;border:1px solid #e3e9ef;border-radius:10px;padding:9px 12px;cursor:pointer;background:#fff}
.pl .item:hover{border-color:#00a884;background:#f6fbf9}
.pl .item .n{font-weight:700;color:#1f4e79;font-variant-numeric:tabular-nums}
.pl .item small{color:#5b6670}
.pl .sit{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;border:1px solid currentColor}
.pl .val{text-align:right;font-variant-numeric:tabular-nums} .pl .deve{color:#b42318;font-weight:700} .pl .quitado{color:#0a7d55;font-weight:600}
.pl .grade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 12px}
.pl .grade label{display:grid;gap:3px;font-size:12.5px;font-weight:600;color:#3b4a58}
.pl .s2{grid-column:span 2} .pl .s4{grid-column:1/-1}
.pl table.gr{border-collapse:collapse;width:100%;margin:4px 0} .pl table.gr th,.pl table.gr td{border:1px solid #e3e9ef;padding:4px 6px;text-align:center;font-size:13px}
.pl table.gr th{background:#f2f5f8} .pl table.gr input{width:100%;padding:5px 6px;text-align:center}
.pl .sec{margin:14px 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#5b6670;text-transform:uppercase}
.pl .pags div,.pl .hist div{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0;border-bottom:1px dashed #e3e9ef}
.pl .pags .v{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
.pl .pags button{border:0;background:none;color:#b42318;cursor:pointer}
.pl .tot{display:flex;gap:18px;justify-content:flex-end;margin:6px 0;font-variant-numeric:tabular-nums}
.pl .acoes{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}
.pl .st{font-size:13px;margin-right:auto;align-self:center} .pl .st.erro{color:#b42318} .pl .st.ok{color:#0a7d55}
.pl .sug{position:absolute;z-index:9100;background:#fff;border:1px solid #cfd8e0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:240px;overflow:auto}
.pl .sug div{padding:7px 10px;cursor:pointer;border-bottom:1px solid #f1f4f7} .pl .sug div:hover{background:#e8f4f2}
@media (max-width:720px){ .pl .item{grid-template-columns:54px 1fr;}.pl .item>:nth-child(n+3){grid-column:2} .pl .val{text-align:left} .pl .grade{grid-template-columns:1fr 1fr} }`;

  let raiz = null, todos = [], filtro = "andamento", busca = "", atual = null;
  function monta() {
    if (raiz) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    raiz = document.createElement("div"); raiz.className = "pl-bg"; raiz.innerHTML = `<div class="pl" role="dialog" aria-label="Pedidos de lentes"><div id="pl-corpo"></div></div>`;
    document.body.appendChild(raiz);
    raiz.addEventListener("click", (e) => { if (e.target === raiz) fechar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && raiz.classList.contains("show")) fechar(); });
  }
  function fechar() { raiz.classList.remove("show"); }

  // ---------- lista ----------
  async function abrir() { monta(); raiz.classList.add("show"); atual = null; await carrega(); }
  async function carrega() {
    $("#pl-corpo", raiz).innerHTML = `<div class="topo"><h3>📦 Pedidos de lentes</h3><button class="x" data-pl="fechar" title="Fechar">×</button></div><div class="resumo">Carregando…</div>`;
    try { todos = (await api("/api/pedidos-lentes?todos=1")).pedidos || []; } catch (e) { $(".resumo", raiz).textContent = e.message; return; }
    desenhaLista();
  }
  function filtrados() {
    const q = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return todos.filter((p) => {
      if (filtro === "andamento" && (p.cancelado || p.situacao === "entregue")) return false;
      if (filtro === "receber" && (p.cancelado || falta(p) <= 0)) return false;
      if (filtro === "entregues" && (p.cancelado || p.situacao !== "entregue")) return false;
      if (filtro === "cancelados" && !p.cancelado) return false;
      if (!q) return true;
      return [num(p), p.paciente_nome, p.paciente_tel, p.lente, p.fornecedor, p.pedido_fornecedor].join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q);
    });
  }
  function desenhaLista() {
    const vivos = todos.filter((p) => !p.cancelado), and = vivos.filter((p) => p.situacao !== "entregue"), receber = vivos.reduce((s, p) => s + falta(p), 0);
    const chegou = vivos.filter((p) => p.situacao === "chegou").length;
    const l = filtrados();
    $("#pl-corpo", raiz).innerHTML = `<div class="topo"><h3>📦 Pedidos de lentes</h3><button class="x" data-pl="fechar" title="Fechar">×</button></div>
      <div class="resumo"><b>${and.length}</b> em andamento · a receber: <b>${BRL(receber)}</b>${chegou ? ` · <b style="color:#0a7d55">${chegou}</b> ${chegou === 1 ? "chegou e aguarda" : "chegaram e aguardam"} aviso ao paciente` : ""}</div>
      <div class="barra"><select id="pl-filtro"><option value="andamento">Em andamento</option><option value="receber">Com valor a receber</option><option value="entregues">Entregues</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option></select>
        <input type="search" id="pl-busca" placeholder="Buscar nº, paciente, lente, fornecedor…" style="flex:1 1 220px" value="${esc(busca)}">
        <button class="b pri" data-pl="novo">＋ Novo pedido</button></div>
      <div class="lista">${l.length ? l.map((p) => `<div class="item" data-id="${esc(p.id)}">
          <span class="n">${num(p)}</span>
          <span><b>${esc(p.paciente_nome)}</b><br><small>${esc(foneBR(p.paciente_tel))}${p.paciente_tel ? " · " : ""}${dataBR(p.created_at)}</small></span>
          <span>${esc(p.lente)}<br><small>${[p.qtd_od ? `OD ×${p.qtd_od}` : "", p.qtd_oe ? `OE ×${p.qtd_oe}` : "", p.fornecedor ? esc(p.fornecedor) + (p.pedido_fornecedor ? " nº " + esc(p.pedido_fornecedor) : "") : ""].filter(Boolean).join(" · ")}</small></span>
          <span>${p.cancelado ? `<span class="sit" style="color:#b42318">Cancelado</span>` : `<span class="sit" style="color:${COR[p.situacao]}">${SIT[p.situacao] || p.situacao}</span>`}</span>
          <span class="val">${BRL(p.valor_total)}<br>${falta(p) > 0 ? `<small class="deve">falta ${BRL(falta(p))}</small>` : `<small class="quitado">pago</small>`}</span></div>`).join("")
        : `<div style="color:#5b6670;padding:12px 2px">Nenhum pedido ${filtro === "andamento" ? "em andamento" : "neste filtro"}.</div>`}</div>`;
    $("#pl-filtro", raiz).value = filtro;
    $("#pl-filtro", raiz).onchange = (e) => { filtro = e.target.value; desenhaLista(); };
    $("#pl-busca", raiz).oninput = (e) => { busca = e.target.value; const pos = e.target.selectionStart; desenhaLista(); const i = $("#pl-busca", raiz); i.focus(); i.setSelectionRange(pos, pos); };
  }

  // ---------- ficha do pedido ----------
  const OLHOS = ["od", "oe"], GR = ["esf", "cil", "eixo", "add"];
  function ficha(p) {
    atual = p; const novo = !p.id, o = p.olhos || {};
    $("#pl-corpo", raiz).innerHTML = `<div class="topo"><h3>${novo ? "Novo pedido de lentes" : `Pedido ${num(p)}`}</h3>${!novo ? `<small style="color:#5b6670">criado em ${dataHoraBR(p.created_at)}${p.criado_por ? " por " + esc(p.criado_por) : ""}</small>` : ""}<button class="x" data-pl="fechar" title="Fechar">×</button></div>
      <div class="grade">
        <label class="s2" style="position:relative">Paciente<input id="pl-nome" autocomplete="off" value="${esc(p.paciente_nome || "")}" placeholder="Digite para buscar no cadastro"></label>
        <label>Telefone<input id="pl-tel" value="${esc(foneBR(p.paciente_tel))}"></label>
        <label>Situação<select id="pl-sit">${Object.entries(SIT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label class="s2">Lente (marca e modelo)<input id="pl-lente" value="${esc(p.lente || "")}" placeholder="Ex.: Biofinity Toric (mensal)"></label>
        <label>Fornecedor<input id="pl-forn" value="${esc(p.fornecedor || "")}"></label>
        <label>Nº do pedido no fornecedor<input id="pl-pforn" value="${esc(p.pedido_fornecedor || "")}"></label>
        <div class="s4"><table class="gr"><thead><tr><th></th><th>Esférico</th><th>Cilindro</th><th>Eixo</th><th>Adição</th><th>Caixas</th></tr></thead><tbody>
          ${OLHOS.map((k) => `<tr><th>${k.toUpperCase()}</th>${GR.map((g) => `<td><input id="pl-${k}-${g}" value="${esc(o[k]?.[g] || "")}"></td>`).join("")}<td><input id="pl-q${k}" inputmode="numeric" value="${esc(p["qtd_" + k] ?? "")}"></td></tr>`).join("")}
        </tbody></table></div>
        <label>Valor total (R$)<input id="pl-total" inputmode="decimal" value="${p.valor_total ? String(p.valor_total).replace(".", ",") : ""}"></label>
        ${novo ? `<label>Pago agora (sinal)<input id="pl-pago" inputmode="decimal" placeholder="0,00"></label><label>Forma<select id="pl-forma">${FORMAS.map((f) => `<option>${f}</option>`).join("")}</select></label>` : ""}
        <label class="s4">Observações<textarea id="pl-obs" rows="2">${esc(p.obs || "")}</textarea></label>
      </div>
      ${novo ? "" : `<div class="sec">Pagamentos</div>
        <div class="pags">${(p.pagamentos || []).map((x, i) => `<div><span>${dataBR(x.em)}</span><span>${esc(x.forma || "")}</span><small style="color:#5b6670">${esc(x.por || "")}</small><span class="v">${BRL(x.valor)}</span><button data-tirar="${i}" title="Remover pagamento lançado errado">✕</button></div>`).join("") || `<div style="color:#5b6670">Nenhum pagamento ainda.</div>`}</div>
        <div class="tot"><span>Total <b>${BRL(p.valor_total)}</b></span><span>Pago <b>${BRL(pago(p))}</b></span><span>A pagar <b class="${falta(p) > 0 ? "deve" : "quitado"}">${BRL(falta(p))}</b></span></div>
        <div class="barra"><input id="pl-pagar" inputmode="decimal" placeholder="Valor recebido" style="width:150px"><select id="pl-pforma">${FORMAS.map((f) => `<option>${f}</option>`).join("")}</select><button class="b" data-pl="pagar">Registrar pagamento</button></div>
        <div class="sec">Histórico</div>
        <div class="hist">${(p.historico || []).slice().reverse().map((h) => `<div><span>${dataHoraBR(h.em)}</span><span>${esc(h.situacao ? SIT[h.situacao] || h.situacao : h.evento || "")}</span><small style="color:#5b6670">${esc(h.por || "")}</small></div>`).join("")}</div>`}
      <div class="acoes"><span class="st" id="pl-st"></span>
        <button class="b" data-pl="voltar">← Lista</button>
        ${novo ? "" : `<button class="b perigo" data-pl="cancelar">${p.cancelado ? "Reativar pedido" : "Cancelar pedido"}</button>`}
        <button class="b pri" data-pl="salvar">${novo ? "Criar pedido" : "Salvar"}</button></div>`;
    $("#pl-sit", raiz).value = p.situacao || "a_encomendar";
    ligaBusca();
  }
  const st = (t, c) => { const x = $("#pl-st", raiz); if (x) { x.textContent = t; x.className = "st " + (c || ""); } };
  const v = (id) => ($("#" + id, raiz)?.value || "").trim();
  function coleta() {
    const olhos = {}; for (const k of OLHOS) { olhos[k] = {}; for (const g of GR) olhos[k][g] = v(`pl-${k}-${g}`); }
    return { paciente_nome: v("pl-nome"), paciente_tel: v("pl-tel").replace(/\D/g, ""), lente: v("pl-lente"), olhos, qtd_od: v("pl-qod"), qtd_oe: v("pl-qoe"),
      fornecedor: v("pl-forn"), pedido_fornecedor: v("pl-pforn"), valor_total: v("pl-total"), situacao: v("pl-sit"), obs: v("pl-obs") };
  }
  async function salvar() {
    const b = coleta(); if (!b.paciente_nome || !b.lente) { st("Informe o paciente e a lente.", "erro"); return; }
    try {
      if (!atual.id) { const r = await api("/api/pedidos-lentes", { method: "POST", body: { ...b, consulta_id: atual.consulta_id || null, pago: v("pl-pago"), forma: v("pl-forma") } }); todos.unshift(r.pedido); ficha(r.pedido); st(`Pedido ${num(r.pedido)} criado.`, "ok"); }
      else { const r = await api(`/api/pedidos-lentes/${atual.id}`, { method: "POST", body: b }); troca(r.pedido); ficha(r.pedido); st("Salvo.", "ok"); }
    } catch (e) { st(e.message, "erro"); }
  }
  function troca(p) { const i = todos.findIndex((x) => x.id === p.id); if (i >= 0) todos[i] = p; else todos.unshift(p); }
  async function acao(body, msg) { try { const r = await api(`/api/pedidos-lentes/${atual.id}`, { method: "POST", body }); troca(r.pedido); ficha(r.pedido); st(msg, "ok"); } catch (e) { st(e.message, "erro"); } }

  // busca de paciente no cadastro (mesma busca do agendamento)
  function ligaBusca() {
    const inp = $("#pl-nome", raiz); if (!inp) return; let caixa = null, t = null, res = [];
    const fecha = () => { if (caixa) caixa.remove(); caixa = null; };
    inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => {
      const q = inp.value.trim(); if (q.length < 3) return fecha();
      try { res = ((await api(`/api/preexame/busca?q=${encodeURIComponent(q)}`)).pacientes || []).slice(0, 8); } catch (_) { return fecha(); }
      fecha(); if (!res.length) return;
      caixa = document.createElement("div"); caixa.className = "sug"; caixa.style.width = inp.offsetWidth + "px"; caixa.style.top = inp.offsetTop + inp.offsetHeight + 2 + "px"; caixa.style.left = inp.offsetLeft + "px";
      caixa.innerHTML = res.map((p, i) => `<div data-i="${i}"><b>${esc(p.nome)}</b><br><small style="color:#5b6670">${esc(foneBR(p.telefone))}${p.convenio ? " · " + esc(p.convenio) : ""}</small></div>`).join("");
      inp.parentElement.appendChild(caixa);
      caixa.addEventListener("mousedown", (e) => { const d = e.target.closest("[data-i]"); if (!d) return; e.preventDefault(); const p = res[+d.dataset.i];
        inp.value = p.nome || ""; if (p.telefone && !/^iclinic/.test(p.telefone)) $("#pl-tel", raiz).value = foneBR(p.telefone); fecha(); });
    }, 300); });
    inp.addEventListener("blur", () => setTimeout(fecha, 150));
  }

  document.addEventListener("click", (e) => {
    if (!raiz || !raiz.contains(e.target)) return;
    const a = e.target.closest("[data-pl]")?.dataset.pl;
    if (a === "fechar") return fechar();
    if (a === "novo") return ficha({ situacao: "a_encomendar" });
    if (a === "voltar") { atual = null; return desenhaLista(); }
    if (a === "salvar") return salvar();
    if (a === "pagar") { const val = v("pl-pagar"); if (!val) return st("Digite o valor recebido.", "erro"); return acao({ pagar: val, forma: v("pl-pforma") }, "Pagamento registrado."); }
    if (a === "cancelar") { const b = e.target.closest("button"); if (!atual.cancelado && !b.dataset.conf) { b.dataset.conf = "1"; b.textContent = "Confirmar cancelamento"; return; } return acao({ cancelado: !atual.cancelado }, atual.cancelado ? "Pedido reativado." : "Pedido cancelado."); }
    const tir = e.target.closest("[data-tirar]"); if (tir) { if (!tir.dataset.conf) { tir.dataset.conf = "1"; tir.textContent = "remover?"; return; } return acao({ tirar_pagamento: tir.dataset.tirar }, "Pagamento removido."); }
    const it = e.target.closest(".item[data-id]"); if (it) { const p = todos.find((x) => x.id === it.dataset.id); if (p) ficha(p); }
  });

  async function novo(pre) { monta(); raiz.classList.add("show"); try { todos = (await api("/api/pedidos-lentes?todos=1")).pedidos || []; } catch (_) {} ficha({ situacao: "a_encomendar", ...pre }); }
  window.PedidosLentes = { abrir, novo };
})();
