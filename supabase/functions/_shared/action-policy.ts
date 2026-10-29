// Lista explícita de ações: uma ação nova nasce bloqueada até revisão de permissão.
const management=['diretor','rh','administrador'];
const operators=['rh','administrador'];
const policies: Record<string,Record<string,string[]>>={
  operations:{
    'audit-history':management,'notifications':['servidor',...management],
    'read-notifications':['servidor',...management],'archives':management,'archive-request':operators,
    'unit-calendar':management,'manual-conflicts':management,'manual-conflict-save':management,
    'scale-list':management,'scale-save':operators,'time-bank':operators,'bond-resources':['servidor',...management],'bond-right-save':operators,'bond-save':operators,
    'conflict-employees':management,'rejection-reasons':management,
    'rejection-reason-save':['administrador'],'legacy-approval':operators,
    'pending-distribution-editor':['servidor','rh','administrador'],'redistribute-pending-day':['servidor','rh','administrador'],
    'revision-plan':['administrador'],'revision-commit':['administrador'],
    'unit-review':management,'operation':['servidor',...operators]
  },
  catalogs:{list:operators,history:operators,'save-employee':operators,
    'save-location':['administrador'],'save-reference':['administrador'],
    'calendar-list':['administrador'],'calendar-preview':['administrador'],'calendar-save':['administrador'],'calendar-delete':['administrador'],
    'organization-list':['administrador'],'organization-save':['administrador']},
  inclusions:{list:operators,approve:operators,reject:operators},
  access:{list:operators,approve:operators,reject:operators}
};
export function actionAllowed(service:string,action:string,role:string) {
  if(!Object.hasOwn(policies,service) || !Object.hasOwn(policies[service],action)) return false;
  return policies[service][action].includes(role);
}
