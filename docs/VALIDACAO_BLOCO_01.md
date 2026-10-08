# Validação técnica — bloco 01

Data: 08/10/2026. Projeto compartilhado de homologação; não constitui aceite institucional.

## Evidências executadas

- Cadastro administrativo online: uma pessoa, duas matrículas, três atuações, quatro perfis e escopo de gestão de uma UBS.
- Primeiro login por CPF com senha provisória e bloqueio das operações antes da troca; troca somente da conta técnica, via API.
- Login por e-mail normalizado; contextos reais Servidor, Diretor, RH e Administrador.
- RH sem acesso à administração de perfis nem ao CNES não concedido.
- Pedido público de acesso, aprovação, primeiro login e troca obrigatória online.
- Aprovação de novo vínculo para CPF existente conserva a mesma pessoa e a senha pessoal. Conferência SQL: duas pessoas de teste, cada uma com dois vínculos e três atuações.
- 234 testes locais aprovados, incluindo sete regressões de campos, contexto e respostas atrasadas. Sintaxe/build conferidos.
- Recuperação de senha e novo login por e-mail confirmados pelo responsável na conta TESTE de recuperação, separadamente.

## Correções nesta entrega

- Editor de acessos passa a incluir Diretor.
- Campo de lotação interna oculto quando não há subdivisão aplicável; seleção válida não é perdida ao alterar tipo de equipe.
- Falha na consulta moderna de contextos não concede fallback legado. Conta sem escopo ativo recebe orientação, não perfil inventado.
- Troca de contexto reconsulta as permissões vigentes.
- Respostas atrasadas de pedidos, perfis, catálogos e acessos não sobrescrevem a nova tela/contexto.
- Permissão visual de redistribuição alinhada à autorização existente para titular/RH/Administrador; não altera suas regras transacionais.

## Verificações ainda em execução

- Inspeção dos quatro perfis e cadastro na versão publicada.
- Revogação e desativação com sessão já emitida.
- Testes de isolamento entre diretorias no mesmo CNES e validação de lotação interna em Secretaria.

## Reproduzir o ensaio online

Script: `scripts/verify-registration-pilot.mjs`. Exige variáveis `SGF_TEST_ADMIN_PASSWORD` e `SGF_REHEARSAL_PASSWORD`, que não são impressas. Não executar sem autorização do responsável pelo ambiente: cria dados fictícios e concede quatro perfis somente à conta técnica. Prefixo padrão identifica o bloco/data; retomada exige `SGF_REHEARSAL_RESUME=1` e nunca deve redefinir senhas de contas existentes.

Não envia recuperação/e-mails nem remove dados. A primeira execução interrompeu-se por uma expectativa de HTTP 200 no pedido público; o endpoint retorna HTTP 202. Corrigida a expectativa para sucesso 2xx e retomado sem recriar a conta ou redefinir sua senha.
