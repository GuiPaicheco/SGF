# Integração cadastral e calendário mensal RH — 17/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## Escopo entregue

Este bloco entrega a integração administrativa do cadastro CNES conferido a um vínculo funcional e a consulta mensal por unidade. **Não entrega ainda a gravação direta de afastamentos.** A decisão atualizada sobre folgas foi incorporada à fila BH01–BH05 antes de implementar essa gravação.

- Administrador: **Cadastros → Contas RH e operadores → Integrar vínculo**. Exige matrícula real, cargo municipal, admissão e vínculo municipal conferidos, justificativa e confirmação explícita da unidade polo.
- Pode associar um vínculo existente da mesma matrícula/unidade ou criar funcionário e vínculo funcional quando ainda não existem. Não cria conta Auth, CPF, matrícula fictícia, direito ou saldo. Preserva pessoas/saldos antigos e recusa trocar silenciosamente a associação ou outro polo já definido.
- `private.rh_registry_bonds` relaciona atuação CNES, vínculo e versão conferida. Mudanças na fonte/conferência tornam necessária nova confirmação; a leitura do histórico continua disponível.
- RH com operador autorizado entra na consulta mensal. Administrador usa **Cadastros → Calendário RH** e seleciona a unidade explicitamente.
- Colunas independentes: nome, cargo, CBO e equipe; matrícula, carga semanal e estado da conferência acompanham a linha. Mantém horas fracionadas sem converter carga semanal em diária.
- Consulta por mês, busca literal por nome/matrícula/cargo/CBO/equipe e páginas de 50 atuações. Somente afastamentos legados já programados são projetados; distribuição diária antiga é respeitada quando existir. Atuação de CBO distinto pode gerar outra linha do mesmo vínculo, sem criar outro afastamento.
- Legado com vínculo conhecido aparece mesmo sem importação CNES. Registros antigos sem vínculo identificável permanecem na escala legada para conciliação; não são associados por nome.

## Dados reais

Coleta atual da UBS Amazonas incorporada pelo endpoint administrativo autenticado: **40 inclusões, zero alterações, zero ausências e zero associações de equipe pendentes** na prévia. Origem CNES HTML público, competência não informada pela fonte. Todos os 40 registros permanecem **pendentes de conferência municipal**, sem matrícula/cargo/direito inferidos.

Contagens após a incorporação: **42 contas institucionais**, **3 servidores legados preservados**, **40 cadastros CNES pendentes**, **zero vínculos integrados reais** e **zero operadores autorizados**. Não escolhemos pessoas reais para operar o sistema. Demais UBS e Secretaria continuam com incorporação/conferência na fila CN10.

HTTP autenticado do Administrador: Amazonas retornou 41 atuações (40 CNES e uma legada) e Secretaria retornou duas legadas no mês consultado, sem afastamentos em outubro. Consulta HTTP autenticada do RH Amazonas sem operador retornou **403 / RH_OPERATOR_REQUIRED**.

## Validação técnica

- Código principal: `9118111`; migração **20261017222951_rh_registry_calendar**, aplicada com a mesma versão local/remota; `manage-rh` publicada na **v2**, validando identidade e contexto no backend.
- **353 testes locais aprovados**, sintaxe dos módulos, build estático e tipos Deno da função `manage-rh` aprovados. [CI do código principal](https://github.com/GuiPaicheco/SGF/actions/runs/39075358079) aprovado em testes, reconstrução, ensaios SQL e restauração sintética.
- SQL real com rollback antes e depois da publicação: conferência obrigatória, polo explícito, criação sem Auth/CPF, reconfirmação sem duplicar funcionário, conflito de versão, carga de 32,5 horas preservada, seleção de operador, busca literal, filtro mensal, programado legado, histórico após mudança da fonte, Administrador e negação de outro CNES/operador revogado/API direta.
- Ensaio adicionado ao CI em `prepare-workflow-rehearsal.mjs rhcalendar`, reutilizando fundação sintética independente. Testes de carga/concorrência extensos permanecem pendentes para ambiente isolado.
- Frontend testa ano bissexto, distribuição legada por dia, colunas/escape de HTML, seleção administrativa explícita e descarte de resposta após navegação.
- Chrome no site publicado, com Administrador real: abriu Calendário RH e confirmou as 41 atuações de Amazonas e as colunas funcionais; depois abriu Integrar vínculo e confirmou o bloqueio do botão de gravação por falta de conferência municipal. Nenhuma integração ou autorização real foi feita no navegador. Console sem erros/avisos nessa verificação. Sessão encerrada ao final. Evidências locais fora do Git/site: `.tools/rh-calendar-live.png` e `.tools/rh-binding-pending-live.png`.
- Validação no Chrome identificou a referência antiga do script principal sob cache imutável. Corrigido no commit `47431d1`: o build agora gera versões por SHA-256 do conteúdo de cada JS/CSS. Testes verificam troca de URL quando o conteúdo muda e falha de build para asset ausente. Evita depender de atualização manual de query strings.
- Banco: uma nova tabela privada com RLS e sem grants de `anon`/`authenticated`; RPCs somente para o backend. Nenhuma função `SECURITY DEFINER` nova. FKs novas têm índices. Consulta limitada a um mês, 50 linhas/página, busca de até 120 caracteres e timeout de oito segundos; resultado superior a mil períodos exige refinar a consulta, sem truncamento silencioso.
- Advisor de segurança: uma informação nova de RLS sem policy na tabela privada (negação deliberada). Permanece a advertência anterior sobre [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Advisor de desempenho não indicou FK nova sem índice; as informações anteriores sobre [índices de FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) seguem em TE02.

## Nova regra de banco de horas e próximo bloco

Decisão do responsável em 17/10: manter os esquemas de férias e folgas, perguntando as horas disponíveis no lançamento, **sem manter banco de horas no usuário/funcionário**. Mostrar dias possíveis e horas faltantes; se insuficientes, orientar realização das horas ou permitir confirmação explícita do RH com justificativa. Guardar números e autoria somente como histórico do lançamento, sem atualizar saldo acumulado ou criar dívida automática. Cancelamento de registro novo não estorna conta de horas; movimentos antigos são preservados.

Próximo bloco: implementar prévia e gravação direta conforme essa regra, validação vigente do operador/polo, idempotência e snapshots, mantendo cálculo de férias e fracionamento existentes. Depois, adaptar comprovante e concluir alteração/cancelamento. A publicação técnica não equivale à homologação pela Diretora/RH.
