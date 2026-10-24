# Contas institucionais e operadores — 17/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## Entrega

As 42 contas (41 UBS e DAPS) foram provisionadas pelo Administrador autenticado, usando Supabase Auth Admin e a senha definida pelo responsável, fornecida somente durante a execução. Nenhuma senha ou token foi salvo em arquivo, Git ou log. Contas antigas, TESTE, três servidores legados e seus dados foram preservados.

O login aceita o nome institucional com espaços, variação de caixa e acentos. Identificadores internos exclusivos não usam CPF fictício. Administrador mantém acesso global; cada conta RH recebe somente seu CNES. DAPS corresponde inicialmente à Secretaria, CNES 2126486.

Administrador encontra **Cadastros → Contas RH e operadores** para criar contas pendentes, bloquear/reativar, redefinir senha e autorizar/revogar funcionários ativos incorporados do CNES. Reexecutar a criação não redefine senha existente; reservas estáveis permitem retomar criação interrompida sem duplicar usuários. Senhas são digitadas no momento da operação e os campos são limpos antes do envio.

Após login institucional, é obrigatório selecionar um nome autorizado. A escolha fica no servidor, vinculada ao `session_id` verificado do Auth. Não é autenticação individual. A autorização é revalidada nas consultas; revogação altera sua versão e invalida escolhas anteriores, mesmo se a pessoa for autorizada novamente. Duas sessões não compartilham seleção. Nome histórico e condição de identidade declarada são registrados na auditoria de seleção/troca.

Contas institucionais não acessam os endpoints ou políticas do fluxo legado. A área nova oferece consulta paginada dos funcionários da própria unidade, sem CNS. O lançamento direto, o calendário novo e o comprovante ainda serão implementados; toda futura gravação deverá usar a mesma validação de sessão/operador e registrar essa autoria.

## Publicação e verificações

- Código principal publicado no commit `9b69f7d`. Migração `20261017201513_institutional_rh_operators` aplicada com versão local e remota iguais.
- `manage-rh` publicada; `access-auth` e funções dependentes de `access-context` republicadas com bloqueio do acesso institucional ao fluxo antigo.
- **345 testes locais aprovados**; sintaxe JavaScript, build estático e tipos Deno da função nova aprovados. A checagem isolada de `access-auth` ainda aponta 15 erros preexistentes de inferência das relações PostgREST (objeto versus array); não impediu o teste HTTP e de navegador.
- [CI do código principal](https://github.com/GuiPaicheco/SGF/actions/runs/39065969372) aprovado: testes, reconstrução do banco vazio, ensaios integrados e restauração sintética.
- SQL real em `BEGIN/ROLLBACK`, antes e após aplicar: reserva/finalização, seleção obrigatória, tentativa de autorização em outro CNES, sessões independentes, revogação/reautorização, limpar operador, invalidar sessão, bloquear/reativar, auditoria histórica e negação da API direta. Fixtures não persistem.
- Provisionamento autenticado real: **42 contas prontas e 42 válidas**, todas RH, sem CPF e sem troca obrigatória. Login real normalizado da UBS Amazonas retornou exatamente um contexto institucional, CNES 6305245. Consulta sem operador e acesso administrativo pela conta RH retornaram 403.
- Chrome no site publicado: login administrativo → Cadastros → Contas RH e operadores → UBS Amazonas; tela confirmou **42 de 42**. Em seguida, login UBS Amazonas → identificação obrigatória, botão Continuar desabilitado com lista vazia. Sessões criadas para os testes foram encerradas.
- Evidências visuais locais, fora do Git/site: `.tools/rh-accounts-live.png` e `.tools/rh-operator-required-live.png`.
- Advisor sem nova advertência de segurança: três informações de RLS sem policy nas tabelas privadas, que negam acesso direto a `anon`/`authenticated`. Funções privilegiadas de consulta/revogação de Auth ficam em `private`, com escopo restrito e execução exclusiva do backend. Permanece a advertência anterior sobre [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Limites e próximo bloco

Ainda há **zero registros CNES incorporados e zero operadores autorizados**. Não foi escolhido funcionário real arbitrariamente. Administrador deve incorporar/conferir a carga e autorizar quem de fato operará cada unidade. A alternativa de cadastro manual continua pendente.

O próximo bloco integra cadastro CNES aos vínculos operacionais e implementa lançamento direto no calendário, com validação de datas, direito/saldo e autoria do operador. Calendário e comprovantes antigos permanecem no acesso legado enquanto essa substituição é construída. A retirada do autosserviço e a migração dos acessos antigos permanecem em AC07.

A senha compartilhada permite que quem a conhece tente entrar em outra conta institucional; isolamento técnico não identifica a pessoa que a digitou. Essa limitação do modelo definido permanece explícita em AC04. Limites de corpo/paginação e cooldown de login estão ativos; controles de frequência das operações e ensaio de concorrência/carga seguem na fila de desempenho.
