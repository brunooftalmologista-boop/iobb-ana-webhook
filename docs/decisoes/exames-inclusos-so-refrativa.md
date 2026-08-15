---
name: exames-inclusos-so-refrativa
description: "Regra de negócio: exames complementares só estão inclusos na consulta na avaliação de cirurgia REFRATIVA — em todos os demais fluxos são cobrados à parte"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-07-27T17:53:03.898Z
---

**REGRA (confirmada pelo Dr. Bruno em 2026-07-27, nas palavras dele: "a única opção que cobre o exame é na avaliação de refrativas, única!"):**
- **AVALIAÇÃO DE CIRURGIA REFRATIVA** → os R$ 200,00 JÁ INCLUEM os exames necessários, inclusive o **Pentacam**. Sem custo à parte. (Confirmado por ele antes, em 25/07, na decisão de conteúdo nº 1.)
- **TODOS OS DEMAIS FLUXOS** — consulta comum, **ceratocone**, **catarata**, adaptação de lente **escleral/rígida**, retorno, qualquer outro → a consulta cobre APENAS os exames da própria consulta. Complementares (Pentacam R$300 particular só no Conjunto Nacional, topografia, biometria, teste de lente R$120 gelatinosa / R$150 rígida-escleral) são solicitados pelo médico QUANDO NECESSÁRIOS e cobrados **À PARTE**.

**Como está implementado (commit `f75711f` e anteriores `493facd`/`067852a`, todos NO AR):** a regra virou **REGRA GLOBAL** no SYSTEM_PROMPT, logo após a tabela "Exames somente particular" — em vez de ficar implícita/por seção, que foi como o erro se espalhou. As seções de Ceratocone e Cirurgia de catarata têm reforços locais explícitos. Testado com paciente sintético nos 3 fluxos: escleral → "não estão incluídos"; catarata → "Não, os exames não estão inclusos"; refrativa → "já estão incluídos… sem custo adicional". ✅

**Why:** a Ana vinha generalizando a regra da refrativa e informando a pacientes de ceratocone/catarata que o Pentacam estava incluso — informação errada que gera atrito no caixa e quebra de confiança na recepção.

**Onde o mesmo erro apareceu no SITE (corrigido no zip `~/Downloads/IOBB_site_ATUAL.zip`, PENDENTE publicar):** eu havia escrito, no FAQ que criei em 26/07, três afirmações erradas — faixa do **ceratocone** ("Pentacam incluído na consulta de R$ 200"), resposta da **catarata** ("avaliação pré-operatória, que inclui os exames necessários") e resposta da **escleral** ("consulta de avaliação que inclui os exames de córnea"). Todas reescritas para "consulta R$ 200 + exame complementar, se necessário, com valor informado à parte". A da **refrativa** foi mantida (é a única correta). Varredura automatizada confirma: só refrativa promete inclusão.

**COMPLEMENTOS (2026-07-27, commits `67906a3` e `d8e0f88`, no ar e testados juntos numa só resposta):**
- **TESTE DE LENTE é cobrado À PARTE**, nunca incluído na consulta: rígida/escleral **R$ 150,00**, gelatinosa R$ 120,00 (só particular, só Conjunto Nacional). Quem vai adaptar lente escleral paga **consulta R$ 200 + teste R$ 150** (+ a lente, a partir de R$ 5.980 o par). A Ana informa os dois valores sem esperar o paciente perguntar.
- **APROVEITAMENTO DE EXAMES: exames que o paciente JÁ TEM, feitos há MENOS DE 3 MESES, podem ser aproveitados** — sem repetir e sem custo adicional. A Ana orienta LEVAR no dia (impresso ou no celular); acima de 3 meses geralmente repete (valor à parte). Trava: nunca prometer que o exame antigo será aceito — quem confirma é o médico na avaliação. (O prazo de 3 meses foi definido pelo Bruno; ele havia escrito "menos de meses" sem o número e eu perguntei em vez de deduzir.)
- Site: a landing de escleral passou a mostrar "consulta R$ 200 + teste de adaptação R$ 150" e a mencionar o aproveitamento de exames de até 3 meses (no zip pendente).

**How to apply:** ao mexer em preço/exames no prompt ou nas landings, checar esta regra ANTES — e rodar a varredura `grep -iE "inclui os exames|incluído na consulta|inclusos na consulta"` em todas as páginas; qualquer ocorrência fora de refrativa é bug. Ver também [[convenios-nomes-equivalencias]] (mesmo padrão: informação de negócio vem do Bruno, não de dedução minha, nem do site).
