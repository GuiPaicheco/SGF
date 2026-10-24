# Bloco de conferência e importação CNES — 17/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## Entrega técnica

Administrador acessa **Cadastros → Conferência CNES**, seleciona uma unidade e envia o JSON gerado pelo coletor. A prévia informa inclusões, mudanças, registros iguais, ausências preservadas e associações de equipe pendentes. A incorporação exige confirmação e versão atual do cadastro. A lista tem páginas de 50 registros e formulário de ajustes municipais.

O backend foi enviado ao GitHub no commit `e1a7c1b`. Migração `20261017173952_cnes_registry_review` aplicada no piloto e registrada com a mesma versão no repositório; `manage-cnes` publicada na versão 1. A função verifica a identidade com `getUser`, revalida conta e acesso Administrador e usa tabelas privadas sem acesso direto por `anon`/`authenticated`. O gateway JWT está desabilitado para usar essa verificação explícita no corpo, conforme configuração versionada.

## Dados e compatibilidade

- `private.cnes_registry_entries`: registro interno de atuação, fonte CNES, campos municipais separados, versão de conferência e associação opcional a `servidores`.
- `private.cnes_registry_state`: revisão por unidade e última coleta incorporada; trava compartilhada entre importação e edição.
- `private.cnes_import_runs`: resumo, autor e digest das cargas, sem duplicar o arquivo inteiro a cada envio.
- Funcionário sem conta/matrícula pode ser incorporado nesse cadastro de conferência com UUID interno. Não recebe CPF, matrícula, cargo municipal, direito ou saldo fictício.
- Mudanças da fonte preservam ajustes municipais e associação ao legado; tornam necessária nova conferência. Ausências na carga não excluem/desativam registros.
- Associação ao cadastro anterior usa busca exata por matrícula dentro da unidade e confirmação humana. Não altera o cadastro anterior ou saldo. Matrícula já existente exige associação correta; uso da mesma matrícula para identidades distintas é recusado.
- Identidade da atuação é derivada de CNES, CNS/principal, CBO, vinculação e entrada na fonte, sem depender de nome/jornada/equipe. Mudança desses identificadores pode criar outro registro para conciliação; não há união automática por nome.
- Os vínculos operacionais, cálculo de direitos, polo e lançamentos do RH ainda precisam integrar esse cadastro. O status “Conferido” significa que houve conferência cadastral; não declara aptidão legal para afastamento.

## Verificações

- **335 testes locais aprovados**, sintaxe do frontend e build estático conferidos; Deno 2.5.4 aprovou a verificação de tipos da função nova.
- Normalização e prévia testadas com dados fictícios: identidade estável, mudança de hash, ordem da carga, duplicatas, identidade ambígua, associação por CNS/CBO, campos inválidos e limite dos detalhes da prévia.
- Ensaio SQL real, antes da aplicação e repetido após publicar, em `BEGIN/ROLLBACK`: inclusão, repetição idempotente, correção municipal, preservação após mudança da fonte, versão antiga, coleta antiga, ausência preservada, paginação, negação ao RH/cliente direto e associação ao legado por matrícula/unidade.
- Novo ensaio adicionado ao CI de reconstrução em banco vazio (`prepare-workflow-rehearsal.mjs cnes`). Backend passou no [run 39054897144](https://github.com/GuiPaicheco/SGF/actions/runs/39054897144): testes, reconstrução, ensaios SQL e restauração sintética. Isso não substitui backup operacional integral.
- Coleta real normalizada em memória: prévia Amazonas com 40 registros e Secretaria com 230, sem persistência e sem pendências de associação nessas duas cargas. Nenhum dado pessoal emitido nos logs.
- Chamada HTTP real sem sessão à função publicada retornou **401 — Sessão obrigatória**.
- Navegador local: arquivo fictício → prévia → confirmação → lista; abertura do formulário → busca de matrícula → seleção do cadastro anterior → salvamento. Preservação dos campos durante a busca e tabela final conferidas, sem erros de console. **API simulada**, sem login real ou gravação do navegador no Supabase. Evidência local em `.tools/cnes-review-local.png`, fora do Git/site.
- Advisor: três avisos informativos de RLS sem policy nas novas tabelas privadas. É bloqueio deliberado: grants de `anon`/`authenticated` foram revogados e a função usa serviço privilegiado após validar Administrador. Alerta preexistente sobre [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) permanece no planejamento; não houve alteração da política de senha.

## Limites e restante

Nenhum cadastro real CNES foi incorporado nesta rodada. Registros de ensaio foram revertidos; contas, senhas, saldos e pedidos anteriores preservados. Importação por arquivo já está implementada; coleta automática pelo painel e revisão das cargas reais continuam pendentes. A conferência depende de Administrador nesta etapa, até implantar contas e operadores do RH.

Faltam validar tela/API com sessão administrativa real, conferir os dados da Amazonas, complementar campos municipais e resolver associações de equipe pendentes quando existirem. Revisão de acessibilidade integral e homologação institucional não foram realizadas. Não foram implementados o lançamento direto do RH, o novo calendário nem o novo comprovante.

**Próximo bloco:** contas institucionais e operadores por CNES — AC01–AC03, AC05–AC06, AC08–AC09 e DB11. Usar o cadastro de conferência para selecionar operadores; fechar a validação autenticada deste bloco junto desse ensaio, sem confundir os testes simulados com aceite real.
