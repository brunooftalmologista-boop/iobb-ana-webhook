// Cloudflare Worker — roteia as landing pages do iobb.com.br para o app da Ana no Render,
// mantendo TODO o resto do domínio no site institucional.
//
// Como funciona: este Worker é ligado APENAS aos paths de landing (ver "Routes"
// no runbook docs/DOMINIO-IOBB.md). Para esses paths, ele faz um proxy reverso
// para o app no Render, preservando o path e a query string (?gclid=..., etc.).
// A URL que o paciente vê continua sendo iobb.com.br/... (não é redirect).
//
// Qualquer path que NÃO estiver nas Routes do Worker nunca chega aqui — segue
// normal para o site institucional. Por isso não há risco de derrubar o site.

const ORIGIN = "https://iobb-ana-webhook.onrender.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Reaponta só o host para o Render; mantém path + query intactos.
    const target = ORIGIN + url.pathname + url.search;
    // Ao construir a Request com uma URL do Render, o fetch já ajusta o Host
    // para iobb-ana-webhook.onrender.com — o Render responde normalmente sem
    // precisar cadastrar iobb.com.br como domínio customizado lá.
    return fetch(new Request(target, request));
  },
};
