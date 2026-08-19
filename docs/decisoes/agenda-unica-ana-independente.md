---
name: agenda-unica-ana-independente
description: "iClinic descontinuado (19/08/2026): a agenda da Ana é a ÚNICA; Ana remarca/cancela QUALQUER consulta por telefone; cobrança de recado sem resposta em 4h"
metadata:
  type: project
---

**19/08/2026 — o iClinic acabou.** Dr. Bruno: *"Não existe agenda iClinic, agora só a da Ana"*. E a direção dele: *"quanto pudermos deixar a Ana mais independente para agendar, melhor. Acho ela melhor que as secretárias humanas pelo WhatsApp"* — o desenho combinado é **WhatsApp inteiro com a Ana; telefone e balcão com a equipe**.

**O que mudou (commit `a1c7dc8`):**
- Ana **remarca/cancela QUALQUER consulta** vinculada ao telefone do paciente — caíram os filtros `origem==='ana'` (lista injetada no prompt, `processarCancelarDaAna`, cancelamento por texto livre). Consulta da secretária deixou de virar "ligue no fixo" (5 conversas em agosto). Espelho avisa toda alteração. Testado ponta a ponta.
- **Cobrança de recado** (`COBRANCA_RECADO_HORAS`, 4h úteis): `recado_emitido` fica no `error_log`; sem resposta `role='human'` na conversa (nem fechada, nem pendência limpa) → UM alerta no número principal (`recado_cobrado` deduplica). Nasceu do lead de lente morto em 03/08 num "a equipe entrará em contato" sem cobrança.
- **Unimed marca no MESMO DIA** (commit `e5c705a`) — saiu de `CONVENIOS_COM_ANTECEDENCIA`; continuam com antecedência: Casec/Codevasf, Care Plus, Life Empresarial.

**Estado dos dados iClinic:** sync desligado (`settings.sync_iclinic_enabled=false`) desde 04/08; 12 retornos futuros legítimos de `origem='iclinic'` **sem telefone** (Leandro out/2026, retornos até jul/2027) — bloqueiam vaga corretamente mas a Ana não os reconhece; equipe pode adicionar telefone pelo painel.

**Pendente da mesma conversa:** template de reengajamento fora da janela de 24h (Bruno precisa criar na Meta) para o follow-up alcançar leads frios. **Não automatizar:** verificação de convênio junto à operadora (Unimed regional/intercâmbio) — continua com a equipe.
