/* Chat da equipe (Dr. Bruno, 19/10/2026) — mensagens instantâneas entre o
   médico e as secretárias, como o chat do iClinic. Usado no painel, no
   prontuário e no pré-exame: cada página chama EquipeChat.montar(botao).
   Sessão: a mesma do painel (localStorage iobb_at / iobb_rt). Interno —
   nada vai para paciente, Ana ou IA. */
(function () {
  if (window.EquipeChat) return;
  const TZ = "America/Sao_Paulo";
  const ler = k => { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } };
  const gravar = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (_) {} };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- sessão (mesma lógica do painel: só uma aba renova por vez) ---------- */
  async function renovar() {
    const rt = ler("iobb_rt"); if (!rt) return false;
    if (Date.now() - Number(ler("iobb_rt_ts") || 0) < 8000) { await new Promise(r => setTimeout(r, 1500)); return true; }
    gravar("iobb_rt_ts", String(Date.now()));
    try {
      const r = await fetch("/api/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
      if (!r.ok) return false;
      const d = await r.json(); gravar("iobb_at", d.access_token || ""); if (d.refresh_token) gravar("iobb_rt", d.refresh_token); return true;
    } catch (_) { return false; }
  }
  async function api(path, opts = {}, again) {
    const r = await fetch(path, { ...opts, headers: { "Authorization": "Bearer " + ler("iobb_at"), "Content-Type": "application/json" } });
    if (r.status === 401 && !again && await renovar()) return api(path, opts, true);
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; try { e.msg = (await r.json()).error; } catch (_) {} throw e; }
    return r.json();
  }

  /* ---------- estilo ---------- */
  const css = `
  :root{--ec-bg:#ffffff;--ec-fg:#1f2d33;--ec-mut:#6b7a85;--ec-line:#dfe4ea;--ec-pri:#00796b;--ec-pri-fg:#ffffff;--ec-meu:#d9f2ec;--ec-out:#f1f4f7;--ec-sombra:rgba(0,0,0,.18);--ec-alerta:#d32f2f}
  @media (prefers-color-scheme: dark){:root{--ec-bg:#1a2228;--ec-fg:#e3e9ee;--ec-mut:#93a3ae;--ec-line:#2c3a43;--ec-pri:#4db6a6;--ec-pri-fg:#0d1a17;--ec-meu:#1f3d38;--ec-out:#24313a;--ec-sombra:rgba(0,0,0,.5);--ec-alerta:#ef6b6b}}
  .ec-badge{position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--ec-alerta);color:#fff;font:700 11px/17px system-ui,sans-serif;text-align:center;pointer-events:none}
  .ec-gaveta{position:fixed;top:0;right:0;bottom:0;width:min(380px,100vw);background:var(--ec-bg);color:var(--ec-fg);box-shadow:-6px 0 24px var(--ec-sombra);z-index:9999;display:flex;flex-direction:column;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .ec-gaveta[hidden]{display:none}
  .ec-topo{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--ec-line)}
  .ec-topo b{font-size:15px}
  .ec-x{border:0;background:none;color:var(--ec-mut);font-size:22px;cursor:pointer;line-height:1;padding:2px 6px}
  .ec-abas{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-bottom:1px solid var(--ec-line)}
  .ec-aba{position:relative;border:1px solid var(--ec-line);background:var(--ec-out);color:var(--ec-fg);border-radius:16px;padding:4px 12px;font:13px system-ui,sans-serif;cursor:pointer}
  .ec-aba.ativa{background:var(--ec-pri);border-color:var(--ec-pri);color:var(--ec-pri-fg)}
  .ec-aba i{position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:var(--ec-alerta)}
  .ec-lista{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
  .ec-msg{max-width:85%;padding:7px 10px;border-radius:10px;background:var(--ec-out);white-space:pre-wrap;word-break:break-word;align-self:flex-start}
  .ec-msg.meu{background:var(--ec-meu);align-self:flex-end}
  .ec-msg small{display:block;color:var(--ec-mut);font-size:11.5px;margin-bottom:2px}
  .ec-vazio{color:var(--ec-mut);text-align:center;margin-top:30px}
  .ec-pe{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--ec-line)}
  .ec-pe textarea{flex:1;min-width:0;resize:none;height:44px;border:1px solid var(--ec-line);border-radius:8px;padding:8px 10px;font:14px system-ui,sans-serif;background:var(--ec-bg);color:var(--ec-fg)}
  .ec-pe button{border:0;border-radius:8px;background:var(--ec-pri);color:var(--ec-pri-fg);font:600 14px system-ui,sans-serif;padding:0 14px;cursor:pointer}
  .ec-st{color:var(--ec-alerta);font-size:12.5px;padding:0 14px 8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- gaveta ---------- */
  const g = document.createElement("div");
  g.className = "ec-gaveta"; g.hidden = true; g.setAttribute("role", "dialog"); g.setAttribute("aria-label", "Chat da equipe");
  g.innerHTML = `<div class="ec-topo"><b>Chat da equipe</b><button type="button" class="ec-x" title="Fechar" aria-label="Fechar">×</button></div>
    <div class="ec-abas"></div><div class="ec-lista"></div><div class="ec-st"></div>
    <div class="ec-pe"><textarea placeholder="Escreva… (Enter envia, Shift+Enter quebra linha)" aria-label="Mensagem"></textarea><button type="button">Enviar</button></div>`;
  document.body.appendChild(g);
  const $abas = g.querySelector(".ec-abas"), $lista = g.querySelector(".ec-lista"), $txt = g.querySelector("textarea"), $st = g.querySelector(".ec-st");

  let eu = null, pessoas = [], msgs = [], ultima = "", aba = "todos", botoes = [], primeiraCarga = true;
  const conversaDe = m => m.para ? (m.de === eu ? m.para : m.de) : "todos";
  const vistoKey = c => `iobb_chat_visto_${eu}_${c}`;   // por pessoa: o computador da recepção é compartilhado
  const naoLidas = c => { const v = ler(vistoKey(c)); return msgs.filter(m => conversaDe(m) === c && m.de !== eu && (!v || m.created_at > v)).length; };
  const hora = iso => { const d = new Date(iso), hoje = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
    const dia = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
    const hh = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { timeZone: TZ }) === hoje ? hh : `${dia} ${hh}`; };

  function marcarVisto() { if (g.hidden) return; const ms = msgs.filter(m => conversaDe(m) === aba); if (ms.length) gravar(vistoKey(aba), ms[ms.length - 1].created_at); }
  function desenhar() {
    const convs = ["todos", ...pessoas.filter(p => p !== eu)];
    $abas.innerHTML = convs.map(c => `<button type="button" class="ec-aba${c === aba ? " ativa" : ""}" data-c="${esc(c)}">${c === "todos" ? "Todos" : esc(c)}${c !== aba && naoLidas(c) ? "<i></i>" : ""}</button>`).join("");
    const ms = msgs.filter(m => conversaDe(m) === aba);
    $lista.innerHTML = ms.length ? ms.map(m => `<div class="ec-msg${m.de === eu ? " meu" : ""}"><small>${m.de === eu ? "Você" : esc(m.de)} · ${hora(m.created_at)}</small>${esc(m.texto)}</div>`).join("")
      : `<div class="ec-vazio">${aba === "todos" ? "Mensagens para toda a equipe aparecem aqui." : "Nenhuma mensagem com " + esc(aba) + " ainda."}</div>`;
    $lista.scrollTop = $lista.scrollHeight;
    const total = convs.reduce((n, c) => n + naoLidas(c), 0);
    for (const b of botoes) { let bd = b.querySelector(".ec-badge"); if (total) { if (!bd) { bd = document.createElement("span"); bd.className = "ec-badge"; b.appendChild(bd); } bd.textContent = total > 99 ? "99+" : String(total); } else if (bd) bd.remove(); }
  }
  $abas.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; aba = b.dataset.c; marcarVisto(); desenhar(); $txt.focus(); });
  g.querySelector(".ec-x").addEventListener("click", () => { g.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !g.hidden) g.hidden = true; });

  /* ---------- som (respeita o 🔔 do painel) ---------- */
  let actx = null;
  function bip() {
    if (ler("iobb_sound_on") === "0") return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, i) => { const o = actx.createOscillator(), v = actx.createGain(); o.frequency.value = i ? 1046 : 784;
        v.gain.setValueAtTime(0.0001, actx.currentTime + t); v.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + t + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.16);
        o.connect(v); v.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.18); });
    } catch (_) {}
  }

  /* ---------- rede ---------- */
  let tPoll = null, emCurso = false;
  async function buscar() {
    if (emCurso) return;
    if (!ler("iobb_at")) { if (eu) { eu = null; msgs = []; ultima = ""; g.hidden = true; desenhar(); } return; }   // saiu do painel
    emCurso = true;
    try {
      const r = await api("/api/equipe/mensagens" + (ultima ? "?desde=" + encodeURIComponent(ultima) : ""));
      if (eu && r.eu !== eu) { eu = null; msgs = []; ultima = ""; primeiraCarga = true; emCurso = false; return buscar(); }   // outra pessoa entrou neste navegador
      eu = r.eu; pessoas = r.pessoas || pessoas;
      const novas = (r.mensagens || []).filter(m => !msgs.some(x => x.id === m.id));
      if (novas.length) { msgs = msgs.concat(novas).slice(-500); ultima = msgs[msgs.length - 1].created_at;
        if (!primeiraCarga && novas.some(m => m.de !== eu)) bip(); }
      if (!ultima) ultima = new Date(Date.now() - 1000).toISOString();
      primeiraCarga = false; marcarVisto(); desenhar(); $st.textContent = "";
    } catch (e) { if (e.status === 403) { botoes.forEach(b => b.style.display = "none"); clearTimeout(tPoll); emCurso = false; return; } }
    emCurso = false;
  }
  function agendar() { clearTimeout(tPoll); tPoll = setTimeout(async () => { await buscar(); agendar(); }, document.hidden ? 30000 : (g.hidden ? 10000 : 4000)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { buscar(); agendar(); } });

  async function enviar() {
    const texto = $txt.value.trim(); if (!texto) return;
    $txt.disabled = true;
    try { const r = await api("/api/equipe/mensagens", { method: "POST", body: JSON.stringify({ texto, para: aba === "todos" ? null : aba }) });
      $txt.value = ""; if (!msgs.some(x => x.id === r.mensagem.id)) msgs.push(r.mensagem); ultima = r.mensagem.created_at; marcarVisto(); desenhar();
    } catch (e) { $st.textContent = e.msg || "Não consegui enviar. Tente de novo."; }
    finally { $txt.disabled = false; $txt.focus(); }
  }
  g.querySelector(".ec-pe button").addEventListener("click", enviar);
  $txt.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });

  window.EquipeChat = {
    montar(botao) {
      if (!botao) return; botoes.push(botao); if (getComputedStyle(botao).position === "static") botao.style.position = "relative";
      botao.addEventListener("click", e => { e.preventDefault(); g.hidden = !g.hidden; if (!g.hidden) { marcarVisto(); desenhar(); setTimeout(() => $txt.focus(), 30); buscar(); } agendar(); });
      if (botoes.length === 1) { buscar(); agendar(); }
      desenhar();
    },
    atualizar() { primeiraCarga = !msgs.length; buscar(); },
  };
})();
