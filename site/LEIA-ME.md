# site/ — o site iobb.com.br (Cloudflare Pages)

**Este diretório é a fonte do site publicado em iobb.com.br.** Até 22/08/2026 o site
existia só no ar e em zips soltos na pasta Documents — qualquer mudança exigia baixar
tudo de novo, e o `_redirects` (que o Cloudflare não devolve) se perdia no caminho.

Cuidador: o agente **site-landings** (`.claude/agents/site-landings.md`). Leia-o antes
de mexer aqui — ele tem as armadilhas que já causaram estrago.

O essencial:
- **O deploy substitui o site inteiro.** O zip precisa levar SEMPRE as 10 páginas +
  `img/` + `_redirects`, com os arquivos na RAIZ (nada de pasta-invólucro).
- Preços e regras vêm do `SYSTEM_PROMPT` do `index.js` — a Ana é a fonte, não a página.
- Não reintroduza imagem em base64: as fotos ficam em `img/*.webp`.
- Quem publica é o Dr. Bruno, arrastando o zip no Cloudflare Pages.

Para gerar a entrega:

    cd site && zip -qr -X ../IOBB_site.zip . -x '.*' -x '__MACOSX*' -x 'LEIA-ME.md'

⚠️ **Este espelho já divergiu do ar duas vezes** (26/08/2026): tinha PMDF, que o site
publicado não tem, e lhe faltava um bloco inteiro de cartões de área na `/asa-norte` e
na `/aguas-claras`. Antes de gerar zip, **compare o texto visível de cada página contra
o ar** (o roteiro está no agente `site-landings`) — publicar este diretório sem conferir
apaga do site o que só existe lá.
