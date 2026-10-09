# Validação do bloco 03 — solicitações e gestão por unidade

Atualização: 08/10/2026. Concluído tecnicamente no escopo atual do piloto; não representa aceite institucional.

## 01. Implementação

- Reprogramação/redistribuição após decisões abre novo protocolo vinculado ao original. Somente o Administrador executa essa operação global, com justificativa e confirmação explícitas. RH permanece no próprio contexto.
- Simulação mantém dias, contagem e horas das parcelas originais, recalculando fim/retorno conforme calendário e aniversário. Cada dia útil recebe uma atuação autorizadora vigente. Não aceita alteração retroativa, contagem antiga desconhecida, parcelas sobrepostas ou colisão com outro pedido ativo da matrícula.
- Confirmação transacional cancela o anterior, compensa eventual débito e cria novo pedido com todas as análises pendentes. Datas, decisões e distribuição anteriores permanecem preservadas. Aprovação nunca equivale à inclusão no calendário.
- Fingerprint confere pedido, decisões, calendário, períodos, aniversário e candidatos; a mesma trava de planejamento serializa as operações. Atuação/vínculo/unidade/lotação ficam protegidos contra desativação concorrente durante a confirmação.
- Uma tela antiga não reativa pedido cancelado, rejeitado ou concluído. Botões de decisão ficam bloqueados durante gravação; respostas atrasadas respeitam navegação/contexto.
- Comprovante disponível também na gestão, com assinaturas do servidor e RH/chefia que autorizou. Tela informa relação entre protocolo anterior e novo.

## 02. Publicação do backend

- Migrations aplicadas e versionadas: `20261008184252_block_three_request_revision.sql`, `20261008185900_domain_conflict_error_codes.sql`, `20261008190550_rejected_request_calendar_cleanup.sql` e `20261008191336_unit_review_active_role_scope.sql`.
- `manage-operations`: versão 10 ACTIVE, `verify_jwt=true`; autoria obtida por `getUser`, sem confiar em identificador de ator enviado pelo navegador. `access-auth`: versão 12 ACTIVE, mantendo autenticação pública própria e validação da identidade no servidor; contexto informa lotação interna.
- Conflitos de negócio agora usam P0001: o ensaio concorrente revelou repetição indefinida de exceções explícitas 40001 pelo PostgREST. Bloqueios e conflitos de serialização reais foram preservados. Referência: [orientação oficial do Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
- Recusa global retira confirmações da projeção/escala e avisa todas as unidades, preservando decisões históricas. Leitura como titular exige perfil servidor: RH com múltiplos perfis não lê dias/análises de outro contexto. A interface também exige papel, CNES e lotação correspondentes antes de oferecer/executar ações.
- CLI sem credencial disponível; publicação efetuada pelo conector autenticado, sem recuperar ou imprimir segredos.

## 03. Evidências técnicas executadas

- Suíte local: 261 testes aprovados, zero falhas.
- SQL real com rollback: 87 verificações aprovadas — 24 de nova análise, 17 de gestão por unidade, oito de redistribuição, 29 de regressão do bloco 02 e nove do ciclo legado. Desativação entre simulação e confirmação validada em SQL; não equivale a desativação simultânea entre sessões.
- Concorrência real pela API com duas sessões/usuários: aprovação 200/409; inclusão no calendário 200/409; confirmação repetida de nova análise 200/409, com um único substituto. Aprovação cruzada com substituição termina sem gravação parcial; ação contra original cancelado é recusada. RH de outra unidade recebe 403.
- Ciclo legado real pela API: devolução, reenvio pelo titular, chefia antes do RH, aprovação separada da programação e cancelamento. Operações legadas sobre pedidos modernos bloqueadas. Servidor com pedido devolvido procura o RH para cancelar.
- Interface hospedada: envio com duas unidades, impedimento de dias sem responsável, distribuição semanal/sexta alternada, comprovante, redistribuição pendente, aprovação sem programação automática, inclusão por CNES, nova análise com protocolos relacionados e recusa justificada. Outros sem justificativa foi bloqueado.
- Conta servidor/RH: consultas autenticadas devolvem duas revisões como titular e somente uma como RH da unidade A. Conferência visual confirma somente controles da unidade A.
- A última conferência identificou a identidade do CNES no objeto relacionado da consulta; a guarda visual aceita essa forma sem ampliar o escopo. A versão do asset foi incrementada para invalidar cache do navegador.
- Calendários consultados excluem pedidos cancelados/rejeitados, mesmo com decisão programada preservada no histórico. Dez dias conservados nas novas análises; compensações restabeleceram 240 horas da matrícula técnica.
- Advisors: nenhum ERROR; 16 INFO de tabelas com RLS sem políticas e acesso de cliente negado, operadas pelo servidor. WARN preexistente de proteção contra senhas vazadas continua no bloco 09. Referências: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Skills Supabase/Postgres orientaram execução restrita, bloqueios, versões, transações e ensaios com rollback. Vercel/Computer Use orientam publicação e verificação do fluxo visível.

## 04. Reprodução e limites

Ensaios reproduzíveis em `tests/block-three-rehearsal.sql`, `tests/legacy-cycle-rehearsal.sql`, `scripts/prepare-workflow-rehearsal.mjs` e `scripts/verify-block-three-pilot.mjs`. Credenciais fornecidas exclusivamente por variáveis de ambiente, nunca versionadas. Capturas no diretório local ignorado `.sgf-backups/bloco03/`.

Testes técnicos não substituem regras aprovadas por RH/Jurídico, conferência cadastral, carga institucional, todos os dispositivos/navegadores ou revisão completa de acessibilidade. Esses trabalhos permanecem nos grupos 05 a 09. Conta técnica exclusiva dos blocos 03/04 desativada e pedidos ativos cancelados com histórico preservado. A conta TESTE de recuperação confirmada pelo usuário e usuários reais não fazem parte dessa limpeza.
