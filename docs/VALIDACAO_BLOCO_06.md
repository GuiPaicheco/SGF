# Validação técnica do bloco 06

Data: 09/10/2026. Ambiente: piloto compartilhado autorizado; não equivale a homologação institucional.

## 01. Entrega

Catálogo estruturado de recusas ensaiado; validações de datas repetidas no banco; mensagens versionadas com canal de apoio e estado explícito de referência normativa. Corrigida divergência no cálculo: fracionamento em dias úteis não é aplicado a uma regra calculada em dias corridos apenas porque um valor anterior permaneceu no formulário.

Migration aplicada: `20261009132736_block_six_submission_guards.sql`. Edge Functions atualizadas: `manage-operations` e `submit-request`; ambas verificam a identidade com Auth antes da operação, mantendo a autenticação própria existente. Nenhuma credencial de conta foi redefinida.

## 02. Evidências reproduzíveis

1. Suíte local: `node --test tests/*.test.mjs` — 277 aprovados, zero falhas; sintaxe, build estático e `git diff --check` aprovados.
2. SQL real: `node scripts/prepare-workflow-rehearsal.mjs block6` — 20 verificações aprovadas, transação integral com ROLLBACK. Datas, aquisição, admissão, criação/edição, campos obrigatórios, versão obsoleta, modo imutável, RH sem permissão global, três recusas, saldo intacto, atuação/nome canônico, rótulo histórico, motivo desativado, último ativo e trilha com autor. Fixtures não permaneceram no banco.
3. API real: `scripts/verify-block-six-pilot.mjs` — cinco grupos aprovados. Duas gravações simultâneas com a mesma versão retornaram 200 e 409; criação, campos obrigatórios, modo imutável, auditoria e desativação conferidos. Motivo técnico identificado e desativado; catálogo original preservado integralmente. Credencial administrativa somente por variável de ambiente; nenhuma conta nova criada.
4. Regressões SQL: unidade (17), calendário (16), cadastro (10), redistribuição (8), bloco 04 (16) e bloco 05 (21) aprovados após a migration, sempre com ROLLBACK.
5. Security Advisor: zero ERROR; 16 INFO de RLS sem políticas em tabelas internas intencionalmente indisponíveis ao cliente. Aviso preexistente de [proteção contra senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) mantido no bloco 09; nenhuma proteção foi desabilitada nesta entrega.

## 03. Limites

Não foi realizado ensaio de carga. A validação SQL da recusa não representa aceite do RH para um caso real. O catálogo de orientação não contém lei inventada: referências, vigências e aprovação jurídica permanecem pendentes no bloco 08. A consistência de datas não certifica integralmente os cálculos de direito por regime.

Históricos não foram apagados. Conta TESTE de recuperação e alteração local preexistente de `logo.png` preservadas. Conclusões adicionais de publicação/interface devem ser registradas após conferência da versão hospedada.
