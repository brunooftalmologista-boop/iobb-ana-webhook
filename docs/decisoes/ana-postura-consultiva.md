---
name: ana-postura-consultiva
description: "Perfil mais 'vendedor' da Ana nos 4 temas de maior valor (refrativa, ceratocone, lentes, catarata) — implementado como postura consultiva com limites do CFM"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4d16038e-588c-4855-9d79-075f25d2104c
  modified: 2026-07-29T01:13:52.471Z
---

Pedido do Dr. Bruno (2026-07-28): Ana com "perfil mais vendedor" e maior conversão em **refrativa, ceratocone, lente de contato e catarata**, mantendo educação e cordialidade. Implementado (commits `16d8b12`, `c013aa2`, `de7badb`) como **postura CONSULTIVA** — enquadramento deliberado: "vendedor" no sentido comum (sensacionalismo, promessa de resultado, urgência artificial) é vedado pelo CFM em publicidade médica e destruiria confiança; o que converte E é seguro é reduzir a incerteza do paciente.

**Seção "POSTURA CONSULTIVA" no SYSTEM_PROMPT (antes de "### Cirurgia de catarata"), 7+1 movimentos:** (1) abrir pelo BENEFÍCIO, não pelo procedimento; (2) espelhar a dor que o paciente MESMO citou (nunca inventar, nunca triagem clínica); (3) explicar o que a AVALIAÇÃO entrega — é o argumento central (responde se é candidato, qual conduta, quanto custa); (4) prova por FATOS (fellowship UFMG, CRM-DF 17877/RQE 9314, estrutura própria, o médico acompanha do pré ao pós) — nunca adjetivo; (5) preço com naturalidade + parcelamento, voltando ao passo real (avaliação R$200); (6) fechar SEMPRE com horário concreto; **(6b) oferecer o horário CEDO** — proibido questionário de 3-4 perguntas; propor horário da 1ª unidade da lista já na mensagem que explica, com a outra unidade oferecida na mesma frase; máximo UMA pergunta por mensagem; (7) objeção = só MAIS UMA tentativa, depois encerrar cordialmente.

**LIMITES ABSOLUTOS codificados:** nunca prometer resultado; nunca superlativo nem comparação com outros profissionais/clínicas; nunca urgência artificial ("últimas vagas", "promoção") — escassez só se for verdade sobre a agenda; nunca insistir após o 2º "não"; nunca diagnosticar; não inventar benefício.

**Bloco CONVERSÃO (catarata) — novo, era o único dos 4 sem um:** argumento mais forte = a cirurgia é COBERTA pela maioria dos convênios atendidos (muita gente adia achando inviável — dizer isso cedo destrava); lente como diferencial didático (monofocal coberta → premium opcional), sempre "a ideal é definida na avaliação"; tranquilizar em 1 linha (≈15 min/olho, colírio + sedação leve, Eye Laser Asa Sul). Os blocos já existentes de refrativa e ceratocone/lentes foram religados a essa postura.

**Resultado medido (paciente sintético, 3 rodadas de teste):** ✅ abre pelo benefício; ✅ espelha a dor ("Entendo que o desconforto com a lente pode ser bastante incômodo"); ✅ catarata abre com "Boa notícia: o TJDFT está entre os convênios… a cirurgia é coberta"; ✅ preço + parcelamento + volta à avaliação; ✅ questionário caiu de 4 perguntas para 1. ⚠️ **VARIÁVEL:** propor a HORA exata no primeiro contato ainda oscila — às vezes propõe dia+unidade ("nesta quarta, 29/07, no Conjunto Nacional"), às vezes ainda pergunta unidade/período. Estilo por prompt é probabilístico; 3 refinamentos sucessivos melhoraram muito mas não tornam determinístico. Se virar prioridade, o caminho determinístico é código (injetar 1 slot sugerido pronto no dynamicPrompt), não mais texto.

**Why:** os 4 temas são os de maior ticket e maior incerteza do paciente — é onde a conversa decide. Ver [[exames-inclusos-so-refrativa]] (só refrativa inclui exames: é diferencial de venda legítimo) e [[regras-atendimento-jul2026]].
