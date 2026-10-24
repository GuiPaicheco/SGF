# Limpeza da base — 23/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Executada a pedido do responsável para iniciar o sistema vazio, mantendo as unidades prontas para acesso e a Administração.

## Preservado

- 42 contas institucionais RH habilitadas, com vínculos válidos para unidade, perfil e autenticação.
- Uma conta administrativa ativa. Credenciais das contas preservadas não foram alteradas.
- Catálogo organizacional de unidades/lotação e relações necessárias ao acesso.
- Catálogos técnicos, tabelas, funções, permissões, políticas RLS e migrations.

## Removido

- 43 cadastros de servidores, incluindo 40 profissionais incorporados do CNES e vínculos legados.
- Férias e demais registros operacionais, revisões, aniversários/dayoff e saldos históricos.
- Oito feriados/pontos facultativos cadastrados.
- Equipes, fontes/cache e histórico de importações CNES, para não reapresentar dados antigos como cadastro atual.
- Autorizações e identificações de operadores; sessões RH anteriores encerradas.
- Solicitações antigas, notificações, auditorias de uso e três contas legadas desabilitadas.

## Procedimento e verificação

1. Inspeção de tabelas, chaves estrangeiras, contas e gatilhos.
2. Cópia local dos dados dos schemas de aplicação em `.sgf-backups/reset-20261023-before.json`, ignorada pelo Git. A cópia não inclui senhas nem registros internos de autenticação; não constitui backup completo do serviço Auth.
3. Ensaio com rollback, seguido de transação confirmada. Esvaziamento explícito das tabelas operacionais, sem CASCADE, alteração de schema ou desativação de gatilhos.
4. Conferência independente após commit: 44 tabelas operacionais vazias; 42 contas RH habilitadas e relacionadas corretamente, uma Administração e 43 usuários Auth. Zero restrições não validadas e zero gatilhos desativados.

A limpeza não pretende apagar logs de infraestrutura mantidos pelo provedor. A cópia anterior contém dados pessoais e deve continuar fora do GitHub, sob controle do responsável.

## Próximo passo

A Administração deve incorporar os profissionais pelo CNES, autorizar operadores e cadastrar os feriados aplicáveis antes de iniciar os lançamentos reais. Sem profissionais autorizados, o RH poderá autenticar a unidade, mas não terá operador para identificar.
