/* IOBB como aplicativo (PWA, 22/10/2026). Incluído no painel, agenda, pré-exame e
   prontuário: registra o service worker (que existe só para o app ser instalável —
   ele NÃO guarda dado de paciente) e, quando aberto como app instalado, mostra um
   botão discreto para voltar à tela inicial (/app). */
(function () {
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  const instalado = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (!instalado || location.pathname === "/app") return;
  addEventListener("DOMContentLoaded", () => {
    const a = document.createElement("a");
    a.href = "/app"; a.title = "Início"; a.setAttribute("aria-label", "Início"); a.textContent = "⌂";
    a.style.cssText = "position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:40;width:38px;height:38px;border-radius:50%;" +
      "background:#0e2a43;color:#fff;font:22px/38px system-ui,sans-serif;text-align:center;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:.85";
    document.body.appendChild(a);
  });
})();
