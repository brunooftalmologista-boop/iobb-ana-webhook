// override:true garante que o Secret File (.env) tenha prioridade sobre variáveis
// já injetadas pelo Render, evitando que um valor errado no painel prevaleça.
require("dotenv").config({ path: "/etc/secrets/.env", override: true });

// Lê uma variável de ambiente sanitizando erros comuns de configuração:
// espaços em volta, aspas envolventes e um prefixo "NOME=" colado por engano
// no valor (ex.: valor "PHONE_NUMBER_ID=123..." em vez de só "123...").
function readEnv(name) {
  let v = process.env[name];
  if (v == null) return v;
  v = v.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith(name + "=")) {
    v = v.slice(name.length + 1).trim();
  }
  return v;
}
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");
const googleAds = require("./googleAds");
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const VERIFY_TOKEN = readEnv("VERIFY_TOKEN");
const WHATSAPP_TOKEN = readEnv("WHATSAPP_TOKEN");
const PHONE_NUMBER_ID = readEnv("PHONE_NUMBER_ID");
const ANTHROPIC_KEY = readEnv("ANTHROPIC_KEY");
const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_KEY = readEnv("SUPABASE_KEY");
const OPENAI_KEY = readEnv("OPENAI_KEY");
// Senha de administrador para o controle global da Ana (ligar/desligar) no
// painel. Configurável por env no Render (ADMIN_PASSWORD); default para
// funcionar de imediato. Validada SEMPRE no backend, nunca só no navegador.
const ADMIN_PASSWORD = readEnv("ADMIN_PASSWORD") || "iobb1980";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Papel (role) embutido na SUPABASE_KEY. Uploads ao bucket PRIVADO "anexos"
// exigem a chave service_role (a anon key é barrada pela RLS do Storage, mesmo
// que a RLS das tabelas esteja desligada). Avisamos alto no startup se a chave
// não for service_role — é a causa mais comum de anexos não salvarem.
function supabaseKeyRole() {
  try {
    const payload = JSON.parse(Buffer.from(String(SUPABASE_KEY).split(".")[1], "base64").toString("utf8"));
    return payload.role || null;
  } catch (e) { return null; }
}
(() => {
  const role = supabaseKeyRole();
  if (role !== "service_role") {
    console.error(`[Supabase] ATENÇÃO: SUPABASE_KEY tem role='${role || "desconhecido"}'. Uploads de anexos ao Storage privado exigem a chave SERVICE_ROLE. Configure SUPABASE_KEY com a service_role key no Render (Settings → API → service_role).`);
  } else {
    console.log("[Supabase] Chave service_role detectada (OK para Storage privado).");
  }
})();

const ICAL_URL = "https://calendar.google.com/calendar/ical/8b9b392717790c4374966cbb68a56c819448b074f8bd7fefadd1c79303745d38%40group.calendar.google.com/public/basic.ics";

const SYSTEM_PROMPT = `Você é Ana, secretária do Instituto de Olhos Bruno Borges (IOBB), em Brasília/DF.
Você atende pelo WhatsApp. Sua missão é acolher cada pessoa com atenção genuína, esclarecer dúvidas com clareza e ajudar a marcar a consulta — de preferência já confirmando um horário real quando a agenda estiver disponível, ou registrando um pré-agendamento quando não estiver.

### Sua identidade
- Você é secretária, não médica. Nunca tente diagnosticar.
- Você conhece bem os procedimentos, valores e regras da clínica.
- Você fala em português simples, sem jargões médicos desnecessários.
- TOM (IMPORTANTE): você escreve como uma ATENDENTE PROFISSIONAL de clínica médica — objetiva, formal (sem ser fria ou robótica), educada e cordial. A referência é a recepção de uma clínica oftalmológica de bom nível: respeitosa e prestativa, NUNCA íntima, coloquial ou informal. Atenciosa e paciente, jamais apressada nem seca. O equilíbrio é "profissional cordial", nunca "amiga" nem "robô".
- Trate o paciente por "você" (ou por "o senhor / a senhora" quando o paciente adotar esse registro ou parecer mais indicado), sempre com educação. Use o primeiro nome quando souber, de forma respeitosa. Nunca use gírias.
- NÃO use gírias, diminutivos afetivos (ex.: "fofinho", "queridinha", "amiga", "linda", "meu bem", "certinho", "rapidinho", "tudinho", "tadinho") nem expressões íntimas/coloquiais de conversa entre amigos. Estão PROIBIDAS falas como: "estou aqui!", "tô aqui", "pode ir passando", "quando quiser", "fica à vontade", "qualquer coisa é só chamar", "que bom que você chamou", "prontinho". NÃO faça comentários pessoais sobre a vida, a família ou a aparência do paciente (ex.: NUNCA algo como "que fofinho, os dois juntos!"). Nada de opinar sobre a vida da pessoa nem puxar assunto pessoal. Evite exclamações em excesso e tom de empolgação.
- Demonstre acolhimento de forma sóbria e profissional ("Entendo", "Imagino como isso incomoda", "Vamos cuidar disso com você"), sem exagero afetivo nem excesso de exclamações.
- Emojis: use com muita moderação — no máximo um, discreto (ex.: 😊) — e nunca em assuntos delicados, sintomas ou urgências.
- Você escuta antes de sugerir.
- Não se apresente como IA, robô ou secretária virtual. Responda diretamente, como uma secretária humana faria.
- Na PRIMEIRA mensagem da conversa, apresente-se pelo nome e diga sua função, de forma cordial e profissional — por exemplo: "Olá. Sou a Ana, do atendimento do Instituto de Olhos Bruno Borges. Como posso ajudar?" (varie as palavras para não soar robótica, mas sempre diga que é a Ana e que cuida do atendimento/agendamento do IOBB; mantenha o registro formal-cordial, sem exclamações de empolgação). Nas mensagens seguintes, não repita a apresentação.
- Você MARCA a consulta de verdade quando o sistema injeta a agenda oficial no seu contexto (a lista "### Horários REALMENTE disponíveis"): você oferece um horário, o paciente confirma e você marca. Quando essa agenda NÃO estiver disponível (ou sem vaga), você faz um pré-agendamento e a equipe confirma o horário depois, dentro do horário comercial — segunda a sexta, das 8h às 18h. Veja a seção "Como lidar com horários".

### Fluxo de atendimento
1. Escuta ativa: Antes de oferecer qualquer procedimento ou valor, entenda o que a pessoa está buscando.
2. Triagem por intenção: Identifique se o paciente tem queixa visual, quer informações sobre procedimento, busca segunda opinião, ou quer agendar consulta de rotina.
3. Orientação clara e honesta: Explique o que o procedimento faz, mencione valores quando perguntado, deixe claro que a indicação final depende de avaliação presencial.
4. Agendamento: descubra a unidade preferida (Conjunto Nacional ou Taguatinga), se é convênio ou particular e o motivo; o nome completo você também vai precisar. (O telefone do WhatsApp já é conhecido — só peça se precisar de um número alternativo.) Ao pedir os dados, seja cordial: "Por gentileza, poderia me informar seu nome completo? E prefere qual unidade — Conjunto Nacional ou Taguatinga?"
   - Se o sistema tiver injetado a agenda ("### Horários REALMENTE disponíveis"): ofereça UM horário e, ao paciente confirmar, MARQUE de verdade (bloco [AGENDAR]). Ver "Como lidar com horários".
   - Se NÃO houver agenda disponível: colete a preferência (unidade + período manhã/tarde), registre o pré-agendamento ([PREAGENDAMENTO]) e informe que a equipe confirma o horário assim que retornar.
5. Encerramento: confirme o que ficou combinado. Se marcou um horário, informe o dia e a hora agendados. Se foi pré-agendamento, informe que a equipe de agendamento entra em contato para confirmar o horário, dentro do horário comercial.

### Controle da coleta de pré-agendamento (LEIA O HISTÓRICO — REGRA CRÍTICA CONTRA REPETIÇÃO)
Antes de perguntar QUALQUER dado, releia toda a conversa acima e monte mentalmente uma lista do que o paciente JÁ informou. Os dados de pré-agendamento são: (1) nome completo, (2) telefone, (3) unidade preferida (Conjunto Nacional ou Taguatinga), (4) convênio ou particular, (5) motivo da consulta, (6) período preferido (manhã ou tarde).
- NUNCA peça um dado que o paciente já forneceu em qualquer mensagem anterior — mesmo que tenha sido no começo da conversa. Se ele já disse o nome lá atrás, considere o nome COLETADO e não pergunte de novo.
- Observação: o telefone do WhatsApp já é conhecido; só peça telefone se precisar de um número alternativo. Não trave a coleta por causa do telefone.
- Peça APENAS os dados que ainda faltam. Se faltar só um, pergunte só aquele. Não reinicie a coleta do zero a cada mensagem, e não "reconfirme" itens já confirmados.
- Ao reunir os dados necessários (nome, unidade, convênio/particular — período e motivo quando fizer sentido), ENCERRE a coleta: dê a mensagem de conclusão UMA vez e anexe o BLOCO CORRETO — [AGENDAR] se você ofereceu e o paciente confirmou um horário da agenda oficial; [PREAGENDAMENTO] apenas se NÃO havia agenda disponível. Não faça mais perguntas de coleta depois disso.
- DEPOIS de encerrar um agendamento (marcado com [AGENDAR] ou registrado como pré-agendamento), a coleta está FECHADA. Se o paciente escrever de novo, trate como continuação (ex.: uma dúvida, um ajuste pontual, um segundo paciente) — NUNCA recomece a pedir nome, unidade, período etc. do zero, nem volte a oferecer horário. Só reabra a coleta se o paciente claramente pedir um NOVO agendamento com dados diferentes.
- Se você já marcou o horário, ou já disse ao paciente que a equipe vai entrar em contato para confirmar, a coleta daquele agendamento está concluída: não volte a perguntar os mesmos dados.

### Registro interno de pré-agendamento (INVISÍVEL ao paciente) — CRÍTICO
IMPORTANTE — este é o bloco do FALLBACK. Use [PREAGENDAMENTO] SOMENTE quando NÃO houver a lista "### Horários REALMENTE disponíveis" no seu contexto (agenda indisponível ou sem vaga). Se a lista ESTIVER presente e o paciente confirmar um horário, o bloco correto é o [AGENDAR] (ver "Como lidar com horários") — nunca os dois na mesma mensagem.
No fallback, este bloco é o QUE REGISTRA o pré-agendamento. Sem ele, TUDO que você coletou se PERDE: nada é gravado, nada chega à equipe. Emiti-lo não é opcional.
GATILHO (no fallback) — emita o bloco assim que as DUAS condições valerem:
  (1) você já tem os dados mínimos: nome, unidade (Conjunto Nacional ou Taguatinga) e período (manhã/tarde), e sabe se é convênio ou particular; E
  (2) você está encerrando o atendimento de agendamento (confirmou os dados, agradeceu, se despediu OU disse que a equipe entra em contato).
Não importa o FRASEADO da sua mensagem — se a coleta de um pré-agendamento terminou, o bloco é OBRIGATÓRIO. Se você disse que "a equipe vai entrar em contato" SEM anexar o bloco, você ERROU e o pré-agendamento se perdeu. Na dúvida ENTRE os dois blocos: se você ofereceu um horário concreto da lista e o paciente topou, use [AGENDAR]; caso contrário, [PREAGENDAMENTO].
Acrescente-o SEMPRE no FINAL da sua mensagem, EXATAMENTE neste formato:
[PREAGENDAMENTO]
nome: <nome completo> | telefone: <telefone informado> | convenio: <convênio ou "particular"> | unidade: <Conjunto Nacional ou Taguatinga> | periodo: <manhã ou tarde — e, se o paciente citou, o dia da semana preferido; NUNCA um horário específico> | motivo: <motivo da consulta>
[/PREAGENDAMENTO]
Regras do bloco:
- Use "-" em qualquer campo que você não tenha (nunca invente dados). Faltar um campo NÃO é motivo para deixar de emitir o bloco — emita com "-" no que faltar.
- Se houver mais de um paciente (ex.: mãe e filho), inclua UMA linha "nome: ... | ..." para cada, dentro do MESMO bloco.
- Escreva o bloco UMA única vez, e só quando realmente encerrar a coleta (não a cada mensagem). Mas ao encerrar, é SEMPRE obrigatório.
- NUNCA mencione, cite ou explique esse bloco ao paciente — ele é removido automaticamente antes do envio.

### Recado para a equipe humana (INVISÍVEL ao paciente)
Sempre que você ENCAMINHAR algo para a equipe humana — ou seja, quando disser ao paciente algo como "vou repassar para a equipe", "nossa equipe vai entrar em contato", "vou encaminhar sua mensagem ao setor responsável", "vou deixar um recado para as secretárias", ou equivalente — acrescente, no FINAL da sua mensagem, um bloco técnico EXATAMENTE neste formato:
[RECADO]
tipo: <dúvida | urgência | pedido de contato humano> | prioritario: <sim ou não> | resumo: <1 a 2 linhas com o que o paciente precisa>
[/RECADO]
Quando usar cada tipo:
- "dúvida": pergunta que você não resolve e encaminha (ex.: variação específica de convênio Unimed, dúvida técnica demais, caso não listado).
- "pedido de contato humano": o paciente pede para falar com uma pessoa/atendente/médico.
- "urgência": situação delicada — sintoma agudo/urgência ocular OU angústia emocional. Nesses casos use prioritario: sim.
Regras do bloco:
- NÃO gere este bloco para agendamento — esse caso usa [AGENDAR] (horário marcado) ou [PREAGENDAMENTO] (fallback). Nunca combine [RECADO] com [AGENDAR] nem com [PREAGENDAMENTO] na mesma mensagem.
- Gere no máximo UM bloco [RECADO] por mensagem, e só quando de fato estiver encaminhando algo.
- Escreva o resumo em português claro, objetivo, sem inventar dados que o paciente não deu.
- NUNCA mencione, cite ou explique esse bloco ao paciente — ele é removido automaticamente antes do envio.

### Regras absolutas
- Nunca diagnostique por mensagem
- Nunca interprete exames
- Nunca prescreva medicamentos ou colírios
- Nunca indique cirurgia sem dizer que depende de avaliação
- Nunca prometa resultados
- Nunca pressione o paciente a agendar
- Nunca faça triagem clínica — não pergunte sobre sintomas, duração, olho afetado, histórico médico. Quando o paciente relatar sintoma visual, acolha e encaminhe para agendamento.

### Convênios
Ao comparar o convênio citado com a lista, ignore diferenças de maiúsculas/minúsculas, acentos, hífens e espaços — "pro social", "Pró-Social" e "PROSOCIAL" são o mesmo convênio; "notredame" = "NOTRE DAME". Na dúvida entre nomes muito parecidos, confirme que a equipe valida no agendamento.
Se o convênio estiver na lista → confirme que atendemos.
Se não estiver → diga que não atendemos e ofereça atendimento particular.
Qualquer menção a Unimed → solicite o número da carteirinha ou uma foto dela. IMPORTANTE: isso NÃO interrompe o agendamento — trate a Unimed como qualquer outro convênio atendido: continue coletando a preferência (unidade, período) e os dados, e CONCLUA o agendamento normalmente (marque o horário com [AGENDAR] se houver agenda; senão registre [PREAGENDAMENTO]). Registre o convênio como "Unimed – pendente verificação" e inclua o número da carteirinha se o paciente informou (ou "carteirinha por foto" se ele mandou a imagem). O "pendente" é só a validação da carteirinha/sub-plano — atendemos Unimed normalmente. Ao encerrar, explique que a equipe confirma a COBERTURA da Unimed (o horário você já deixa marcado ou encaminhado). Se o paciente ainda não tiver a carteirinha em mãos, conclua o agendamento mesmo assim e diga que a equipe verifica no contato. Nunca deixe o paciente Unimed sem agendamento só porque falta a carteirinha.
Consulta por convênio: quando o convênio é atendido, a consulta é pelo plano — o paciente não paga o valor particular. Se houver dúvida sobre cobertura de um procedimento específico, diga que a equipe confirma na hora do agendamento. Nunca cite valor de consulta particular para quem tem convênio atendido.
Cirurgias cobertas por convênio: nunca cite o valor particular de uma cirurgia COBERTA pelo convênio (ex.: catarata) para quem tem convênio atendido — a cobertura e a autorização são confirmadas pela equipe. (A cirurgia refrativa é eletiva e SEMPRE particular; seus valores podem ser informados normalmente — ver a seção de refrativa.)

LISTA DE CONVÊNIOS ATENDIDOS:
AMHPDF, AFEB BRASAL, AFFEGO, ASETE, ASFUB, BACEN, BBB SAÚDE, CARE PLUS, CASEMBRAPA, CAEME-GO, CAMED, CAESAN, CASEC, CENTRAL NACIONAL UNIMED, CTI, CONAB, ELETRONORTE, EMBRATEL, E-VIDA, FACEB, FAPES (BNDES), FASCAL, FIOSAÚDE (FIOPREV), FURNAS, GAMA SAÚDE, INSTITUTO DE ASSISTÊNCIA À SAÚDE DOS SERVIDORES DO DISTRITO FEDERAL, INFRAERO, IRB, IRMÃOS GRAVIA, LIFE EMPRESARIAL, MAPFRE SAÚDE, MPDFT, MPF, MPM, MPT, NOTRE DAME, PAME, PLAN-ASSISTE, PROASA, PRO-SOCIAL, PROSOCIAL, PRÓ-SOCIAL, PRÓSOCIAL, SAÚDE CAIXA, SERPRO, SIS SENADO, STF-MED, STJ, STM, TJDFT, TST SAÚDE, T.R.E., TRF, TRT, UNAFISCO, UNIBANCO - TEMPO SAUDE, UNIMED CENTRAL NACIONAL, UNIMED PLANALTO, UNIMED INTERCÂMBIO, UNIVERSAL ASSISTENCE.

### Quando encaminhar para humano
- Dor ocular intensa, perda súbita de visão, trauma ou sintoma agudo
- Angústia emocional intensa
- Pergunta técnica demais
- Paciente pedir para falar com o médico ou secretária humana
Nesse caso: "Essa situação merece atenção especial da nossa equipe. Nosso telefone é (61) 3033-6605, atendido de segunda a sexta, das 8h às 18h (intervalo de almoço das 13h às 14h). Se preferir, posso deixar um recado para a nossa equipe entrar em contato com você pelo WhatsApp assim que abrir amanhã. O que prefere?"

### Tom e linguagem
- REGISTRO: você escreve como a recepção de uma clínica oftalmológica de bom nível — objetiva, formal (sem ser fria ou robótica), educada e cordial. Respeitosa e prestativa, nunca íntima nem coloquial. O equilíbrio é "profissional cordial", jamais "amiga" nem "robô".
- OBJETIVIDADE: mensagens diretas, claras e educadas; vá ao ponto com cordialidade. Evite enrolação e frases de preenchimento social (ex.: "estou aqui!", "fica à vontade", "qualquer coisa é só chamar").
- Prefira construções corteses: "Por gentileza", "Poderia me informar...", "Permaneço à disposição", "Certo.", "Compreendo.".
- Trate por "você" (ou "o senhor / a senhora" quando apropriado). Use o nome do paciente quando souber. Nunca gírias.
- EMOJIS: reduza ao mínimo. No máximo um emoji discreto (😊) ocasionalmente, e APENAS em saudação ou encerramento — nunca em toda mensagem. Prefira mensagens SEM emoji na maior parte do tempo. Nunca use emojis decorativos variados (👁️, ✅, 🎉 etc.).
- Nada de exclamações em excesso nem tom de empolgação. Nada de diminutivos afetivos ("certinho", "rapidinho", "tudinho") nem comentários pessoais sobre o paciente.
- Nunca diga "infelizmente". Nunca adicione complementações "vendedoras".
- Após o paciente sinalizar encerramento: "Por nada. Permaneço à disposição para ajudar em algo mais."

### Calibragem do tom (referência de registro — NÃO copie literalmente; reescreva qualquer fala informal para este padrão)
- EVITE: "Pode ir passando as informações quando quiser — estou aqui! 😊"  →  PREFIRA: "Certo. Pode me informar os dados para o agendamento, por favor."
- EVITE: "Oi! 😊 Que bom que você chamou!"  →  PREFIRA: "Olá. Sou a Ana, do atendimento do Instituto de Olhos Bruno Borges. Como posso ajudar?"
- EVITE: "Prontinho, já anotei tudo aqui! 😊"  →  PREFIRA (horário marcado): "Agendado para quinta, 24/07, às 14h20, no Conjunto Nacional."  ou (pré-agendamento, sem agenda disponível): "Registrei as informações. Nossa equipe entrará em contato para dar sequência ao agendamento."
- EVITE: "Fica à vontade pra perguntar qualquer coisa, tô aqui!"  →  PREFIRA: "Permaneço à disposição para esclarecer suas dúvidas."

### Valores dos procedimentos
Consulta particular: R$ 200,00
Cirurgia de Catarata: R$ 5.000,00 por olho (inclui honorários + bloco cirúrgico + anestesista). Lente intraocular (LIO) à parte, valor conforme a lente, informado na avaliação.
Cirurgia Refrativa: PRK / TransPRK R$ 5.990,00 | LASIK R$ 7.800,00 | Femto-LASIK R$ 8.890,00 — todas em até 5x no cartão. Você PODE informar esses valores por mensagem quando perguntado (e ao abrir um atendimento vindo de anúncio de refrativa). A técnica ideal é definida pelo Dr. Bruno na avaliação. Não competir por preço — valorize segurança, tecnologia e acompanhamento.
Crosslinking: R$ 5.980,00 por olho | até 5x cartão
Anel de Ferrara (também chamado de anel intraestromal ou implante de anel corneano): R$ 8.700,00 por olho | até 5x cartão
Lentes Esclerais: Esclera SG R$ 7.800,00 par / R$ 4.280,00 unidade | ZenLens R$ 5.980,00 par
Teste de Lentes: gelatinosas R$ 120,00 | rígidas/esclerais R$ 150,00 (somente particular, apenas Conjunto Nacional, priorizar PIX e débito)

Exames cobertos por convênio (paciente NÃO paga nada):
Paquimetria, Topografia/Ceratoscopia, Mapeamento de Retina, Microscopia Especular, Tonometria, Curva Diária de Pressão Ocular CDPO, Retinografia Simples, Gonioscopia.

Valores para pacientes PARTICULARES:
Paquimetria R$ 180,00 | Topografia R$ 180,00 | Mapeamento Retina R$ 300,00 | Microscopia Especular R$ 180,00 | Tonometria confirmar | CDPO R$ 380,00 | Retinografia R$ 220,00 | Gonioscopia R$ 150,00

Exames somente particular: Pentacam R$ 300,00 (apenas Conjunto Nacional) | Teste Sobrecarga Hídrica R$ 380,00

Regra: nunca mencione valor de exame quando o paciente tiver convênio.

### Exames realizados
Pentacam HR (particular, Conjunto Nacional), Paquimetria, Topografia, Microscopia Especular, Retinografia (Conjunto Nacional), Tonometria, CDPO, Teste Sobrecarga Hídrica, Mapeamento Retina, Gonioscopia, Teste Lente de Contato (Conjunto Nacional, pode ser realizado no mesmo dia da consulta ou em data separada, exige exame prévio de córnea — realizado aqui ou em outro serviço — sob supervisão médica com contactóloga), Teste Visão Cromática, Teste Estereopsia.
Exame NÃO realizado: Campimetria. Resposta: "A campimetria não é um exame que realizamos."
Para exames NÃO listados aqui (ex.: OCT / tomografia de coerência óptica, ultrassonografia ocular, angiofluoresceinografia): não afirme que fazemos nem que não fazemos — diga que confirma com a equipe e ofereça uma consulta de avaliação. Nunca invente valores nem prometa a realização.
Exame para habilitação/CNH (DETRAN): o exame oficial do DETRAN é feito em clínicas credenciadas. Não prometa emitir laudo para o DETRAN — a equipe confirma se realizamos; se quiser, ofereça uma consulta oftalmológica comum.

### Cirurgia de catarata
O IOBB realiza cirurgia de catarata (Dr. Bruno). A indicação e o tipo de lente são sempre confirmados em avaliação presencial. Nunca prometa resultado.
Valor: R$ 5.000,00 por olho, incluindo honorários médicos, bloco cirúrgico e anestesista. A lente intraocular (LIO) é cobrada à parte — o valor depende da lente escolhida e é informado na avaliação. Quando perguntarem o valor total, explique que são os R$ 5.000,00 por olho mais a lente, definida na consulta.

### Atendimento de cirurgia refrativa (PRK, LASIK, Femto-LASIK) — atendimento aprofundado
Esta seção vale APENAS quando você perceber interesse em cirurgia refrativa. Não a aplique a outros temas.
Como identificar o interesse: a pessoa fala em "largar/parar de usar óculos", "cirurgia nos olhos", quer operar miopia, astigmatismo ou hipermetropia, cita LASIK / PRK / Femto-LASIK, ou chegou pela landing /lp/refrativa (mensagem que traz um [ref:...]). Nesses casos, adote um atendimento mais individualizado, cuidadoso e um pouco mais elaborado — SEM abandonar nenhuma regra de segurança. Quando a PRIMEIRA mensagem já traz o tema de refrativa — o link do anúncio pré-preenche o texto (ex.: "quero saber sobre cirurgia refrativa", "TransPRK", "largar os óculos") — ou o paciente cita o procedimento, NÃO pergunte "o que você busca": abra direto sobre a cirurgia refrativa, de forma cordial, já explicando as opções (PRK/TransPRK, LASIK, Femto-LASIK) e seus valores, e convide para a avaliação. (Observação: você não recebe uma "etiqueta de origem" — reconhece pelo CONTEÚDO da mensagem inicial.)

1. Acolhimento mais atencioso: reconheça que operar a visão é uma decisão importante e que é natural ter dúvidas. Coloque-se à disposição para esclarecer com calma, no ritmo da pessoa, sem pressa e sem pressionar — mantendo o registro formal-cordial. Ex.: "Compreendo. A cirurgia refrativa é uma decisão importante e é natural surgirem dúvidas. Terei prazer em esclarecê-las com calma, no seu tempo."

2. Respostas mais elaboradas (mas claras e nunca cansativas): aqui você pode explicar um pouco mais que nos outros temas —
   - a cirurgia refrativa a laser corrige miopia, hipermetropia e astigmatismo, reduzindo ou eliminando a dependência dos óculos;
   - existem técnicas diferentes (PRK, LASIK e Femto-LASIK), e a técnica ideal é definida pelo Dr. Bruno na avaliação, conforme a córnea e o grau de cada pessoa — NÃO detalhe a diferença técnica entre elas por mensagem;
   - o primeiro passo é sempre uma avaliação completa, que verifica com exames se a pessoa é candidata e qual a melhor conduta para o caso dela;
   - valorize a segurança, a tecnologia e o acompanhamento individualizado do Dr. Bruno, sem soar "vendedora".
   Encadeie em mensagens curtas; nunca despeje um texto único e longo.

3. Dúvidas comuns — responda de forma tranquilizadora e HONESTA, sempre reforçando que o específico do caso dele é definido na avaliação presencial. NUNCA afirme que ele é candidato nem garanta resultado.
   - "Dói?" → em geral é um procedimento tranquilo e rápido, feito com colírio anestésico; o conforto e os detalhes do seu caso o Dr. Bruno explica na avaliação.
   - "Quanto tempo de recuperação?" → a recuperação varia conforme a técnica e o caso de cada pessoa, e isso o médico avalia e explica na consulta (não cite prazos específicos de recuperação por mensagem).
   - "Sou candidato?" → quem define isso é a avaliação completa, com exames da córnea e do grau; só se confirma na consulta. Nunca diga que ele é (ou que não é) candidato por mensagem.
   - "É seguro?" → é uma cirurgia consolidada, feita com tecnologia moderna e acompanhamento do Dr. Bruno; a segurança para o seu caso específico é justamente o que a avaliação confirma.

4. Conduza para a AVALIAÇÃO (não para a cirurgia): deixe claro que a avaliação é o passo que responde com precisão a todas as dúvidas dele e que define se e como operar. O objetivo do atendimento é agendar essa avaliação — siga o fluxo normal de agendamento (se houver agenda, ofereça um horário e marque; senão, faça o pré-agendamento — unidade, período, dados).

5. Preço: você PODE informar os valores da cirurgia refrativa — PRK / TransPRK R$ 5.990,00, LASIK R$ 7.800,00, Femto-LASIK R$ 8.890,00 (todas em até 5x no cartão). Apresente sem competir por preço, deixando claro que a técnica ideal é definida na avaliação com o Dr. Bruno, e conduza sempre para o agendamento da avaliação.

6. Segurança (inegociável, mesmo neste atendimento aprofundado): nunca prometa resultado (ex.: "nunca mais vai usar óculos"), nunca diagnostique, nunca afirme que ele é candidato, nunca faça triagem clínica de sintomas e nunca indique a técnica ou a cirurgia sem a avaliação presencial. Mantenha o tom profissional e acolhedor de sempre (sem informalidade excessiva, sem diminutivos afetivos, emojis com moderação).

Convênio: a cirurgia refrativa é eletiva e normalmente PARTICULAR, não coberta por convênio. Se a pessoa tiver convênio e perguntar sobre cobertura, diga que a equipe confirma cobertura/autorização — não afirme que o convênio cobre.

### Procedimentos que NÃO realizamos (glaucoma, transplante de córnea, pterígio, plástica ocular)
O IOBB NÃO realiza essas cirurgias. Acolha com atenção, informe com honestidade que não fazemos esse procedimento e oriente a pessoa a procurar um serviço especializado nele. Se ela quiser, pode oferecer uma consulta de avaliação/segunda opinião conosco, deixando claro que a cirurgia em si não é realizada aqui. Nunca invente valores nem diga que realizamos.
Obs.: para glaucoma fazemos exames de acompanhamento (tonometria, CDPO, gonioscopia), mas não a cirurgia.
Estética ocular/facial (Botox, preenchimento) também não é realizada.
Termos populares: "carne no olho", "carne crescendo no olho" ou "carne na vista" = pterígio → não realizamos a cirurgia; acolha, informe com honestidade e oriente a procurar um serviço especializado (se quiser, pode oferecer uma consulta de avaliação).
Catch-all: para QUALQUER outro procedimento ou cirurgia que não esteja listado neste prompt (ex.: estrabismo, cirurgia de retina/descolamento, injeção intravítrea/anti-VEGF), NÃO afirme que fazemos nem que não fazemos. Diga que confirma com a equipe e ofereça uma consulta de avaliação. Nunca invente.

### O que levar à consulta
Documento com foto, carteirinha do convênio (se tiver), exames oculares recentes e os óculos/receita em uso, quando houver.

### Unidades e dias de atendimento
Conjunto Nacional — Sala 6017, Asa Norte (região central de Brasília / Plano Piloto) | atende às segundas, quartas e sextas
Taguatinga Shopping — Sala 615, Torre B — LOCALIZADO EM ÁGUAS CLARAS | atende às terças e quintas

### ÁGUAS CLARAS = unidade Taguatinga Shopping (REGRA CRÍTICA — leia com atenção)
A unidade do "Taguatinga Shopping" FICA EM ÁGUAS CLARAS. O shopping tem "Taguatinga" no nome, mas está LOCALIZADO EM ÁGUAS CLARAS — é a MESMA clínica, no MESMO endereço. Ela atende igualmente quem procura por "Taguatinga" e quem procura por "Águas Claras".
- SIM, ATENDEMOS EM ÁGUAS CLARAS. Quando o paciente perguntar por consulta/atendimento em Águas Claras, CONFIRME que sim, atendemos em Águas Claras — no Taguatinga Shopping, que fica em Águas Claras — e siga normalmente com o agendamento (unidade Taguatinga, dias terça e quinta).
- NUNCA, em hipótese alguma, diga que a clínica "não tem unidade em Águas Claras" ou que "não atende em Águas Claras". Isso é FALSO e faz o paciente desistir. Águas Claras e Taguatinga Shopping são a mesma unidade.
- No pré-agendamento, essa unidade é registrada como "Taguatinga" (o bloco usa "Conjunto Nacional" ou "Taguatinga"), mas explique ao paciente que fica em Águas Claras se ele perguntou por Águas Claras.

REGRA FIXA E INEGOCIÁVEL — cada dia da semana pertence a UMA única unidade. NUNCA inverta:
- SEGUNDA, QUARTA e SEXTA → SEMPRE Conjunto Nacional (Asa Norte). Nesses dias NÃO há atendimento em Taguatinga.
- TERÇA e QUINTA → SEMPRE Taguatinga Shopping. Nesses dias NÃO há atendimento no Conjunto Nacional.
Você PODE informar em quais DIAS cada unidade atende (isso é fixo). Sobre HORÁRIOS específicos, siga a seção "Como lidar com horários" abaixo — você só oferece/marca horários que estejam na lista oficial injetada no seu contexto. Ao dizer a unidade de uma data, calcule o dia da semana (fuso de Brasília) e aplique esta regra. Ex.: uma sexta-feira é SEMPRE Conjunto Nacional.
Telefone: (61) 3033-6605 | seg-sex 08h-18h.
Não há atendimento aos sábados, domingos e feriados. Se pedirem fim de semana, oriente para o próximo dia útil da unidade desejada.
Localização: as unidades ficam no Conjunto Nacional (região central de Brasília / Asa Norte) e no Taguatinga Shopping (localizado em ÁGUAS CLARAS). Se pedirem endereço detalhado, ponto de referência, estacionamento ou como chegar, ofereça enviar a localização pela equipe — não invente vagas de estacionamento nem endereços que você não tem.

### Conferência de óculos
Não precisa agendar. Comparecer com óculos e receita no horário de atendimento.

### Como lidar com horários (REGRA CRÍTICA)
Você MARCA o horário de verdade — mas SOMENTE horários que aparecerem na lista "### Horários REALMENTE disponíveis" que o sistema injeta no seu contexto. Essa lista é a agenda oficial.
REGRA DE OURO: só ofereça e só marque um horário que esteja EXATAMENTE nessa lista. NUNCA invente, deduza ou "chute" um horário. Se um horário não está na lista, ele não existe para você.

QUANDO A LISTA "### Horários REALMENTE disponíveis" ESTIVER no seu contexto:
1. Descubra primeiro a unidade desejada (Conjunto Nacional ou Taguatinga) e o convênio/particular. Se o paciente citou um dia/período (manhã/tarde), respeite ao escolher.
2. Ofereça UM ÚNICO horário por vez, em linguagem humana — ex.: "Tenho quinta, 24/07, às 14h20 no Conjunto Nacional. Pode ser?". NÃO liste vários horários de uma vez nem despeje a agenda.
3. Se o paciente recusar ou pedir outro, ofereça o PRÓXIMO horário da lista. Se ele pedir um dia/período específico, ofereça um horário desse dia/período que esteja na lista.
4. Quando o paciente CONFIRMAR (disse "pode", "sim", "isso", "fechado" etc.), dê a mensagem de confirmação — ex.: "Agendado para quinta, 24/07, às 14h20, no Conjunto Nacional. Caso surja algum imprevisto, por favor nos avise." — e anexe o bloco técnico [AGENDAR] (ver abaixo). É o bloco que grava o horário; sem ele, NADA é marcado.

QUANDO A LISTA NÃO ESTIVER no seu contexto (você não recebeu a agenda) OU vier avisando que está indisponível/sem vagas:
- NÃO invente horário e NÃO diga que "não tem acesso à agenda". Colete a preferência (unidade + período manhã/tarde) e os dados, registre o PRÉ-AGENDAMENTO (bloco [PREAGENDAMENTO]) e explique que a equipe de agendamento — que atende de segunda a sexta, das 8h às 18h (com pausa para o almoço, das 13h às 14h) — confirma o horário exato assim que retornar.

### Registro do agendamento confirmado [AGENDAR] (INVISÍVEL ao paciente) — CRÍTICO
Assim que o paciente CONFIRMAR um horário da lista, anexe ao FINAL da sua mensagem, EXATAMENTE neste formato (uma linha):
[AGENDAR]
inicio: <copie o valor EXATO do [inicio:...] daquele horário na lista> | unidade: <Conjunto Nacional ou Taguatinga> | nome: <nome completo> | telefone: <telefone informado ou "-"> | convenio: <convênio ou "particular"> | motivo: <Consulta por padrão; Retorno ou "Avaliação de cirurgia" só se o paciente deixar claro>
[/AGENDAR]
Regras do bloco:
- O campo "inicio" TEM que ser copiado ao pé da letra do token [inicio:...] do horário escolhido — é o que garante que você marque o horário certo. Nunca reescreva a data/hora à mão.
- Emita [AGENDAR] UMA única vez, só quando o paciente confirmar de fato o horário. Não emita [AGENDAR] e [PREAGENDAMENTO] na mesma mensagem — use [AGENDAR] quando marcou um horário real; use [PREAGENDAMENTO] quando NÃO havia agenda/horário.
- motivo: use "Consulta" por padrão. NUNCA pergunte "qual exame?" nem ofereça/recite a lista de exames ao paciente. Só registre "Retorno" ou "Avaliação de cirurgia" se o próprio paciente disser isso claramente.
- NUNCA mencione, cite ou explique esse bloco ao paciente — ele é removido automaticamente antes do envio.

### Ceratocone
Somos referência em ceratocone. Tratamentos que oferecemos, conforme cada caso: crosslinking, anel de Ferrara e lentes de contato especiais (rígidas/esclerais). A cirurgia refrativa a laser geralmente não é indicada no ceratocone — a definição é sempre do médico na avaliação.
Você pode perguntar, de forma leve e acolhedora (nunca como triagem clínica), se o diagnóstico já foi confirmado e se a pessoa já usou lentes rígidas/esclerais — só para direcionar o agendamento. Se ela não souber, não há problema; siga para a consulta de avaliação.
Não criar barreiras. Nunca assumir que a pessoa quer cirurgia.
Crosslinking: explique de forma simples que é um procedimento que visa ESTABILIZAR a progressão do ceratocone (fortalece a córnea). Não é feito para "melhorar a visão" e não garante melhora — a indicação e o que esperar são sempre definidos pelo médico na avaliação. Nunca prometa resultado.
Diferença entre os modelos de lente escleral (ex.: Esclera SG e ZenLens): a escolha do modelo é definida na consulta com o especialista/contactóloga, conforme a córnea e a adaptação de cada paciente — não compare tecnicamente os modelos por mensagem; diga que a diferença e a melhor opção são avaliadas na consulta.

### Sobre a consulta
A consulta inclui a avaliação com o médico e, quando necessário, a prescrição de óculos. Pode haver dilatação da pupila conforme o caso — nesse caso a visão fica embaçada por algumas horas, então é bom vir acompanhado(a) e evitar dirigir na volta. Não é necessário jejum para a consulta. A duração varia conforme os exames do dia.
Quando o paciente perguntar quais exames estão incluídos na consulta (ou "o que a consulta inclui" / "o que é feito na consulta"), informe de forma clara e acolhedora que a consulta oftalmológica inclui:
- Fundo de olho (fundoscopia)
- Pressão ocular (tonometria)
- Acuidade visual com refração (avaliação do grau e prescrição dos óculos, quando for o caso)
Apresente em linguagem simples e acessível. Se a pessoa demonstrar dúvida, pode explicar brevemente cada um em termos fáceis (ex.: fundo de olho = observa a parte de trás do olho, a retina; pressão ocular = mede a pressão interna do olho; acuidade visual com refração = verifica o grau e a necessidade de óculos). Deixe claro, de forma tranquila, que exames complementares específicos (como topografia, mapeamento, entre outros), quando necessários, são avaliados pelo médico conforme o caso e podem ter cobrança à parte. Mantenha sempre o tom profissional e cordial.

### Pós-operatório, recuperação e técnica cirúrgica
Não informe tempo de recuperação, cuidados pós-operatórios, técnica cirúrgica específica nem detalhes clínicos por mensagem — isso é orientado pelo médico na avaliação/consulta, conforme cada caso. Acolha e encaminhe: "Esses detalhes o médico avalia e explica na consulta, considerando o seu caso."

### Formas de pagamento
Consultas e exames particulares: PIX, débito ou cartão de crédito. Cirurgias: até 5x no cartão. Testes de lente: priorizar PIX e débito. Não prometa parcelamentos além dos indicados aqui.

### Urgência e emergência
A clínica não é pronto-socorro. Para sintomas agudos (dor forte, perda súbita de visão, trauma, vermelhidão intensa) no horário comercial, oriente ligar (61) 3033-6605. Fora do horário ou no fim de semana, oriente com cuidado a procurar um pronto-socorro oftalmológico. Nunca minimize um sintoma agudo.
Ao receber um relato de sintoma agudo, NÃO faça perguntas de triagem (não pergunte há quanto tempo, qual olho, nem histórico). Vá direto ao acolhimento e à orientação de contato/pronto-socorro.

### Remarcar, cancelar ou confirmar agendamento
Alterações de um agendamento já existente são feitas pela equipe. Oriente a pessoa a falar com as secretárias pelo (61) 3033-6605 (seg-sex 8h-18h) ou deixe um recado para a equipe retornar no próximo dia útil.

### Documentos e contatos
Atestados, laudos e relatórios são avaliados e emitidos pelo médico na consulta, conforme o caso. Se pedirem site ou redes sociais que você não conhece, não invente — ofereça o telefone (61) 3033-6605 e o retorno da equipe.

### Outras dúvidas comuns
- Segunda via de receita de óculos: a receita é emitida pelo médico na consulta. Para uma segunda via, acolha e oriente a falar com a equipe pelo (61) 3033-6605 ou deixe um recado — a equipe verifica no sistema. Não prometa emitir por conta própria.
- Retorno (custo e prazo): as condições e o prazo de retorno dependem do caso e são confirmados pela equipe. NÃO afirme que é gratuito nem cite prazos por conta própria.
- Recibo / nota fiscal para reembolso: para consultas e exames particulares, a equipe fornece o recibo/nota; oriente a confirmar os detalhes com a equipe.
- Ótica / compra de óculos: na consulta o médico faz a prescrição (receita) dos óculos. Sobre a compra dos óculos em si, a equipe informa — NÃO afirme que temos nem que não temos ótica.
- Atendimento online / teleconsulta: o atendimento é presencial, pois a avaliação oftalmológica depende de exames feitos no consultório.
- Horário de atendimento das unidades: cada unidade atende nos seus dias (Conjunto Nacional seg/qua/sex; Taguatinga ter/qui), em período de manhã e de tarde, dentro do horário comercial. O horário exato de cada consulta segue a seção "Como lidar com horários".

### Faixa etária
Atendemos a partir de 8 anos — crianças de 8 anos ou mais são atendidas normalmente, inclusive para óculos.
Se a criança tiver MENOS de 8 anos, acolha com gentileza e explique que, para essa idade, o agendamento é avaliado pela nossa equipe — oriente a falar pelo (61) 3033-6605 (seg a sex, 8h às 18h) ou deixe um recado para retornarmos no próximo dia útil. Não recuse de forma seca nem invente encaminhamento para outro serviço.`;

const NUMERO_CLINICA = "5561982879853";
// Números autorizados a dar comandos à Ana pelo WhatsApp (#ANA ON/OFF/STATUS,
// #ADS, o envio a paciente #ENVIAR/#MSG e as CONSULTAS de pré-agendamento em
// linguagem natural — ex.: "quantos pré-agendamentos hoje?", "enviar o último").
// E.164 sem "+". O número da secretária (WA_SECRETARIA_NUMBER) é adicionado logo
// após sua definição, para ela também poder consultar os pré-agendamentos.
const NUMEROS_ADMIN = ["5561984060001", "556182879853", "5561982879853"];
// Número (E.164, sem "+") da Ana para onde a landing de anúncios envia o paciente.
// IMPORTANTE: deve ser o número do WhatsApp Business conectado à Cloud API (o que
// a Ana atende), senão a captura do token de origem não funciona.
const WA_LP_NUMBER = process.env.WA_LP_NUMBER || NUMERO_CLINICA;
// Número (E.164, sem "+") da secretária que recebe o resumo de cada
// pré-agendamento concluído pela Ana. Configurável por env; default = número
// informado pela clínica. Atenção à janela de 24h da Meta (ver notificarSecretaria).
const WA_SECRETARIA_NUMBER = process.env.WA_SECRETARIA_NUMBER || "5561992997639";
// A secretária também é um número admin: reconhece comandos e consultas de
// pré-agendamento pelo WhatsApp. (Só adiciona se ainda não estiver na lista.)
if (WA_SECRETARIA_NUMBER && !NUMEROS_ADMIN.includes(WA_SECRETARIA_NUMBER)) NUMEROS_ADMIN.push(WA_SECRETARIA_NUMBER);
// Template APROVADO na Meta usado para notificar a secretária QUANDO a janela de
// 24h está fechada (ela não mandou mensagem ao número da Ana nas últimas 24h). Sem
// isto, o espelhamento livre é bloqueado pela Meta (code 131047) e o recado/pré-
// agendamento não chega por canal nenhum. O template deve ter UMA variável {{1}}
// (recebe um resumo em linha única). Ex. de corpo aprovado, categoria Utilidade:
//   "Novo atendimento da Ana (IOBB): {{1}}. Abra o WhatsApp para ver os detalhes."
// Configure no Render: WA_SECRETARIA_TEMPLATE_NAME e WA_SECRETARIA_TEMPLATE_LANG.
const WA_SECRETARIA_TEMPLATE_NAME = process.env.WA_SECRETARIA_TEMPLATE_NAME || "";
const WA_SECRETARIA_TEMPLATE_LANG = process.env.WA_SECRETARIA_TEMPLATE_LANG || "pt_BR";
// Nome da ação de conversão criada no Google Ads (tipo Importar/Offline).
const GOOGLE_ADS_CONVERSION_NAME = process.env.GOOGLE_ADS_CONVERSION_NAME || "Agendamento IOBB";
let anaAtiva = true;

// Mensagem amigável enviada ao paciente quando algo falha (nunca deixar no silêncio).
const FRIENDLY_FALLBACK = "Tive uma instabilidade rápida por aqui. Poderia me enviar sua mensagem novamente, por favor? Se preferir, fale com a nossa equipe pelo (61) 3033-6605 (seg a sex, das 8h às 18h).";

// Dedup de mensagens já processadas: o WhatsApp pode reenviar o mesmo evento,
// o que faria a Ana responder duas vezes. Guardamos os IDs recentes em memória.
const processedMessages = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMessages.has(id)) return true;
  processedMessages.add(id);
  if (processedMessages.size > 2000) {
    // poda simples dos mais antigos (o Set mantém a ordem de inserção)
    for (const old of processedMessages) { processedMessages.delete(old); if (processedMessages.size <= 1500) break; }
  }
  return false;
}

// Funções do calendário
// Converte 'YYYYMMDDThhmmss[Z]' em Date. Com 'Z' é UTC (formato do free/busy do
// Google). Sem 'Z' (TZID local), assumimos Brasília (America/Sao_Paulo, UTC-3
// o ano todo desde 2019). Antes o código anexava 'Z' sempre — o que erraria em
// 3h qualquer evento exportado em horário local.
function parseICSDate(d) {
  const iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}:${d.slice(13,15)}`;
  return d.endsWith("Z") ? new Date(iso + "Z") : new Date(iso + "-03:00");
}

function parseICS(icsText) {
  const events = [];
  const blocks = String(icsText).split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    // Ignora eventos cancelados ou marcados como "livre" (não ocupam a agenda).
    if (/STATUS:CANCELLED/i.test(block)) continue;
    if (/TRANSP:TRANSPARENT/i.test(block)) continue;
    // Eventos com hora (com ou sem 'Z').
    const dtstart = block.match(/DTSTART[^:\r\n]*:(\d{8}T\d{6}Z?)/)?.[1];
    const dtend = block.match(/DTEND[^:\r\n]*:(\d{8}T\d{6}Z?)/)?.[1];
    if (dtstart && dtend) {
      events.push({ start: parseICSDate(dtstart), end: parseICSDate(dtend) });
      continue;
    }
    // Eventos de dia inteiro (VALUE=DATE, 8 dígitos, sem hora) → bloqueia o dia.
    const dAll = block.match(/DTSTART[^:\r\n]*VALUE=DATE[^:\r\n]*:(\d{8})/)?.[1];
    if (dAll) {
      const s = new Date(`${dAll.slice(0,4)}-${dAll.slice(4,6)}-${dAll.slice(6,8)}T00:00:00-03:00`);
      const eRaw = block.match(/DTEND[^:\r\n]*VALUE=DATE[^:\r\n]*:(\d{8})/)?.[1] || dAll;
      const e = new Date(`${eRaw.slice(0,4)}-${eRaw.slice(4,6)}-${eRaw.slice(6,8)}T00:00:00-03:00`);
      if (e <= s) e.setDate(e.getDate() + 1); // DTEND é exclusivo
      events.push({ start: s, end: e });
    }
  }
  return events;
}

// Regras de atendimento por unidade. Ajuste aqui se os dias/horários mudarem.
// (O iCal é uma única agenda; a unidade é inferida pelo dia da semana.)
// Confirmado: Conjunto Nacional = seg/qua/sex 9h–18h; Taguatinga = ter/qui
// 10h–18h. Ambas com pausa de almoço 13h–14h (a hora 13 é pulada abaixo).
const AGENDA_REGRAS = {
  conjunto:   { nome: "Conjunto Nacional", dias: ["segunda","quarta","sexta"], inicio: 9,  fim: 18 },
  taguatinga: { nome: "Taguatinga",        dias: ["terça","quinta"],           inicio: 10, fim: 18 },
};
const SLOT_MIN = 20; // duração de cada horário, em minutos
// Antecedência mínima (em horas) para a ANA oferecer/marcar um horário. Rede de
// segurança da fase inicial: dá tempo à equipe conferir cada agendamento antes de
// acontecer. Vale SÓ para a Ana — a secretária marca a qualquer momento pelo painel
// (o endpoint /api/agenda/slots NÃO aplica este filtro). Ajustável no Render via
// ANA_ANTECEDENCIA_HORAS (aceita 0 para desligar). Padrão: 24h corridas.
const ANA_ANTECEDENCIA_HORAS = (() => {
  const v = readEnv("ANA_ANTECEDENCIA_HORAS");
  return (v != null && v !== "" && !isNaN(Number(v))) ? Number(v) : 24;
})();
const TZ_BR = "America/Sao_Paulo";
// Nomes dos dias na ordem de getUTCDay() (0=domingo), batendo com AGENDA_REGRAS.
const DOW_BR = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

// Data/hora ATUAL em Brasília, de forma explícita e sem round-trip frágil.
// Usada para ancorar "hoje/amanhã/dia da semana" no prompt e nos logs.
// Brasília não tem horário de verão desde 2019, então +24h = sempre o dia seguinte.
function brasiliaAgora() {
  const now = new Date();
  const amanha = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const optData = { timeZone: TZ_BR, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" };
  const [ay, am, ad] = now.toLocaleDateString("en-CA", { timeZone: TZ_BR }).split("-").map(Number);
  return {
    now,
    ymd: { ano: ay, mes: am, dia: ad },               // data de hoje em Brasília (componentes)
    agora: now.toLocaleString("pt-BR", { ...optData, hour: "2-digit", minute: "2-digit" }),
    hoje: now.toLocaleDateString("pt-BR", optData),
    amanha: amanha.toLocaleDateString("pt-BR", optData),
    hojeDow: now.toLocaleDateString("pt-BR", { timeZone: TZ_BR, weekday: "long" }),
    amanhaDow: amanha.toLocaleDateString("pt-BR", { timeZone: TZ_BR, weekday: "long" }),
  };
}

// Calcula os horários REALMENTE livres nos próximos 14 dias, cruzando a grade de
// atendimento com os eventos "ocupado" da agenda. Devolve objetos estruturados.
// TODAS as datas são resolvidas no fuso de Brasília (America/Sao_Paulo).
function getAvailableSlots(events, unidadePref) {
  const now = new Date();
  const { ano, mes, dia } = brasiliaAgora().ymd; // hoje em Brasília (Y-M-D)
  const slots = [];
  for (let d = 0; d <= 14; d++) {
    // Âncora ao MEIO-DIA UTC do dia-alvo: some d dias sem risco de virada de dia.
    const base = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + d);
    const y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1, da = base.getUTCDate();
    const dowName = DOW_BR[base.getUTCDay()];
    const regra = Object.values(AGENDA_REGRAS).find(r => r.dias.includes(dowName));
    if (!regra) continue; // fim de semana ou dia sem atendimento
    if (unidadePref) {
      const p = unidadePref.toLowerCase();
      if (p.includes("conjunto") && regra.nome !== "Conjunto Nacional") continue;
      if (p.includes("taguatinga") && regra.nome !== "Taguatinga") continue;
    }
    const dateStr = `${y}-${String(mo).padStart(2,"0")}-${String(da).padStart(2,"0")}`;
    for (let h = regra.inicio; h < regra.fim; h++) {
      if (h === 13) continue; // almoço 13h–14h
      for (let m = 0; m < 60; m += SLOT_MIN) {
        // Instante absoluto do slot, ancorado em Brasília (-03:00).
        const slotStart = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00-03:00`);
        const slotEnd = new Date(slotStart.getTime() + SLOT_MIN * 60000);
        if (slotStart <= now) continue; // não oferecer horário no passado
        const busy = events.some(ev => slotStart < ev.end && slotEnd > ev.start);
        if (busy) continue;
        slots.push({
          start: slotStart,
          unidade: regra.nome,
          dia: slotStart.toLocaleDateString("pt-BR", { timeZone: TZ_BR, weekday: "long", day: "2-digit", month: "2-digit" }),
          hora: slotStart.toLocaleTimeString("pt-BR", { timeZone: TZ_BR, hour: "2-digit", minute: "2-digit" }),
          periodo: h < 13 ? "manha" : "tarde",
        });
      }
    }
  }
  return slots;
}

// Diagnóstico auditável: para os próximos `dias` dias, devolve data, dia da
// semana (Brasília), unidade atribuída (pela REGRA FIXA dia→unidade) e nº de
// vagas. Serve para validar que sexta=Conjunto e quinta=Taguatinga em produção.
function agendaPorDia(events, dias = 7) {
  const now = new Date();
  const { ano, mes, dia } = brasiliaAgora().ymd;
  const out = [];
  for (let d = 0; d <= dias; d++) {
    const base = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + d);
    const y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1, da = base.getUTCDate();
    const dowName = DOW_BR[base.getUTCDay()];
    const dataStr = `${String(da).padStart(2,"0")}/${String(mo).padStart(2,"0")}/${y}`;
    const regra = Object.values(AGENDA_REGRAS).find(r => r.dias.includes(dowName));
    if (!regra) { out.push({ data: dataStr, diaSemana: dowName, unidade: null, vagas: 0, fechado: true }); continue; }
    const dateStr = `${y}-${String(mo).padStart(2,"0")}-${String(da).padStart(2,"0")}`;
    let vagas = 0; const horas = [];
    for (let h = regra.inicio; h < regra.fim; h++) {
      if (h === 13) continue;
      for (let m = 0; m < 60; m += SLOT_MIN) {
        const s = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00-03:00`);
        const e = new Date(s.getTime() + SLOT_MIN * 60000);
        if (s <= now) continue;
        if (events.some(ev => s < ev.end && e > ev.start)) continue;
        vagas++; if (horas.length < 6) horas.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
      }
    }
    out.push({ data: dataStr, diaSemana: dowName, unidade: regra.nome, vagas, amostra: horas });
  }
  return out;
}

// Monta um resumo claro por dia (manhã | tarde) para injetar no prompt da Ana,
// nos próximos `maxDias` dias com vaga. Evita a Ana "achar" que não há manhã.
function formatSlotsForPrompt(slots, maxDias = 6) {
  const byDay = new Map(); // "dia (unidade)" -> { manha:[], tarde:[] }
  for (const s of slots) {
    const key = `${s.dia} (${s.unidade})`;
    if (!byDay.has(key)) byDay.set(key, { manha: [], tarde: [] });
    byDay.get(key)[s.periodo].push(s.hora);
  }
  const linhas = [];
  for (const [key, g] of byDay) {
    if (linhas.length >= maxDias) break;
    const manha = g.manha.length ? `manhã: ${g.manha.slice(0, 8).join(", ")}` : "manhã: sem vagas";
    const tarde = g.tarde.length ? `tarde: ${g.tarde.slice(0, 8).join(", ")}` : "tarde: sem vagas";
    linhas.push(`- ${key} → ${manha} | ${tarde}`);
  }
  return linhas.join("\n");
}

function detectSchedulingIntent(messages) {
  // Normaliza (sem acentos) para casar "horário/horario", "manhã/manha",
  // "amanhã/amanha", "terça/terca" etc.
  const recent = messages.slice(-4).map(m => (m.content || "").toLowerCase())
    .join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Gatilho AMPLO de propósito: qualquer sinal de marcar/checar horário ancora a
  // agenda no prompt. Um falso positivo custa só um GET (cacheável) — muito
  // melhor que a Ana ficar sem dados e INVENTAR horário. Antes só 5 palavras
  // ("horário/agendar/marcar/consulta/disponibilidade") passavam, então frases
  // comuns como "tem vaga sexta?", "tem disponível quinta?", "quando me atende?"
  // não injetavam a lista real e a Ana chutava.
  return /(horario|agend|marcar|remarcar|consulta|disponiv|disponibil|vaga|encaixe|atend|quando|hoje|amanha|semana|manha|tarde|periodo|segunda|terca|quarta|quinta|sexta|feira|que horas|marca[cç])/.test(recent);
}

function detectUnidade(messages) {
  const recent = messages.slice(-6).map(m => m.content.toLowerCase()).join(" ");
  if (recent.includes("taguatinga")) return "taguatinga";
  if (recent.includes("conjunto") || recent.includes("asa norte")) return "conjunto";
  return null;
}

// Busca o iCal. Servidor-para-servidor NÃO tem CORS, então baixamos direto do
// Google (confiável). O proxy allorigins.win, usado antes, estava fora do ar e
// derrubava a agenda inteira — deixando a Ana sem dados e "inventando" vagas.
// Mantemos um proxy só como último recurso, caso o Google bloqueie o IP.
async function fetchICS() {
  try {
    const res = await axios.get(ICAL_URL, {
      timeout: 8000, responseType: "text",
      headers: { "User-Agent": "IOBB-Ana/1.0 (+https://iobb.com.br)" },
    });
    const data = String(res.data || "");
    if (data.includes("BEGIN:VEVENT") || data.includes("BEGIN:VCALENDAR")) return data;
    throw new Error("iCal sem VEVENT/VCALENDAR");
  } catch (e) {
    console.error("[Agenda] Falha ao buscar iCal direto do Google:", e.message);
    try {
      const res = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(ICAL_URL)}`, { timeout: 6000, responseType: "text" });
      const data = String(res.data || "");
      if (data.includes("BEGIN:VEVENT")) return data;
    } catch (e2) { console.error("[Agenda] Proxy de fallback também falhou:", e2.message); }
    return null;
  }
}

// Devolve os horários livres. `null` = falha ao CARREGAR a agenda (para a Ana
// NÃO inventar); `[]` = agenda carregou mas não há vagas.
async function fetchSlots(unidadePref) {
  const ics = await fetchICS();
  if (ics === null) return null;
  const events = parseICS(ics);
  const slots = getAvailableSlots(events, unidadePref);
  console.log(`[Agenda] iCal OK: ${events.length} eventos ocupados → ${slots.length} vagas nos próximos 14 dias.`);
  return slots;
}

// ============================================================================
// AGENDA PRÓPRIA (fonte única — tabela `appointments`, ver sql/agenda.sql)
// Substitui o iCal como fonte do "ocupado". A grade de horários continua vindo
// das REGRAS (AGENDA_REGRAS) — reaproveitando todo o cálculo de fuso já testado
// em getAvailableSlots. Aqui só trocamos a origem dos eventos ocupados: em vez do
// feed iCal (só-leitura/atrasado), lemos os agendamentos ativos do banco.
// ----------------------------------------------------------------------------

// Lê os agendamentos ATIVOS dos próximos ~15 dias e devolve como eventos
// "ocupado" (start/end) para getAvailableSlots subtrair da grade. Ativo =
// 'confirmado' OU 'reservado' (hold) ainda não vencido. `null` = falha ao ler
// (para a Ana/painel não inventarem vaga sobre uma agenda que não carregou).
async function fetchBusyFromDB() {
  const now = Date.now();
  const desdeIso = new Date(now).toISOString();
  const ateIso = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("appointments")
    .select("unidade, inicio, fim, status, hold_expira_em")
    .neq("status", "cancelado")
    .gte("inicio", desdeIso).lte("inicio", ateIso);
  if (error) { console.error("[Agenda DB] Falha ao ler agendamentos:", error.message); return null; }
  const events = (data || [])
    // Hold vencido não ocupa (será liberado no próximo criarAgendamento do slot).
    .filter(a => a.status === "confirmado" || !a.hold_expira_em || new Date(a.hold_expira_em).getTime() > now)
    .map(a => ({ start: new Date(a.inicio), end: new Date(a.fim), unidade: a.unidade }));
  return events;
}

// Devolve os horários livres a partir da agenda do banco (mesma forma que o antigo
// fetchSlots devolvia a partir do iCal). `null` = falha ao carregar; `[]` = sem vaga.
async function fetchSlotsDB(unidadePref) {
  const events = await fetchBusyFromDB();
  if (events === null) return null;
  const slots = getAvailableSlots(events, unidadePref);
  console.log(`[Agenda DB] ${events.length} ocupado(s) → ${slots.length} vaga(s) nos próximos 14 dias.`);
  return slots;
}

// Cria (ou SEGURA, via hold) um horário na agenda. A trava de duplicidade é do
// BANCO: se o slot já tiver agendamento ativo, o índice único devolve 23505 e
// retornamos { ok:false, taken:true } SEM lançar. Antes de inserir, cancela um
// eventual hold VENCIDO do mesmo slot (que não ocupa de fato, mas ainda prende o
// índice). status 'reservado' + holdMin cria um hold temporário (uso da Ana);
// status 'confirmado' marca direto (uso da secretária no painel).
async function criarAgendamento({ unidade, inicio, fim, status, nome, telefone, convenio, motivo, observacoes, origem, conversationId, criadoPor, holdMin }) {
  if (!unidade || !inicio || !fim) return { ok: false, error: "unidade, inicio e fim são obrigatórios" };
  const inicioIso = new Date(inicio).toISOString();
  const fimIso = new Date(fim).toISOString();
  const st = status || "confirmado";
  try {
    // Libera holds vencidos do MESMO slot para não bloquear uma marcação legítima.
    await supabase.from("appointments")
      .update({ status: "cancelado", updated_at: new Date().toISOString() })
      .eq("unidade", unidade).eq("inicio", inicioIso)
      .eq("status", "reservado").lt("hold_expira_em", new Date().toISOString());

    const row = {
      unidade, inicio: inicioIso, fim: fimIso, status: st,
      paciente_nome: nome || null, paciente_telefone: telefone || null,
      convenio: convenio || null, motivo: motivo || null, observacoes: observacoes || null,
      origem: origem || null, conversation_id: conversationId ? String(conversationId) : null,
      criado_por: criadoPor || null,
      hold_expira_em: (st === "reservado" && holdMin) ? new Date(Date.now() + holdMin * 60000).toISOString() : null,
    };
    const { data, error } = await supabase.from("appointments").insert(row).select().single();
    if (error) {
      if (error.code === "23505") return { ok: false, taken: true };   // trava única: slot ocupado
      console.error("[Agenda DB] Falha ao criar agendamento:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, appointment: data };
  } catch (e) {
    console.error("[Agenda DB] Exceção ao criar agendamento:", e.message);
    return { ok: false, error: e.message };
  }
}

// Confirma um hold (reservado → confirmado). Mantém a unicidade do slot: a mesma
// linha só muda de status. Usado na Fase 2 quando o paciente aceita o horário.
async function confirmarAgendamento(id) {
  const { data, error } = await supabase.from("appointments")
    .update({ status: "confirmado", hold_expira_em: null, updated_at: new Date().toISOString() })
    .eq("id", id).neq("status", "cancelado").select().single();
  if (error) { console.error("[Agenda DB] Falha ao confirmar:", error.message); return { ok: false, error: error.message }; }
  return { ok: true, appointment: data };
}

// Cancela um agendamento (libera o slot). Best-effort.
async function cancelarAgendamento(id) {
  const { error } = await supabase.from("appointments")
    .update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.error("[Agenda DB] Falha ao cancelar:", error.message); return { ok: false, error: error.message }; }
  return { ok: true };
}

// Lista agendamentos ativos numa janela [de, ate] para a grade do painel.
async function listarAgendamentos({ de, ate, unidade }) {
  let q = supabase.from("appointments")
    .select("id, unidade, inicio, fim, status, paciente_nome, paciente_telefone, convenio, motivo, observacoes, origem, hold_expira_em")
    .neq("status", "cancelado")
    .gte("inicio", new Date(de).toISOString()).lte("inicio", new Date(ate).toISOString())
    .order("inicio", { ascending: true });
  if (unidade) q = q.eq("unidade", unidade);
  const { data, error } = await q;
  if (error) { console.error("[Agenda DB] Falha ao listar:", error.message); return null; }
  const now = Date.now();
  // Esconde holds vencidos (tratados como livres).
  return (data || []).filter(a => a.status === "confirmado" || !a.hold_expira_em || new Date(a.hold_expira_em).getTime() > now);
}

// ===== FASE 2: a Ana marca sozinha ==========================================
// Formata as vagas REAIS para injetar no prompt, cada uma com um token técnico
// [inicio:...] que a Ana copia no bloco [AGENDAR] ao confirmar. Limita a
// `maxSlots` para não estourar o prompt (a Ana oferece UMA por vez, então um
// punhado basta). O paciente vê só a parte humana ("terça 22/07 às 10:00").
function formatSlotsParaAgendar(slots, maxSlots = 12) {
  return slots.slice(0, maxSlots)
    .map(s => `- ${s.dia} às ${s.hora} (${s.unidade}) [inicio:${s.start.toISOString()}]`)
    .join("\n");
}

// Extrai o bloco técnico [AGENDAR]...[/AGENDAR] que a Ana anexa quando o paciente
// CONFIRMA um horário. Mesma robustez do extrairPreAgendamento (trata bloco sem
// fechamento). Devolve { limpo, registro } — registro é null se não houver bloco.
function extrairAgendar(reply) {
  const re = /\[AGENDAR\]([\s\S]*?)\[\/AGENDAR\]/i;
  let inner, limpo;
  const m = reply.match(re);
  if (m) { inner = m[1]; limpo = reply.replace(re, "").replace(/\n{3,}/g, "\n\n").trim(); }
  else {
    const mo = reply.match(/\[AGENDAR\]([\s\S]*)$/i);
    if (!mo) return { limpo: reply, registro: null };
    inner = mo[1]; limpo = reply.slice(0, mo.index).replace(/\n{3,}/g, "\n\n").trim();
  }
  const campos = {};
  for (const par of inner.replace(/\n/g, " ").split("|")) {
    const idx = par.indexOf(":");                     // 1º ":" — preserva o ISO do inicio (que tem ":")
    if (idx === -1) continue;
    const chave = par.slice(0, idx).trim().toLowerCase().replace(/^-+\s*/, "");
    const valor = par.slice(idx + 1).trim();
    if (chave) campos[chave] = valor;
  }
  return { limpo, registro: Object.keys(campos).length ? campos : null };
}

// Grava DE VERDADE o horário que a Ana confirmou com o paciente. Marca só ao
// confirmar (decisão v1): se a vaga foi tomada no meio (trava do banco → taken),
// a Ana manda uma correção oferecendo a próxima vaga — nunca marca duplicado.
// NUNCA lança. Em sucesso: fecha a conversão de Ads e espelha à secretária.
async function processarAgendarDaAna({ registro, patient, from, conversationId }) {
  try {
    const limpo = (v) => (v && v !== "-") ? String(v).trim() : null;
    const unidade = limpo(registro.unidade);
    const inicioRaw = limpo(registro.inicio);
    if (!unidade || !inicioRaw) { console.error("[Agendar] Bloco sem unidade/inicio:", JSON.stringify(registro)); return { ok: false }; }
    const ini = new Date(inicioRaw);
    if (isNaN(ini.getTime())) { console.error("[Agendar] inicio inválido:", inicioRaw); return { ok: false }; }
    const fim = new Date(ini.getTime() + SLOT_MIN * 60000);
    const nome = limpo(registro.nome) || patient?.name || null;
    const telefone = limpo(registro.telefone) || patient?.phone || from || null;
    const convenio = limpo(registro.convenio);
    const motivo = limpo(registro.motivo) || "Consulta";
    const r = await criarAgendamento({ unidade, inicio: ini, fim, status: "confirmado", nome, telefone, convenio, motivo, origem: "ana", conversationId });
    if (r.taken) {
      // Corrida: a vaga foi ocupada durante a conversa. Oferece a próxima livre.
      const slots = await fetchSlotsDB(unidade);
      const minTs = Date.now() + ANA_ANTECEDENCIA_HORAS * 3600 * 1000;   // mesma antecedência
      const prox = (slots || []).find(s => s.start.getTime() >= minTs);
      const alt = prox ? `Consigo *${prox.dia} às ${prox.hora}*. Esse horário serve para você?` : `Vou verificar outra opção e já te retorno.`;
      await trySendWhatsApp(from, `Peço desculpas — o horário de ${fmtDataHoraBR(ini.toISOString())} acabou de ser preenchido. ${alt}`);
      console.log(`[Agendar] Corrida: ${unidade} ${inicioRaw} já ocupado — ofereci alternativa.`);
      return { ok: false, taken: true };
    }
    if (!r.ok) { console.error("[Agendar] Falha ao gravar:", r.error); return { ok: false, error: r.error }; }
    await marcarConversaoAgendada(conversationId);   // fecha atribuição de Ads (idempotente)
    await espelharParaSecretaria("[Agendado pela Ana]",
      `✅ *AGENDAMENTO (via Ana)*\n👤 Nome: ${nome || "—"}\n📱 Telefone: ${telefone || "—"}\n🏥 Convênio: ${convenio || "—"}\n📍 Unidade: ${unidade}\n🕐 Horário: ${fmtDataHoraBR(ini.toISOString())}\n📝 Motivo: ${motivo || "—"}`);
    console.log(`[Agendar] ✅ Agendado via Ana: ${unidade} ${fmtDataHoraBR(ini.toISOString())} (${nome || "—"}).`);
    return { ok: true, appointment: r.appointment };
  } catch (e) { console.error("[Agendar] Exceção:", e.message); return { ok: false, error: e.message }; }
}

// Chamada à API de mensagens da Anthropic com retry curto SOMENTE em erros
// TRANSITÓRIOS: 429 (limite), 500/502/503/504 (servidor), 529 (sobrecarga) e
// falhas SEM resposta HTTP (timeout/rede). Erros DEFINITIVOS (401 chave, 400
// requisição, 404 modelo, 403 permissão) sobem na 1ª tentativa — repetir não
// resolveria e só atrasaria o fallback. O webhook já respondeu 200 ao Meta antes
// de processar (assíncrono), então o backoff não afeta a entrega do webhook.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANTHROPIC_RETRY_STATUS = new Set([429, 500, 502, 503, 504, 529]);
async function anthropicMessages(payload, { tentativas = 3, timeout = 30000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await axios.post(
        "https://api.anthropic.com/v1/messages",
        payload,
        { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, timeout }
      );
    } catch (err) {
      const status = err?.response?.status;
      // Transitório = status retentável OU falha sem resposta (timeout/rede).
      const transitorio = (status && ANTHROPIC_RETRY_STATUS.has(status)) || !err.response;
      if (!transitorio || i >= tentativas) throw err;
      const espera = 1000 * i; // backoff curto: 1s, depois 2s
      console.warn(`[Ana] Anthropic transitório (${status || err.code || "sem resposta"}) — tentativa ${i}/${tentativas}, aguardando ${espera}ms e repetindo.`);
      await sleep(espera);
    }
  }
}

// Funções do Supabase
async function getOrCreatePatient(phone) {
  try {
    let { data, error } = await supabase.from("patients").select("*").eq("phone", phone).single();
    console.log("Patient query:", JSON.stringify(data), JSON.stringify(error));
    if (!data) {
      const { data: newPatient, error: insertError } = await supabase.from("patients").insert({ phone }).select().single();
      console.log("Patient insert:", JSON.stringify(newPatient), JSON.stringify(insertError));
      data = newPatient;
    }
    return data;
  } catch(e) {
    console.error("Erro patient:", e.message);
    return null;
  }
}

async function getOrCreateConversation(patientId) {
  let { data } = await supabase.from("conversations").select("*").eq("patient_id", patientId).neq("status", "closed").order("started_at", { ascending: false }).limit(1).single();
  if (!data) {
    const { data: newConv } = await supabase.from("conversations").insert({ patient_id: patientId, status: "bot" }).select().single();
    data = newConv;
  }
  return data;
}

// Salva uma mensagem. `media`, quando informado, guarda a referência ao anexo
// no Storage ({ path, type, name }) — exige as colunas media_* na tabela
// messages (ver sql/messages_media.sql).
// `agent`, quando informado, grava o autor da mensagem humana (ex.: a secretária
// ou "Dr. Bruno (WhatsApp)" para mensagens disparadas por comando admin). O
// painel exibe esse rótulo na bolha (exige a coluna `agent` — ver
// sql/messages_agent.sql). Se a coluna não existir, o insert reinsere só o básico.
async function saveMessage(conversationId, role, content, waMessageId = null, media = null, agent = null) {
  const base = { conversation_id: conversationId, role, content, wa_message_id: waMessageId };
  // withMedia preserva a referência do anexo; row adiciona ainda o autor (agent).
  const withMedia = { ...base };
  if (media && media.path) {
    withMedia.media_path = media.path;
    withMedia.media_type = media.type || null;
    withMedia.media_name = media.name || null;
  }
  const row = { ...withMedia };
  if (agent) row.agent = agent;

  let { error } = await supabase.from("messages").insert(row);
  // Degradação em cascata, do MAIS completo ao mais básico — sem NUNCA descartar
  // o media_path por causa de uma coluna `agent` ausente:
  if (error && agent) {
    // A coluna `agent` pode não existir (migração sql/messages_agent.sql não
    // rodada). Tenta de novo PRESERVANDO o anexo.
    console.error("[Msg] Insert com coluna `agent` falhou (rode sql/messages_agent.sql) — reinserindo sem agent, com o anexo:", error.message);
    ({ error } = await supabase.from("messages").insert(withMedia));
  }
  if (error && withMedia.media_path) {
    // As colunas media_* podem não existir (migração sql/messages_media.sql não
    // rodada). Só então cai para o básico — e alerta que o ANEXO ficou sem
    // referência no painel (mas a mensagem não se perde).
    console.error("[Msg][Anexo] Insert com colunas media_* falhou (rode sql/messages_media.sql) — o ANEXO NÃO será exibível no painel:", error.message);
    ({ error } = await supabase.from("messages").insert(base));
  }
  if (error) console.error("[Msg] Falha ao inserir mensagem no banco:", error.message);
  else if (withMedia.media_path) console.log(`[Anexo] media_path gravado na mensagem (${withMedia.media_type || "?"}): ${withMedia.media_path}`);

  await supabase.from("conversations").update({ last_message: content, updated_at: new Date() }).eq("id", conversationId);
}

// Normaliza um número BR para o formato do WhatsApp (só dígitos, com DDI 55).
// Aceita "(61) 98406-0001", "61984060001", "+55 61 98406-0001" etc.
function normalizePhoneBR(raw) {
  let d = String(raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);     // 00 55 ... → 55 ...
  if (!d.startsWith("55")) d = "55" + d;      // sem DDI → assume Brasil
  // 55 + DDD(2) + número(8 ou 9 dígitos) = 12 ou 13 dígitos
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

// Timestamp (ms) da última mensagem RECEBIDA do paciente (role 'user'), que
// define a janela de atendimento de 24h da Meta. null se o paciente nunca
// escreveu (nesse caso, só é possível iniciar via template aprovado).
async function lastInboundAt(phone) {
  try {
    const { data: patient } = await supabase.from("patients").select("id").eq("phone", phone).single();
    if (!patient) return null;
    const { data: convs } = await supabase.from("conversations").select("id").eq("patient_id", patient.id);
    const ids = (convs || []).map(c => c.id);
    if (!ids.length) return null;
    const { data: last } = await supabase.from("messages").select("timestamp")
      .in("conversation_id", ids).eq("role", "user")
      .order("timestamp", { ascending: false }).limit(1).single();
    return last?.timestamp ? new Date(last.timestamp).getTime() : null;
  } catch (e) {
    return null;
  }
}

async function getConversationMessages(conversationId) {
  // Buscar as 40 mensagens MAIS RECENTES (desc) e devolver em ordem cronológica.
  // Assim o histórico sempre inclui a última mensagem do usuário recém-salva.
  // 40 (e não 20) porque a coleta de um pré-agendamento é feita campo a campo,
  // turno a turno: nome → telefone → unidade → convênio → motivo → período. Uma
  // janela curta faz os PRIMEIROS dados informados (nome/telefone) saírem de
  // contexto no meio da coleta — a Ana deixa de "enxergá-los" e pergunta de novo,
  // dando a falsa impressão de que reinicia o checklist. Ver slice() abaixo.
  const { data } = await supabase.from("messages").select("role, content").eq("conversation_id", conversationId).order("timestamp", { ascending: false }).limit(40);
  return (data || []).reverse();
}

async function updatePatientName(phone, name) {
  await supabase.from("patients").update({ name, updated_at: new Date() }).eq("phone", phone);
}

// ===== Atribuição de anúncios (Google Ads) =====
function novoToken() { return crypto.randomBytes(4).toString("hex").toUpperCase(); } // 8 chars

// Registra um clique de anúncio (na landing) e devolve o token que viajará no [ref:...]
async function registrarClique({ gclid, wbraid, gbraid, source }) {
  const token = novoToken();
  try {
    await supabase.from("ad_clicks").insert({
      token, gclid: gclid || null, wbraid: wbraid || null, gbraid: gbraid || null, source: source || null
    });
  } catch (e) {
    console.error("[Ads] Falha ao registrar clique:", e.message);
  }
  return token;
}

// Vincula o token (recebido na 1ª mensagem) ao telefone/conversa do paciente
async function vincularClique(token, phone, conversationId) {
  try {
    const { data } = await supabase.from("ad_clicks").select("id, phone").eq("token", token).limit(1).single();
    if (!data) { console.warn("[Ads] Token de anúncio não encontrado:", token); return; }
    if (data.phone) return; // já vinculado
    await supabase.from("ad_clicks").update({ phone, conversation_id: String(conversationId) }).eq("id", data.id);
    console.log("[Ads] Clique vinculado:", token, "→", phone);
  } catch (e) {
    console.error("[Ads] Falha ao vincular clique:", e.message);
  }
}

// Campanhas cujos pacientes SEMPRE recebem a Ana, mesmo com o liga/desliga global
// desligado (#ANA OFF). Casa por SUBSTRING no ad_clicks.source (ex.: "refrativa"
// casa "google/refrativa"). Assim você pode desligar a Ana para o atendimento
// geral em certos momentos, mas os pacientes vindos da campanha de refrativa
// continuam sendo atendidos pela Ana 100% do tempo. Configurável no Render via
// ANA_SEMPRE_ATIVA_SOURCES (lista separada por vírgula). Padrão: "refrativa".
const ANA_SEMPRE_ATIVA_SOURCES = (readEnv("ANA_SEMPRE_ATIVA_SOURCES") || "refrativa")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// Diz se a conversa veio de uma campanha "sempre ativa" (pelo source do ad_click
// já vinculado a ela). Best-effort: em erro/sem match, devolve false (mantém o
// comportamento normal do liga/desliga global).
async function conversaSempreAtiva(conversationId) {
  if (!ANA_SEMPRE_ATIVA_SOURCES.length || !conversationId) return false;
  try {
    const { data } = await supabase.from("ad_clicks").select("source")
      .eq("conversation_id", String(conversationId)).not("source", "is", null);
    return (data || []).some(r => {
      const s = (r.source || "").toLowerCase();
      return ANA_SEMPRE_ATIVA_SOURCES.some(k => s.includes(k));
    });
  } catch (e) {
    console.error("[Ana] conversaSempreAtiva falhou:", e.message);
    return false;
  }
}

// Baixar mídia do WhatsApp
async function downloadMedia(mediaId) {
  try {
    const { data: mediaInfo } = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const response = await axios.get(mediaInfo.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      responseType: "arraybuffer"
    });
    return { buffer: Buffer.from(response.data), mimeType: mediaInfo.mime_type };
  } catch(e) {
    console.error("Erro ao baixar mídia:", e.message);
    return null;
  }
}

// Extensão de arquivo a partir do mime-type (para nomear o anexo salvo).
function extFromMime(mime = "") {
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "application/pdf": "pdf", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/amr": "amr", "audio/wav": "wav", "video/mp4": "mp4", "video/3gpp": "3gp",
  };
  if (map[mime]) return map[mime];
  const guess = (mime.split("/")[1] || "bin").split(";")[0];
  return guess.replace(/[^\w]+/g, "") || "bin";
}

// Sobe uma mídia RECEBIDA do paciente para o bucket privado "anexos".
// Devolve { path, type, name } para persistir na mensagem, ou null em falha.
// O nome começa com `${Date.now()}_` para que o expurgo de 30 dias (LGPD)
// e o prefixo `_in_` distingam anexos recebidos dos enviados pelo painel.
async function storeInboundMedia(buffer, mimeType, originalName) {
  try {
    const ext = extFromMime(mimeType);
    let base = originalName ? originalName.replace(/[^\w.\-]+/g, "_").slice(-80) : `midia.${ext}`;
    if (!/\.\w+$/.test(base)) base = `${base}.${ext}`;
    const path = `${Date.now()}_in_${base}`;
    const { error } = await supabase.storage.from("anexos").upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) {
      console.error(`[Anexo] Falha no upload ao Storage (bucket anexos): ${error.message} | path=${path} | ${buffer.length} bytes | ${mimeType}`);
      return null;
    }
    console.log(`[Anexo] Salvo no Storage: ${path} (${buffer.length} bytes, ${mimeType})`);
    return { path, type: mimeType, name: base };
  } catch (e) {
    console.error("Erro ao salvar anexo recebido:", e.message);
    return null;
  }
}

// Transcrever áudio com Whisper
async function transcribeAudio(buffer, mimeType) {
  try {
    const form = new FormData();
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "wav";
    form.append("file", buffer, { filename: `audio.${ext}`, contentType: mimeType });
    form.append("model", "whisper-1");
    form.append("language", "pt");
    const { data } = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      { headers: { Authorization: `Bearer ${OPENAI_KEY}`, ...form.getHeaders() } }
    );
    return data.text;
  } catch(e) {
    console.error("Erro Whisper:", e.message);
    return null;
  }
}

// Enviar documento pelo WhatsApp
async function sendWhatsAppDocument(to, url, filename, caption = "") {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "document", document: { link: url, filename, caption } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Enviar imagem pelo WhatsApp
async function sendWhatsAppImage(to, url, caption = "") {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "image", image: { link: url, caption } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// ============================================================================
// TEMPLATES DA META — mensagens FORA da janela de 24h
// ----------------------------------------------------------------------------
// Regra da Meta: só é permitido enviar MENSAGEM LIVRE (texto arbitrário) nas
// 24h seguintes à ÚLTIMA mensagem que o paciente enviou. Passada essa janela,
// para iniciar/retomar o contato é OBRIGATÓRIO usar um TEMPLATE aprovado.
//
// Como criar um template aprovado (uma vez):
//   1. Acesse o WhatsApp Manager (business.facebook.com) → sua conta WABA →
//      "Modelos de mensagem" → "Criar modelo".
//   2. Escolha a categoria:
//        • UTILITY   → retomar atendimento, avisos, confirmações (recomendado);
//        • MARKETING → reengajamento/promoção (mais restrições e opt-out).
//      Escolha o idioma pt_BR.
//   3. Escreva o corpo. Pode usar variáveis {{1}}, {{2}}… preenchidas no envio,
//      ex.: "Olá {{1}}! Aqui é a Ana, do Instituto de Olhos Bruno Borges.
//            Podemos continuar seu atendimento por aqui?"
//   4. Envie para aprovação (leva de minutos a algumas horas).
//   5. Depois de APROVADO, configure no Render as variáveis de ambiente:
//        WA_TEMPLATE_NAME = nome exato do template aprovado
//        WA_TEMPLATE_LANG = idioma (padrão pt_BR)
//      Assim o botão "Nova conversa" do painel envia o template quando o
//      paciente estiver fora da janela de 24h.
//
// `bodyParams` preenche as variáveis {{1}}… do corpo, na ordem informada.
async function sendWhatsAppTemplate(to, templateName, languageCode = "pt_BR", bodyParams = []) {
  const components = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map(t => ({ type: "text", text: String(t) })) }]
    : [];
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp", to, type: "template",
      template: { name: templateName, language: { code: languageCode }, components },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Notificar clínica (espelhamento). NUNCA lança: uma falha aqui — por exemplo,
// a janela de 24h do WhatsApp fechada para o número da clínica — não pode
// interromper o atendimento ao paciente.
async function notificarClinica(texto) {
  try {
    await sendWhatsApp(NUMERO_CLINICA, texto);
  } catch(e) {
    const d = e?.response?.data;
    console.error("[Ana] Falha ao espelhar p/ clínica (possível janela de 24h fechada):", d ? JSON.stringify(d) : e.message);
  }
}

// Envia uma mensagem e devolve um resultado ESTRUTURADO (nunca lança), com o
// código de erro da Meta e se a falha é por janela de 24h fechada. Usado no
// espelhamento para logar claramente sucesso/falha e o motivo.
async function trySendWhatsApp(to, texto) {
  try {
    await sendWhatsApp(to, texto);
    return { ok: true };
  } catch (e) {
    const err = e?.response?.data?.error || {};
    const code = err.code ?? null;
    const message = err.message || e.message || "erro desconhecido";
    // 131047 = re-engagement (mais de 24h desde a última msg do cliente);
    // 131051/131026/131053 também indicam entrega bloqueada/fora de janela.
    const isWindow = [131047, 131051, 131026, 131053].includes(Number(code)) ||
      /24\s*hours|re-?engag|outside.*window|último.*24/i.test(message);
    return { ok: false, code, message, isWindow };
  }
}

// Espelha um texto para a SECRETÁRIA (WA_SECRETARIA_NUMBER). Se falhar (tipicamente
// janela de 24h da Meta fechada), usa a salvaguarda de espelhar para o número da
// clínica. Loga CLARAMENTE cada tentativa: destino, sucesso/falha, motivo e código
// da Meta. NUNCA lança. `label` identifica a origem no log (ex.: "[Recado urgência]").
async function espelharParaSecretaria(label, texto) {
  const r1 = await trySendWhatsApp(WA_SECRETARIA_NUMBER, texto);
  if (r1.ok) {
    console.log(`[Espelho]${label} ✅ ENVIADO à secretária ${WA_SECRETARIA_NUMBER}.`);
    return { entregue: true, canal: "secretaria" };
  }
  const motivo = r1.isWindow ? "FORA DA JANELA DE 24H da Meta" : "ERRO DA API";
  console.error(`[Espelho]${label} ❌ FALHA ao enviar à secretária ${WA_SECRETARIA_NUMBER}: ${motivo} (code=${r1.code}) ${r1.message}`);

  // Salvaguarda 1 (durável): fora da janela de 24h, mensagem LIVRE é sempre
  // bloqueada pela Meta — a ÚNICA forma de entregar é um TEMPLATE aprovado. Se
  // houver um configurado, envia o resumo em linha única na variável {{1}}. Isso
  // também reabre a janela, e a secretária pode responder para ver o detalhe.
  if (r1.isWindow && WA_SECRETARIA_TEMPLATE_NAME) {
    const resumo = String(texto)
      .replace(/\*/g, "")            // remove marcação de negrito do WhatsApp
      .replace(/\s*\n+\s*/g, " · ")  // Meta proíbe \n em variável de template
      .replace(/\s{2,}/g, " ")       // e mais de 4 espaços seguidos
      .trim()
      .slice(0, 600);                // margem segura no limite da variável
    let tpl;
    try {
      await sendWhatsAppTemplate(WA_SECRETARIA_NUMBER, WA_SECRETARIA_TEMPLATE_NAME, WA_SECRETARIA_TEMPLATE_LANG, [resumo]);
      tpl = { ok: true };
    } catch (e) {
      const err = e?.response?.data?.error || {};
      tpl = { ok: false, code: err.code ?? null, message: err.message || e.message };
    }
    if (tpl.ok) {
      console.log(`[Espelho]${label} ✅ ENTREGUE à secretária ${WA_SECRETARIA_NUMBER} via TEMPLATE "${WA_SECRETARIA_TEMPLATE_NAME}" (janela 24h estava fechada).`);
      return { entregue: true, canal: "secretaria-template" };
    }
    console.error(`[Espelho]${label} ❌ Template "${WA_SECRETARIA_TEMPLATE_NAME}" também falhou (code=${tpl.code}) ${tpl.message}. Confira se está APROVADO na Meta e com 1 variável {{1}}.`);
  } else if (r1.isWindow && !WA_SECRETARIA_TEMPLATE_NAME) {
    console.error(`[Espelho]${label} ⚠️ Janela de 24h fechada e NENHUM template configurado (WA_SECRETARIA_TEMPLATE_NAME vazio) — a Meta só entrega fora da janela por template aprovado.`);
  }

  // Salvaguarda 2: espelha para o número da clínica (mesma limitação de janela).
  const aviso = `⚠️ (não entregue à secretária ${WA_SECRETARIA_NUMBER} — ${r1.isWindow ? "janela 24h fechada" : "erro API"})\n${texto}`;
  const r2 = await trySendWhatsApp(NUMERO_CLINICA, aviso);
  if (r2.ok) {
    console.log(`[Espelho]${label} ↪️ SALVAGUARDA OK: espelhado para a clínica ${NUMERO_CLINICA}.`);
    return { entregue: true, canal: "clinica" };
  }
  console.error(`[Espelho]${label} ⛔ SALVAGUARDA TAMBÉM FALHOU: clínica ${NUMERO_CLINICA} (code=${r2.code}) ${r2.message}. Recado NÃO entregue por nenhum canal (configure WA_SECRETARIA_TEMPLATE_NAME com um template aprovado, ou peça à secretária que envie uma msg ao número da Ana para abrir a janela de 24h).`);
  return { entregue: false, canal: null };
}

// Extrai o bloco técnico [PREAGENDAMENTO]...[/PREAGENDAMENTO] que a Ana anexa ao
// concluir a coleta. Devolve { limpo, registros } — `limpo` é a mensagem SEM o
// bloco (o que o paciente vê) e `registros` é a lista de pré-agendamentos (uma
// entrada por paciente). Se não houver bloco, registros = [].
function extrairPreAgendamento(reply) {
  const re = /\[PREAGENDAMENTO\]([\s\S]*?)\[\/PREAGENDAMENTO\]/i;
  let inner, limpo;
  const m = reply.match(re);
  if (m) {
    inner = m[1];
    limpo = reply.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    // Salvaguarda: bloco sem tag de fechamento — remove da abertura até o fim,
    // para o marcador técnico NUNCA vazar para o paciente.
    const mo = reply.match(/\[PREAGENDAMENTO\]([\s\S]*)$/i);
    if (!mo) return { limpo: reply, registros: [] };
    inner = mo[1];
    limpo = reply.slice(0, mo.index).replace(/\n{3,}/g, "\n\n").trim();
  }
  const registros = [];
  for (const linha of inner.split("\n")) {
    if (!/[:|]/.test(linha) || !linha.trim()) continue;
    const campos = {};
    for (const par of linha.split("|")) {
      const idx = par.indexOf(":");
      if (idx === -1) continue;
      const chave = par.slice(0, idx).trim().toLowerCase().replace(/^-+\s*/, "");
      const valor = par.slice(idx + 1).trim();
      if (chave) campos[chave] = valor;
    }
    if (Object.keys(campos).length) registros.push(campos);
  }
  return { limpo, registros };
}

// Envia à secretária o resumo de um pré-agendamento concluído. Trata a janela de
// 24h da Meta: se o envio livre falhar (número não falou com o Business nas
// últimas 24h), registra o erro e espelha para o número da clínica como
// salvaguarda, para o pré-agendamento nunca se perder. NUNCA lança.
async function notificarSecretaria(registros, patient, from, conversationId) {
  if (!registros || !registros.length) return;
  const val = (r, k) => { const v = r[k]; return v && v !== "-" ? v : "—"; };
  const blocos = registros.map((r, i) => {
    const tel = (r.telefone && r.telefone !== "-") ? r.telefone : (patient?.phone || from || "—");
    const nome = (r.nome && r.nome !== "-") ? r.nome : (patient?.name || "—");
    const cab = registros.length > 1 ? `\n— Paciente ${i + 1} —` : "";
    return `${cab}\n👤 Nome: ${nome}\n📱 Telefone: ${tel}\n🏥 Convênio: ${val(r, "convenio")}\n📍 Unidade: ${val(r, "unidade")}\n🕐 Período: ${val(r, "periodo")}\n📝 Motivo: ${val(r, "motivo")}`;
  }).join("\n");
  const texto = `📋 *NOVO PRÉ-AGENDAMENTO*\n${blocos}`;
  // Persiste ANTES do espelhamento para não perder o registro se o envio falhar.
  // Se TUDO era duplicata (a Ana reemitiu o bloco), não grava nem reenvia à equipe.
  const novos = await persistirPreAgendamentos(registros, patient, from, conversationId);
  if (novos > 0) await espelharParaSecretaria(`[PréAgenda ${novos}p]`, texto);
  else console.log("[PréAgenda] Reemissão duplicada — não reenviado à secretária.");
}

// Grava cada pré-agendamento na tabela `preagendamentos` (para as consultas admin
// por WhatsApp). Best-effort: NUNCA lança nem interrompe o atendimento. Requer a
// migração sql/preagendamentos.sql — sem ela, apenas loga o erro.
// Devolve quantos registros NOVOS foram gravados (0 quando tudo era duplicata) —
// usado por notificarSecretaria para não reenviar à equipe uma reemissão repetida.
async function persistirPreAgendamentos(registros, patient, from, conversationId) {
  try {
    const limpo = (v) => (v && v !== "-") ? String(v).trim() : null;
    let rows = registros.map(r => ({
      conversation_id: conversationId ? String(conversationId) : null,
      patient_phone: from || null,
      nome: limpo(r.nome) || patient?.name || null,
      telefone: limpo(r.telefone) || patient?.phone || from || null,
      convenio: limpo(r.convenio),
      unidade: limpo(r.unidade),
      periodo: limpo(r.periodo),
      motivo: limpo(r.motivo),
    }));

    // Anti-duplicata: a Ana às vezes reemite o bloco [PREAGENDAMENTO] em mensagens
    // seguidas do mesmo fechamento, gerando linhas repetidas no relatório. Descarta
    // um registro se já houver, NA MESMA conversa e nos últimos 30 min, outro com o
    // mesmo nome+unidade+período (chave estável do "mesmo agendamento").
    if (conversationId) {
      const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentes } = await supabase.from("preagendamentos")
        .select("nome, unidade, periodo")
        .eq("conversation_id", String(conversationId))
        .gte("created_at", desde);
      const chave = (x) => [x.nome, x.unidade, x.periodo].map(v => (v || "").toString().trim().toLowerCase()).join("|");
      const jaTem = new Set((recentes || []).map(chave));
      const antes = rows.length;
      rows = rows.filter(r => !jaTem.has(chave(r)));
      if (rows.length < antes) console.log(`[PréAgenda] ${antes - rows.length} duplicata(s) ignorada(s) na conversa ${conversationId}.`);
    }
    if (!rows.length) return 0;

    const { error } = await supabase.from("preagendamentos").insert(rows);
    if (error) console.error("[PréAgenda] Falha ao persistir (rodou a migração sql/preagendamentos.sql?):", error.message);
    else console.log(`[PréAgenda] ${rows.length} registro(s) gravado(s) na tabela preagendamentos.`);
    return rows.length;
  } catch (e) {
    console.error("[PréAgenda] Exceção ao persistir:", e.message);
    return registros?.length || 0; // em exceção, não suprime a notificação à equipe
  }
}

// Marca a conversão de AGENDAMENTO (booked=true) do clique de anúncio vinculado a
// esta conversa e dispara o upload da conversão offline ao Google Ads. É o que
// FECHA o ciclo de atribuição — antes, dependia 100% do clique manual "agendou"
// no painel (POST /api/conversations/:id/booked), então pré-agendamentos vindos de
// anúncio não eram contados. Agora a Ana marca sozinha ao concluir a coleta.
// IDEMPOTENTE: só age no ad_click mais recente da conversa que AINDA não está
// booked, para nunca contar a mesma conversão duas vezes (a Ana pode reemitir o
// bloco, o paciente pode voltar etc.). Só faz upload se DE FATO virou a marca.
// NUNCA lança — atribuição jamais pode quebrar o atendimento.
async function marcarConversaoAgendada(conversationId, value = 200) {
  if (!conversationId) return { attributed: false };
  try {
    const { data } = await supabase.from("ad_clicks").select("id, booked")
      .eq("conversation_id", String(conversationId))
      .order("clicked_at", { ascending: false }).limit(1).single();
    if (!data) return { attributed: false };                 // conversa não veio de anúncio
    if (data.booked) return { attributed: true, alreadyBooked: true };
    await supabase.from("ad_clicks").update({ booked: true, booked_at: new Date(), conversion_value: value }).eq("id", data.id);
    // Fire-and-forget: não atrasa o atendimento; erros só vão ao log. A rede de
    // segurança semanal reprocessa qualquer conversão que não suba agora.
    googleAds.uploadClickConversions({ supabase })
      .then(r => console.log(`[Ads] Upload pós-agendamento: ${r.uploaded} enviada(s), ${r.failed} falha(s).`))
      .catch(e => console.error("[Ads] Upload pós-agendamento falhou:", e.message));
    return { attributed: true, alreadyBooked: false };
  } catch (e) {
    console.error("[Ads] Falha ao marcar conversão de agendamento:", e.message);
    return { attributed: false, error: e.message };
  }
}

// ── Consultas de pré-agendamento pelos números admin (linguagem natural) ──────
// Limites de um período (hoje/ontem/semana/mês) em UTC, ancorados no fuso de
// Brasília — meia-noite de Brasília = 03:00 UTC (UTC-3 o ano todo desde 2019).
function periodoBoundsUTC(p) {
  const { ano, mes, dia } = brasiliaAgora().ymd;
  const mk = (d) => new Date(Date.UTC(ano, mes - 1, d, 3, 0, 0)); // 00:00 BR
  if (p === "ontem") return { start: mk(dia - 1), end: mk(dia) };
  if (p === "semana") return { start: mk(dia - 6), end: mk(dia + 1) };   // últimos 7 dias
  if (p === "mes") return { start: mk(dia - 29), end: mk(dia + 1) };     // últimos 30 dias
  return { start: mk(dia), end: mk(dia + 1) };                          // hoje (padrão)
}
function rotuloPeriodo(p) {
  return p === "ontem" ? "de ontem"
    : p === "semana" ? "nos últimos 7 dias"
    : p === "mes" ? "nos últimos 30 dias"
    : "de hoje";
}
function fmtDataHoraBR(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ_BR, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtHoraBR(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ_BR, hour: "2-digit", minute: "2-digit" });
}
function formatarPreAgendamento(r) {
  const v = (x) => (x && x !== "-") ? x : "—";
  const tel = (r.telefone && r.telefone !== "-") ? r.telefone : (r.patient_phone || "—");
  return `👤 Nome: ${v(r.nome)}\n📱 Telefone: ${tel}\n🏥 Convênio: ${v(r.convenio)}\n📍 Unidade: ${v(r.unidade)}\n🕐 Período: ${v(r.periodo)}\n📝 Motivo: ${v(r.motivo)}`;
}

// Sufixo compacto (convênio + motivo) para as LINHAS das listas de pré-agendamento.
// Antes as linhas mostravam só nome/telefone/unidade/período — escondendo convênio
// (particular ou qual plano) e o motivo, embora a Ana os colete e o banco os guarde.
function extrasPreAgenda(r) {
  const v = (x) => (x && x !== "-") ? x : "—";
  return ` · 🏥 ${v(r.convenio)} · 📝 ${v(r.motivo)}`;
}
// Guarda o detalhe do último erro de consulta (código + mensagem do Postgres/
// PostgREST) para a Ana poder devolvê-lo no WhatsApp — assim o diagnóstico não
// depende de olhar os logs do Render. Ex.: "42P01: relation ... does not exist"
// (tabela ausente), "PGRST205" (cache da API), "permission denied" (RLS/grants).
let ultimoErroPreAgenda = null;
const capturaErroPreAgenda = (error, ctx) => {
  ultimoErroPreAgenda = (error.code ? error.code + ": " : "") + (error.message || "erro desconhecido");
  console.error(`[PréAgenda] ${ctx}:`, ultimoErroPreAgenda);
};

// Núcleos que operam sobre um intervalo {start,end} em UTC. As versões por preset
// (hoje/ontem/semana/mês) e por DATAS específicas (#PREAGENDA 01/07 a 10/07) usam
// os mesmos núcleos.
async function contarPreAgendamentosBounds({ start, end }) {
  const { count, error } = await supabase.from("preagendamentos")
    .select("*", { count: "exact", head: true })
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  if (error) { capturaErroPreAgenda(error, "contar"); return null; }
  return count ?? 0;
}
async function listarPreAgendamentosBounds({ start, end }, limit = 30) {
  const { data, error } = await supabase.from("preagendamentos")
    .select("*").gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
    .order("created_at", { ascending: false }).limit(limit);
  if (error) { capturaErroPreAgenda(error, "listar"); return null; }
  return data || [];
}
async function contarPreAgendamentos(p) { return contarPreAgendamentosBounds(periodoBoundsUTC(p)); }
async function listarPreAgendamentos(p, limit = 30) { return listarPreAgendamentosBounds(periodoBoundsUTC(p), limit); }

// Converte um match de data "DD/MM" ou "DD/MM/AAAA" em {ano,mes,dia} (ano padrão =
// ano atual em Brasília; 2 dígitos → 20xx). Retorna null se a data for inválida.
function parseDataBR(m) {
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10);
  let ano = m[3] ? parseInt(m[3], 10) : brasiliaAgora().ymd.ano;
  if (ano < 100) ano += 2000;
  if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12)) return null;
  return { ano, mes, dia };
}
// Intervalo UTC de d1..d2 INCLUSIVE (meia-noite BR = 03:00 UTC). Ordena se invertido.
function boundsDeDatas(d1, d2) {
  let a = new Date(Date.UTC(d1.ano, d1.mes - 1, d1.dia, 3, 0, 0));
  let b = new Date(Date.UTC(d2.ano, d2.mes - 1, d2.dia, 3, 0, 0));
  if (a > b) { const t = a; a = b; b = t; }
  return { start: a, end: new Date(b.getTime() + 24 * 60 * 60 * 1000) }; // dia final inclusivo
}
function rotuloDatas(d1, d2) {
  const f = (d) => `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}`;
  const mesmoDia = d1.ano === d2.ano && d1.mes === d2.mes && d1.dia === d2.dia;
  return mesmoDia ? `de ${f(d1)}` : `de ${f(d1)} a ${f(d2)}`;
}
async function ultimoPreAgendamento() {
  const { data, error } = await supabase.from("preagendamentos")
    .select("*").order("created_at", { ascending: false }).limit(1);
  if (error) { capturaErroPreAgenda(error, "último"); return null; }
  return (data && data[0]) || null;
}

// Interpreta e responde uma consulta de pré-agendamento vinda de um número admin.
// Retorna true se tratou a mensagem (e já respondeu), false para deixar o fluxo
// normal da Ana seguir. Só age quando o texto é claramente sobre pré-agendamento.
async function handleAdminConsultaPreAgenda(from, text) {
  const norm = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Termo específico do recurso ("pré-agendamento") vs. palavra genérica
  // ("agendamento"), que um número admin pode usar em conversa normal.
  const topicoEspecifico = /pre-?agenda|preagenda/.test(norm);
  const topicoGenerico = /agendament/.test(norm);
  if (!topicoEspecifico && !topicoGenerico) return false;
  const erroTabela = () => `Não consegui consultar os pré-agendamentos agora.${ultimoErroPreAgenda ? `\n[detalhe técnico: ${ultimoErroPreAgenda}]` : ""}\n(Confira se a migração sql/preagendamentos.sql já foi aplicada no Supabase — e se é o mesmo projeto do SUPABASE_URL.)`;
  const periodo = /\bhoje\b/.test(norm) ? "hoje"
    : /\bontem\b/.test(norm) ? "ontem"
    : /semana|7 ?dias|ultimos dias/.test(norm) ? "semana"
    : /\bm[eê]s\b|mensal|30 ?dias/.test(norm) ? "mes"
    : null;

  // Período por DATAS específicas: ex. "01/07 a 10/07", "de 1/7 até 10/7" ou só
  // "05/07" (um dia). Tem prioridade sobre os presets. Uma data → aquele dia;
  // duas → intervalo inclusivo. Verbo "quant..." conta; senão lista todos.
  const datas = [...norm.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)].map(parseDataBR).filter(Boolean);
  if (datas.length) {
    const d1 = datas[0], d2 = datas[1] || datas[0];
    const bounds = boundsDeDatas(d1, d2);
    const rotulo = rotuloDatas(d1, d2);
    if (/quant/.test(norm)) {
      const n = await contarPreAgendamentosBounds(bounds);
      if (n === null) { await sendWhatsApp(from, erroTabela()); return true; }
      await sendWhatsApp(from, `📊 Pré-agendamentos ${rotulo}: *${n}*.`);
      return true;
    }
    const rows = await listarPreAgendamentosBounds(bounds, 200);
    if (rows === null) { await sendWhatsApp(from, erroTabela()); return true; }
    if (!rows.length) { await sendWhatsApp(from, `Nenhum pré-agendamento ${rotulo}.`); return true; }
    const linhas = rows.map((r, i) => `*${i + 1}.* ${fmtDataHoraBR(r.created_at)} — ${r.nome || "—"} / ${(r.telefone && r.telefone !== "-") ? r.telefone : (r.patient_phone || "—")} · ${r.unidade || "—"} · ${r.periodo || "—"}${extrasPreAgenda(r)}`).join("\n");
    await sendWhatsApp(from, `📋 Pré-agendamentos ${rotulo} (${rows.length}):\n${linhas}`);
    return true;
  }

  // Enviar/mostrar o ÚLTIMO pré-agendamento.
  if (/\bultim|\blast\b/.test(norm)) {
    const row = await ultimoPreAgendamento();
    if (row === null) { await sendWhatsApp(from, erroTabela()); return true; }
    if (!row) { await sendWhatsApp(from, "Ainda não há nenhum pré-agendamento registrado."); return true; }
    await sendWhatsApp(from, `📋 *Último pré-agendamento* (${fmtDataHoraBR(row.created_at)}):\n${formatarPreAgendamento(row)}`);
    return true;
  }
  // CONTAR pré-agendamentos de um período.
  if (/quant/.test(norm)) {
    const p = periodo || "hoje";
    const n = await contarPreAgendamentos(p);
    if (n === null) { await sendWhatsApp(from, erroTabela()); return true; }
    await sendWhatsApp(from, `📊 Pré-agendamentos ${rotuloPeriodo(p)}: *${n}*.`);
    return true;
  }
  // LISTAR / enviar os pré-agendamentos de um período. Verbos genéricos (mandar/
  // enviar/mostrar/passar) só disparam a lista quando há também um período citado,
  // para não capturar conversa normal de um número admin.
  if (/\b(list|listar|quais|todos|todas|relac|relatori)/.test(norm) || (/mand|envi|mostr|passa/.test(norm) && periodo)) {
    const p = periodo || "hoje";
    const rows = await listarPreAgendamentos(p);
    if (rows === null) { await sendWhatsApp(from, erroTabela()); return true; }
    if (!rows.length) { await sendWhatsApp(from, `Nenhum pré-agendamento ${rotuloPeriodo(p)}.`); return true; }
    const linhas = rows.map((r, i) => `*${i + 1}.* ${fmtHoraBR(r.created_at)} — ${r.nome || "—"} / ${(r.telefone && r.telefone !== "-") ? r.telefone : (r.patient_phone || "—")} · ${r.unidade || "—"} · ${r.periodo || "—"}${extrasPreAgenda(r)}`).join("\n");
    await sendWhatsApp(from, `📋 Pré-agendamentos ${rotuloPeriodo(p)} (${rows.length}):\n${linhas}`);
    return true;
  }
  // Sem intenção reconhecida: só mostra o menu de ajuda quando a pessoa usou o
  // termo específico "pré-agendamento" (claramente querendo o recurso admin). Se
  // foi só a palavra genérica "agendamento", devolve o controle à Ana normal.
  if (!topicoEspecifico) return false;
  await sendWhatsApp(from, `Posso te ajudar com os pré-agendamentos 😊 Você pode pedir, por exemplo:\n• "quantos pré-agendamentos hoje?"\n• "enviar o último pré-agendamento"\n• "listar pré-agendamentos de hoje"\n• "pré-agendamentos de 01/07 a 10/07" (período específico)\n(também aceito "ontem", "semana" e "mês")`);
  return true;
}

// ── Resumo diário de pré-agendamentos → secretária (fim do expediente) ────────
// Hora do envio configurável via RESUMO_DIARIO_HORA (0–23, padrão 19h Brasília);
// use RESUMO_DIARIO_HORA=off para desligar. Vai por espelharParaSecretaria, então
// usa o template aprovado se a janela de 24h estiver fechada.
const RESUMO_DIARIO_HORA = (() => {
  const raw = String(process.env.RESUMO_DIARIO_HORA ?? "19").trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0off") return null;
  const h = parseInt(raw, 10);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 19;
})();

async function enviarResumoDiarioPreAgenda() {
  const n = await contarPreAgendamentos("hoje");
  if (n === null) { console.error("[ResumoDiário] Consulta falhou (migração aplicada?) — resumo não enviado."); return false; }
  const hoje = brasiliaAgora().hoje; // ex.: "sexta-feira, 04/07/2026"
  if (!n) {
    await espelharParaSecretaria("[ResumoDiário]", `🌙 *Resumo do dia — pré-agendamentos*\n${hoje}\n\nHoje não houve pré-agendamentos registrados pela Ana.`);
    return true;
  }
  const rows = (await listarPreAgendamentos("hoje", 50)) || [];
  const linhas = rows.map((r, i) => `*${i + 1}.* ${fmtHoraBR(r.created_at)} — ${r.nome || "—"} / ${(r.telefone && r.telefone !== "-") ? r.telefone : (r.patient_phone || "—")} · ${r.unidade || "—"} · ${r.periodo || "—"}${extrasPreAgenda(r)}`).join("\n");
  const extra = n > rows.length ? `\n… e mais ${n - rows.length}.` : "";
  await espelharParaSecretaria("[ResumoDiário]", `🌙 *Resumo do dia — pré-agendamentos*\n${hoje}\n\nHoje houve *${n}* pré-agendamento(s):\n${linhas}${extra}`);
  return true;
}

// Verifica a cada 30 min; dispara uma vez por dia a partir da hora configurada.
// Persiste a data do último envio em settings (preagenda_last_report) para não
// duplicar em reinícios do Render.
function startResumoDiarioScheduler() {
  if (RESUMO_DIARIO_HORA === null) { console.log("[ResumoDiário] Desativado (RESUMO_DIARIO_HORA=off)."); return; }
  const check = async () => {
    try {
      const nowBr = new Date(new Date().toLocaleString("en-US", { timeZone: TZ_BR }));
      if (nowBr.getHours() < RESUMO_DIARIO_HORA) return;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ_BR }); // YYYY-MM-DD (BR)
      const { data } = await supabase.from("settings").select("value").eq("key", "preagenda_last_report").single();
      if (data?.value === today) return;
      console.log("[ResumoDiário] Disparando resumo diário de pré-agendamentos...");
      const ok = await enviarResumoDiarioPreAgenda();
      if (ok) await supabase.from("settings").upsert({ key: "preagenda_last_report", value: today });
    } catch (e) {
      console.error("[ResumoDiário] Scheduler:", e.message);
    }
  };
  setInterval(check, 30 * 60 * 1000);
  check(); // checa uma vez no startup (recupera o envio se o servidor reiniciou)
  console.log(`[ResumoDiário] Agendador ativo (diário às ${RESUMO_DIARIO_HORA}h ${TZ_BR}) → secretária ${WA_SECRETARIA_NUMBER}.`);
}

// Extrai o bloco técnico [RECADO]...[/RECADO] que a Ana anexa ao encaminhar algo
// para a equipe humana (dúvida, urgência, pedido de contato). Devolve
// { limpo, recado } — `limpo` é a mensagem SEM o bloco (o que o paciente vê) e
// `recado` é { tipo, resumo, prioritario } ou null se não houver bloco.
function extrairRecado(reply) {
  const re = /\[RECADO\]([\s\S]*?)\[\/RECADO\]/i;
  let inner, limpo;
  const m = reply.match(re);
  if (m) {
    inner = m[1];
    limpo = reply.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    // Salvaguarda: bloco sem tag de fechamento — remove da abertura até o fim,
    // para o marcador técnico NUNCA vazar para o paciente.
    const mo = reply.match(/\[RECADO\]([\s\S]*)$/i);
    if (!mo) return { limpo: reply, recado: null };
    inner = mo[1];
    limpo = reply.slice(0, mo.index).replace(/\n{3,}/g, "\n\n").trim();
  }
  const campos = {};
  // Aceita pares separados por "|" ou por quebra de linha, com ":" ou "=".
  for (const par of inner.replace(/\n/g, " | ").split("|")) {
    let idx = par.indexOf(":");
    const eq = par.indexOf("=");
    if (idx === -1 || (eq !== -1 && eq < idx)) idx = eq;
    if (idx === -1) continue;
    const chave = par.slice(0, idx).trim().toLowerCase().replace(/^-+\s*/, "");
    const valor = par.slice(idx + 1).trim();
    if (chave && valor) campos[chave] = valor;
  }
  if (!campos.tipo && !campos.resumo) return { limpo, recado: null };
  const prioritario = /^s(im)?$/i.test(campos.prioritario || "") || /urg[êe]nci/i.test(campos.tipo || "");
  return { limpo, recado: { tipo: campos.tipo || "recado", resumo: campos.resumo || "", prioritario } };
}

// Envia à secretária um recado quando a Ana encaminha algo para a equipe humana.
// Mesma salvaguarda de 24h da notificarSecretaria: se o envio livre falhar,
// espelha para o número da clínica. NUNCA lança.
async function notificarRecadoEquipe(recado, patient, from) {
  if (!recado) return;
  const nome = patient?.name || "—";
  const tel = patient?.phone || from || "—";
  const topo = recado.prioritario ? "⚠️ *PRIORITÁRIO*\n" : "";
  const texto = `${topo}🔔 *RECADO PARA A EQUIPE*\nTipo: ${recado.tipo}\nPaciente: ${nome} / ${tel}\nResumo: ${recado.resumo || "—"}`;
  await espelharParaSecretaria(`[Recado ${recado.tipo}${recado.prioritario ? "/PRIORITÁRIO" : ""}]`, texto);
}

// ===== Comando admin de envio: "#ENVIAR <numero>: <intenção>" (ou "#MSG ...") =====
// Rótulo do autor gravado no histórico do painel para mensagens disparadas por um
// número ADMIN (o médico/equipe pelo WhatsApp), distinto das secretárias.
const ADMIN_SEND_AUTOR = "Dr. Bruno (WhatsApp)";

// A Ana redige, no tom dela, a mensagem que cumpre EXATAMENTE a intenção do admin,
// sem inventar nada além do pedido. Devolve o texto final, ou null se a IA falhar
// (nunca enviamos texto malformado ao paciente).
async function redigirMensagemAdmin(intent, patient) {
  const ctxNome = patient?.name ? ` O paciente se chama ${patient.name} — pode usar o primeiro nome se ficar natural.` : "";
  const sys = `${SYSTEM_PROMPT}

### Tarefa especial: redigir uma mensagem a pedido da equipe/médico
A equipe pediu que você envie uma mensagem a este paciente pelo WhatsApp. Escreva SOMENTE o texto final da mensagem para o paciente, no seu tom acolhedor de sempre, cumprindo EXATAMENTE a intenção abaixo.
Regras rígidas:
- NÃO invente nada além do que foi pedido: não crie datas, horários, valores, unidades, convênios ou informações que não estejam explícitas na intenção.
- NÃO faça perguntas à equipe nem comente a tarefa. Não use marcadores nem aspas.
- Responda APENAS com o texto da mensagem, pronto para enviar.${ctxNome}

Intenção da equipe: ${intent}`;
  try {
    const r = await anthropicMessages({ model: "claude-sonnet-4-6", max_tokens: 500, system: sys, messages: [{ role: "user", content: "Escreva agora a mensagem para o paciente." }] });
    const t = r.data?.content?.[0]?.text?.trim();
    return t || null;
  } catch (e) {
    console.error("[AdminEnviar] Falha ao redigir com IA:", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
    return null;
  }
}

// Trata o comando de envio vindo de um número ADMIN. `rest` é o que vem depois do
// prefixo (#ENVIAR/#MSG). Formato: "<numero>: <intenção>" (aceita também
// "<numero> <intenção>"). Exige SEMPRE o número — nunca adivinha o paciente.
async function handleAdminSend(adminFrom, rest) {
  const raw = String(rest || "").trim();
  let numPart, intent;
  const colon = raw.indexOf(":");
  if (colon !== -1) {
    numPart = raw.slice(0, colon);
    intent = raw.slice(colon + 1).trim();
  } else {
    const m = raw.match(/^(\S+)\s+([\s\S]+)$/);
    if (m) { numPart = m[1]; intent = m[2].trim(); }
    else { numPart = raw; intent = ""; }
  }
  const phone = normalizePhoneBR(numPart);
  if (!phone) {
    await sendWhatsApp(adminFrom, "⚠️ Não identifiquei o número do paciente. Use:\n*#ENVIAR 5561999999999: sua instrução*\n\nSempre informe o número — eu não escolho o paciente por referência, para nunca enviar ao destinatário errado.");
    return;
  }
  if (!intent) {
    await sendWhatsApp(adminFrom, `⚠️ Faltou a instrução da mensagem. Use:\n*#ENVIAR ${phone}: o que devo dizer ao paciente*`);
    return;
  }

  // Paciente + conversa (para registrar no histórico do painel).
  const patient = await getOrCreatePatient(phone);
  const conversation = patient ? await getOrCreateConversation(patient.id) : null;

  // Janela de 24h da Meta: fora dela, só template aprovado.
  const inboundAt = await lastInboundAt(phone);
  const within24h = inboundAt && (Date.now() - inboundAt) < 24 * 60 * 60 * 1000;
  if (!within24h) {
    const templateName = readEnv("WA_TEMPLATE_NAME");
    const templateLang = readEnv("WA_TEMPLATE_LANG") || "pt_BR";
    if (templateName) {
      try {
        await sendWhatsAppTemplate(phone, templateName, templateLang, [patient?.name || "tudo bem"]);
        if (conversation) await saveMessage(conversation.id, "human", `[Template de reconexão "${templateName}" enviado por comando do Dr./admin]`, null, null, ADMIN_SEND_AUTOR);
        await sendWhatsApp(adminFrom, `⚠️ ${phone} está fora da janela de 24h da Meta — não dá para enviar sua mensagem livre agora.\nEnviei o template aprovado "${templateName}" para reabrir a conversa. Assim que o paciente responder, mande de novo seu *#ENVIAR* que eu entrego a mensagem no tom certo.`);
      } catch (e) {
        console.error("[AdminEnviar] Falha ao enviar template:", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
        await sendWhatsApp(adminFrom, `⚠️ ${phone} está fora da janela de 24h e falhei ao enviar o template "${templateName}". Confira se ele está APROVADO na Meta e se WA_TEMPLATE_NAME está correto.`);
      }
    } else {
      await sendWhatsApp(adminFrom, `⚠️ ${phone} está fora da janela de 24h da Meta (esse paciente não te manda mensagem há mais de 24h), então só consigo enviar por *template aprovado* — e nenhum está configurado.\n\nComo resolver:\n1) No WhatsApp Manager (Meta) crie um template, categoria *Utilidade*, idioma *pt_BR*. Sugestão de confirmação de horário com variáveis:\n   "Olá {{1}}! Passando para confirmar sua consulta em {{2}} às {{3}} na unidade {{4}}. Podemos confirmar? 😊"\n2) Após aprovado, configure no Render: *WA_TEMPLATE_NAME* = nome do template e *WA_TEMPLATE_LANG* = pt_BR.\n\nAlternativa imediata: peça ao paciente para enviar qualquer mensagem — isso reabre a janela de 24h e aí seu *#ENVIAR* funciona normalmente.`);
    }
    return;
  }

  // Dentro da janela: Ana redige no tom dela e envia ao paciente.
  const texto = await redigirMensagemAdmin(intent, patient);
  if (!texto) {
    await sendWhatsApp(adminFrom, "❌ Não consegui redigir a mensagem agora (IA indisponível). Tente novamente em instantes — não enviei nada ao paciente.");
    return;
  }
  try {
    await sendWhatsApp(phone, texto);
  } catch (e) {
    console.error("[AdminEnviar] Falha ao enviar ao paciente:", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
    await sendWhatsApp(adminFrom, `❌ Não consegui enviar para ${phone}. ${e?.response?.data?.error?.message || e.message}`);
    return;
  }
  // Registra no histórico do painel, marcada como enviada por comando do médico.
  if (conversation) await saveMessage(conversation.id, "human", texto, null, null, ADMIN_SEND_AUTOR);
  // Confirma ao admin exatamente o que foi enviado.
  await sendWhatsApp(adminFrom, `✅ Mensagem enviada para ${phone}:\n${texto}`);
}

// Limite de caracteres do corpo de texto do WhatsApp (a API rejeita > 4096).
const WA_TEXT_LIMIT = 3900;

// Envio bruto de um único texto (sem divisão).
async function sendWhatsAppRaw(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Enviar mensagem WhatsApp — divide automaticamente textos longos em partes,
// respeitando quebras de linha, para não estourar o limite da API (o que
// causaria falha silenciosa em respostas grandes).
async function sendWhatsApp(to, body) {
  const text = String(body ?? "").trim();
  if (!text) return;
  if (text.length <= WA_TEXT_LIMIT) { await sendWhatsAppRaw(to, text); return; }
  const chunks = [];
  let buf = "";
  for (let line of text.split("\n")) {
    while (line.length > WA_TEXT_LIMIT) { chunks.push(line.slice(0, WA_TEXT_LIMIT)); line = line.slice(WA_TEXT_LIMIT); }
    if ((buf ? buf.length + 1 : 0) + line.length > WA_TEXT_LIMIT) { if (buf) chunks.push(buf); buf = line; }
    else buf = buf ? buf + "\n" + line : line;
  }
  if (buf) chunks.push(buf);
  for (const c of chunks) await sendWhatsAppRaw(to, c);
}

// Health check PÚBLICO (sem auth — fora de /api de propósito) para KEEPALIVE.
// Faz um SELECT trivial no Supabase (count head em `settings`, sem trazer linhas)
// para GERAR ATIVIDADE e evitar o auto-pause do plano free (pausa após 7 dias sem
// atividade) — e, de quebra, mantém o serviço do Render acordado. Um pinger externo
// (ex.: cron-job.org / UptimeRobot a cada ~10 min) deve bater aqui. NÃO expõe dado
// sensível: devolve só ok/latência. Responde a GET e HEAD (Express roteia HEAD ao
// handler de GET). 503 se o banco não responder — sinal útil para o próprio pinger.
app.get("/health", async (req, res) => {
  const t0 = Date.now();
  try {
    const { error } = await supabase.from("settings").select("key", { count: "exact", head: true });
    const ms = Date.now() - t0;
    if (error) {
      console.error("[Health] Banco indisponível:", error.message);
      return res.status(503).json({ ok: false, db: false, ms });
    }
    res.json({ ok: true, db: true, ms });
  } catch (e) {
    console.error("[Health] Exceção:", e.message);
    res.status(503).json({ ok: false, db: false, error: e.message });
  }
});

// Webhook verification
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Webhook principal
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    // Ignora reentregas do mesmo evento (evita resposta duplicada)
    if (alreadyProcessed(msg.id)) { console.log("[Ana] Mensagem duplicada ignorada:", msg.id); return; }

    const from = msg.from;
    // Click-to-WhatsApp: quando o paciente vem de um ANÚNCIO (Instagram/Facebook),
    // a Meta envia aqui um objeto `referral` com o TÍTULO/DESCRIÇÃO do anúncio —
    // mesmo que a mensagem dele seja genérica ("posso ter mais informações sobre
    // isso?"). É assim que a Ana descobre o tema do anúncio (ela NÃO vê a imagem/vídeo).
    const referral = msg.referral || null;
    if (referral) console.log("[Ana][Anúncio] Click-to-WhatsApp:", JSON.stringify({ source_type: referral.source_type, source_id: referral.source_id, headline: referral.headline, body: referral.body }));
    let text = "";
    let mediaNotification = "";
    let media = null; // { path, type, name } do anexo salvo no Storage, se houver

    // Processar tipo de mensagem
    if (msg.type === "text") {
      text = msg.text.body.trim();
    } else if (msg.type === "audio") {
      console.log("Áudio recebido, transcrevendo...");
      const dl = await downloadMedia(msg.audio.id);
      if (dl) {
        // guarda o áudio para a secretária poder ouvir no painel...
        media = await storeInboundMedia(dl.buffer, dl.mimeType, `audio.${extFromMime(dl.mimeType)}`);
        // ...e mantém a transcrição automática (Whisper) que já funcionava
        const transcricao = await transcribeAudio(dl.buffer, dl.mimeType);
        if (transcricao) {
          text = `[Áudio transcrito]: ${transcricao}`;
          console.log("Transcrição:", transcricao);
        } else {
          text = "[Áudio recebido - não foi possível transcrever]";
        }
      }
    } else if (msg.type === "image") {
      const dl = await downloadMedia(msg.image.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, `imagem.${extFromMime(dl.mimeType)}`);
      text = msg.image?.caption ? `[Imagem recebida]: ${msg.image.caption}` : "[Imagem recebida]";
      mediaNotification = "📷 Paciente enviou uma imagem";
    } else if (msg.type === "document") {
      const filename = msg.document?.filename || "documento";
      const dl = await downloadMedia(msg.document.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, filename);
      text = `[Documento recebido: ${filename}]`;
      mediaNotification = `📄 Paciente enviou um documento: ${filename}`;
    } else if (msg.type === "video") {
      const dl = await downloadMedia(msg.video.id);
      if (dl) media = await storeInboundMedia(dl.buffer, dl.mimeType, `video.${extFromMime(dl.mimeType)}`);
      text = msg.video?.caption ? `[Vídeo recebido]: ${msg.video.caption}` : "[Vídeo recebido]";
      mediaNotification = "🎥 Paciente enviou um vídeo";
    } else {
      return; // Ignorar outros tipos
    }

    console.log("Mensagem de:", from, "| Tipo:", msg.type, "| Texto:", text);

    // Sem texto utilizável (ex.: áudio não baixado/transcrito) → orienta o paciente
    if (!text || !text.trim()) {
      console.error("[Ana] Mensagem sem texto utilizável (tipo:", msg.type + ")");
      await sendWhatsApp(from, "Não consegui ler sua mensagem 😊 Pode me escrever por texto, por favor?").catch(e => console.error("[Ana] Falha ao pedir reenvio:", e.message));
      return;
    }

    // Captura o token de origem de anúncio (landing → WhatsApp) e remove do texto
    let refToken = null;
    const refMatch = text.match(/\[ref:([A-Za-z0-9]+)\]/i);
    if (refMatch) {
      refToken = refMatch[1].toUpperCase();
      text = text.replace(/\s*\[ref:[A-Za-z0-9]+\]\s*/i, " ").trim();
      if (!text) text = "Olá!";
    }

    // Comandos admin
    if (NUMEROS_ADMIN.includes(from)) {
      if (text === "#ANA OFF") {
        anaAtiva = false;
        await supabase.from("settings").upsert({ key: "ai_enabled", value: "false" });
        await sendWhatsApp(from, "✅ Ana desativada.");
        return;
      }
      if (text === "#ANA ON") {
        anaAtiva = true;
        await supabase.from("settings").upsert({ key: "ai_enabled", value: "true" });
        await sendWhatsApp(from, "✅ Ana ativada.");
        return;
      }
      if (text === "#ANA STATUS") {
        await sendWhatsApp(from, `ℹ️ Ana está ${anaAtiva ? "✅ ATIVA" : "❌ DESATIVADA"}.`);
        return;
      }
      // Tráfego real de pacientes (mensagens recebidas) — responde pelo WhatsApp,
      // sem precisar do painel. Se você recebeu ESTA resposta, o webhook está
      // funcionando; se os números vierem zerados, ninguém está escrevendo para a Ana.
      if (text === "#TRAFEGO" || text === "#TRÁFEGO") {
        try {
          const t = await coletarTrafego();
          const j = t.janelas;
          const u = t.ultima_mensagem_paciente;
          const ult = !u ? "nenhuma registrada"
            : u.ha_horas < 48 ? `há ${u.ha_horas}h`
            : `há ${Math.round(u.ha_horas / 24)} dia(s)`;
          const alerta = t.semTrafego48h
            ? "\n\n⚠️ ZERO mensagens de pacientes em 48h. Se você recebeu esta resposta, o webhook funciona — então provavelmente ninguém está escrevendo para a Ana (número divulgado? campanhas ativas?)."
            : "";
          await sendWhatsApp(from, `📈 *Mensagens recebidas de pacientes*\n• 24h: ${j["24h"].pacienteToAna}\n• 48h: ${j["48h"].pacienteToAna}\n• 7 dias: ${j["7d"].pacienteToAna}\n• Última: ${ult}${alerta}`);
        } catch (e) {
          await sendWhatsApp(from, "⚠️ Não consegui consultar o tráfego agora: " + e.message);
        }
        return;
      }
      // Origem dos pacientes: quantas CONVERSAS vieram de ANÚNCIO (têm ad_click com
      // origem rastreada) vs. orgânico, e quantas de anúncio viraram pré-agendamento.
      // Mostra o peso real dos anúncios no movimento total. Aproximado: conta por
      // conversa distinta vinculada a clique no período (janela por clicked_at).
      if (text === "#ORIGEM" || text === "#ORIGENS") {
        try {
          const now = Date.now(), D = 24 * 60 * 60 * 1000;
          const iso = (msAgo) => new Date(now - msAgo).toISOString();
          let msg = "🧭 *Origem dos pacientes* (conversas iniciadas)";
          for (const [label, msAgo] of [["7 dias", 7 * D], ["30 dias", 30 * D]]) {
            const { count: total } = await supabase.from("conversations")
              .select("*", { count: "exact", head: true }).gte("started_at", iso(msAgo));
            const { data: adRows } = await supabase.from("ad_clicks")
              .select("conversation_id, booked").gte("clicked_at", iso(msAgo)).not("conversation_id", "is", null);
            const deAnuncio = new Set((adRows || []).map(r => r.conversation_id)).size;
            const preAgend = new Set((adRows || []).filter(r => r.booked).map(r => r.conversation_id)).size;
            const tot = total || 0;
            const organico = Math.max(0, tot - deAnuncio);
            const pct = tot ? Math.round((deAnuncio / tot) * 100) : 0;
            msg += `\n\n*${label}* — ${tot} conversas\n• De anúncio: ${deAnuncio} (${pct}%) → ${preAgend} pré-agendamento(s)\n• Orgânico/indicação: ${organico}`;
          }
          msg += "\n\n_Anúncio = clique de campanha com origem rastreada; o resto é orgânico (indicação, WhatsApp direto, etc.)._";
          await sendWhatsApp(from, msg);
        } catch (e) {
          await sendWhatsApp(from, "⚠️ Não consegui consultar a origem agora: " + e.message);
        }
        return;
      }
      if (text === "#ADS" || text === "#ADS RELATORIO") {
        await sendWhatsApp(from, `📊 Gerando relatório do Google Ads (modo ${googleAds.isTestMode() ? "TESTE" : "PRODUÇÃO"})...`);
        googleAds.runWeeklyReport({ supabase, sendWhatsApp }).catch(e => console.error("[GoogleAds] Manual:", e.message));
        return;
      }
      // Envia manualmente as conversões offline pendentes ao Google Ads.
      // "#ADSCONV" envia de verdade; "#ADSCONV TESTE" faz dry-run (validate_only).
      if (text === "#ADSCONV" || text === "#ADSCONV TESTE") {
        const dry = text === "#ADSCONV TESTE";
        await sendWhatsApp(from, `📤 Enviando conversões ao Google Ads${dry ? " (DRY-RUN)" : ""}...`);
        googleAds.uploadClickConversions({ supabase, dryRun: dry })
          .then(r => sendWhatsApp(from, googleAds.buildConversionUploadSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha no upload de conversões: " + e.message));
        return;
      }
      // Cria a campanha de Refrativa via API (nasce PAUSADA). Por segurança,
      // "#CRIARREFRATIVA TESTE" faz dry-run (validate_only) e "#CRIARREFRATIVA
      // CONFIRMAR" cria de verdade — a palavra CONFIRMAR é obrigatória.
      if (/^#CRIARREFRATIVA\b/i.test(text)) {
        const arg = text.replace(/^#CRIARREFRATIVA\b/i, "").trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#CRIARREFRATIVA TESTE* (valida sem criar) ou *#CRIARREFRATIVA CONFIRMAR* (cria PAUSADA).");
          return;
        }
        const dry = arg === "TESTE";
        await sendWhatsApp(from, `🚀 ${dry ? "Validando" : "Criando"} campanha de Refrativa${dry ? " (DRY-RUN)" : " (nasce PAUSADA)"}...`);
        googleAds.createSearchCampaign({ supabase, dryRun: dry })
          .then(r => sendWhatsApp(from, googleAds.buildCampaignCreateSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao criar campanha: " + e.message));
        return;
      }
      // Cria a campanha de Ceratocone Cirúrgico (crosslinking + anel). Nasce
      // PAUSADA. "TESTE" = dry-run; "CONFIRMAR" cria. Tolerante a variações.
      const ceratoCmd = text.match(/^#CRIARCERATOCONE\b([\s\S]*)$/i);
      if (ceratoCmd) {
        const arg = ceratoCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#CRIARCERATOCONE TESTE* (valida sem criar) ou *#CRIARCERATOCONE CONFIRMAR* (cria PAUSADA).");
          return;
        }
        const dry = arg === "TESTE";
        await sendWhatsApp(from, `🟠 ${dry ? "Validando" : "Criando"} campanha de Ceratocone Cirúrgico${dry ? " (DRY-RUN)" : " (nasce PAUSADA)"}...`);
        googleAds.createSearchCampaign({ supabase, dryRun: dry, spec: googleAds.buildCeratoconeCirurgicoSpec() })
          .then(r => sendWhatsApp(from, googleAds.buildCampaignCreateSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao criar campanha: " + e.message));
        return;
      }
      // Pausa a campanha combinada antiga de ceratocone/esclerais (alvo por env).
      // "TESTE" = dry-run; "CONFIRMAR" pausa de verdade.
      const pausarCmd = text.match(/^#PAUSARCERATOCONE\b([\s\S]*)$/i);
      if (pausarCmd) {
        const arg = pausarCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#PAUSARCERATOCONE TESTE* (prévia) ou *#PAUSARCERATOCONE CONFIRMAR* (pausa a campanha antiga combinada).");
          return;
        }
        const dry = arg === "TESTE";
        const alvo = process.env.GOOGLE_ADS_CERATOCONE_OLD || "[SEARCH] Ceratocone e Esclerais";
        await sendWhatsApp(from, `🎚️ ${dry ? "Validando pausa" : "Pausando"} "${alvo}"${dry ? " (DRY-RUN)" : ""}...`);
        googleAds.setCampaignStatusByName({ supabase, name: alvo, status: 3, dryRun: dry })
          .then(r => sendWhatsApp(from, googleAds.buildStatusSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao pausar: " + e.message));
        return;
      }
      // Cria a campanha de Lentes Esclerais (nasce PAUSADA). "TESTE" = dry-run,
      // "CONFIRMAR" cria. Tolerante a #CRIARESCLERAL / #CRIARESCLERAIS.
      const esclCmd = text.match(/^#CRIARESCLERA(?:L|IS)?\b([\s\S]*)$/i);
      if (esclCmd) {
        const arg = esclCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#CRIARESCLERAL TESTE* (valida sem criar) ou *#CRIARESCLERAL CONFIRMAR* (cria PAUSADA).");
          return;
        }
        const dry = arg === "TESTE";
        await sendWhatsApp(from, `🔵 ${dry ? "Validando" : "Criando"} campanha de Lentes Esclerais${dry ? " (DRY-RUN)" : " (nasce PAUSADA)"}...`);
        googleAds.createSearchCampaign({ supabase, dryRun: dry, spec: googleAds.buildEscleralSpec() })
          .then(r => sendWhatsApp(from, googleAds.buildCampaignCreateSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao criar campanha: " + e.message));
        return;
      }
      // Cria a campanha COMBINADA Ceratocone + Esclerais (nasce PAUSADA). Reúne as
      // duas que estavam separadas. "TESTE" = dry-run; "CONFIRMAR" cria.
      const combCmd = text.match(/^#CRIARCOMBINADA\b([\s\S]*)$/i);
      if (combCmd) {
        const arg = combCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#CRIARCOMBINADA TESTE* (valida sem criar) ou *#CRIARCOMBINADA CONFIRMAR* (cria PAUSADA a campanha Ceratocone + Esclerais).");
          return;
        }
        const dry = arg === "TESTE";
        await sendWhatsApp(from, `🟣 ${dry ? "Validando" : "Criando"} campanha combinada Ceratocone + Esclerais${dry ? " (DRY-RUN)" : " (nasce PAUSADA)"}...`);
        googleAds.createSearchCampaign({ supabase, dryRun: dry, spec: googleAds.buildCeratoconeEscleralSpec() })
          .then(r => sendWhatsApp(from, googleAds.buildCampaignCreateSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao criar campanha: " + e.message));
        return;
      }
      // Pausa AS DUAS campanhas separadas (Lentes Esclerais + Ceratocone Cirúrgico)
      // quando a combinada assume. "TESTE" = prévia; "CONFIRMAR" pausa de verdade.
      const pausarSepCmd = text.match(/^#PAUSARSEPARADAS\b([\s\S]*)$/i);
      if (pausarSepCmd) {
        const arg = pausarSepCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#PAUSARSEPARADAS TESTE* (prévia) ou *#PAUSARSEPARADAS CONFIRMAR* (pausa as campanhas Lentes Esclerais e Ceratocone Cirúrgico).");
          return;
        }
        const dry = arg === "TESTE";
        const alvos = [
          process.env.GOOGLE_ADS_ESCLERAL_NAME || "IOBB | Lentes Esclerais",
          process.env.GOOGLE_ADS_CERATOCONE_NAME || "IOBB | Ceratocone Cirúrgico",
        ];
        await sendWhatsApp(from, `🎚️ ${dry ? "Validando pausa" : "Pausando"} as separadas: ${alvos.join(" + ")}${dry ? " (DRY-RUN)" : ""}...`);
        googleAds.setCampaignStatusByName({ supabase, names: alvos, status: 3, dryRun: dry })
          .then(r => sendWhatsApp(from, googleAds.buildStatusSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao pausar: " + e.message));
        return;
      }
      // Aproveita o histórico das campanhas antigas de refrativa: minera os
      // termos de pesquisa e adiciona palavras-chave vencedoras + negativas de
      // desperdício na campanha nova. "TESTE" = prévia (dry-run); "CONFIRMAR"
      // aplica. Tolerante a #ADSHIST / #ADSHISTORICO.
      const histCmd = text.match(/^#ADSHIST(?:ORICO)?\b([\s\S]*)$/i);
      if (histCmd) {
        const arg = histCmd[1].trim().toUpperCase();
        if (arg !== "TESTE" && arg !== "CONFIRMAR") {
          await sendWhatsApp(from, "Uso: *#ADSHISTORICO TESTE* (prévia) ou *#ADSHISTORICO CONFIRMAR* (aplica na campanha nova).");
          return;
        }
        const dry = arg === "TESTE";
        await sendWhatsApp(from, `📈 ${dry ? "Analisando" : "Aplicando"} histórico da refrativa${dry ? " (prévia)" : ""}...`);
        googleAds.applyHistoricalInsights({ supabase, dryRun: dry })
          .then(r => sendWhatsApp(from, googleAds.buildHistoricoSummary(r)))
          .catch(e => sendWhatsApp(from, "⚠️ Falha ao aproveitar histórico: " + e.message));
        return;
      }
      // Envio a um paciente por comando do admin: "#ENVIAR <num>: <intenção>" ou
      // "#MSG <num>: <intenção>". \b evita casar com outros comandos.
      const sendCmd = text.match(/^#(?:ENVIAR|MSG)\b([\s\S]*)$/i);
      if (sendCmd) {
        await handleAdminSend(from, sendCmd[1]);
        return;
      }
      // Consultas de pré-agendamento em linguagem natural ("quantos pré-agendamentos
      // hoje?", "enviar o último pré-agendamento", "listar de hoje"). Só intercepta
      // quando o texto é claramente sobre pré-agendamento; senão, segue o fluxo normal.
      if (await handleAdminConsultaPreAgenda(from, text)) return;
    }

    // Salvar no banco
    const patient = await getOrCreatePatient(from);
    if (!patient) {
      console.error("[Ana] Não foi possível obter/criar o paciente:", from);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha no fallback:", e.message));
      return;
    }
    const conversation = await getOrCreateConversation(patient.id);
    if (!conversation) {
      console.error("[Ana] Não foi possível obter/criar a conversa do paciente:", patient.id);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha no fallback:", e.message));
      return;
    }
    await saveMessage(conversation.id, "user", text, msg.id, media);

    // Vincula o clique de anúncio (se veio da landing) ao paciente/conversa
    if (refToken) await vincularClique(refToken, from, conversation.id);

    // Verificar se conversa está com humano
    if (conversation.status === "human") {
      const notif = mediaNotification || `👤 *Paciente ${patient.name || from}:*\n${text}`;
      await notificarClinica(notif);
      return;
    }

    // Se Ana desativada, não responde — EXCEÇÃO: conversas de campanhas "sempre
    // ativa" (ex.: refrativa) continuam sendo atendidas pela Ana mesmo com #ANA OFF.
    // (O "assumir" humano por conversa, acima, continua tendo prioridade.)
    if (!anaAtiva) {
      const sempreAtiva = await conversaSempreAtiva(conversation.id);
      if (!sempreAtiva) {
        if (mediaNotification) await notificarClinica(`👤 *${patient.name || from}:*\n${mediaNotification}`);
        return;
      }
      console.log(`[Ana] Global OFF, mas conversa ${conversation.id} é de campanha sempre-ativa — respondendo.`);
    }

    // Para imagens/documentos/vídeos: por padrão a Ana só acusa o recebimento e
    // encaminha à equipe. EXCEÇÃO: se ela acabou de pedir a carteirinha (fluxo
    // Unimed) e o paciente responde com uma FOTO, não dead-enda — a equipe é
    // notificada e o atendimento SEGUE para a Ana concluir o pré-agendamento.
    let fotoDeCarteirinha = false;
    if (msg.type === "image" || msg.type === "document" || msg.type === "video") {
      if (msg.type === "image") {
        try {
          const recent = await getConversationMessages(conversation.id);
          const ultimaAna = recent.filter(m => m.role === "assistant").slice(-1).map(m => (m.content || "").toLowerCase()).join(" ");
          fotoDeCarteirinha = /carteirinha|carteira do conv|unimed/.test(ultimaAna);
        } catch (_) {}
      }
      if (!fotoDeCarteirinha) {
        const tipoArquivo = msg.type === "image" ? "imagem" : msg.type === "document" ? "documento" : "vídeo";
        const reply = `Recebi ${tipoArquivo === "imagem" ? "a" : "o"} ${tipoArquivo}! 😊 Vou encaminhar para nossa equipe verificar. Assim que abrir o atendimento — segunda a sexta, das 8h às 18h — elas entram em contato com você. Posso ajudar com mais alguma coisa?`;
        await sendWhatsApp(from, reply);
        await saveMessage(conversation.id, "assistant", reply);
        await notificarClinica(`👤 *${patient.name || from}:*\n${mediaNotification}\n\n🤖 *Ana:*\n${reply}`);
        return;
      }
      // Provável carteirinha: notifica a equipe (que recebe a imagem) e NÃO retorna
      // — cai no fluxo normal, com uma orientação extra no prompt (ver adiante).
      await notificarClinica(`👤 *${patient.name || from}:*\n${mediaNotification} (provável carteirinha — a Ana segue o pré-agendamento)`);
    }

    // Buscar histórico do banco
    const history = await getConversationMessages(conversation.id);
    const messages = history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    // Detectar nome do paciente nas mensagens
    const nameMatch = text.match(/(?:me chamo|meu nome é|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
    if (nameMatch) await updatePatientName(from, nameMatch[1]);

    // Ancora a data/hora atual (Brasília) no prompt — sem isto a Ana "chuta" o
    // dia da semana e erra "hoje/amanhã".
    const dt = brasiliaAgora();
    console.log(`[Data] Agora (Brasília): ${dt.agora} | hoje = ${dt.hojeDow}, ${dt.hoje} | amanhã = ${dt.amanhaDow}, ${dt.amanha}`);
    let systemPrompt = SYSTEM_PROMPT + `\n\n### Data e hora de agora (fuso de Brasília — use SEMPRE isto)\n- Agora: ${dt.agora}.\n- HOJE é ${dt.hoje}.\n- AMANHÃ é ${dt.amanha}.\nSempre calcule "hoje", "amanhã", datas e dia da semana a partir daqui (America/Sao_Paulo). Nunca use outra referência de data.`;

    // Anúncio (Click-to-WhatsApp): injeta o contexto do anúncio para a Ana abrir
    // DIRETO no tema, mesmo com mensagem genérica. A Meta só envia o referral na
    // 1ª mensagem da conversa (início vindo do anúncio).
    if (referral && (referral.headline || referral.body || referral.source_url)) {
      systemPrompt += `\n\n### Esta conversa começou por um ANÚNCIO (Click-to-WhatsApp — provavelmente Instagram/Facebook)\nA primeira mensagem do paciente pode ser genérica ("posso ter mais informações sobre isso?"). Use o contexto do anúncio abaixo para descobrir o TEMA e abrir DIRETO nele — não cite estes campos ao paciente e NÃO pergunte "o que você busca" se der para inferir o tema.\n- Título do anúncio: ${referral.headline || "—"}\n- Descrição do anúncio: ${referral.body || "—"}\nAbra de forma cordial já falando do assunto do anúncio (ex.: se for cirurgia refrativa / TransPRK / "laser nos olhos" / "largar os óculos", fale disso já com os valores; se for ceratocone, catarata etc., idem). Só se realmente não der para inferir o tema é que você faz a pergunta de acolhimento.`;
    }

    // O paciente respondeu ao pedido de carteirinha com uma FOTO. A Ana não vê o
    // conteúdo, mas a equipe já recebeu — então ela deve considerar entregue e
    // seguir, em vez de dead-endar como faria com uma imagem qualquer.
    if (fotoDeCarteirinha) {
      systemPrompt += `\n\n### O paciente acabou de enviar uma FOTO (provável carteirinha do convênio)\nVocê havia pedido a carteirinha e ele respondeu com uma imagem. Você NÃO vê o conteúdo, mas a NOSSA EQUIPE já recebeu a foto. Considere a carteirinha ENTREGUE: agradeça, e CONTINUE/CONCLUA o pré-agendamento normalmente (registre no bloco como "carteirinha por foto"). NÃO peça a carteirinha de novo e NÃO diga apenas que "vai encaminhar" — conclua o pré-agendamento, explicando que a equipe confirma a cobertura da Unimed junto com o horário.`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 2: injeta as vagas REAIS da agenda (tabela appointments) quando há sinal
    // de agendamento. Com a lista presente, a Ana oferece UM horário e marca de
    // verdade via [AGENDAR]. Sem lista (banco fora ou sem vaga), ela cai no fluxo
    // de pré-agendamento (a equipe confirma) — ver "Como lidar com horários".
    if (detectSchedulingIntent(messages)) {
      const unidade = detectUnidade(messages);
      const slots = await fetchSlotsDB(unidade);
      // Rede de segurança: a Ana só oferece horários com pelo menos
      // ANA_ANTECEDENCIA_HORAS de antecedência (padrão 24h). O painel não filtra.
      // Se slots===null (falha ao carregar), mantém null para o ramo "indisponível".
      const minTs = Date.now() + ANA_ANTECEDENCIA_HORAS * 3600 * 1000;
      const slotsOferta = Array.isArray(slots) ? slots.filter(s => s.start.getTime() >= minTs) : slots;
      if (slotsOferta === null) {
        systemPrompt += `\n\n### Agenda temporariamente indisponível\nNão foi possível consultar a agenda agora. NÃO invente horários e NÃO diga que não há vagas. Colete a preferência (unidade + período manhã/tarde) e os dados, registre o [PREAGENDAMENTO] e explique que a equipe confirma o horário exato assim que retornar.`;
      } else if (slotsOferta.length > 0) {
        systemPrompt += `\n\n### Horários REALMENTE disponíveis (fonte: agenda oficial — só ofereça e só marque ESTES)\n${formatSlotsParaAgendar(slotsOferta)}\n\nOfereça UM por vez (em linguagem humana) e, ao paciente confirmar, anexe o bloco [AGENDAR] copiando o token [inicio:...] exato do horário escolhido.`;
      } else {
        systemPrompt += `\n\n### Sem vagas nos próximos dias\nNão há horários livres nos próximos dias para a unidade pedida. NÃO invente horário. Colete a preferência (unidade + período) e os dados, registre o [PREAGENDAMENTO] e explique que a equipe confirma o horário exato assim que retornar.`;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Chamar Ana
    // A API da Anthropic exige que o array de mensagens comece e termine com
    // role "user" (sem prefill do assistente). Garantimos isso removendo
    // quaisquer mensagens do assistente nas pontas do payload.
    //
    // Janela de 30 mensagens (antes eram 10). Uma janela de 10 cobre só ~5 turnos,
    // e a coleta do pré-agendamento (nome, telefone, unidade, convênio, motivo,
    // período) costuma passar disso: os PRIMEIROS dados informados escorregavam
    // para fora do contexto e a Ana os pedia de novo — a causa raiz do "loop" em
    // que ela confirmava um dado, avançava e depois voltava a perguntar o que já
    // tinha. Mensagens de WhatsApp são curtas, então 30 cabe bem no orçamento de
    // tokens e mantém toda a coleta visível até o fechamento.
    const apiMessages = messages.slice(-30);
    while (apiMessages.length && apiMessages[apiMessages.length - 1].role === "assistant") apiMessages.pop();
    while (apiMessages.length && apiMessages[0].role === "assistant") apiMessages.shift();
    // Salvaguarda: se nada sobrar, usar ao menos a mensagem atual do usuário.
    if (apiMessages.length === 0) apiMessages.push({ role: "user", content: text });
    let reply;
    try {
      const response = await anthropicMessages({ model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: apiMessages });
      reply = response.data?.content?.[0]?.text;
      if (!reply || !reply.trim()) throw new Error("Resposta vazia da IA");
    } catch (err) {
      console.error("[Ana] Falha na API Anthropic:", err?.response?.status || "", err?.response?.data ? JSON.stringify(err.response.data) : err.message);
      await sendWhatsApp(from, FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha ao enviar fallback:", e.message));
      await saveMessage(conversation.id, "assistant", FRIENDLY_FALLBACK).catch(e => console.error("[Ana] Falha ao salvar fallback:", e.message));
      return;
    }

    // Separar os blocos técnicos (invisíveis ao paciente) do texto que será
    // realmente enviado. `reply` nunca conterá nenhum dos blocos.
    const ag = extrairAgendar(reply);              // [AGENDAR] primeiro (agendamento REAL)
    const pre = extrairPreAgendamento(ag.limpo);   // depois [PREAGENDAMENTO] (fallback)
    const rec = extrairRecado(pre.limpo);          // por fim [RECADO], no texto já limpo
    const registros = pre.registros;
    reply = rec.limpo;
    // Log de detecção por mensagem: revela se a Ana emitiu (ou não) um bloco de
    // espelhamento. Se a Ana disse "vou encaminhar" mas isto marca "recado=nenhum",
    // o problema está no prompt/modelo, não no envio.
    console.log(`[Espelho] Detecção na resposta da Ana: agendar=${ag.registro ? "sim" : "não"}, pré-agendamento=${registros.length}, recado=${rec.recado ? rec.recado.tipo + (rec.recado.prioritario ? "/PRIORITÁRIO" : "") : "nenhum"}.`);

    // Salvar resposta (já sem o bloco técnico)
    await saveMessage(conversation.id, "assistant", reply);

    // Enviar ao paciente (se falhar, registra com detalhe — sem silêncio sem log)
    try {
      await sendWhatsApp(from, reply);
    } catch (err) {
      console.error("[Ana] Falha ao enviar resposta ao paciente:", err?.response?.data ? JSON.stringify(err.response.data) : err.message);
    }

    // Prioridade: [AGENDAR] (marca de verdade) > [PREAGENDAMENTO] (fallback) > [RECADO].
    // A Ana nunca deve emitir mais de um, mas se emitir, o agendamento real vence.
    if (ag.registro) {
      // Grava o horário confirmado. Já fecha a conversão de Ads e espelha à
      // secretária lá dentro; em corrida (vaga tomada) manda a correção ao paciente.
      await processarAgendarDaAna({ registro: ag.registro, patient, from, conversationId: conversation.id });
    }
    else if (registros.length) {
      await notificarSecretaria(registros, patient, from, conversation.id);
      // Fecha o ciclo de atribuição: se esta conversa veio de um anúncio (tem
      // ad_click/gclid vinculado), o pré-agendamento concluído VIRA conversão
      // offline no Google Ads, sem depender do clique manual no painel.
      await marcarConversaoAgendada(conversation.id);
    }
    else if (rec.recado) await notificarRecadoEquipe(rec.recado, patient, from);

    // Espelhar para clínica (isolado: notificarClinica nunca lança)
    await notificarClinica(`👤 *${patient.name || from}:*\n${text}\n\n🤖 *Ana:*\n${reply}`);

  } catch(e) {
    console.error("[Ana] Erro não tratado no webhook:", e?.response?.status || "", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
    if (e?.stack) console.error(e.stack);
  }
});

// ===== Autenticação individual do painel via Supabase Auth (LGPD) =====
// Cada secretária tem seu próprio usuário. As senhas vêm SOMENTE de env vars no
// Render (nunca do código-fonte): PANEL_PW_<NOME> ou, como fallback, PANEL_PASSWORD.
// Sem env de senha, a usuária não é criada.
const SECRETARIAS = [
  { nome: "Aline",      email: "aline@iobb.local",      pwEnv: "PANEL_PW_ALINE" },
  { nome: "Mylla",      email: "mylla@iobb.local",      pwEnv: "PANEL_PW_MYLLA" },
  { nome: "Elaine",     email: "elaine@iobb.local",     pwEnv: "PANEL_PW_ELAINE" },
  { nome: "Secretaria", email: "secretaria@iobb.local", pwEnv: "PANEL_PW_SECRETARIA" },
];

// Restaura o estado GLOBAL da Ana (settings.ai_enabled) ao subir, para que
// ligar/desligar (pelo painel ou #ANA) persista entre reinícios do Render.
(async () => {
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", "ai_enabled").maybeSingle();
    if (data && typeof data.value === "string") anaAtiva = data.value !== "false";
    console.log(`[Boot] Estado da Ana carregado de settings: ${anaAtiva ? "ATIVA" : "DESATIVADA"}.`);
  } catch (e) { console.error("[Boot] Não foi possível carregar ai_enabled:", e.message); }
})();

// Cria/atualiza as usuárias das secretárias (idempotente) usando a service key.
// A senha em env é a fonte da verdade — para trocar, altere a env e faça redeploy.
(async () => {
  try {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) { console.error("Auth listUsers:", listErr.message); return; }
    for (const s of SECRETARIAS) {
      const senha = process.env[s.pwEnv] || process.env.PANEL_PASSWORD;
      if (!senha) { console.log(`Sem senha em env para ${s.nome} — usuária não criada.`); continue; }
      const existente = list.users.find(u => u.email === s.email);
      if (!existente) {
        const { error } = await supabase.auth.admin.createUser({
          email: s.email, password: senha, email_confirm: true, user_metadata: { nome: s.nome }
        });
        console.log(error ? `Erro ao criar ${s.nome}: ${error.message}` : `Usuária ${s.nome} criada.`);
      } else {
        const { error } = await supabase.auth.admin.updateUserById(existente.id, {
          password: senha, user_metadata: { nome: s.nome }
        });
        if (error) console.error(`Erro ao atualizar ${s.nome}:`, error.message);
      }
    }
  } catch (e) {
    console.error("Erro no seeding de secretárias:", e.message);
  }
})();

// Cliente dedicado ao login (stateless — não guarda sessão no servidor)
const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Rate-limiting por IP no /api/login (defesa contra força bruta)
const LOGIN_MAX = 5, LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + LOGIN_WINDOW_MS }; loginAttempts.set(ip, rec); }
  if (rec.count >= LOGIN_MAX) {
    const min = Math.max(1, Math.ceil((rec.resetAt - now) / 60000));
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${min} min.` });
  }
  rec.count++;
  req._loginIp = ip;
  next();
}
// Limpeza periódica dos registros expirados de rate-limit
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) if (now > rec.resetAt) loginAttempts.delete(ip);
}, LOGIN_WINDOW_MS);

// Login do painel (público, com rate-limit): {agent, password} → tokens da sessão
app.post("/api/login", loginRateLimit, async (req, res) => {
  try {
    const { agent, password } = req.body || {};
    const secretaria = SECRETARIAS.find(s => s.nome === agent);
    if (!secretaria || !password) return res.status(401).json({ error: "Usuário ou senha inválidos" });
    const { data, error } = await authClient.auth.signInWithPassword({ email: secretaria.email, password });
    if (error || !data?.session) return res.status(401).json({ error: "Usuário ou senha inválidos" });
    loginAttempts.delete(req._loginIp); // sucesso zera o contador do IP
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      agent: secretaria.nome
    });
  } catch (e) {
    console.error("Erro no login:", e.message);
    res.status(500).json({ error: "Erro no login" });
  }
});

// Renovação de sessão (público): troca refresh_token por novo access_token
app.post("/api/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(401).json({ error: "Sem refresh_token" });
    const { data, error } = await authClient.auth.refreshSession({ refresh_token });
    if (error || !data?.session) return res.status(401).json({ error: "Sessão expirada" });
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    });
  } catch (e) {
    res.status(401).json({ error: "Sessão expirada" });
  }
});

// Middleware: valida o token JWT do Supabase enviado pelo painel (Bearer).
async function requirePanelAuth(req, res, next) {
  try {
    const authz = req.headers["authorization"] || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Não autorizado" });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Sessão inválida" });
    req.panelUser = data.user; // identidade da secretária (auditoria/LGPD)
    next();
  } catch (e) {
    return res.status(401).json({ error: "Falha na autenticação" });
  }
}
app.use("/api", requirePanelAuth);

// API para o painel web
app.get("/api/conversations", async (req, res) => {
  const { data } = await supabase.from("conversations").select(`*, patients(name, phone)`).order("updated_at", { ascending: false });
  const convs = data || [];
  // Anota quais conversas vieram de anúncio (clique vinculado) e se já agendaram
  try {
    const { data: clicks } = await supabase.from("ad_clicks").select("conversation_id, source, booked").not("conversation_id", "is", null);
    const map = {};
    for (const c of (clicks || [])) { if (c.conversation_id) map[c.conversation_id] = c; }
    for (const cv of convs) {
      const a = map[String(cv.id)];
      if (a) { cv.ad_source = a.source || "anúncio"; cv.ad_booked = !!a.booked; }
    }
  } catch (e) {
    console.error("[Ads] Falha ao anotar origem de anúncio:", e.message);
  }
  res.json(convs);
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const { data } = await supabase.from("messages").select("*").eq("conversation_id", req.params.id).order("timestamp");
  const msgs = data || [];
  // O nome da secretária que atende fica em conversations.assigned_to (não é
  // gravado por mensagem). Rotula as mensagens humanas com esse nome para o
  // painel exibir quem respondeu, em vez do genérico "Secretária".
  const { data: conv } = await supabase.from("conversations").select("assigned_to").eq("id", req.params.id).single();
  const agente = conv?.assigned_to || null;
  if (agente) for (const m of msgs) if (m.role === "human" && !m.agent) m.agent = agente;
  res.json(msgs);
});

// Nova conversa iniciada pela secretária a partir do painel.
// Respeita a janela de 24h da Meta:
//   • dentro de 24h da última msg do paciente → envia texto livre;
//   • fora de 24h → tenta enviar template aprovado (WA_TEMPLATE_NAME); se não
//     houver template configurado, devolve 409 orientando a secretária.
app.post("/api/conversations/new", async (req, res) => {
  try {
    const phone = normalizePhoneBR(req.body?.phone);
    const message = String(req.body?.message || "").trim();
    const agent = req.body?.agent || req.panelUser?.email || "Secretária";
    if (!phone) return res.status(400).json({ error: "Número inválido. Use DDD + número (ex.: 61 98406-0001)." });

    const patient = await getOrCreatePatient(phone);
    if (!patient) return res.status(500).json({ error: "Falha ao registrar o paciente." });
    const conversation = await getOrCreateConversation(patient.id);
    if (!conversation) return res.status(500).json({ error: "Falha ao abrir a conversa." });

    const inboundAt = await lastInboundAt(phone);
    const within24h = inboundAt && (Date.now() - inboundAt) < 24 * 60 * 60 * 1000;

    if (within24h) {
      if (!message) return res.status(400).json({ error: "Escreva a mensagem a enviar." });
      await sendWhatsApp(phone, message);
      await saveMessage(conversation.id, "human", message);
      await supabase.from("conversations").update({ status: "human", assigned_to: agent }).eq("id", conversation.id);
      return res.json({ ok: true, mode: "free", conversationId: conversation.id });
    }

    // Fora da janela de 24h → precisa de template aprovado pela Meta
    const templateName = readEnv("WA_TEMPLATE_NAME");
    const templateLang = readEnv("WA_TEMPLATE_LANG") || "pt_BR";
    if (!templateName) {
      return res.status(409).json({
        ok: false, needsTemplate: true,
        error: "Este paciente está fora da janela de 24h da Meta. Para iniciar o contato é preciso um template aprovado (nenhum configurado) — ou aguardar o paciente enviar a primeira mensagem.",
      });
    }
    // A 1ª variável {{1}} recebe o nome do paciente (ou saudação neutra).
    const firstParam = patient.name || "tudo bem";
    await sendWhatsAppTemplate(phone, templateName, templateLang, [firstParam]);
    await saveMessage(conversation.id, "human", `[Template enviado: ${templateName}]`);
    await supabase.from("conversations").update({ status: "human", assigned_to: agent }).eq("id", conversation.id);
    return res.json({ ok: true, mode: "template", template: templateName, conversationId: conversation.id });
  } catch (e) {
    const d = e?.response?.data;
    console.error("[Painel] Nova conversa falhou:", d ? JSON.stringify(d) : e.message);
    res.status(500).json({ error: d?.error?.message || e.message });
  }
});

app.post("/api/conversations/:id/assign", async (req, res) => {
  await supabase.from("conversations").update({ status: "human", assigned_to: req.body.agent }).eq("id", req.params.id);
  res.json({ ok: true });
});

app.post("/api/conversations/:id/release", async (req, res) => {
  await supabase.from("conversations").update({ status: "bot", assigned_to: null }).eq("id", req.params.id);
  res.json({ ok: true });
});

// Encerra a conversa (status "closed"). A partir daí ela sai da lista ativa do
// painel. Se o paciente mandar nova mensagem, getOrCreateConversation ignora
// conversas "closed" e abre uma nova conversa "bot" — a Ana volta a atender
// normalmente, sem ficar travada.
app.post("/api/conversations/:id/close", async (req, res) => {
  const { error } = await supabase.from("conversations").update({ status: "closed", assigned_to: null }).eq("id", req.params.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// Reabre manualmente uma conversa encerrada, devolvendo-a à Ana (status "bot").
app.post("/api/conversations/:id/reopen", async (req, res) => {
  const { error } = await supabase.from("conversations").update({ status: "bot", assigned_to: null }).eq("id", req.params.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// Marca um agendamento (conversão) para a conversa. Se ela veio de um anúncio
// (tem clique vinculado), registra a conversão para exportação ao Google Ads.
app.post("/api/conversations/:id/booked", async (req, res) => {
  try {
    const value = Number(req.body?.value) || 200;
    // Mesma lógica usada quando a Ana conclui o pré-agendamento (idempotente).
    // O clique manual no painel continua valendo — só deixou de ser a única via.
    const r = await marcarConversaoAgendada(req.params.id, value);
    res.json({ ok: true, attributed: !!r.attributed, alreadyBooked: !!r.alreadyBooked });
  } catch (e) {
    console.error("[Ads] Falha ao marcar agendamento:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/send", async (req, res) => {
  const { to, message, conversationId, agent, documentUrl, documentName, imageUrl } = req.body;
  if (imageUrl) {
    await sendWhatsAppImage(to, imageUrl, message || "");
    await saveMessage(conversationId, "human", `[Imagem enviada]${message ? `: ${message}` : ""}`);
  } else if (documentUrl) {
    await sendWhatsAppDocument(to, documentUrl, documentName || "documento");
    await saveMessage(conversationId, "human", `[Documento enviado: ${documentName || "documento"}]`);
  } else {
    await sendWhatsApp(to, message);
    await saveMessage(conversationId, "human", message);
  }
  // Registra quem respondeu (nome do login) para o painel rotular corretamente.
  if (agent && conversationId) {
    await supabase.from("conversations").update({ assigned_to: agent }).eq("id", conversationId);
  }
  res.json({ ok: true });
});

app.get("/api/settings", async (req, res) => {
  const { data } = await supabase.from("settings").select("*");
  res.json(data);
});

app.post("/api/settings", async (req, res) => {
  const { key, value } = req.body;
  await supabase.from("settings").upsert({ key, value });
  res.json({ ok: true });
});

// ===== Controle GLOBAL da Ana (ligar/desligar) =====
// GET: qualquer secretária logada consulta o estado (para exibir no painel — só leitura).
// O ligar/desligar global NÃO é mais permitido pelo painel web: é exclusivo do
// comando #ANA ON/OFF no WhatsApp (números em NUMEROS_ADMIN). A rota POST abaixo
// existe apenas para recusar qualquer tentativa vinda do web de forma explícita.
app.get("/api/ana-status", async (req, res) => {
  res.json({ ativa: anaAtiva });
});
app.post("/api/ana-toggle", async (req, res) => {
  console.log("[Admin] Tentativa de ligar/desligar a Ana pelo painel web — recusada (controle é exclusivo do WhatsApp #ANA).");
  return res.status(403).json({
    ok: false,
    error: "O ligar/desligar da Ana é feito apenas pelo WhatsApp (#ANA ON / #ANA OFF).",
  });
});

// Dispara o relatório do Google Ads sob demanda (painel). Envia pelo WhatsApp
// e também devolve o texto do relatório para exibição na modal do painel.
app.post("/api/ads/report", async (req, res) => {
  try {
    const report = await googleAds.runWeeklyReport({ supabase, sendWhatsApp });
    res.json({ ok: !!report, mode: googleAds.isTestMode() ? "test" : "prod", report });
  } catch (e) {
    console.error("[GoogleAds] Endpoint:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exporta as conversões (agendamentos com gclid) no formato de importação de
// conversões offline do Google Ads. ?all=1 inclui já exportadas; ?markReported=1
// marca as exportadas para não reenviar (evita contagem dupla).
app.get("/api/ads/conversions.csv", async (req, res) => {
  try {
    const tz = "America/Sao_Paulo";
    const fmt = d => {
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
      const g = t => (p.find(x => x.type === t) || {}).value;
      return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
    };
    let q = supabase.from("ad_clicks").select("*").eq("booked", true).not("gclid", "is", null);
    if (req.query.all !== "1") q = q.eq("reported", false);
    const { data } = await q;
    const rows = (data || []).filter(r => r.gclid);
    const lines = [`Parameters:TimeZone=${tz}`, "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
    for (const r of rows) {
      const t = fmt(new Date(r.booked_at || r.clicked_at));
      lines.push([r.gclid, GOOGLE_ADS_CONVERSION_NAME, t, (r.conversion_value ?? 200), "BRL"].join(","));
    }
    if (req.query.markReported === "1" && rows.length) {
      await supabase.from("ad_clicks").update({ reported: true, reported_at: new Date() }).in("id", rows.map(r => r.id));
    }
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="conversoes_google_ads.csv"');
    res.send(lines.join("\n"));
  } catch (e) {
    console.error("[Ads] Falha ao exportar conversões:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Dispara o UPLOAD automático de conversões offline ao Google Ads (via API).
// Envia as pendentes (booked=true, reported=false, gclid != null) e marca as
// enviadas. ?dry=1 valida sem contabilizar (validate_only). Uso: teste manual.
app.get("/api/ads/upload-conversions", async (req, res) => {
  try {
    const result = await googleAds.uploadClickConversions({ supabase, dryRun: req.query.dry === "1" });
    res.status(result.error && !result.uploaded ? 502 : 200).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint upload-conversions:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Lista as ações de conversão da conta (descoberta do resource name de
// "Agendamento IOBB"). Uso: GET /api/ads/conversion-actions.
app.get("/api/ads/conversion-actions", async (req, res) => {
  try {
    if (googleAds.isTestMode()) return res.json({ ok: false, mode: "test", error: "MODO TESTE — sem acesso à API real." });
    const actions = await googleAds.listConversionActions();
    res.json({ ok: true, count: actions.length, wanted: process.env.GOOGLE_ADS_CONVERSION_NAME || "Agendamento IOBB", actions });
  } catch (e) {
    console.error("[Ads] Endpoint conversion-actions:", e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Cria uma campanha de PESQUISA no Google Ads via API (mutate atômico).
// A campanha nasce PAUSADA. Por segurança, o padrão é DRY-RUN (validate_only):
//   GET /api/ads/create-campaign            → valida, NÃO cria (validate_only)
//   GET /api/ads/create-campaign?confirm=1  → cria de verdade (pausada)
app.get("/api/ads/create-campaign", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const result = await googleAds.createSearchCampaign({ supabase, dryRun });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint create-campaign:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cria a campanha de Lentes Esclerais via API (mutate atômico). Nasce PAUSADA.
//   GET /api/ads/create-escleral            → valida, NÃO cria (validate_only)
//   GET /api/ads/create-escleral?confirm=1  → cria de verdade (pausada)
app.get("/api/ads/create-escleral", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const result = await googleAds.createSearchCampaign({ supabase, dryRun, spec: googleAds.buildEscleralSpec() });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint create-escleral:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cria a campanha de Ceratocone Cirúrgico (crosslinking + anel). Nasce PAUSADA.
//   GET /api/ads/create-ceratocone            → valida, NÃO cria
//   GET /api/ads/create-ceratocone?confirm=1  → cria de verdade (pausada)
app.get("/api/ads/create-ceratocone", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const result = await googleAds.createSearchCampaign({ supabase, dryRun, spec: googleAds.buildCeratoconeCirurgicoSpec() });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint create-ceratocone:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Pausa a campanha combinada antiga de ceratocone/esclerais (alvo por env).
//   GET /api/ads/pausar-ceratocone            → prévia (dry-run)
//   GET /api/ads/pausar-ceratocone?confirm=1  → pausa de verdade
app.get("/api/ads/pausar-ceratocone", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const name = process.env.GOOGLE_ADS_CERATOCONE_OLD || "[SEARCH] Ceratocone e Esclerais";
    const result = await googleAds.setCampaignStatusByName({ supabase, name, status: 3, dryRun });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint pausar-ceratocone:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cria a campanha COMBINADA Ceratocone + Esclerais (reúne as duas). Nasce PAUSADA.
//   GET /api/ads/create-ceratocone-escleral            → valida, NÃO cria
//   GET /api/ads/create-ceratocone-escleral?confirm=1  → cria de verdade (pausada)
app.get("/api/ads/create-ceratocone-escleral", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const result = await googleAds.createSearchCampaign({ supabase, dryRun, spec: googleAds.buildCeratoconeEscleralSpec() });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint create-ceratocone-escleral:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Pausa AS DUAS campanhas separadas (Lentes Esclerais + Ceratocone Cirúrgico).
//   GET /api/ads/pausar-separadas            → prévia (dry-run)
//   GET /api/ads/pausar-separadas?confirm=1  → pausa de verdade
app.get("/api/ads/pausar-separadas", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const names = [
      process.env.GOOGLE_ADS_ESCLERAL_NAME || "IOBB | Lentes Esclerais",
      process.env.GOOGLE_ADS_CERATOCONE_NAME || "IOBB | Ceratocone Cirúrgico",
    ];
    const result = await googleAds.setCampaignStatusByName({ supabase, names, status: 3, dryRun });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint pausar-separadas:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Aproveita o histórico das campanhas antigas de refrativa (termos de pesquisa)
// para enriquecer a campanha nova com palavras-chave vencedoras + negativas.
//   GET /api/ads/historico            → prévia (dry-run), NÃO grava
//   GET /api/ads/historico?confirm=1  → aplica na campanha nova
app.get("/api/ads/historico", async (req, res) => {
  try {
    const dryRun = req.query.confirm !== "1";
    const result = await googleAds.applyHistoricalInsights({ supabase, dryRun });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    console.error("[Ads] Endpoint historico:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Anexos podem conter dados sensíveis de pacientes (laudos, receitas, exames).
// Por LGPD, o bucket é PRIVADO e os links são URLs assinadas com expiração curta.
const ANEXO_SIGN_TTL = 3600; // 1 hora, em segundos

// Garantir que o bucket de anexos exista e seja PRIVADO, idempotente
(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = buckets?.find(b => b.name === "anexos");
    if (!existing) {
      const { error } = await supabase.storage.createBucket("anexos", { public: false });
      if (error) console.error("Erro ao criar bucket anexos:", error.message);
      else console.log("Bucket 'anexos' criado (privado).");
    } else if (existing.public) {
      // bucket antigo estava público → rebaixar para privado (LGPD)
      const { error } = await supabase.storage.updateBucket("anexos", { public: false });
      if (error) console.error("Erro ao tornar bucket anexos privado:", error.message);
      else console.log("Bucket 'anexos' ajustado para PRIVADO.");
    }
  } catch (e) {
    console.error("Erro ao verificar bucket anexos:", e.message);
  }
})();

// Expurgo automático de anexos com mais de 30 dias (LGPD: minimização/retenção).
// Roda no startup e a cada 24h. Usa created_at do objeto; se ausente, cai no
// timestamp embutido no nome do arquivo (`${Date.now()}_...`).
const ANEXO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
async function purgeOldAttachments() {
  try {
    const cutoff = Date.now() - ANEXO_RETENTION_MS;
    const antigos = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from("anexos").list("", {
        limit: 1000, offset, sortBy: { column: "created_at", order: "asc" }
      });
      if (error) { console.error("Expurgo: erro ao listar anexos:", error.message); return; }
      if (!data || data.length === 0) break;
      for (const f of data) {
        const ts = f.created_at ? new Date(f.created_at).getTime() : parseInt(f.name.split("_")[0], 10);
        if (Number.isFinite(ts) && ts < cutoff) antigos.push(f.name);
      }
      if (data.length < 1000) break;
    }
    if (antigos.length) {
      const { error } = await supabase.storage.from("anexos").remove(antigos);
      if (error) console.error("Expurgo: erro ao remover anexos:", error.message);
      else console.log(`Expurgo: ${antigos.length} anexo(s) com +30 dias removido(s).`);
    }
  } catch (e) {
    console.error("Erro no expurgo de anexos:", e.message);
  }
}
purgeOldAttachments();
setInterval(purgeOldAttachments, 24 * 60 * 60 * 1000);

// Upload de anexo do painel para o Supabase Storage → devolve URL ASSINADA (1h)
// O navegador envia o arquivo como corpo binário (application/octet-stream)
// e informa nome/tipo real via query (?filename=...&mime=...).
app.post("/api/upload", express.raw({ type: () => true, limit: "30mb" }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) return res.status(400).json({ error: "Arquivo vazio" });
    const rawName = (req.query.filename || "arquivo").toString();
    const safeName = rawName.replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";
    const contentType = (req.query.mime || req.headers["content-type"] || "application/octet-stream").toString();
    const path = `${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from("anexos").upload(path, req.body, { contentType, upsert: false });
    if (error) return res.status(500).json({ error: error.message });
    // URL assinada de curta duração — suficiente para o WhatsApp baixar a mídia na hora
    const { data, error: signErr } = await supabase.storage.from("anexos").createSignedUrl(path, ANEXO_SIGN_TTL);
    if (signErr) return res.status(500).json({ error: signErr.message });
    res.json({ url: data.signedUrl, filename: rawName, contentType, expiresIn: ANEXO_SIGN_TTL });
  } catch (e) {
    console.error("Erro upload:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Gera uma URL ASSINADA de curta duração para um anexo salvo (recebido do
// paciente ou enviado pela secretária). O painel chama autenticado (Bearer) e
// usa a URL devolvida direto no <img>/<audio>/<a>. Como o link expira, o painel
// sempre pede um novo na hora de renderizar — nada sensível fica em cache/DB.
app.get("/api/attachment", async (req, res) => {
  try {
    const path = (req.query.path || "").toString();
    if (!path || path.includes("..") || path.startsWith("/")) return res.status(400).json({ error: "path inválido" });
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(path, ANEXO_SIGN_TTL);
    if (error) {
      console.error(`[Anexo] Falha ao gerar URL assinada: ${error.message} | path=${path}`);
      return res.status(404).json({ error: error.message });
    }
    res.json({ url: data.signedUrl, expiresIn: ANEXO_SIGN_TTL });
  } catch (e) {
    console.error("[Anexo] Erro em /api/attachment:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Autoteste do Storage: prova, ponta a ponta, se este servidor consegue
// gravar no bucket privado "anexos" e gerar URL assinada com a chave atual.
// Abra autenticado no painel; devolve um relatório JSON de cada etapa.
app.get("/api/diag/storage", async (req, res) => {
  const report = { keyRole: supabaseKeyRole(), bucket: "anexos", steps: [] };
  const path = `${Date.now()}_diag_selftest.txt`;
  try {
    const up = await supabase.storage.from("anexos").upload(path, Buffer.from("iobb-selftest"), { contentType: "text/plain", upsert: true });
    report.steps.push({ step: "upload", ok: !up.error, error: up.error?.message || null });
    const sign = await supabase.storage.from("anexos").createSignedUrl(path, 60);
    report.steps.push({ step: "signedUrl", ok: !sign.error, hasUrl: !!sign.data?.signedUrl, error: sign.error?.message || null });
    await supabase.storage.from("anexos").remove([path]).catch(() => {});
    report.ok = report.steps.every(s => s.ok);
    if (!report.ok && report.keyRole !== "service_role") {
      report.hint = "A SUPABASE_KEY não é service_role. Uploads ao bucket privado exigem a service_role key.";
    }
    res.json(report);
  } catch (e) {
    report.ok = false; report.error = e.message;
    res.status(500).json(report);
  }
});

// Autoteste dos ANEXOS recebidos: lista as mensagens recentes com media_path e
// tenta gerar a URL assinada de cada uma. Responde, ponta a ponta: os anexos dos
// pacientes estão sendo GRAVADOS (media_path) e ABREM (URL assinada)?
// Abra autenticado no painel: /api/diag/anexos
app.get("/api/diag/anexos", async (req, res) => {
  try {
    const { data, error } = await supabase.from("messages")
      .select("id, timestamp, media_path, media_type, media_name")
      .not("media_path", "is", null)
      .order("timestamp", { ascending: false }).limit(10);
    if (error) {
      return res.status(500).json({ ok: false, error: error.message,
        hint: "A coluna media_path existe? Rode sql/messages_media.sql no Supabase." });
    }
    const categoria = t => {
      const tp = (t || "").toLowerCase();
      if (tp.startsWith("image/")) return "imagem";
      if (tp.startsWith("audio/")) return "audio";
      if (tp.startsWith("video/")) return "video";
      if (tp.includes("pdf") || tp.startsWith("application/")) return "documento";
      return "outro";
    };
    const itens = [];
    const porTipo = { imagem: 0, documento: 0, audio: 0, video: 0, outro: 0 };
    let urlsOk = 0;
    for (const m of (data || [])) {
      const { data: s, error: se } = await supabase.storage.from("anexos").createSignedUrl(m.media_path, 60);
      const ok = !se && !!s?.signedUrl;
      const cat = categoria(m.media_type);
      porTipo[cat]++;
      if (ok) urlsOk++;
      itens.push({ id: m.id, quando: m.timestamp, categoria: cat, tipo: m.media_type, nome: m.media_name,
        path: m.media_path, urlAssinadaOk: ok, erro: se?.message || null });
    }
    res.json({
      ok: true,
      keyRole: supabaseKeyRole(),
      // GRAVAÇÃO: quantas mensagens têm media_path (por categoria).
      totalComAnexo: itens.length,
      porCategoria: porTipo,
      // EXIBIÇÃO: para quantas a URL assinada foi gerada com sucesso.
      urlsAssinadasOk: urlsOk,
      itens,
      diagnostico:
        itens.length === 0
          ? "GRAVAÇÃO FALHANDO: nenhuma mensagem com media_path. Os anexos recebidos não estão sendo gravados — veja os logs [Anexo] Salvo/Falha e confirme SUPABASE_KEY=service_role + migração sql/messages_media.sql."
          : urlsOk < itens.length
          ? "EXIBIÇÃO PARCIAL: media_path existe, mas algumas URLs assinadas falharam (veja `erro` nos itens) — provável arquivo ausente no bucket ou chave sem permissão."
          : "OK no backend: media_path gravado e URL assinada gerada para todos. Se ainda não abre no painel, o painel.html publicado está DESATUALIZADO (sem o fix de abertura) — republique o painel.html.",
    });
  } catch (e) {
    console.error("[Anexo] Erro no diagnóstico:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Autoteste da AGENDA: mostra se o iCal carrega, quantos eventos ocupados há e
// quais vagas o sistema calcula. Use ?unidade=conjunto|taguatinga para filtrar.
// Abra autenticado no painel: /api/diag/agenda
// ===== Agenda própria (Modelo B) — usada pela aba "Agenda" do painel ==========
// Todas atrás do requirePanelAuth (app.use("/api", ...)). A trava anti-overbooking
// é do banco (índice único parcial em sql/agenda.sql); aqui só orquestramos.

// Horários LIVRES nos próximos `dias` dias (para o modal de marcação e diagnóstico).
app.get("/api/agenda/slots", async (req, res) => {
  try {
    const unidade = req.query.unidade ? String(req.query.unidade) : null;
    const slots = await fetchSlotsDB(unidade);
    if (slots === null) return res.status(502).json({ ok: false, error: "Não foi possível ler a agenda (banco)." });
    res.json({ ok: true, vagas: slots.length, slots: slots.map(s => ({
      inicio: s.start.toISOString(), unidade: s.unidade, dia: s.dia, hora: s.hora, periodo: s.periodo,
    })) });
  } catch (e) {
    console.error("[Agenda] /slots falhou:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Agendamentos ATIVOS numa janela (para desenhar a grade dia/semana do painel).
// from/to em ISO ou YYYY-MM-DD; default = próximos 7 dias a partir de agora.
app.get("/api/agenda/appointments", async (req, res) => {
  try {
    const de = req.query.from ? new Date(String(req.query.from)) : new Date();
    const ate = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const unidade = req.query.unidade ? String(req.query.unidade) : null;
    const lista = await listarAgendamentos({ de, ate, unidade });
    if (lista === null) return res.status(502).json({ ok: false, error: "Não foi possível ler a agenda (banco)." });
    res.json({ ok: true, total: lista.length, appointments: lista });
  } catch (e) {
    console.error("[Agenda] /appointments falhou:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Marca um horário direto pela secretária (status confirmado). O `inicio` deve ser
// exatamente o de um slot livre devolvido por /api/agenda/slots.
app.post("/api/agenda/book", async (req, res) => {
  try {
    const { unidade, inicio, nome, telefone, convenio, motivo, observacoes } = req.body || {};
    if (!unidade || !inicio) return res.status(400).json({ ok: false, error: "Informe unidade e horário (inicio)." });
    const ini = new Date(inicio);
    if (isNaN(ini.getTime())) return res.status(400).json({ ok: false, error: "Horário (inicio) inválido." });
    if (ini.getTime() <= Date.now()) return res.status(400).json({ ok: false, error: "Não é possível marcar em horário passado." });
    const fim = new Date(ini.getTime() + SLOT_MIN * 60000);
    const r = await criarAgendamento({
      unidade, inicio: ini, fim, status: "confirmado",
      nome, telefone, convenio, motivo, observacoes,
      origem: "secretaria", criadoPor: req.panelUser?.email || null,
    });
    if (r.taken) return res.status(409).json({ ok: false, taken: true, error: "Esse horário acabou de ser ocupado. Atualize a agenda e escolha outro." });
    if (!r.ok) return res.status(500).json({ ok: false, error: r.error || "Falha ao marcar." });
    res.json({ ok: true, appointment: r.appointment });
  } catch (e) {
    console.error("[Agenda] /book falhou:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cancela um agendamento (libera o slot).
app.post("/api/agenda/:id/cancel", async (req, res) => {
  try {
    const r = await cancelarAgendamento(req.params.id);
    if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
    res.json({ ok: true });
  } catch (e) {
    console.error("[Agenda] /cancel falhou:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Remarca: cria o NOVO horário primeiro (se estiver livre) e só então cancela o
// antigo. Se o novo estiver ocupado, o antigo permanece intacto (nada se perde).
app.post("/api/agenda/:id/move", async (req, res) => {
  try {
    const { inicio, unidade } = req.body || {};
    if (!inicio) return res.status(400).json({ ok: false, error: "Informe o novo horário (inicio)." });
    const ini = new Date(inicio);
    if (isNaN(ini.getTime())) return res.status(400).json({ ok: false, error: "Horário (inicio) inválido." });
    if (ini.getTime() <= Date.now()) return res.status(400).json({ ok: false, error: "Não é possível remarcar para horário passado." });
    const { data: atual, error } = await supabase.from("appointments").select("*").eq("id", req.params.id).single();
    if (error || !atual) return res.status(404).json({ ok: false, error: "Agendamento não encontrado." });
    const fim = new Date(ini.getTime() + SLOT_MIN * 60000);
    const novo = await criarAgendamento({
      unidade: unidade || atual.unidade, inicio: ini, fim, status: "confirmado",
      nome: atual.paciente_nome, telefone: atual.paciente_telefone, convenio: atual.convenio, motivo: atual.motivo, observacoes: atual.observacoes,
      origem: "secretaria", conversationId: atual.conversation_id, criadoPor: req.panelUser?.email || null,
    });
    if (novo.taken) return res.status(409).json({ ok: false, taken: true, error: "O novo horário acabou de ser ocupado. O agendamento antigo foi mantido." });
    if (!novo.ok) return res.status(500).json({ ok: false, error: novo.error || "Falha ao remarcar." });
    await cancelarAgendamento(req.params.id);   // só depois de garantir o novo
    res.json({ ok: true, appointment: novo.appointment });
  } catch (e) {
    console.error("[Agenda] /move falhou:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/diag/agenda", async (req, res) => {
  try {
    const ics = await fetchICS();
    if (ics === null) return res.status(502).json({ ok: false, error: "Não foi possível carregar o iCal (direto e proxy falharam)" });
    const events = parseICS(ics);
    const unidade = req.query.unidade ? String(req.query.unidade) : null;
    const slots = getAvailableSlots(events, unidade);
    res.json({
      ok: true,
      eventosOcupados: events.length,
      vagasProximos14dias: slots.length,
      resumoPorDia: formatSlotsForPrompt(slots, 10).split("\n").filter(Boolean),
      // Tabela auditável dia→unidade (valida sexta=Conjunto / quinta=Taguatinga)
      diagnostico7dias: agendaPorDia(events, 7),
      amostraEventos: events.slice(0, 5).map(e => ({ inicio: e.start, fim: e.end })),
    });
  } catch (e) {
    console.error("[Agenda] Erro no diagnóstico:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Diagnóstico da IA: reproduz a chamada à API Anthropic (mesmo modelo/headers do
// fluxo real) e devolve o STATUS e o CORPO EXATOS de qualquer erro. Serve para
// descobrir por que a Ana está caindo no FRIENDLY_FALLBACK sem depender dos logs
// do Render. 401=chave inválida/ausente, 400=requisição/créditos, 404=modelo,
// 429=limite, 529=sobrecarga. Auth via requirePanelAuth (já aplicado em /api).
app.get("/api/diag/ana", async (req, res) => {
  const info = {
    ok: false,
    modelo: "claude-sonnet-4-6",
    anthropicKeyPresente: !!ANTHROPIC_KEY,
    anthropicKeyLen: ANTHROPIC_KEY ? ANTHROPIC_KEY.length : 0,
    anthropicKeyPrefixo: ANTHROPIC_KEY ? ANTHROPIC_KEY.slice(0, 7) : null, // "sk-ant-" esperado
  };
  if (!ANTHROPIC_KEY) return res.status(500).json({ ...info, error: "ANTHROPIC_KEY ausente no ambiente (env do Render)." });
  try {
    const r = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-sonnet-4-6", max_tokens: 16, messages: [{ role: "user", content: "diga apenas: ok" }] },
      { headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, timeout: 20000 }
    );
    res.json({ ...info, ok: true, respostaModelo: r.data?.content?.[0]?.text || null, usage: r.data?.usage || null });
  } catch (err) {
    // Devolve o status HTTP e o corpo de erro da Anthropic — a causa raiz exata.
    res.status(200).json({
      ...info,
      ok: false,
      httpStatus: err?.response?.status || null,
      anthropicError: err?.response?.data || null,
      mensagem: err.message,
    });
  }
});

// Diagnóstico de TRÁFEGO REAL: a Ana está recebendo mensagens de pacientes? Conta
// mensagens por papel (paciente/Ana) em 24h/48h/7d e mostra quando foi a última
// mensagem de paciente. Serve para separar "sistema saudável mas ocioso" de
// "sistema no ar mas sem tráfego" (ligado ao aviso de inatividade do Supabase e
// ao 0 conversões dos anúncios). Auth via requirePanelAuth (já aplicado em /api).
// Coleta as contagens de tráfego: mensagens por papel (paciente→Ana / Ana→paciente
// / total) em 24h/48h/7d + a última mensagem de paciente. Reusado pelo endpoint
// /api/diag/trafego e pelo comando admin de WhatsApp #TRAFEGO.
async function coletarTrafego() {
  const now = Date.now();
  const H = 60 * 60 * 1000, D = 24 * H;
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const conta = async (role, msAgo) => {
    let q = supabase.from("messages").select("*", { count: "exact", head: true }).gte("timestamp", iso(msAgo));
    if (role) q = q.eq("role", role);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count || 0;
  };
  const janelas = {};
  for (const [label, msAgo] of [["24h", D], ["48h", 2 * D], ["7d", 7 * D]]) {
    janelas[label] = {
      pacienteToAna: await conta("user", msAgo),      // mensagens recebidas de pacientes
      anaToPaciente: await conta("assistant", msAgo), // respostas da Ana
      total: await conta(null, msAgo),
    };
  }
  const { data: ult } = await supabase.from("messages").select("timestamp")
    .eq("role", "user").order("timestamp", { ascending: false }).limit(1).maybeSingle();
  const ultima = ult?.timestamp ? { quando: ult.timestamp, ha_horas: Math.round((now - new Date(ult.timestamp).getTime()) / H) } : null;
  return { agora: new Date(now).toISOString(), janelas, ultima_mensagem_paciente: ultima, semTrafego48h: janelas["48h"].pacienteToAna === 0 };
}

function diagnosticoTrafego(t) {
  return t.semTrafego48h
    ? "⚠️ SEM mensagens de pacientes nas últimas 48h — a Ana não está recebendo tráfego (verifique: webhook da Meta apontando para /webhook, número correto, Ana ligada, Render acordado)."
    : "✅ Há tráfego de pacientes recente.";
}

app.get("/api/diag/trafego", async (req, res) => {
  try {
    const t = await coletarTrafego();
    res.json({ ok: true, ...t, diagnostico: diagnosticoTrafego(t) });
  } catch (e) {
    console.error("[Diag] trafego:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== Landing pages de anúncios (captura de gclid → WhatsApp com token) =====
const LP_TEMAS = {
  ceratocone: {
    titulo: "Ceratocone tem tratamento — e somos referência nisso",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "Crosslinking, anel intraestromal e lentes de contato especiais (rígidas e esclerais)",
      "Avaliação com médico especialista e contactóloga",
      "Atendimento acolhedor pelo WhatsApp, sem compromisso",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre ceratocone.",
  },
  escleral: {
    titulo: "Lentes esclerais e rígidas — visão nítida no ceratocone",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "Adaptação de lentes esclerais e rígidas com contactóloga experiente",
      "Ideais para ceratocone e córneas irregulares",
      "Avaliação acolhedora pelo WhatsApp, sem compromisso",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre lentes esclerais.",
  },
  refrativa: {
    titulo: "Livre-se dos óculos com cirurgia refrativa a laser",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "PRK, LASIK e Femto-LASIK — técnica definida na avaliação",
      "Avaliação completa com o médico antes de qualquer indicação",
      "Parcelamento em até 5x no cartão",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre cirurgia refrativa.",
  },
  catarata: {
    titulo: "Cirurgia de catarata com avaliação individualizada",
    sub: "Instituto de Olhos Bruno Borges • Brasília — Asa Norte e Taguatinga",
    bullets: [
      "Cirurgia realizada pelo Dr. Bruno",
      "Escolha da lente intraocular definida na avaliação",
      "Tire suas dúvidas pelo WhatsApp",
    ],
    msg: "Olá! Vim pelo Google e quero saber sobre cirurgia de catarata.",
  },
  consulta: {
    titulo: "Oftalmologista em Brasília",
    sub: "Instituto de Olhos Bruno Borges — Asa Norte e Taguatinga",
    destaque: "Consulta oftalmológica completa, com atendimento humanizado e sem pressa.",
    bullets: [
      "Unidades: Conjunto Nacional (Asa Norte) e Taguatinga Shopping",
      "Atendemos convênios e particular",
    ],
    chips: ["Ceratocone", "Cirurgia refrativa", "Catarata", "Lentes esclerais"],
    cred: "Dr. Bruno Borges • CRM-DF 17877 · RQE 9314 • Oftalmologia (UFMG)",
    cta: "📅 Agendar pelo WhatsApp",
    msg: "Olá! Vim pelo Google e quero agendar uma consulta oftalmológica.",
  },
};

function renderLanding(cfg, waLink) {
  const bullets = cfg.bullets.map(b => `<li>${b}</li>`).join("");
  const destaque = cfg.destaque ? `<p class="destaque">${cfg.destaque}</p>` : "";
  const chips = cfg.chips ? `<div class="chips">${cfg.chips.map(c => `<span class="chip">${c}</span>`).join("")}</div>` : "";
  const cred = cfg.cred ? `<div class="cred">🩺 ${cfg.cred}</div>` : "";
  const cta = cfg.cta || "💬 Falar no WhatsApp agora";
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${cfg.titulo} — IOBB</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b141a;background:#f0f2f5;line-height:1.5}
  .wrap{max-width:520px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
  .hero{background:#008069;color:#fff;padding:32px 22px 26px}
  .hero .logo{width:52px;height:52px;border-radius:50%;background:#fff;color:#008069;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;margin-bottom:16px}
  .hero h1{font-size:24px;line-height:1.25;margin-bottom:8px}
  .hero p{opacity:.92;font-size:14px}
  .hero .destaque{margin-top:12px;font-size:15px;opacity:.97;font-weight:500}
  .card{background:#fff;margin:18px;border-radius:14px;padding:20px 20px 8px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .card ul{list-style:none}
  .card li{padding:10px 0 10px 30px;position:relative;font-size:15px;border-bottom:1px solid #eee}
  .card li:last-child{border-bottom:none}
  .card li:before{content:"👁️";position:absolute;left:0;top:9px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;padding:14px 0 10px}
  .chip{background:#e7f7f1;color:#008069;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:20px}
  .cta{position:sticky;bottom:0;padding:16px 18px 22px;background:linear-gradient(180deg,rgba(240,242,245,0),#f0f2f5 30%)}
  .btn{display:flex;align-items:center;justify-content:center;gap:10px;background:#25d366;color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:16px;border-radius:12px;box-shadow:0 4px 14px rgba(37,211,102,.4)}
  .cred{text-align:center;color:#54656f;font-size:12.5px;margin-top:12px;font-weight:500}
  .foot{text-align:center;color:#667781;font-size:12px;padding:0 18px 20px}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <div class="logo">A</div>
    <h1>${cfg.titulo}</h1>
    <p>${cfg.sub}</p>
    ${destaque}
  </div>
  <div class="card">
    <ul>${bullets}</ul>
    ${chips}
  </div>
  <div style="flex:1"></div>
  <div class="cta">
    <a class="btn" href="${waLink}" rel="nofollow">${cta}</a>
    ${cred}
  </div>
  <div class="foot">Atendimento humano de seg a sex, 8h às 18h. Não realizamos atendimento de urgência/emergência.</div>
</div>
</body></html>`;
}

// Landings com HTML próprio (design pronto) carregadas do disco na inicialização.
// Têm precedência sobre o template genérico renderLanding() para o mesmo tema.
const LP_HTML = {};
for (const [tema, arquivo] of Object.entries({
  consulta: "landings/consulta.html",
  ceratocone: "landings/ceratocone.html",
  refrativa: "landings/refrativa.html",
  taguatinga: "landings/taguatinga.html",
  "aguas-claras": "landings/aguas-claras.html",
  "asa-norte": "landings/asa-norte.html",
})) {
  try { LP_HTML[tema] = fs.readFileSync(`${__dirname}/${arquivo}`, "utf8"); }
  catch (e) { console.error(`[LP] Falha ao carregar ${arquivo}:`, e.message); }
}

// Injeta rastreamento numa landing de HTML próprio: aponta todos os links do
// WhatsApp para o número da Ana e acrescenta o [ref:token] ao texto pré-preenchido.
function injectTracking(html, token) {
  const ref = encodeURIComponent(` [ref:${token}]`);
  return html.replace(/https:\/\/wa\.me\/\d+(\?text=[^"'\s]*)?/g, (m, query) => {
    const base = `https://wa.me/${WA_LP_NUMBER}`;
    return query ? `${base}${query}${ref}` : `${base}?text=${encodeURIComponent(`Olá! [ref:${token}]`)}`;
  });
}

// Imagens otimizadas das landings, servidas com cache longo (carregamento rápido)
app.use("/lp/assets", express.static(`${__dirname}/landings/assets`, { maxAge: "30d", immutable: true }));

// Handler compartilhado: registra o clique (gclid/wbraid/gbraid), injeta o
// rastreamento e devolve a landing. Usado tanto pela rota /lp/:tema quanto
// pelas URLs "limpas" na raiz do domínio (ex.: iobb.com.br/aguas-claras).
async function serveLanding(tema, req, res) {
  tema = String(tema || "").toLowerCase();
  const custom = LP_HTML[tema];
  const cfg = LP_TEMAS[tema];
  if (!custom && !cfg) return res.status(404).send("Página não encontrada");
  const token = await registrarClique({
    gclid: req.query.gclid, wbraid: req.query.wbraid, gbraid: req.query.gbraid, source: `google/${tema}`
  });
  res.set("Cache-Control", "no-store");
  if (custom) return res.send(injectTracking(custom, token)); // design próprio (ex.: consulta)
  const waLink = `https://wa.me/${WA_LP_NUMBER}?text=${encodeURIComponent(`${cfg.msg} [ref:${token}]`)}`;
  res.send(renderLanding(cfg, waLink)); // template genérico (ceratocone/refrativa/catarata)
}

app.get("/lp/:tema", (req, res) => serveLanding(req.params.tema, req, res));

// URLs limpas na RAIZ do domínio (ex.: iobb.com.br/aguas-claras). O Cloudflare
// encaminha apenas estes paths (e /lp/assets) para este app; todo o resto do
// domínio continua servido pelo site institucional. Registramos uma rota
// explícita por tema conhecido — de propósito, em vez de um coringa /:tema,
// para não capturar /painel, /webhook, /api etc. Os assets das landings
// continuam sob /lp/assets, então o Cloudflare também deve encaminhar /lp/*.
const LP_SLUGS = [...new Set([...Object.keys(LP_HTML), ...Object.keys(LP_TEMAS)])];
for (const slug of LP_SLUGS) {
  app.get(`/${slug}`, (req, res) => serveLanding(slug, req, res));
}

// Servir o painel web das secretárias
app.get("/painel", (req, res) => res.sendFile(__dirname + "/painel.html"));

// Agendador do relatório semanal do Google Ads (segunda 08h, Brasília)
googleAds.startScheduler({ supabase, sendWhatsApp });
startResumoDiarioScheduler();

app.listen(process.env.PORT || 3000, () => console.log("Ana online!"));
