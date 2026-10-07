// O destino de recuperação é do próprio SGF, nunca um URL arbitrário do cliente.
export function recoveryRedirect(value: unknown, configured = '') {
  const canonical = 'https://sgfbetim.vercel.app/';
  const allowed = new Set([canonical, ...configured.split(',').map(item => item.trim()).filter(Boolean)]);
  if (value == null || value === '') return canonical;
  if (typeof value !== 'string') throw new Error('RECOVERY_REDIRECT_INVALID');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('RECOVERY_REDIRECT_INVALID'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !allowed.has(parsed.href))
    throw new Error('RECOVERY_REDIRECT_INVALID');
  return parsed.href;
}
