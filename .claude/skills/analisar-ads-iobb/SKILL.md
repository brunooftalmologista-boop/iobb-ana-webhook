---
name: analisar-ads-iobb
description: Analisa o desempenho do Google Ads do Instituto de Olhos Bruno Borges (IOBB) e propõe mudanças concretas para gerar mais agendamento. Use quando o Dr. Bruno colar uma tabela do Google Ads (palavras-chave, termos de pesquisa, relatório semanal), perguntar se vale manter/pausar/aumentar uma campanha, disser que uma campanha "não converte" ou "não tem procura", ou pedir para avaliar lances, orçamento e palavras negativas. Também para revisões periódicas de campanha.
---

Você analisa as campanhas do Google Ads do IOBB com um objetivo só: **mais paciente agendado**. Cliques, CTR e impressões só importam enquanto explicam isso.

O Dr. Bruno paga essas campanhas do próprio bolso e já disse, textualmente: *"não fica inventando o que não sabe, gasto dinheiro com isso, tem que ter responsabilidade"*. Portanto: **nunca apresente suposição como fato**. Diga de onde veio cada número — banco de dados, print que ele mandou, ou estimativa sua.

## Antes de qualquer conclusão: o relatório do Google pode estar mentindo

Foi o erro mais caro desta conta. Em 03/08/2026 o relatório semanal dizia **1 conversão** para R$ 1.247 investidos, e mandava "revisar palavras-chave e pausar termos" em cinco campanhas. Os dados reais eram **14 agendamentos** — o upload de conversões offline estava quebrado havia duas semanas.

Seguir aquele relatório teria pausado justamente o que funcionava.

**Sempre confira no banco antes de aceitar "0 conversões":**

```sql
select count(*) filter (where booked) agendados,
       count(*) filter (where booked and reported) enviados_ao_google,
       count(*) filter (where booked and not reported) pendentes,
       max(reported_at) ultimo_envio
from ad_clicks;
```

Se `pendentes` for alto ou `ultimo_envio` for antigo, o Google está otimizando com sinal errado e **nenhuma decisão de verba é confiável**. Conserte a medição primeiro. O comando `#ADSCONV TESTE` (WhatsApp, número admin) mostra o motivo exato da falha.

## Armadilhas de leitura que já produziram diagnóstico errado

1. **`booked` no ad_clicks ≠ agendamento real.** Em julho: 29 marcados, 5 com agendamento de verdade. A diferença vinha do botão "agendou" do painel, clicado quando a secretária marcava no iClinic. Sempre cruze com a tabela `appointments`.
2. **Linhas sem `gclid` não são clique de anúncio.** Em 23/07 apareceram 31 "cliques" na escleral — 28 sem identificador nenhum. Era tráfego de teste e rastreador da semana em que a página foi construída. Filtre por `gclid is not null`.
3. **Compare períodos iguais.** Já confundi 30 dias de banco com 2 dias de painel e chamei de contradição. Pergunte o período da tabela antes de comparar.
4. **Zero num dia não é sinal.** 10 cliques com 0 conversas é resultado normal — mesmo na melhor taxa da conta o esperado seria 1. Só o número do mês diz algo.
5. **`source` no ad_clicks vem da PÁGINA, não da campanha.** Duas campanhas apontando para a mesma landing aparecem juntas.

## Números de referência desta conta (julho/2026)

Use como régua. Se um número novo destoar muito, desconfie da medição antes da campanha.

| Campanha | Cliques | Viraram conversa | Agendaram |
|---|---|---|---|
| Águas Claras | 364 | 35 (**9,6%**) | **19** |
| Asa Norte | 260 | 10 (3,8%) | 1 |
| Escleral | 142 | 5 (3,5%) | 0 |
| Ceratocone | 114 | 2 (1,8%) | 1 |
| Refrativa | 62 | 3 (4,8%) | 1 |

**Águas Claras é a régua**: mesma clínica, mesma Ana, mesma mensagem pronta. Se outra campanha converte muito abaixo disso, a diferença está na intenção da busca ou no volume — não na Ana.

**Contexto que muda prioridades:** só **9% das conversas da Ana vêm de anúncio** (61 de 683 em julho). As taxas de agendamento são quase iguais entre anúncio (8,2%) e orgânico (9,0%). Ou seja: negativa de palavra-chave economiza dinheiro de mídia, mas **não** resolve o volume de conversas que não fecham — esse trabalho é de conversão, não de anúncio.

## Como diagnosticar uma campanha "que não converte"

Faça nesta ordem. Cada passo elimina uma causa.

**1. Tem impressão?** Se a soma der algumas dezenas, o mercado é pequeno e não há o que otimizar. Sinal claro: palavras marcadas **"Não qualificada — Baixo volume de pesquisas"**. Em escleral e ceratocone, TODAS as variações com "brasília"/"df" estavam assim.

**2. Tem clique?** CTR alto (15-40%) com poucas impressões = o anúncio é bom, falta gente pesquisando. Não mexa no anúncio; mexa no alcance ou aceite o tamanho do mercado.

**3. CTR baixo com muitas impressões** = posição ruim ou anúncio que não conversa com a busca. Compare o lance com o dos termos que performam no mesmo grupo.

**4. Clica e não escreve?** Aí sim é landing ou intenção. Compare com os 9,6% de Águas Claras.

**5. Escreve e não agenda?** É a Ana, não o anúncio. Leia as conversas.

## O vocabulário do paciente ≠ o do médico

Descoberta de 04/08 que vale para toda campanha nova: a campanha de ceratocone tinha **crosslinking, anel de Ferrara, anel intraestromal, cirurgia de ceratocone** — 19 impressões e **zero cliques**. Já **"especialista em ceratocone"** teve 40% de CTR e **"tratamento de ceratocone"** trouxe o maior volume.

Quem foi diagnosticado busca **quem trata**, não **qual técnica**. O nome do procedimento é o que o médico usa. Ao propor palavras-chave, escreva como o paciente escreveria.

## Quando negativa ajuda e quando não

**Ajuda** quando há volume de clique inútil: em julho foram 968 cliques para 61 conversas — mais de 900 cliques pagos que nunca escreveram. Aí cortar 30% vale R$ 300-400/mês.

**Não ajuda** quando a campanha tem 50 impressões. Não há tráfego ruim a cortar, e negativar reduz ainda mais o que já é quase nada. Foi o caso de escleral e ceratocone — cheguei a preparar 104 negativas e depois recomendei **não aplicar**.

Se for propor negativas, mire o informacional ("o que é", "sintomas", "tem cura"), estudo ("artigo", "cid", "tcc") e benefício ("aposentadoria", "inss"). **Nunca negative "concurso"** na conta toda: laudo para concurso é serviço que a clínica faz e está incluso na consulta.

## Orçamento × lance: não confunda

O relatório diz qual é o gargalo, e a correção é oposta em cada caso.

- **"Perdendo X% por ORÇAMENTO"** → a verba do dia acaba. Subir lance aqui é contraproducente: mesmo dinheiro, menos cliques.
- **"Perdendo X% por CLASSIFICAÇÃO"** → o lance ou o índice de qualidade perdem o leilão. Aí lance resolve.
- **"Abaixo do lance de primeira página"** → o termo não roda. Costuma faltar centavos.

Se o CPC médio estiver colado no lance máximo, o lance está prendendo.

## Formato da resposta

1. **O que os números dizem**, com tabela curta. Números antes de adjetivos.
2. **O diagnóstico**, dizendo qual dos cinco passos acima falhou.
3. **O que fazer**, em ordem de retorno, com valores concretos (lance de R$ X para R$ Y).
4. **O que você NÃO consegue ver** — você não tem acesso ao painel do Google Ads nem ao Perfil da Empresa (domínios do Google são bloqueados). Peça o print específico que resolveria a dúvida.
5. **O critério de decisão**, definido ANTES do próximo ciclo: "se em duas semanas continuar em N cliques, faça X".

Nunca recomende pausar ou aumentar verba sem antes confirmar que a medição está sã. E quando a amostra for pequena (3 cliques, 2 conversas), diga que é pequena em vez de tratar como tendência.
