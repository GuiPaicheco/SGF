export function validateReasonCatalog(payload: any) {
  if (typeof payload.code !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(payload.code)
    || typeof payload.label !== 'string' || payload.label.trim().length < 3 || payload.label.trim().length > 160
    || !['bank','conflict','other'].includes(payload.input_mode) || typeof payload.active !== 'boolean'
    || !Number.isInteger(payload.display_order) || payload.display_order < 0 || payload.display_order > 10000
    || !Number.isInteger(payload.version) || payload.version < 0
    || typeof payload.justification !== 'string' || payload.justification.trim().length < 3 || payload.justification.trim().length > 2000)
    throw new Error('REASON_CATALOG_INVALID');
  return {code:payload.code,label:payload.label.trim(),input_mode:payload.input_mode,active:payload.active,
    display_order:payload.display_order,version:payload.version,justification:payload.justification.trim()};
}

export function validateRejection(reason: any, details: any, notes: unknown) {
  if (!reason?.active || !reason.code || !['bank','conflict','other'].includes(reason.input_mode)) throw new Error('REJECTION_REASON_INACTIVE');
  if (typeof notes !== 'string' || notes.trim().length < 3 || notes.trim().length > 2000) throw new Error('REJECTION_DATA_INVALID');
  const result: any = {code: reason.code};
  if (reason.input_mode === 'bank') {
    const available = details?.available_hours, required = details?.required_hours;
    if (typeof available !== 'number' || typeof required !== 'number' || !Number.isFinite(available) || !Number.isFinite(required)
      || available < 0 || required <= available || required > 100000) throw new Error('REJECTION_BANK_INVALID');
    Object.assign(result,{available_hours:available,required_hours:required});
  }
  if (reason.input_mode === 'conflict') {
    const name = details?.employee_name;
    const valid = (date: any) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(new Date(date).valueOf()) && new Date(date).toISOString().slice(0,10) === date;
    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 200 || !valid(details?.start_date)
      || !valid(details?.end_date) || details.end_date < details.start_date) throw new Error('REJECTION_CONFLICT_INVALID');
    Object.assign(result,{employee_name:name.trim(),start_date:details.start_date,end_date:details.end_date});
    if (details?.bond_unit_id != null) {
      if (typeof details.bond_unit_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(details.bond_unit_id)) throw new Error('REJECTION_CONFLICT_INVALID');
      result.bond_unit_id = details.bond_unit_id;
    }
  }
  return result;
}
