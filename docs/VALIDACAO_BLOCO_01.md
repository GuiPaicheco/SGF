# Validação técnica — bloco 01

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Data: 08/10/2026. Projeto compartilhado de homologação; não constitui aceite institucional.

## Evidências executadas

- Cadastro administrativo online: uma pessoa, duas matrículas, três atuações, quatro perfis e escopo de gestão de uma UBS.
- Primeiro login por CPF com senha provisória e bloqueio das operações antes da troca; troca somente da conta técnica, via API.
- Login por e-mail normalizado; contextos reais Servidor, Diretor, RH e Administrador.
- RH sem acesso à administração de perfis nem ao CNES não concedido.
- Pedido público de acesso, aprovação, primeiro login e troca obrigatória online.
- Aprovação de novo vínculo para CPF existente conserva a mesma pessoa e a senha pessoal. Conferência SQL: duas pessoas de teste, cada uma com dois vínculos e três atuações.
- 236 testes locais aprovados, incluindo nove regressões de campos, contexto, desativação, cabeçalho e respostas atrasadas. Sintaxe/build conferidos.
- Recuperação de senha e novo login por e-mail confirmados pelo responsável na conta TESTE de recuperação, separadamente.

## Correções nesta entrega

- Editor de acessos passa a incluir Diretor.
- Campo de lotação interna oculto quando não há subdivisão aplicável; seleção válida não é perdida ao alterar tipo de equipe.
- Falha na consulta moderna de contextos não concede fallback legado. Conta sem escopo ativo recebe orientação, não perfil inventado.
- Troca de contexto reconsulta as permissões vigentes.
- Respostas atrasadas de pedidos, perfis, catálogos e acessos não sobrescrevem a nova tela/contexto.
- Permissão visual de redistribuição alinhada à autorização existente para titular/RH/Administrador; não altera suas regras transacionais.

## Verificações finais concluídas

- Inspeção em Chrome do Servidor, Diretor, RH e Administrador: escolha de contexto, navegação e áreas administrativas. Conferência das listas de acessos/cadastros e formulário administrativo.
- Cadastro público publicado: equipes eSF filtradas pela UBS, Não se aplica desabilita equipe, inclusão/remoção de CNES e inclusão de vínculo. Polo inicia opcional. Lotação interna invisível em UBS, verificada após correção CSS: regras de display estavam sobrepondo o atributo HTML hidden.
- Revogação real de RH/Diretor/Administrador da fixture: JWT anteriormente emitido recebe HTTP 403 ao tentar gestão/administração; consulta devolve somente os três contextos de Servidor. Navegador aberto revalidou e exibiu somente esses vínculos, sem menus administrativos.
- Desativação das duas contas técnicas deste bloco: sessão já emitida e novo login bloqueados. Contas reais e conta TESTE de recuperação preservadas; não houve exclusão física. O histórico de testes/auditoria foi mantido.
- Onze verificações SQL de RLS passaram em transação com ROLLBACK: duas diretorias internas de Secretaria no mesmo CNES, RH/Diretor limitados ao próprio escopo, vínculo selecionado, administrador consolidado, cabeçalhos forjados, escopo revogado, conta desativada e CNES inativo/ausente.
- Dez verificações SQL de cadastro/aprovação passaram em transação com ROLLBACK: pessoa única, múltiplas matrículas/atuações, CPF/pedido duplicado rejeitado e autoria registrada.
- Intervalo de login conferido no banco real: segunda tentativa imediata recusada com retry_after de até três segundos; doze falhas espaçadas não geram bloqueio acumulado. Ensaio com ROLLBACK, sem alterar tentativas reais.
- Publicação conferida em https://sgfbetim.vercel.app/ com os recursos `20261008-access-3`. Captura local em `.sgf-backups/bloco01-cadastro-validado.png`, não versionada.

## Alcance e próxima etapa

Bloco 01 encerrado tecnicamente. A subdivisão de Secretaria foi testada com fixtures SQL isoladas e testes locais do formulário; não foram inventadas diretorias oficiais permanentes para um teste visual. O aceite com responsáveis/equipamentos institucionais permanece no bloco 08. Saldos e direitos efetivos por vínculo pertencem ao bloco 02 e não estão certificados por estes ensaios de identidade/cadastro.

Correções adicionais: cabeçalho de gestão identifica o papel ativo, contexto de conta desativada é descartado e texto do cadastro não promete senha forte/única para o fluxo padrão de senha provisória.

## Reproduzir o ensaio online

Script: `scripts/verify-registration-pilot.mjs`. Exige variáveis `SGF_TEST_ADMIN_PASSWORD` e `SGF_REHEARSAL_PASSWORD`, que não são impressas. Não executar sem autorização do responsável pelo ambiente: cria dados fictícios e concede quatro perfis somente à conta técnica. Prefixo padrão identifica o bloco/data; retomada exige `SGF_REHEARSAL_RESUME=1` e nunca deve redefinir senhas de contas existentes.

Não envia recuperação/e-mails nem remove dados. A primeira execução interrompeu-se por uma expectativa de HTTP 200 no pedido público; o endpoint retorna HTTP 202. Corrigida a expectativa para sucesso 2xx e retomado sem recriar a conta ou redefinir sua senha.

Ensaio final: `scripts/verify-access-revocation-pilot.mjs`, restrito por ID, e-mail e nome às duas fixtures desta entrega. Sem flag revoga os privilégios de gestão; com `SGF_REHEARSAL_CLEANUP=1` desativa ambas. Não repetir depois da desativação, nem reativar as fixtures apenas para executar o script.
