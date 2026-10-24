// Verificação heurística: nunca imprimir o valor que correspondeu a um segredo.
export function inspectPublicFile(name, content = '') {
  const path = name.replaceAll('\\', '/');
  const issues = [];
  if (/^(?:\.sgf-backups|\.sgf-imports|\.tools|\.vscode|\.vercel|\.netlify|dist|output|tmp)\//.test(path)
    || /(?:^|\/)\.env(?:\..*)?$/.test(path) && !path.endsWith('/.env.example') && path !== '.env.example'
    || /\.(?:pem|key|dump|backup)$/i.test(path)) {
    issues.push({ path, line: 0, kind: 'arquivo interno ou segredo potencial' });
  }
  const patterns = [
    ['chave privada', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['segredo Supabase', /\b(?:sb_secret_[A-Za-z0-9_-]{16,}|sbp_[a-f0-9]{30,})\b/],
    ['credencial em URL', /\b(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/i],
  ];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const [kind, pattern] of patterns) {
      if (pattern.test(line)) issues.push({ path, line: index + 1, kind });
    }
    for (const match of line.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
      try {
        if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') {
          issues.push({ path, line: index + 1, kind: 'JWT privilegiado Supabase' });
        }
      } catch { /* Uma string semelhante a JWT pode ser somente um exemplo. */ }
    }
  }
  return issues;
}
