# Validação do bloco 05 — notificações e auditoria

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

09/10/2026. Escopo: piloto compartilhado autorizado, não aceite institucional de produção.

## 01. Alterações implementadas

- Auditoria transacional em cadastros, vínculos, atuações, equipes/polo, acessos, inclusões, permissões, direitos, banco de horas, solicitações, períodos e catálogos. Identidade encaminhada pelas funções após validar a sessão/contexto; registros públicos sem identidade comprovada permanecem explicitamente sem autor.
- Nome do autor, matrícula e nomes dos afetados capturados nos eventos novos; identificação coletiva da escala, sem inventar um sujeito único. Histórico anterior preservado, com busca por relações existentes sem inventar snapshots históricos.
- Remoção de campos e padrões conhecidos de credenciais na gravação e na resposta. RH/Diretor recebem somente diferenças operacionais autorizadas, não snapshots cadastrais completos.
- Avisos de períodos, recursos/cadastro e conflitos nominais; correção da colisão de chaves de feriado quando dois protocolos afetam a mesma unidade. Escala geral de UBS sem lotação interna fictícia.
- Classificação dos avisos legados por metadados comprovados. Gestão sem escopo confiável permanece preservada e oculta para RH/Diretor; nenhum histórico excluído.
- Paginação e validação de IDs/páginas nos avisos; mesma guarda para consulta/marcação. Resposta atrasada não substitui a tela depois de trocar contexto ou sair das notificações.
- API sem permissão para alterar/apagar trilha existente; cadastro administrativo composto e edição de acesso/lotação usam operações transacionais. Auth/DB continuam serviços separados, com limite explicado no procedimento operacional.

## 02. Ensaios e evidências

- Suíte local: 273 testes aprovados, sem falhas.
- Ensaio SQL do bloco 05: 21 verificações aprovadas, na mesma transação com rollback. Cobertura: autoria, dois escopos, antes/depois, deduplicação, eventos coletivos, segredo removido, avisos legados, períodos, conflito nominal, dois pedidos sob o mesmo feriado, falha forçada da auditoria desfazendo mutação, impossibilidade de sobrescrever histórico pela API, banco por vínculo, edição composta e registro da troca de senha sem credencial.
- Regressões SQL com a migração: bloco 03 (24), bloco 04 (16), cadastro (10), calendário (16), gestão por unidade (17), redistribuição (8), todas aprovadas. O ensaio de redistribuição passou a declarar vigência sintética explícita, eliminando dependência do dia de execução.
- Migrações `20261009125707_block_five_notifications_audit.sql` e `20261009130354_block_five_safe_password_flag.sql` aplicadas ao projeto `ijhvbzomakbbxverqfqh`; funções atualizadas: manage-profiles 15, manage-access 11, manage-inclusions 6, manage-operations 14 e access-auth 13.
- Inspeção de segurança após migração: sem erro; 16 avisos informativos de tabelas internas sem políticas de cliente e alerta pré-existente de proteção contra senhas vazadas desativada. A decisão sobre essa proteção continua no bloco 09. Referências: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

API real: 7 grupos aprovados pelo script `scripts/verify-block-five-pilot.mjs`: cadastro/troca de senha de conta nova, banco auditado, aviso nominal sem vazamento entre CNES, buscas por afetado/autor/matrícula/evento/período, isolamento RH/Diretor, páginas de 50 eventos/30 avisos sem repetição no recorte estável e marcação de leitura isolada. Conta técnica `66e3b69f-de70-4b3b-8611-e71ad6165018` desativada e alerta encerrado, sem exclusão do histórico. Primeiro ensaio `5757455c-dfae-4dee-bac9-25bd1fd59e11` igualmente encerrado após corrigir comparação do próprio teste (ID não faz parte do DTO de aviso). Nenhum e-mail enviado nem senha de conta existente alterada. Conta TESTE de recuperação preservada.

Interface do piloto: login administrativo, busca por afetado/evento e detalhes históricos conferidos; segunda página de notificações exibiu 30 avisos sem erro nem texto corrompido no recorte revisado. Corrigido o motivo exibido no encerramento de conflito (usa closure_reason do snapshot sem sobrescrever o motivo original). CNES separado visualmente do título do aviso. Respostas atrasadas do histórico também possuem guarda de rota/contexto. Evidências locais em `.sgf-backups/bloco05/`. Revisão de todas as demais telas e acessibilidade institucional permanece no bloco 08.

GitHub main atualizado; versão funcional `5b49820ecaf5bf0e1b03828eb46144c894be8fb1` confirmada READY no Vercel, destino https://sgfbetim.vercel.app/. Validação guiada pelas skills Supabase/Postgres (trilha transacional, ACL e isolamento), Vercel deployments-cicd (projeto/commit/destino verificados) e Computer Use (conferência visual da interface publicada). Não se trata de aprovação jurídica nem de garantia de ausência de falhas.

## 03. Limites e operação

[AUDITORIA_RETENCAO.md](AUDITORIA_RETENCAO.md) formaliza desativação, compensações e condições para anonimização. Não houve anonimização ou exclusão física, nem foi inventado prazo legal de retenção. Aprovação institucional continua no bloco 08. Paginação por página não representa exportação com snapshot; testes funcionais não representam ensaio de carga ou revisão jurídica.
