#!/usr/bin/env node
// ============================================================================
// Gera o GOOGLE_ADS_REFRESH_TOKEN (rode UMA vez, localmente).
//
// Pré-requisitos:
//   - OAuth Client do tipo "App para computador (Desktop app)" criado no
//     Google Cloud Console (Client ID + Client Secret).
//   - Escopos autorizados na tela de consentimento: .../auth/adwords E
//     .../auth/datamanager (este último exige a "Data Manager API" HABILITADA
//     no projeto do Google Cloud — Ativar APIs e serviços → Data Manager API).
//   - O refresh token gerado cobre OS DOIS escopos: relatórios/campanhas (Ads
//     API) e upload de conversões (Data Manager API).
//
// Uso:
//   GOOGLE_ADS_CLIENT_ID=xxx GOOGLE_ADS_CLIENT_SECRET=yyy node generate-refresh-token.js
//   (ou apenas `node generate-refresh-token.js` e informe quando solicitado)
//
// O script abre um servidor local, você autoriza no navegador e ele imprime
// o refresh_token para você colar no /etc/secrets/.env do Render.
// ============================================================================

const http = require("http");
const crypto = require("crypto");
const readline = require("readline");
const axios = require("axios");

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
// Dois escopos: adwords (relatórios/campanhas) + datamanager (upload de
// conversões via Data Manager API). Separados por espaço.
const SCOPE = "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

(async () => {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || await ask("Client ID: ");
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || await ask("Client Secret: ");
  if (!clientId || !clientSecret) {
    console.error("Client ID e Client Secret são obrigatórios.");
    process.exit(1);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  console.log("\n1) Abra este link no navegador e autorize com a conta do Google Ads:\n");
  console.log(authUrl + "\n");
  console.log("2) Aguardando o retorno da autorização em " + REDIRECT_URI + " ...\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== "/") { res.writeHead(404); res.end(); return; }
      const err = url.searchParams.get("error");
      const gotCode = url.searchParams.get("code");
      const gotState = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (err || !gotCode || gotState !== state) {
        res.end("<h2>Falha na autorização. Pode fechar esta aba e tentar de novo.</h2>");
        server.close();
        return reject(new Error(err || "código ausente ou state inválido"));
      }
      res.end("<h2>Autorizado! Pode fechar esta aba e voltar ao terminal.</h2>");
      server.close();
      resolve(gotCode);
    });
    server.listen(PORT);
    server.on("error", reject);
  });

  console.log("Trocando o código por tokens...\n");
  const { data } = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

  if (!data.refresh_token) {
    console.error("Não veio refresh_token. Revogue o acesso em https://myaccount.google.com/permissions e rode de novo (prompt=consent + access_type=offline).");
    process.exit(1);
  }

  console.log("======================================================");
  console.log("✅ REFRESH TOKEN GERADO — adicione ao /etc/secrets/.env:\n");
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("======================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("Erro:", e?.response?.data || e.message);
  process.exit(1);
});
