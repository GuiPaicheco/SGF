# Versões do SGF

## Decisão vigente — 07/10/2026

O Supabase `ijhvbzomakbbxverqfqh` passa a ser o piloto compartilhado de produção/homologação do novo modelo, por autorização do responsável. Não há bancos independentes. Foram aplicados `multi_unit_pilot_release` (sete migrations locais) e `multi_unit_pilot_read_labels`, e publicadas sete Edge Functions. Os hotfixes de primeiro acesso abaixo foram incorporados.

O workspace atual é a fonte do desenvolvimento e o `main` recebe o piloto. Frontend publicado no Vercel em **https://sgfbetim.vercel.app**, projeto `sgfbetim`, com integração GitHub e publicação exclusiva de `dist`. Primeiro deploy confirmado Ready no commit `49ffd320aff9fdbb37afa41ef0d51f2832f80b0f`. Netlify anterior está pausado por créditos e não é o endereço atual. `SGF-estavel`, commit `52742f88e5776f457e55f26024090b5080c1a56a`, preserva o código legado e não deve operar contra o banco atualizado. As pastas `SGF-homologacao-*` são snapshots bloqueados e sem banco. Nenhum plano pago contratado.

Snapshot parcial pré-migração em `.sgf-backups/20261007-pre-upgrade/`, fora do Git; não é backup integral do projeto nem restauração automática. As seções seguintes documentam a situação histórica de 06/10, substituída por esta decisão.

## Estável hospedada

- Pasta de manutenção: `../SGF-estavel`.
- Branch de correção: `codex/stable-access-fix`.
- Publicação: branch remota `main`, Netlify `sgfbetim.netlify.app`.
- Supabase atual: `ijhvbzomakbbxverqfqh`, com o modelo legado.
- Senha provisória para cadastro manual, aprovação de uma conta nova e reset administrativo: `123456`, conforme definição do responsável pelo piloto em 06/10/2026.
- O primeiro login exige uma senha pessoal diferente da provisória. Aprovar acessos adicionais não redefine a senha de uma conta existente.
- Recuperação por e-mail permanece disponível. Falhas de envio orientam procurar Administrador/TI para o reset autenticado.

## Em desenvolvimento

- Pasta: `../Solicitacao de Ferias`.
- Alterações de múltiplos vínculos, CNES e revisão diária permanecem locais.
- Não aplicar suas migrations nem publicar suas Edge Functions no Supabase da versão estável.
- Manter os hotfixes da versão estável separados e incorporá-los ao desenvolvimento quando compatíveis com o novo modelo.
- Antes de executar o novo modelo, configurar um banco independente de desenvolvimento/homologação.

## Correção de 06/10/2026

O fluxo antigo aprovava acesso por convite de e-mail, enquanto cadastro manual e reset geravam senhas aleatórias. A versão estável agora cria a conta com senha provisória conhecida, confirma o e-mail para permitir entrada imediata e exige a troca de senha. Nenhuma migration do novo modelo acompanha este hotfix.
