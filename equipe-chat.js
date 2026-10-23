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
  .ec-st{color:var(--ec-alerta);font-size:12.5px;padding:0 14px 8px}
  .ec-urgchk{display:flex;align-items:center;gap:4px;font:600 12.5px system-ui,sans-serif;color:var(--ec-alerta);white-space:nowrap;cursor:pointer}
  .ec-msg.urg{border-left:3px solid var(--ec-alerta)}
  .ec-perm{border:0;background:none;color:var(--ec-pri);font:600 12.5px system-ui,sans-serif;cursor:pointer;padding:0 14px 8px;text-align:left}
  .ec-toast{position:fixed;top:calc(62px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(440px,94vw);z-index:9998;background:var(--ec-bg);color:var(--ec-fg);
    border:2px solid var(--ec-pri);border-radius:12px;box-shadow:0 10px 30px var(--ec-sombra);padding:12px 14px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .ec-toast[hidden]{display:none}
  .ec-toast .ec-t-txt{margin:4px 0 10px;white-space:pre-wrap;word-break:break-word;max-height:7.5em;overflow:hidden}
  .ec-toast .ec-t-ac{display:flex;gap:8px;justify-content:flex-end}
  .ec-toast button,.ec-urg button{border:0;border-radius:8px;font:600 14px system-ui,sans-serif;padding:8px 14px;cursor:pointer}
  .ec-btn-pri{background:var(--ec-pri);color:var(--ec-pri-fg)} .ec-btn-sec{background:var(--ec-out);color:var(--ec-fg)}
  .ec-urg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:grid;place-items:center;padding:16px}
  .ec-urg[hidden]{display:none}
  .ec-urg>div{width:min(460px,100%);background:var(--ec-bg);color:var(--ec-fg);border:3px solid var(--ec-alerta);border-radius:14px;padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.4);font:15px/1.45 system-ui,sans-serif}
  .ec-urg h3{margin:0 0 6px;color:var(--ec-alerta);font-size:18px} .ec-urg .ec-u-txt{white-space:pre-wrap;word-break:break-word;margin:8px 0 16px;font-size:16px}
  .ec-urg .ec-u-ac{display:flex;gap:8px;justify-content:flex-end} .ec-btn-urg{background:var(--ec-alerta);color:#fff}
  .ec-clip{border:1px solid var(--ec-line)!important;background:var(--ec-out)!important;color:var(--ec-fg)!important;font-size:18px!important;padding:0 10px!important}
  .ec-img{display:block;max-width:220px;max-height:220px;border-radius:8px;margin-top:4px;border:1px solid var(--ec-line)}
  .ec-arq{display:inline-flex;gap:6px;align-items:center;margin-top:4px;padding:6px 10px;border:1px solid var(--ec-line);border-radius:8px;background:var(--ec-bg);color:var(--ec-fg);text-decoration:none;font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .ec-gaveta.arrastando .ec-lista{outline:3px dashed var(--ec-pri);outline-offset:-8px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- gaveta ---------- */
  const g = document.createElement("div");
  g.className = "ec-gaveta"; g.hidden = true; g.setAttribute("role", "dialog"); g.setAttribute("aria-label", "Chat da equipe");
  g.innerHTML = `<div class="ec-topo"><b>Chat da equipe</b><span><button type="button" class="ec-x ec-som"></button><button type="button" class="ec-x" title="Fechar" aria-label="Fechar">×</button></span></div>
    <div class="ec-abas"></div><div class="ec-lista"></div><div class="ec-st"></div><button type="button" class="ec-perm" hidden></button>
    <div class="ec-pe"><button type="button" class="ec-clip" title="Anexar foto, PDF ou documento (também dá para colar uma imagem com Ctrl+V ou arrastar o arquivo para cá)" aria-label="Anexar arquivo">📎</button><input type="file" class="ec-file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"><textarea placeholder="Escreva… (Enter envia, Shift+Enter quebra linha)" aria-label="Mensagem"></textarea><div style="display:flex;flex-direction:column;gap:6px;justify-content:center"><label class="ec-urgchk" title="Abre uma janela na tela de quem recebe, que só fecha clicando em Ciente"><input type="checkbox" class="ec-urg-in"> ⚠️ Urgente</label><button type="button" class="ec-enviar" style="padding:8px 14px">Enviar</button></div></div>`;
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

  const tam = n => n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  function anexoHtml(m) {
    if (!m.anexo_nome) return "";
    if (!m.anexo_url) return `<div class="ec-arq">📎 ${esc(m.anexo_nome)} (link expirado: reabra o chat)</div>`;
    if (/^image\//.test(m.anexo_mime || "")) return `<a href="${esc(m.anexo_url)}" target="_blank" rel="noopener" title="${esc(m.anexo_nome)}"><img class="ec-img" src="${esc(m.anexo_url)}" alt="${esc(m.anexo_nome)}" loading="lazy"></a>`;
    return `<a class="ec-arq" href="${esc(m.anexo_url)}" target="_blank" rel="noopener">${/pdf/.test(m.anexo_mime || "") ? "📄" : "📎"} ${esc(m.anexo_nome)}${m.anexo_tamanho ? ` · ${tam(m.anexo_tamanho)}` : ""}</a>`;
  }
  const resumo = m => m.texto || (m.anexo_nome ? `📎 ${m.anexo_nome}` : "");
  function marcarVisto() { if (g.hidden) return; const ms = msgs.filter(m => conversaDe(m) === aba); if (ms.length) gravar(vistoKey(aba), ms[ms.length - 1].created_at); }
  function desenhar() {
    const convs = ["todos", ...pessoas.filter(p => p !== eu)];
    $abas.innerHTML = convs.map(c => `<button type="button" class="ec-aba${c === aba ? " ativa" : ""}" data-c="${esc(c)}">${c === "todos" ? "Todos" : esc(c)}${c !== aba && naoLidas(c) ? "<i></i>" : ""}</button>`).join("");
    const ms = msgs.filter(m => conversaDe(m) === aba);
    $lista.innerHTML = ms.length ? ms.map(m => `<div class="ec-msg${m.de === eu ? " meu" : ""}${m.urgente ? " urg" : ""}"><small>${m.urgente ? "⚠️ URGENTE · " : ""}${m.de === eu ? "Você" : esc(m.de)} · ${hora(m.created_at)}</small>${esc(m.texto)}${anexoHtml(m)}</div>`).join("")
      : `<div class="ec-vazio">${aba === "todos" ? "Mensagens para toda a equipe aparecem aqui." : "Nenhuma mensagem com " + esc(aba) + " ainda."}</div>`;
    $lista.scrollTop = $lista.scrollHeight;
    const total = convs.reduce((n, c) => n + naoLidas(c), 0);
    for (const b of botoes) { let bd = b.querySelector(".ec-badge"); if (total) { if (!bd) { bd = document.createElement("span"); bd.className = "ec-badge"; b.appendChild(bd); } bd.textContent = total > 99 ? "99+" : String(total); } else if (bd) bd.remove(); }
  }
  $abas.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; aba = b.dataset.c; marcarVisto(); desenhar(); $txt.focus(); });
  // a aba/botão que abriu o chat fica marcada enquanto ele está aberto
  const marcaBotoes = () => botoes.forEach(b => b.classList.toggle("ec-ativo", !g.hidden));
  const fechar = () => { g.hidden = true; marcaBotoes(); };
  g.querySelector(".ec-x:not(.ec-som)").addEventListener("click", fechar);
  const $som = g.querySelector(".ec-som");
  const desenhaSom = () => { $som.textContent = somLigado() ? "🔔" : "🔕"; $som.title = somLigado() ? "Som de mensagem nova ligado (clique para desligar)" : "Som desligado (clique para ligar)"; $som.style.fontSize = "17px"; };
  $som.addEventListener("click", () => { gravar("iobb_chat_som", somLigado() ? "0" : "1"); desenhaSom(); if (somLigado()) bip(); });
  desenhaSom();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !g.hidden) fechar(); });

  /* ---------- som (21/10/2026) ----------
     Próprio do chat (🔔 na gaveta), independente do 🔔 dos sons da Ana no painel.
     O navegador só libera áudio depois de um clique/tecla na página: o contexto
     é criado/destravado no primeiro gesto e o bip só toca a partir daí. */
  let actx = null;
  function somLigado() { return ler("iobb_chat_som") !== "0"; }   // declaração (içada): a gaveta usa antes desta linha
  function destravar() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (_) {}
  }
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, destravar, { capture: true, passive: true }));
  function bip() {
    if (!somLigado()) return;
    try { destravar(); if (!actx) return;
      [0, 0.18].forEach((t, i) => { const o = actx.createOscillator(), v = actx.createGain(); o.frequency.value = i ? 1046 : 784;
        v.gain.setValueAtTime(0.0001, actx.currentTime + t); v.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + t + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.16);
        o.connect(v); v.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.18); });
    } catch (_) {}
  }

  /* ---------- rede ---------- */
  let tPoll = null, emCurso = false;
  async function buscar() {
    if (emCurso) return;
    if (!ler("iobb_at")) { if (eu) { eu = null; msgs = []; ultima = ""; fechar(); desenhar(); } return; }   // saiu do painel
    emCurso = true;
    try {
      const r = await api("/api/equipe/mensagens" + (ultima ? "?desde=" + encodeURIComponent(ultima) : ""));
      if (eu && r.eu !== eu) { eu = null; msgs = []; ultima = ""; primeiraCarga = true; emCurso = false; return buscar(); }   // outra pessoa entrou neste navegador
      eu = r.eu; pessoas = r.pessoas || pessoas;
      const novas = (r.mensagens || []).filter(m => !msgs.some(x => x.id === m.id));
      if (novas.length) { msgs = msgs.concat(novas).slice(-500); ultima = msgs[msgs.length - 1].created_at;
        const deOutros = primeiraCarga ? [] : novas.filter(m => m.de !== eu);
        if (deOutros.length) { bip(); avisarNovas(deOutros); } }
      if (!ultima) ultima = new Date(Date.now() - 1000).toISOString();
      primeiraCarga = false; marcarVisto(); desenhar(); $st.textContent = "";
    } catch (e) { if (e.status === 403) { botoes.forEach(b => b.style.display = "none"); clearTimeout(tPoll); emCurso = false; return; } }
    emCurso = false;
  }
  function agendar() { clearTimeout(tPoll); tPoll = setTimeout(async () => { await buscar(); agendar(); }, document.hidden ? 15000 : (g.hidden ? 10000 : 4000)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { buscar(); agendar(); } });

  async function enviar() {
    const texto = $txt.value.trim(); if (!texto) return;
    $txt.disabled = true;
    const $urg = g.querySelector(".ec-urg-in");
    try { const r = await api("/api/equipe/mensagens", { method: "POST", body: JSON.stringify({ texto, para: aba === "todos" ? null : aba, urgente: $urg.checked }) });
      $txt.value = ""; $urg.checked = false; if (!msgs.some(x => x.id === r.mensagem.id)) msgs.push(r.mensagem); ultima = r.mensagem.created_at; marcarVisto(); desenhar();
    } catch (e) { $st.textContent = e.msg || "Não consegui enviar. Tente de novo."; }
    finally { $txt.disabled = false; $txt.focus(); }
  }
  g.querySelector(".ec-enviar").addEventListener("click", enviar);

  /* ---------- anexos (23/10/2026) ----------
     📎, colar imagem (Ctrl+V) ou arrastar para a gaveta. O texto escrito vai junto como
     legenda. Até 15 MB. O arquivo sobe cru; o servidor guarda no bucket privado. */
  const $file = g.querySelector(".ec-file");
  g.querySelector(".ec-clip").addEventListener("click", () => $file.click());
  $file.addEventListener("change", () => { const f = $file.files[0]; $file.value = ""; if (f) enviarArquivo(f); });
  async function enviarArquivo(f, again) {
    if (f.size > 15 * 1048576) { $st.textContent = "Arquivo grande demais (máximo 15 MB)."; return; }
    const $urg = g.querySelector(".ec-urg-in"), legenda = $txt.value.trim();
    const nome = f.name || `imagem-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    const qs = new URLSearchParams({ nome, texto: legenda, urgente: $urg.checked ? "1" : "", ...(aba === "todos" ? {} : { para: aba }) });
    $st.style.color = "var(--ec-mut)"; $st.textContent = `Enviando ${nome}…`;
    try {
      const r = await fetch("/api/equipe/anexo?" + qs, { method: "POST", headers: { "Authorization": "Bearer " + ler("iobb_at"), "Content-Type": f.type || "application/octet-stream" }, body: f });
      if (r.status === 401 && !again && await renovar()) return enviarArquivo(f, true);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.mensagem) throw new Error(d.error || "Não consegui enviar o arquivo.");
      $txt.value = ""; $urg.checked = false; if (!msgs.some(x => x.id === d.mensagem.id)) msgs.push(d.mensagem); ultima = d.mensagem.created_at; marcarVisto(); desenhar();
      $st.textContent = "";
    } catch (e) { $st.textContent = e.message || "Não consegui enviar o arquivo."; }
    finally { $st.style.color = ""; }
  }
  $txt.addEventListener("paste", e => { const it = [...(e.clipboardData?.items || [])].find(x => x.kind === "file"); if (it) { e.preventDefault(); const f = it.getAsFile(); if (f) enviarArquivo(f); } });
  g.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); g.classList.add("arrastando"); } });
  g.addEventListener("dragleave", e => { if (!g.contains(e.relatedTarget)) g.classList.remove("arrastando"); });
  g.addEventListener("drop", e => { e.preventDefault(); g.classList.remove("arrastando"); const f = e.dataTransfer?.files?.[0]; if (f) enviarArquivo(f); });

  /* ---------- AVISOS (22/10/2026): "na prática ninguém vê, só se abrir o chat" ----------
     1) cartão no topo da tela com quem mandou e o texto; 2) mensagem URGENTE abre
     janela no meio que só fecha com "Ciente" (e o bip repete até lá); 3) notificação
     do sistema quando a página está minimizada/atrás de outra janela; 4) título da
     aba pisca. Nada disso aparece para quem já está com aquela conversa aberta. */
  const toast = document.createElement("div"); toast.className = "ec-toast"; toast.hidden = true; toast.setAttribute("role", "status");
  toast.innerHTML = `<b class="ec-t-de"></b><div class="ec-t-txt"></div><div class="ec-t-ac"><button type="button" class="ec-btn-sec ec-t-x">Fechar</button><button type="button" class="ec-btn-pri ec-t-abrir">Abrir chat</button></div>`;
  document.body.appendChild(toast);
  const urg = document.createElement("div"); urg.className = "ec-urg"; urg.hidden = true; urg.setAttribute("role", "alertdialog");
  urg.innerHTML = `<div><h3>⚠️ Mensagem urgente</h3><b class="ec-u-de"></b><div class="ec-u-txt"></div><div class="ec-u-ac"><button type="button" class="ec-btn-sec ec-u-abrir">Responder</button><button type="button" class="ec-btn-urg ec-u-ok">Ciente</button></div></div>`;
  document.body.appendChild(urg);
  let toastConv = null, tToast = null, filaUrg = [], tBipUrg = null, tTitulo = null;
  const tituloOrig = () => document.title.replace(/^\(\d+\) 💬 [^|]*\| /, "");
  function abrirEm(c) { aba = c || "todos"; g.hidden = false; marcaBotoes(); marcarVisto(); desenhar(); setTimeout(() => $txt.focus(), 30); buscar(); agendar(); }
  function mostraToast(lista) {
    const m = lista[lista.length - 1]; toastConv = conversaDe(m);
    toast.querySelector(".ec-t-de").textContent = `💬 ${m.de}${m.para ? " (para você)" : " (para todos)"}${lista.length > 1 ? ` · +${lista.length - 1} mensagem(ns)` : ""}`;
    toast.querySelector(".ec-t-txt").textContent = resumo(m);
    toast.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { toast.hidden = true; }, 90000);
  }
  toast.querySelector(".ec-t-x").addEventListener("click", () => { toast.hidden = true; });
  toast.querySelector(".ec-t-abrir").addEventListener("click", () => { toast.hidden = true; abrirEm(toastConv); });
  function mostraUrg() {
    const m = filaUrg[0]; if (!m) { urg.hidden = true; clearInterval(tBipUrg); tBipUrg = null; return; }
    urg.querySelector(".ec-u-de").textContent = `De ${m.de} · ${hora(m.created_at)}`; urg.querySelector(".ec-u-txt").textContent = resumo(m);
    urg.hidden = false; if (!tBipUrg) tBipUrg = setInterval(bip, 12000);
  }
  urg.querySelector(".ec-u-ok").addEventListener("click", () => { filaUrg.shift(); mostraUrg(); });
  urg.querySelector(".ec-u-abrir").addEventListener("click", () => { const m = filaUrg.shift(); mostraUrg(); if (m) abrirEm(conversaDe(m)); });
  function notificarSistema(m) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const titulo = `${m.urgente ? "⚠️ URGENTE — " : "💬 "}${m.de}`, opts = { body: String(resumo(m)).slice(0, 200), tag: "iobb-chat", renotify: true, icon: "/app-icons/icon-192.png", requireInteraction: !!m.urgente };
      const viaJanela = () => { try { const n = new Notification(titulo, opts); n.onclick = () => { window.focus(); abrirEm(conversaDe(m)); n.close(); }; } catch (_) {} };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => r ? r.showNotification(titulo, opts) : viaJanela()).catch(viaJanela);
      else viaJanela();
    } catch (_) {}
  }
  function piscaTitulo(n) {
    if (!document.hidden || tTitulo) return; let liga = false;
    tTitulo = setInterval(() => { liga = !liga; const base = tituloOrig(); document.title = liga ? `(${n}) 💬 Nova mensagem | ${base}` : base; }, 1200);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && tTitulo) { clearInterval(tTitulo); tTitulo = null; document.title = tituloOrig(); } });
  function avisarNovas(lista) {
    const vendo = m => !g.hidden && aba === conversaDe(m) && !document.hidden;
    const urgentes = lista.filter(m => m.urgente), normais = lista.filter(m => !m.urgente && !vendo(m));
    if (urgentes.length) { filaUrg.push(...urgentes); mostraUrg(); }
    if (normais.length) mostraToast(normais);
    if (document.hidden || !document.hasFocus()) { lista.forEach(notificarSistema); piscaTitulo(lista.length); }
  }
  // permissão para o aviso do sistema (pedida num clique — o navegador exige)
  const $perm = g.querySelector(".ec-perm");
  function desenhaPerm() {
    if (!("Notification" in window)) { $perm.hidden = true; return; }
    const p = Notification.permission;
    $perm.hidden = p === "granted";
    $perm.textContent = p === "denied" ? "🔕 Avisos fora desta tela estão bloqueados no navegador (libere no cadeado da barra de endereço)." : "🔔 Ativar aviso mesmo com a tela minimizada";
  }
  $perm.addEventListener("click", () => { try { Notification.requestPermission().then(desenhaPerm); } catch (_) {} });
  desenhaPerm();
  $txt.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });

  window.EquipeChat = {
    montar(botao) {
      if (!botao) return; botoes.push(botao); if (getComputedStyle(botao).position === "static") botao.style.position = "relative";
      botao.addEventListener("click", e => { e.preventDefault(); g.hidden = !g.hidden; marcaBotoes(); if (!g.hidden) { marcarVisto(); desenhar(); setTimeout(() => $txt.focus(), 30); buscar(); } agendar(); });
      if (botoes.length === 1) { buscar(); agendar(); }
      desenhar();
    },
    atualizar() { primeiraCarga = !msgs.length; buscar(); },
    fechar,
  };
})();
