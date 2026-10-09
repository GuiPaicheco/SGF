// Catálogo versionado de mensagens. Referências jurídicas precisam de aceite institucional.
export const guidanceVersion='2026-10-09.1';
export const supportChannels={rh:'Em dúvidas sobre direitos ou regras, consulte a norma vigente indicada pelo RH e procure o RH da sua unidade.',ti:'Para problemas do sistema, procure os Administradores ou a TI da Prefeitura de Betim.'};
export const guidanceCatalog: Record<string,{category:string;explanation:string;status:number;normative:boolean;channel?:'rh'|'ti'}>={
 SUBMISSION_PERIOD_INVALID:{category:'validation',explanation:'As datas, a quantidade de dias ou a jornada informadas não são coerentes. Confira início, fim, retorno e parcelas antes de enviar.',status:400,normative:false},
 SUBMISSION_ACQUISITION_RULE:{category:'rule',explanation:'O início das férias regulamentares precisa ser posterior ao fim do período aquisitivo informado. Este impedimento ocorre antes do envio; não é recusa administrativa.',status:400,normative:true},
 SUBMISSION_ADMISSION_RULE:{category:'validation',explanation:'A admissão não pode ser anterior ao nascimento, posterior ao início solicitado ou posterior ao fim do período aquisitivo. Confira os dados funcionais.',status:400,normative:false},
 RESPONSIBILITY_DAYS_INCOMPLETE:{category:'validation',explanation:'Defina uma unidade autorizadora para cada dia útil exibido na simulação.',status:400,normative:false},
 RESPONSIBILITY_UNIT_INELIGIBLE:{category:'validation',explanation:'Uma atuação não está ativa, autorizada ou vigente para o dia escolhido. Confira o vínculo e a unidade responsável.',status:400,normative:false},
 RESPONSIBILITY_DAY_DUPLICATED:{category:'validation',explanation:'Cada dia deve ter apenas uma unidade responsável. Revise a distribuição.',status:400,normative:false},
 INSUFFICIENT_VALIDATED_BALANCE:{category:'rule',explanation:'O saldo validado da matrícula não cobre as horas solicitadas. A inclusão no calendário não foi realizada. Confira o saldo com o RH; isso não registra automaticamente uma recusa.',status:400,normative:true},
 REJECTION_REASON_INACTIVE:{category:'administrative',explanation:'O motivo selecionado não está ativo. Atualize a solicitação e escolha um motivo disponível antes de recusar.',status:400,normative:false},
 REJECTION_BANK_INVALID:{category:'administrative',explanation:'Informe o saldo real conferido e as horas necessárias, que devem superar esse saldo. A recusa registra a informação; não corrige automaticamente o banco de horas.',status:400,normative:false},
 REJECTION_CONFLICT_INVALID:{category:'administrative',explanation:'Especifique o funcionário, sua atuação e o período do conflito; explique por que ele impede a autorização.',status:400,normative:false},
 REJECTION_CONFLICT_MEMBER_INVALID:{category:'administrative',explanation:'A atuação relacionada deve pertencer ao CNES/lotação da revisão e estar vigente em todo o período informado.',status:400,normative:false},
 REJECTION_DATA_INVALID:{category:'administrative',explanation:'Preencha o motivo de recusa e uma justificativa de 3 a 2000 caracteres. Os campos específicos também são obrigatórios.',status:400,normative:false},
 REASON_VERSION_CONFLICT:{category:'concurrency',explanation:'Outro administrador alterou este motivo. Atualize o catálogo e confira a nova versão antes de salvar.',status:409,normative:false,channel:'ti'},
 REASON_CATALOG_INVALID:{category:'validation',explanation:'Confira código, nome, modo de preenchimento, ordem, versão e justificativa do motivo.',status:400,normative:false,channel:'ti'},
 REASON_MODE_IMMUTABLE:{category:'validation',explanation:'O modo de preenchimento não pode mudar. Crie outro motivo e desative o anterior, preservando as recusas já registradas.',status:400,normative:false,channel:'ti'},
 REASON_LAST_ACTIVE:{category:'validation',explanation:'Mantenha pelo menos um motivo ativo para permitir recusas.',status:400,normative:false,channel:'ti'},
 TECHNICAL_ERROR:{category:'technical',explanation:'Não foi possível concluir a operação. Atualize a tela e tente novamente. Se persistir, informe a operação e o horário à equipe de suporte, sem compartilhar senhas.',status:500,normative:false},
};
export function userGuidance(code:string){
 const item=guidanceCatalog[code];if(!item)return null;
 const support=supportChannels[item.channel || (item.category==='technical'?'ti':'rh')];
 return {code,category:item.category,status:item.status,version:guidanceVersion,
 error:`${item.explanation} ${support}`,support,
 reference:item.normative?{status:'pending_institutional_approval',citation:null,approved_by:null,valid_from:null,valid_until:null}:null};
}
