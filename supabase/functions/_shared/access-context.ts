export type AccessContext = {
  role: string;
  bondId: string | null;
  bondUnitId: string | null;
  cnesUnitId: string | null;
  lotacaoId: string | null;
  servidorId: string | null;
  registration: string | null;
  global: boolean;
};

const header = (request: Request, name: string) => request.headers.get(name)?.trim() || null;

export const validateAccessContext = async (
  admin: any,
  request: Request,
  profileId: string,
  grantedRoles: string[] = [],
): Promise<AccessContext> => {
  const role = header(request, 'x-sgf-role') || '';
  const bondId = header(request, 'x-sgf-bond');
  const cnesUnitId = header(request, 'x-sgf-cnes');
  const lotacaoId = header(request, 'x-sgf-lotacao');
  if (!grantedRoles.includes(role)) throw new Error('INVALID_ACCESS_CONTEXT');
  // Revalidar no banco: sessões/contextos salvos não conservam privilégios revogados.
  const { data: account, error: accountError } = await admin.from('profiles')
    .select('roles,disabled_at,must_change_password').eq('id',profileId).single();
  if(accountError || !account || account.disabled_at || account.must_change_password
    || !account.roles?.includes(role)) throw new Error('INVALID_ACCESS_CONTEXT');

  if (role === 'administrador') {
    if (bondId || cnesUnitId || lotacaoId) throw new Error('INVALID_ACCESS_CONTEXT');
    return { role, bondId: null, bondUnitId: null, cnesUnitId: null, lotacaoId: null, servidorId: null, registration: null, global: true };
  }

  if (role === 'rh' || role === 'diretor') {
    if (bondId || !lotacaoId || !cnesUnitId) throw new Error('INVALID_ACCESS_CONTEXT');
    const {data: location,error: locationError} = await admin.from('lotacoes').select('id').eq('id',lotacaoId).eq('active',true).maybeSingle();
    if(locationError || !location) throw new Error('INVALID_ACCESS_CONTEXT');
    const {data: cnes,error: cnesError} = await admin.from('cnes_units').select('id').eq('id',cnesUnitId).eq('active',true).maybeSingle();
    if(cnesError || !cnes) throw new Error('INVALID_ACCESS_CONTEXT');
    const { data: scope, error: scopeError } = await admin.from('profile_scopes')
      .select('lotacao_id').eq('profile_id', profileId).eq('lotacao_id', lotacaoId).maybeSingle();
    if (scopeError || !scope) throw new Error('INVALID_ACCESS_CONTEXT');
    if (cnesUnitId) {
      const { data: mapping, error: mappingError } = await admin.from('lotacao_cnes_units')
        .select('lotacao_id').eq('lotacao_id', lotacaoId).eq('cnes_unit_id', cnesUnitId).maybeSingle();
      if (mappingError || !mapping) throw new Error('INVALID_ACCESS_CONTEXT');
    }
    return { role, bondId: null, bondUnitId: null, cnesUnitId, lotacaoId, servidorId: null, registration: null, global: false };
  }

  if (role !== 'servidor' || !bondId || !cnesUnitId) throw new Error('INVALID_ACCESS_CONTEXT');
  if(lotacaoId) {
    const {data: location,error: locationError}=await admin.from('lotacoes').select('id').eq('id',lotacaoId).eq('active',true).maybeSingle();
    if(locationError || !location) throw new Error('INVALID_ACCESS_CONTEXT');
  }
  const {data: cnes,error: cnesError} = await admin.from('cnes_units').select('id').eq('id',cnesUnitId).eq('active',true).maybeSingle();
  if(cnesError || !cnes) throw new Error('INVALID_ACCESS_CONTEXT');
  const { data: bond, error: bondError } = await admin.from('employment_bonds')
    .select('id,servidor_id,registration,servidor:servidores!employment_bonds_servidor_id_fkey(profile_id,active)')
    .eq('id', bondId).eq('active', true).maybeSingle();
  const employee = Array.isArray(bond?.servidor) ? bond.servidor[0] : bond?.servidor;
  if (bondError || !bond || employee?.profile_id !== profileId || !employee?.active) throw new Error('INVALID_ACCESS_CONTEXT');
  let unitQuery = admin.from('employment_bond_units').select('id,internal_lotacao_id')
    .eq('bond_id', bondId).eq('cnes_unit_id', cnesUnitId).eq('active', true);
  unitQuery = lotacaoId ? unitQuery.eq('internal_lotacao_id', lotacaoId) : unitQuery.is('internal_lotacao_id', null);
  const { data: unit, error: unitError } = await unitQuery.maybeSingle();
  if (unitError || !unit) throw new Error('INVALID_ACCESS_CONTEXT');
  return { role, bondId, bondUnitId: unit.id, cnesUnitId, lotacaoId: unit.internal_lotacao_id, servidorId: bond.servidor_id, registration: bond.registration, global: false };
};

export const contextHeaders = (context: AccessContext) => ({
  'x-sgf-role': context.role,
  ...(context.bondId ? { 'x-sgf-bond': context.bondId } : {}),
  ...(context.cnesUnitId ? { 'x-sgf-cnes': context.cnesUnitId } : {}),
  ...(context.lotacaoId ? { 'x-sgf-lotacao': context.lotacaoId } : {}),
});
