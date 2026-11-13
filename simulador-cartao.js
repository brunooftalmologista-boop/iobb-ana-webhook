/* Simulador de cartão (Dr. Bruno, 13/11/2026) — botão 💳 no /painel.
   A secretária digita o valor à vista e escolhe a bandeira; a tabela mostra quanto
   cobrar do paciente no débito, crédito à vista e de 2x a 12x para a clínica receber
   o MESMO valor à vista, já descontando:
     1) a taxa da Cielo (parcelado loja, contrato do IOBB), e
     2) a perda do dinheiro que só entra nos meses seguintes (juros/inflação do mês).
   Não fala com o servidor nem grava nada: é só conta no navegador.

   As taxas abaixo foram copiadas do portal Cielo (Minha Conta > Taxas e Planos,
   EC 2772190751, plano Postecipado, modalidade Aluguel) em 13/11/2026. Se a Cielo
   mudar o contrato, troque os números aqui e a data em TAXAS_CONFERIDAS_EM.
   Prazo de recebimento no portal: débito 1 dia; crédito à vista 31 dias; parcelado
   31 dias a cada parcela.

   Uso: SimuladorCartao.montar(botao)  ·  SimuladorCartao.abrir() */
(function () {
  const TAXAS_CONFERIDAS_EM = "13/11/2026";
  // deb = débito (null = bandeira não aceita débito); cred = crédito à vista;
  // p2a6 / p7a12 = parcelado loja. Valores em %.
  const BANDEIRAS = [
    { id: "visa", nome: "Visa / Mastercard", deb: 1.32, cred: 2.19, p2a6: 2.89, p7a12: 3.20 },
    { id: "elo", nome: "Elo", deb: 1.87, cred: 2.74, p2a6: 3.54, p7a12: 3.85 },
    { id: "amex", nome: "Amex", deb: null, cred: 2.69, p2a6: 3.49, p7a12: 3.80 },
    { id: "diners", nome: "Diners", deb: null, cred: 2.19, p2a6: 4.99, p7a12: 4.99 },
    { id: "hiper", nome: "Hipercard", deb: null, cred: 4.87, p2a6: 4.99, p7a12: 4.67 },
    { id: "banes", nome: "Banescard / Cabal", deb: 2.70, cred: 3.70, p2a6: 2.15, p7a12: 2.21 },
    { id: "agiplan", nome: "Agiplan / Sorocred", deb: null, cred: 3.70, p2a6: 2.15, p7a12: 2.21 },
  ];
  const PIX_CIELO = 0.89;

  // Perda mensal do dinheiro no tempo. Médias mensais equivalentes ao acumulado
  // de 12 meses (conferido em 13/11/2026):
  //   CDI  ≈ 14,2% em 12 meses até out/2026  → 1,11% ao mês (o que o dinheiro renderia aplicado)
  //   IPCA ≈ 4,58% em 12 meses até set/2026  → 0,37% ao mês (só a inflação)
  const PERDAS = [
    { id: "cdi", rotulo: "Juros (CDI)", mes: 1.11, dica: "o que o dinheiro renderia aplicado — já inclui a inflação" },
    { id: "media", rotulo: "Média juros + inflação", mes: 0.74, dica: "média simples entre CDI (1,11%) e IPCA (0,37%)" },
    { id: "ipca", rotulo: "Só inflação (IPCA)", mes: 0.37, dica: "só a perda de poder de compra" },
    { id: "outro", rotulo: "Outro", mes: null, dica: "digite a % ao mês" },
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const PCT = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  const lerNumero = (s) => {
    let t = String(s || "").replace(/[^\d,.-]/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");   // 1.234,56 → 1234.56
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  };
  const sobeCentavo = (x) => Math.ceil(x * 100 - 1e-6) / 100;   // arredonda para cima: nunca perde centavo

  // Quando cada parcela cai na conta, em meses (30 dias): débito 1 dia; crédito
  // 31 dias; parcelado: 1ª em 31 dias e as demais a cada 30.
  const mesesDaParcela = (k) => (31 + 30 * (k - 1)) / 30;

  // Fator de "valor de hoje" de R$ 1 pago em n parcelas iguais (média dos descontos).
  function fatorTempo(n, iMes, debito) {
    if (debito) return Math.pow(1 + iMes, -1 / 30);
    let s = 0;
    for (let k = 1; k <= n; k++) s += Math.pow(1 + iMes, -mesesDaParcela(k));
    return s / n;
  }

  // Para cada forma: quanto cobrar (total e parcela) para o valor de hoje líquido = V.
  function calcula(V, b, iMes) {
    const linhas = [];
    const add = (rotulo, n, taxa, debito) => {
      const f = taxa / 100;
      const tempo = fatorTempo(n, iMes, debito);
      const bruto = V / ((1 - f) * tempo);
      const parcela = sobeCentavo(bruto / n);
      const total = Math.round(parcela * n * 100) / 100;
      const semAcrescimo = V * (1 - f) * tempo;          // se cobrar só o valor à vista
      linhas.push({
        rotulo, n, taxa, total, parcela,
        acrescimo: V > 0 ? (total / V - 1) * 100 : 0,
        taxaReais: total * f,
        tempoReais: total * (1 - f) * (1 - tempo),
        semAcrescimo, perdaSemAcrescimo: V - semAcrescimo,
      });
    };
    if (b.deb != null) add("Débito", 1, b.deb, true);
    add("Crédito à vista", 1, b.cred, false);
    for (let n = 2; n <= 12; n++) add(`${n}x`, n, n <= 6 ? b.p2a6 : b.p7a12, false);
    return linhas;
  }

  const css = `
.sc-bg{position:fixed;inset:0;background:rgba(11,20,26,.55);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
.sc-bg.show{display:flex}
.sc{background:#fff;color:#122a3f;border-radius:14px;width:min(860px,100%);padding:20px 22px;box-shadow:0 12px 40px rgba(5,20,40,.3);font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.sc h3{margin:0;font-size:18px} .sc .topo{display:flex;align-items:center;gap:10px;margin-bottom:12px} .sc .x{margin-left:auto;border:0;background:none;font-size:22px;cursor:pointer;color:#5b6670}
.sc .campos{display:grid;grid-template-columns:180px 1fr;gap:10px 14px;align-items:center;margin-bottom:12px}
.sc label.t{font-size:12.5px;font-weight:600;color:#3b4a58}
.sc input,.sc select{padding:8px 10px;border:1px solid #cfd8e0;border-radius:8px;font:inherit;color:#122a3f;background:#fff;min-width:0}
.sc #sc-valor{font-size:18px;font-weight:700;width:180px}
.sc .perdas{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sc .perdas label{display:flex;gap:5px;align-items:center;border:1px solid #cfd8e0;border-radius:999px;padding:4px 10px;cursor:pointer;font-size:13px}
.sc .perdas label.on{border-color:#00a884;background:#e8f6f1}
.sc .perdas input[type=radio]{margin:0}
.sc #sc-outro{width:70px;padding:4px 8px}
.sc .dica{font-size:12px;color:#5b6670}
.sc #sc-tabela{overflow-x:auto;-webkit-overflow-scrolling:touch}
.sc table{border-collapse:collapse;width:100%;margin-top:6px;font-variant-numeric:tabular-nums}
.sc th,.sc td{padding:6px 8px;border-bottom:1px solid #e3e9ef;text-align:right;white-space:nowrap}
.sc th{font-size:12px;color:#5b6670;font-weight:700;background:#f6f8fa}
.sc th:first-child,.sc td:first-child{text-align:left}
.sc td.cobrar{font-weight:700;color:#0a7d55}
.sc td.perde{color:#b42318}
.sc tr:hover td{background:#f6fbf9}
.sc .rodape{font-size:12px;color:#5b6670;margin-top:10px;line-height:1.5}
.sc .acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;align-items:center}
.sc .b{padding:8px 14px;border-radius:8px;border:1px solid #cfd8e0;background:#fff;cursor:pointer;font:inherit;font-weight:600}
.sc .b.pri{background:#00a884;border-color:#00a884;color:#fff}
.sc .st{font-size:13px;color:#0a7d55;margin-right:auto}
@media (max-width:640px){ .sc .campos{grid-template-columns:1fr} .sc .col-sem{display:none} .sc th,.sc td{padding:5px 4px;font-size:12.5px} }`;

  let raiz = null;
  const estado = { bandeira: "visa", perda: "cdi", outro: "" };

  function monta() {
    if (raiz) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    raiz = document.createElement("div"); raiz.className = "sc-bg";
    raiz.innerHTML = `<div class="sc" role="dialog" aria-label="Simulador de cartão">
  <div class="topo"><h3>💳 Simulador de cartão</h3><button class="x" data-sc="fechar" title="Fechar">×</button></div>
  <div class="campos">
    <label class="t" for="sc-valor">Valor à vista (Pix/dinheiro)</label>
    <div><input id="sc-valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off"></div>
    <label class="t" for="sc-bandeira">Bandeira do cartão</label>
    <div><select id="sc-bandeira">${BANDEIRAS.map((b) => `<option value="${b.id}">${b.nome}</option>`).join("")}</select></div>
    <label class="t">Perda do dinheiro no tempo</label>
    <div>
      <div class="perdas">${PERDAS.map((p) => `<label data-perda="${p.id}"><input type="radio" name="sc-perda" value="${p.id}">${p.rotulo}${p.mes != null ? ` <span class="dica">${PCT(p.mes)} a.m.</span>` : ` <input id="sc-outro" inputmode="decimal" placeholder="% a.m.">`}</label>`).join("")}</div>
      <div class="dica" id="sc-dica-perda"></div>
    </div>
  </div>
  <div id="sc-tabela"></div>
  <div class="rodape" id="sc-rodape"></div>
  <div class="acoes"><span class="st" id="sc-st"></span><button class="b" data-sc="fechar">Fechar</button><button class="b pri" data-sc="copiar">Copiar valores para o paciente</button></div>
</div>`;
    document.body.appendChild(raiz);
    raiz.addEventListener("click", (e) => {
      if (e.target === raiz) return fechar();
      const a = e.target.closest("[data-sc]"); if (!a) return;
      if (a.dataset.sc === "fechar") fechar();
      if (a.dataset.sc === "copiar") copiar();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && raiz.classList.contains("show")) fechar(); });
    $("#sc-valor", raiz).addEventListener("input", desenha);
    $("#sc-valor", raiz).addEventListener("blur", (e) => { const v = lerNumero(e.target.value); if (v > 0) e.target.value = BRL(v); });
    $("#sc-valor", raiz).addEventListener("focus", (e) => { const v = lerNumero(e.target.value); e.target.value = v > 0 ? String(v).replace(".", ",") : ""; e.target.select(); });
    $("#sc-bandeira", raiz).addEventListener("change", (e) => { estado.bandeira = e.target.value; desenha(); });
    raiz.querySelectorAll('input[name="sc-perda"]').forEach((r) => r.addEventListener("change", (e) => { estado.perda = e.target.value; desenha(); }));
    $("#sc-outro", raiz).addEventListener("input", (e) => { estado.outro = e.target.value; estado.perda = "outro"; desenha(); });
    $("#sc-outro", raiz).addEventListener("focus", () => { estado.perda = "outro"; desenha(); });
  }

  function taxaPerda() {
    const p = PERDAS.find((x) => x.id === estado.perda) || PERDAS[0];
    return p.mes != null ? p.mes : Math.max(0, lerNumero(estado.outro));
  }

  let ultimo = null;
  function desenha() {
    const V = lerNumero($("#sc-valor", raiz).value);
    const b = BANDEIRAS.find((x) => x.id === estado.bandeira) || BANDEIRAS[0];
    const iPct = taxaPerda();
    raiz.querySelectorAll(".perdas label").forEach((l) => {
      const on = l.dataset.perda === estado.perda;
      l.classList.toggle("on", on); $("input[type=radio]", l).checked = on;
    });
    const p = PERDAS.find((x) => x.id === estado.perda);
    $("#sc-dica-perda", raiz).textContent = p ? `${p.dica}${p.id === "outro" ? "" : "."}` : "";
    if (!(V > 0)) {
      ultimo = null;
      $("#sc-tabela", raiz).innerHTML = `<div class="dica" style="padding:14px 0">Digite o valor à vista para ver a tabela.</div>`;
      $("#sc-rodape", raiz).textContent = "";
      return;
    }
    const linhas = calcula(V, b, iPct / 100);
    ultimo = { V, b, linhas };
    $("#sc-tabela", raiz).innerHTML = `<table>
  <thead><tr><th>Forma</th><th>Cobrar do paciente</th><th>Parcela</th><th>Acréscimo</th><th title="Taxa da Cielo sobre o valor cobrado">Taxa Cielo</th><th title="Quanto o dinheiro perde por entrar nos meses seguintes">Perda no tempo</th><th class="col-sem" title="Quanto sobra, em dinheiro de hoje, se cobrar só o valor à vista">Sem acréscimo, sobra</th></tr></thead>
  <tbody>${linhas.map((l) => `<tr>
    <td>${l.rotulo}</td>
    <td class="cobrar">${BRL(l.total)}</td>
    <td>${l.n > 1 ? `${l.n}x ${BRL(l.parcela)}` : "—"}</td>
    <td>+${PCT(l.acrescimo)}</td>
    <td>${BRL(l.taxaReais)} <span class="dica">(${PCT(l.taxa)})</span></td>
    <td>${BRL(l.tempoReais)}</td>
    <td class="col-sem perde">${BRL(l.semAcrescimo)}</td>
  </tr>`).join("")}</tbody></table>`;
    $("#sc-rodape", raiz).innerHTML =
      `"Cobrar do paciente" já cobre a taxa da Cielo e a perda de ${PCT(iPct)} ao mês sobre o dinheiro que só entra depois: a clínica fica com o equivalente a ${BRL(V)} hoje. ` +
      `"Sem acréscimo, sobra" mostra quanto vale hoje o que entra se a venda for feita pelo valor à vista. ` +
      `${b.deb == null ? `${b.nome} não tem débito na Cielo. ` : ""}` +
      `Pix pela maquininha Cielo custa ${PCT(PIX_CIELO)}; Pix direto na conta do IOBB não tem taxa. ` +
      `Taxas da Cielo conferidas no portal em ${TAXAS_CONFERIDAS_EM} (parcelado loja, sem antecipação).`;
    $("#sc-st", raiz).textContent = "";
  }

  async function copiar() {
    if (!ultimo) return;
    const { V, b, linhas } = ultimo;
    const txt = [`Valor à vista (Pix ou dinheiro): ${BRL(V)}`, `No cartão ${b.nome}:`]
      .concat(linhas.map((l) => l.n > 1 ? `${l.rotulo} de ${BRL(l.parcela)} (total ${BRL(l.total)})` : `${l.rotulo}: ${BRL(l.total)}`))
      .join("\n");
    try { await navigator.clipboard.writeText(txt); $("#sc-st", raiz).textContent = "Copiado. É só colar na conversa."; }
    catch (_) { window.prompt("Copie o texto abaixo:", txt); }
  }

  function abrir() { monta(); raiz.classList.add("show"); desenha(); setTimeout(() => $("#sc-valor", raiz).focus(), 30); }
  function fechar() { if (raiz) raiz.classList.remove("show"); }
  function montar(botao) { if (botao) botao.addEventListener("click", abrir); }

  window.SimuladorCartao = { abrir, fechar, montar, _calcula: calcula, _BANDEIRAS: BANDEIRAS };
})();
