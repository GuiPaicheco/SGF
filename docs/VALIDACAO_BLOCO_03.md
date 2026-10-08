# Validação do bloco 03 — solicitações e gestão por unidade

Atualização: 08/10/2026. Em validação integrada; não representa aceite institucional.

## 01. Implementação

- Reprogramação/redistribuição após decisões abre novo protocolo vinculado ao original. Somente o Administrador executa essa operação global, com justificativa e confirmação explícitas. RH permanece no próprio contexto.
- Simulação mantém dias, contagem e horas das parcelas originais, recalculando fim/retorno conforme calendário e aniversário. Cada dia útil recebe uma atuação autorizadora vigente. Não aceita alteração retroativa, contagem antiga desconhecida, parcelas sobrepostas ou colisão com outro pedido ativo da matrícula.
- Confirmação transacional cancela o anterior, compensa eventual débito e cria novo pedido com todas as análises pendentes. Datas, decisões e distribuição anteriores permanecem preservadas. Aprovação nunca equivale à inclusão no calendário.
- Fingerprint confere pedido, decisões, calendário, períodos, aniversário e candidatos; a mesma trava de planejamento serializa as operações. Atuação/vínculo/unidade/lotação ficam protegidos contra desativação concorrente durante a confirmação.
- Uma tela antiga não reativa pedido cancelado, rejeitado ou concluído. Botões de decisão ficam bloqueados durante gravação; respostas atrasadas respeitam navegação/contexto.
- Comprovante disponível também na gestão, com assinaturas do servidor e RH/chefia que autorizou. Tela informa relação entre protocolo anterior e novo.

## 02. Publicação do backend

- Migration aplicada: `20261008184252_block_three_request_revision.sql`, mesma versão registrada no Supabase.
- `manage-operations`: versão 9 ACTIVE, `verify_jwt=true`; autoria obtida por `getUser`, sem confiar em identificador de ator enviado pelo navegador.
- CLI sem credencial disponível; publicação efetuada pelo conector autenticado, sem recuperar ou imprimir segredos.

## 03. Evidências técnicas iniciais

- Suíte local: 253 testes aprovados, incluindo seis novos testes do editor/segurança do ciclo de substituição.
- SQL real com rollback: 22 cenários da nova reprogramação, 17 do ciclo por unidade, oito da redistribuição pendente e 29 de regressão do bloco 02 aprovados. Não equivale a teste concorrente de duas sessões.
- Advisors: nenhum ERROR; 16 INFO de tabelas com RLS sem políticas e acesso de cliente negado, operadas pelo servidor. WARN preexistente de proteção contra senhas vazadas continua no bloco 09. Referências: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Skills Supabase/Postgres orientaram execução restrita, bloqueios, versões, transações e ensaios com rollback. Vercel/Computer Use orientam publicação e verificação do fluxo visível.

## 04. Ainda em execução

Conferência pela interface do ciclo completo, preenchimentos por semana/dia, comprovante, redistribuição e novo protocolo; concorrência real e comportamento legado. Atualizar esta seção somente após obter evidências. Não considerar o bloco concluído apenas pela aplicação da migration.
