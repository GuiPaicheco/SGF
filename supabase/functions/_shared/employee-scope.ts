import type { AccessContext } from './access-context.ts';

// Mesmo CNES não significa mesma lotação interna. Não usar lotação legada como fallback.
export async function employeeInAccessContext(admin: any, context: AccessContext, employeeId: string) {
  if(context.global) return true;
  if(context.role==='servidor') return context.servidorId===employeeId;
  if(!context.cnesUnitId || !context.lotacaoId) return false;
  const {data:location,error:locationError}=await admin.from('lotacoes')
    .select('is_internal_allocation').eq('id',context.lotacaoId).eq('active',true).single();
  if(locationError || !location) throw new Error('INVALID_ACCESS_CONTEXT');
  const {data:bonds,error:bondError}=await admin.from('employment_bonds')
    .select('id').eq('servidor_id',employeeId).eq('active',true);
  if(bondError) throw bondError;
  if(!bonds?.length) return false;
  let query=admin.from('employment_bond_units').select('id').in('bond_id',bonds.map((bond:any)=>bond.id))
    .eq('cnes_unit_id',context.cnesUnitId).eq('active',true);
  query=location.is_internal_allocation ? query.eq('internal_lotacao_id',context.lotacaoId) : query.is('internal_lotacao_id',null);
  const {data,error}=await query.limit(1);
  if(error) throw error;
  return Boolean(data?.length);
}

export function accessRequestInScope(request: any, cnesIds: Set<string>, locationId: string, internal: boolean) {
  if(request.model_version!==2) return false;
  const bonds=request.access_request_bonds || [];
  // Uma aprovação de acesso afeta todos os vínculos: nenhum deles pode escapar do escopo.
  return bonds.length>0 && bonds.every((bond:any)=>bond.units?.length>0 && bond.units.every((unit:any)=>
    cnesIds.has(unit.cnes_unit_id) && (unit.internal_lotacao_id || null)===(internal ? locationId : null)));
}
