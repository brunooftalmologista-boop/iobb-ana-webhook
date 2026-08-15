---
name: feedback-nao-inventar-ads
description: "Como o Bruno quer que eu trabalhe com Google Ads: separar fato de suposição, nunca vender chute como certeza (dinheiro real em jogo)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
---

O Bruno cobrou (2026-07-25), com razão, depois que eu afirmei "escleral é um grupo dentro da campanha de Ceratocone" como se fosse fato — quando era **inferência de um print** (que mostrava só o grupo, não a campanha). Ele: "não fica inventando o que não sabe, gasto dinheiro com isso, tem que ter responsabilidade."

**How to apply:**
- Em tudo que envolve Google Ads (campanhas, orçamentos, lances, estrutura de grupos, URLs finais), SEMPRE marcar a fonte de cada afirmação: **(a) visto no banco** (sólido — mas o banco só tem tráfego por tema em `ad_clicks.source`, NÃO a estrutura de campanhas), **(b) print do usuário**, ou **(c) anotação de sessão anterior** (retrato datado, pode estar desatualizado — verificar, não afirmar).
- NUNCA apresentar suposição como certeza. Se não sei, dizer "não sei / preciso de print" — não preencher a lacuna com chute plausível.
- Eu **não tenho acesso** ao painel do Google Ads (`ads.google.com` bloqueado por política) nem ao Cloudflare — logo, estrutura/orçamento/URL final de campanha eu SÓ sei via print do usuário. Pedir o print antes de orientar onde aplicar geo/negativas/lance.
- Mesmo padrão vale pro Cloudflare (já errei dizendo "Wix" por falso positivo). Verificar ao vivo quando der (iobb.com.br não é bloqueado, dá pra testar no Browser pane); afirmar só o que testei.

**Why:** são decisões que gastam dinheiro real da conta IOBB; um chute apresentado como fato leva o Bruno a agir errado. Confiança depende de eu ser rigoroso sobre o que é dado e o que é suposição. Relacionado a [[ads-performance-analise-jul2026]] e [[ads-iobb-domain-migration]].
