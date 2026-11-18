/* Exames do pedido + justificativa por CID — UM lugar só (13/11/2026).
   Usado pelo prontuário (pedido do médico) e pelo pré-exame (pedido que a equipe
   prepara e o Dr. Bruno assina). Antes a tabela vivia só no prontuário.
   Regras: para cada exame, a 1ª regra cujo CID (prefixo) está entre os
   diagnósticos vence; [null, texto] é o padrão, sem CID. */
(function(){
const J_GLAUCOMA=["H40","H42","Q15.0"], J_DIABETES=["E10","E11","E12","E13","E14","H36.0"], J_CATARATA=["H25","H26","H28"], J_ECTASIA=["H18.6","H18.7"];
const JUST={
  "Pentacam":[[J_ECTASIA,"Diagnóstico e acompanhamento de ectasia corneana (ceratocone), com avaliação de progressão por tomografia de córnea."],[["H52.2"],"Investigação de astigmatismo com suspeita de irregularidade corneana."],[["H52.1","H52.0","H44.2"],"Avaliação corneana (curvatura, elevação e espessura) para indicação de cirurgia refrativa e exclusão de ectasia."],[J_CATARATA,"Avaliação corneana no planejamento da cirurgia de catarata (astigmatismo corneano e escolha da lente intraocular)."],[null,"Avaliação da curvatura, elevação e espessura da córnea."]],
  "Topografia de córnea":[[J_ECTASIA,"Diagnóstico e acompanhamento de ectasia corneana (ceratocone)."],[["H52.2"],"Investigação de astigmatismo com suspeita de irregularidade corneana."],[["H52.1","H52.0","H44.2"],"Avaliação da curvatura corneana para indicação de cirurgia refrativa e exclusão de ectasia."],[J_CATARATA,"Avaliação do astigmatismo corneano no planejamento da cirurgia de catarata."],[null,"Avaliação da curvatura da córnea."]],
  "Paquimetria":[[J_GLAUCOMA,"Medida da espessura corneana central para interpretação da pressão intraocular em suspeita/diagnóstico de glaucoma."],[J_ECTASIA,"Acompanhamento da espessura corneana em ectasia corneana."],[null,"Avaliação da espessura corneana."]],
  "Microscopia especular":[[J_CATARATA,"Avaliação do endotélio corneano no pré-operatório de cirurgia de catarata."],[["H18.5"],"Avaliação de distrofia endotelial corneana."],[J_ECTASIA,"Avaliação endotelial em paciente com ectasia corneana e uso de lente de contato."],[null,"Avaliação da densidade e da morfologia das células endoteliais da córnea."]],
  "Mapeamento de retina":[[J_DIABETES,"Rastreamento e estadiamento de retinopatia diabética."],[["H43"],"Avaliação da periferia retiniana por alteração do vítreo (descolamento do vítreo posterior / moscas volantes)."],[["H44.2","H52.1"],"Avaliação da periferia retiniana em miopia (risco de degenerações e roturas)."],[J_CATARATA,"Avaliação da retina no pré-operatório de cirurgia de catarata."],[J_GLAUCOMA,"Avaliação do nervo óptico e da retina em suspeita/diagnóstico de glaucoma."],[null,"Avaliação do fundo de olho sob midríase."]],
  "Retinografia":[[J_GLAUCOMA,"Documentação do disco óptico para acompanhamento de glaucoma."],[J_DIABETES,"Documentação e acompanhamento de retinopatia diabética."],[["H35.3"],"Documentação e acompanhamento de maculopatia."],[null,"Documentação fotográfica do fundo de olho."]],
  // OCT: descrição completa, como os convênios exigem na guia (23/10/2026)
  "OCT de mácula":[[["H35.3"],"Paciente com doença macular (degeneração macular). Solicito tomografia de coerência óptica (OCT) de mácula para avaliação da espessura e da estrutura das camadas da retina macular, pesquisa de fluido intra/sub-retiniano e de neovascularização, exame necessário para definição de conduta e acompanhamento do tratamento."],
    [J_DIABETES,"Paciente diabético. Solicito tomografia de coerência óptica (OCT) de mácula para investigação e quantificação de edema macular diabético, exame necessário para indicação e acompanhamento do tratamento."],
    [["H35.8","H34"],"Solicito tomografia de coerência óptica (OCT) de mácula para investigação e quantificação de edema macular, exame necessário para definição de conduta e acompanhamento."],
    [J_CATARATA,"Pré-operatório de cirurgia de catarata. Solicito tomografia de coerência óptica (OCT) de mácula para afastar doença macular que limite o prognóstico visual e orientar a escolha da lente intraocular."],
    [null,"Solicito tomografia de coerência óptica (OCT) de mácula para avaliação da espessura e da estrutura das camadas da retina macular, exame necessário para o diagnóstico e o acompanhamento de alteração macular com repercussão na acuidade visual."]],
  "OCT de nervo óptico (papila)":[[J_GLAUCOMA,"Paciente com glaucoma / suspeita de glaucoma (escavação do disco óptico aumentada e/ou pressão intraocular elevada). Solicito tomografia de coerência óptica (OCT) de nervo óptico (papila) para quantificação da camada de fibras nervosas da retina e análise do disco óptico, exame necessário para o diagnóstico e o acompanhamento da progressão da doença."],
    [["H47"],"Solicito tomografia de coerência óptica (OCT) de nervo óptico (papila) para investigação de neuropatia óptica, com quantificação da camada de fibras nervosas da retina e análise do disco óptico."],
    [null,"Solicito tomografia de coerência óptica (OCT) de nervo óptico (papila) para quantificação da camada de fibras nervosas da retina e análise do disco óptico, exame necessário para o diagnóstico e o acompanhamento."]],
  "Campimetria visual":[[J_GLAUCOMA,"Avaliação do campo visual para diagnóstico e acompanhamento de glaucoma."],[["H47","H46"],"Investigação de neuropatia óptica."],[null,"Avaliação do campo visual."]],
  "Tonometria":[[J_GLAUCOMA,"Medida da pressão intraocular para diagnóstico e acompanhamento de glaucoma."],[J_ECTASIA,"Medida da pressão intraocular em paciente com ectasia corneana (córnea fina altera a leitura)."],[null,"Medida da pressão intraocular."]],
  "Curva diária de pressão ocular":[[J_GLAUCOMA,"Avaliação da variação da pressão intraocular ao longo do dia em suspeita/diagnóstico de glaucoma."],[null,"Avaliação da variação diurna da pressão intraocular."]],
  "Gonioscopia":[[J_GLAUCOMA,"Avaliação do ângulo da câmara anterior para classificação do glaucoma."],[null,"Avaliação do ângulo da câmara anterior."]],
  "Teste de sobrecarga hídrica":[[J_GLAUCOMA,"Avaliação da facilidade de escoamento do humor aquoso em suspeita/diagnóstico de glaucoma."],[null,"Avaliação da facilidade de escoamento do humor aquoso."]],
  "Teste de lente de contato":[[J_ECTASIA,"Teste de adaptação de lente de contato para reabilitação visual em ectasia corneana (ceratocone)."],[null,"Teste de adaptação de lente de contato para correção visual."]],
  "Biometria":[[J_CATARATA,"Cálculo da lente intraocular para cirurgia de catarata."],[null,"Cálculo de lente intraocular."]],
  "Avaliação cardiológica com risco cirúrgico":[[J_CATARATA,"Avaliação cardiológica pré-operatória, com risco cirúrgico, para cirurgia de catarata."],[null,"Avaliação cardiológica pré-operatória, com risco cirúrgico, para cirurgia oftalmológica."]],
  "Ultrassonografia ocular":[[J_CATARATA,"Avaliação do segmento posterior por opacidade de meios (catarata densa)."],[["H43.1"],"Avaliação do vítreo e da retina por hemorragia vítrea."],[["H33"],"Investigação de descolamento de retina."],[null,"Avaliação do segmento posterior do olho."]],
};

const LISTA=["Pentacam", "Topografia de córnea", "Paquimetria", "Tonometria", "Microscopia especular", "Mapeamento de retina", "Retinografia", "OCT de mácula", "OCT de nervo óptico (papila)", "Campimetria visual", "Curva diária de pressão ocular", "Gonioscopia", "Teste de sobrecarga hídrica", "Teste de lente de contato", "Biometria", "Ultrassonografia ocular", "Avaliação cardiológica com risco cirúrgico"];
// Pré-exame não tem diagnóstico: o MOTIVO marcado pela equipe aponta o grupo de
// CID cuja regra serve de justificativa (sem citar o CID — quem diagnostica é o médico).
const MOTIVO_GRUPO=[[/ceratocone/i,J_ECTASIA],[/refrativa/i,["H52.1"]],[/catarata/i,J_CATARATA],[/glaucoma|press[ãa]o/i,J_GLAUCOMA],[/diabet/i,J_DIABETES]];
function justPorMotivos(exame, motivos){
  const regras=JUST[exame]; if(!regras) return "";
  for(const [re,grupo] of MOTIVO_GRUPO){
    if(!(motivos||[]).some(m=>re.test(m))) continue;
    const r=regras.find(([pref])=>pref&&pref.some(p=>grupo.some(g=>g.startsWith(p)||p.startsWith(g))));
    if(r) return r[1];
  }
  const d=regras.find(r=>!r[0]); return d?d[1]:"";
}
window.ExamesPedido={J_GLAUCOMA,J_DIABETES,J_CATARATA,J_ECTASIA,JUST,LISTA,justPorMotivos};
})();
