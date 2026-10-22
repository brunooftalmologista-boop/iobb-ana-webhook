/* Autocompletar de paciente ao MARCAR (Dr. Bruno, 22/10/2026) — agenda e painel.
   Ao digitar o nome (ou telefone/CPF/nascimento) no "Marcar horário", mostra quem já
   tem cadastro (agenda + prontuário + importados do iClinic) e, ao escolher, preenche
   nome completo, telefone, convênio e a data de nascimento (nas observações, no
   formato que a Ana e o prontuário leem). Usa a busca do Cadastro (/api/preexame/busca). */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const semAc = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const foneBR = (t) => { const d = String(t || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : ""; };
  const dataBR = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  function iniciar() {
    const nome = $("#agbook-nome"); if (!nome || nome.dataset.autoc) return; nome.dataset.autoc = "1";
    const caixa = document.createElement("div");
    caixa.style.cssText = "position:absolute;z-index:10050;background:#fff;color:#1f2d33;border:1px solid #cfd8e0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:280px;overflow:auto;font:14px/1.35 system-ui,sans-serif;display:none";
    document.body.appendChild(caixa);
    let res = [], sel = -1, t = null, ultimaQ = "";
    const posiciona = () => { const r = nome.getBoundingClientRect(); caixa.style.left = (r.left + scrollX) + "px"; caixa.style.top = (r.bottom + scrollY + 2) + "px"; caixa.style.width = r.width + "px"; };
    const fecha = () => { caixa.style.display = "none"; sel = -1; };
    function desenha() {
      if (!res.length) { fecha(); return; }
      caixa.innerHTML = `<div style="padding:6px 10px;font-size:12px;color:#6b7b8c;border-bottom:1px solid #eef1f4">Já tem cadastro — clique para puxar os dados</div>` +
        res.map((p, i) => `<div data-i="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f4f7;${i === sel ? "background:#e8f4f2" : ""}">
          <b>${esc(p.nome)}</b><br><small style="color:#5a6b7c">${[foneBR(p.telefone), p.convenio || "", p.nascimento ? "nasc. " + esc(p.nascimento) : "", p.ultima ? "última " + dataBR(p.ultima) : "", p.importado ? "iClinic" : ""].filter(Boolean).map(esc).join(" · ")}</small>
          ${p.proxima ? `<br><small style="color:#b45309;font-weight:600">⚠️ já tem consulta marcada em ${dataBR(p.proxima)}</small>` : ""}</div>`).join("");
      posiciona(); caixa.style.display = "block";
    }
    async function busca() {
      const q = nome.value.trim(); if (q.length < 3 || q === ultimaQ) { if (q.length < 3) fecha(); return; } ultimaQ = q;
      try {
        const r = await fetch(`/api/preexame/busca?q=${encodeURIComponent(q)}`, { headers: { Authorization: "Bearer " + (localStorage.getItem("iobb_at") || "") } });
        if (!r.ok) { fecha(); return; }
        const d = await r.json(); if (nome.value.trim() !== q) return;
        res = (d.pacientes || []).slice(0, 8); sel = -1; desenha();
      } catch (_) { fecha(); }
    }
    function escolhe(i) {
      const p = res[i]; if (!p) return;
      nome.value = p.nome || nome.value;
      const tel = $("#agbook-tel"); if (tel && p.telefone && !/^iclinic/.test(p.telefone)) tel.value = foneBR(p.telefone) || p.telefone;
      const conv = $("#agbook-conv");
      if (conv) {
        const alvo = semAc(p.convenio || "Particular");
        let op = [...conv.options].find((o) => semAc(o.value || o.text) === alvo) || [...conv.options].find((o) => alvo && semAc(o.value || o.text).includes(alvo));
        if (!op && p.convenio) { op = new Option(p.convenio, p.convenio); conv.add(op); }
        if (op) conv.value = op.value;
      }
      const obs = $("#agbook-obs");
      if (obs && p.nascimento && !/Nascimento:/i.test(obs.value)) obs.value = [obs.value.trim(), `Nascimento: ${p.nascimento}`].filter(Boolean).join("\n");
      fecha(); ultimaQ = nome.value.trim();
    }
    nome.addEventListener("input", () => { clearTimeout(t); t = setTimeout(busca, 300); });
    nome.addEventListener("keydown", (e) => {
      if (caixa.style.display === "none") return;
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); desenha(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); desenha(); }
      else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); escolhe(sel); }
      else if (e.key === "Escape") fecha();
    });
    caixa.addEventListener("mousedown", (e) => { const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); escolhe(+d.dataset.i); } });
    nome.addEventListener("blur", () => setTimeout(fecha, 150));
    addEventListener("scroll", () => { if (caixa.style.display !== "none") posiciona(); }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
