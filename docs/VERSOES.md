# Versões do SGF

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
