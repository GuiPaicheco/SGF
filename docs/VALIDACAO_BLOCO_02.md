# Bloco 02 — evidências técnicas e limites

Data: 08/10/2026. Ambiente: piloto compartilhado autorizado, Supabase `ijhvbzomakbbxverqfqh`. Não constitui homologação institucional.

## 01. Implementação

- Administração de CNES/equipes, INE com fonte oficial e justificativa, desativação e controle de versão.
- Lotação interna exige Secretaria superior; UBS não exige subdivisão. Compartilhamento de CNES não concede acesso à outra diretoria.
- Dados funcionais, direitos/períodos aquisitivos e banco de horas por vínculo. Matrículas distintas possuem recursos distintos; vários CNES do mesmo vínculo não duplicam recursos.
- Saldo declarado separado do validado; extrato com autoria; gravação atômica, proteção contra repetição e versões antigas. Consumo único na primeira inclusão no calendário e estorno único no encerramento recusado/cancelado.
- Solicitação por segunda matrícula utiliza dados do vínculo e não cria conta financeira legada por pessoa. Direito deve pertencer à matrícula solicitante.
- Contexto e logout limpam recursos carregados; campo legado opcional de equipe não interrompe gravação.

## 02. Banco e funções

Migrations aplicadas: `block_two_catalog_and_bond_balances`, `block_two_validation_fixes` e `block_two_organization_integrity`. Arquivos locais mantidos em `supabase/migrations`; não reaplicar no mesmo banco.

`manage-catalogs` e `manage-operations` publicadas, com verificação JWT mantida e autenticação/validação de contexto na função. A chave pública do navegador não permite escrever diretamente nos recursos financeiros; funções sensíveis são exclusivas do servidor.

## 03. Testes

1. Suíte local: 246 testes aprovados, zero falhas; sintaxe de `app.js` e `organization-ui.js` verificada.
2. PostgreSQL real: 29 cenários aprovados em `tests/block-two-rehearsal.sql`, incluindo duas matrículas, CNES compartilhado, direitos incorretos, escopo de RH/servidor, versão antiga, reenvio, débito único, estorno e reversão por insuficiência de saldo. Casos adicionais confirmam jornada vazia opcional, preservação da fonte de INE e bloqueio de transformação silenciosa de unidade geral já utilizada.
3. Uma repetição do ensaio foi executada sem o invólucro transacional e deixou fixtures. Foram retirados exclusivamente usuários/estrutura/pedidos/recursos/auditoria sintéticos desse ensaio, sem alterar dados anteriores. O arquivo agora inclui BEGIN/ROLLBACK para impedir execução acidental sem reversão. Após repetir, consulta confirmou zero usuários `f100…`, zero novas contas/extrato e catálogo original de 48 CNES/176 equipes, com dois INE pendentes.
4. Não foram alteradas a senha nem a conta TESTE de recuperação. Contas técnicas desativadas do bloco 01 permanecem como estavam.
5. Advisors: sem achados de nível ERROR; 16 INFO de RLS sem políticas em tabelas operadas exclusivamente pelo servidor, com acesso direto negado. WARN preexistente de proteção contra senhas vazadas permanece no bloco 09. Referências: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
6. Navegador Chrome, frontend local contra funções publicadas: login administrativo, consulta de cadastros, catálogo com 48 CNES/176 equipes, busca EMULTI 004, editor de equipe com referência oficial, nova lotação com seleção CNES e três formulários de recursos da matrícula TESTE. Consultas HTTP autenticadas carregaram sem erro. Textos e alinhamento inspecionados; nenhum ID duplicado nem padrão de codificação corrompida nas telas novas. Não foram gravadas alterações na conta TESTE nem nos catálogos oficiais pelo navegador.
7. Publicação GitHub `main`: commit funcional `18922c4`; Vercel `dpl_yH4yKvwf6LSQGwfQfomUPjtKFDbN`, alvo production do piloto, status READY, build de aproximadamente 3,2 segundos. No domínio `https://sgfbetim.vercel.app/`, confirmados HTTP 200, versão `20261008-block2-1`, login administrativo, catálogo/filtro e recursos da matrícula TESTE; zero mensagens ERROR capturadas no console durante a navegação observada. Isso não é monitoramento contínuo nem varredura integral de logs de produção.

Evidências visuais locais (ignoradas no Git): `.sgf-backups/bloco02/catalogo-publicado.jpg` e `matricula-publicada.jpg`. Alteração preexistente de `logo.png` não foi incluída no commit. As skills de Supabase/Postgres orientaram RLS, índices, transações e bloqueios; Vercel orientou conferência de projeto/commit/publicação; Computer Use orientou navegação e conferência visual.

## 04. Limites e aceite

Não encerra testes de duas sessões realmente concorrentes, ciclo completo das solicitações pela interface, reconstrução em banco vazio ou revisão normativa. Direitos cadastrados não são concessão legal nem consumo automático; cálculos legais continuam sujeitos à validação do RH/Jurídico. Dados legados ambíguos exigem reconciliação explícita.

Para encerrar institucionalmente o bloco, faltam: decisão sobre duas unidades no mesmo dia; fonte dos INE de EMULTI 004 BUENO FRANCO/EMULTI 018 VILA CRISTINA; aceite da matriz de CNES/lotação/equipes/vínculos/autorizadores. Nenhuma dessas informações foi inventada.
