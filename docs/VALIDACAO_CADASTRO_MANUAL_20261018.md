# Cadastro operacional e alternativa manual — 18/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Décimo segundo bloco. Migração `20261018210032_manual_registry` e função `manage-cnes` v3 publicadas. Nenhum cadastro real foi criado, conferido, integrado ou autorizado durante o ensaio.

## Entregas

- Tela administrativa de funcionários por unidade, com retorno ao calendário e importação CNES recolhida em seção expansível.
- Inclusão manual com nome, matrícula e CBO obrigatórios; campos municipais disponíveis, carga semanal fracionada e motivo. Origem manual visível, sem fabricar CNS, competência CNES, CPF, conta, saldo ou direito.
- Criação pendente de conferência. Após salvar a revisão municipal, botão de integração funcional disponível na própria lista, reutilizando o contrato que exige confirmação explícita do polo e mantém versões/histórico.
- Somente Administrador global pode incluir/conferir/integrar. O RH continua consultando os funcionários no calendário; delegação da correção cadastral permanece FL05.
- Escrita transacional com lock por unidade/matrícula, limite de 5.000 registros/unidade, chave de reenvio, rejeição de conteúdo alterado na mesma chave e auditoria. Matrícula já presente no cadastro funcional ou de conferência impede criação adicional; não há união por nome.
- Formulário mantém dados após erro, impede segundo envio em andamento, reutiliza chave para repetição idêntica e troca a chave quando o preenchimento muda. Resposta atrasada não escreve em outro contexto.

## Evidências

**386 testes Node aprovados**, build estático e Deno check concluídos. Ensaio SQL `manual-registry` integrado ao CI e reproduzível por `node scripts/prepare-workflow-rehearsal.mjs manualregistry`: criação/repetição, conflito, duplicação, bloqueio antes da revisão, conferência, integração sem identidade fictícia e auditoria, com rollback. Repetido após aplicação da migração. Permissão direta de execução negada a `anon` e `authenticated`; a Edge Function valida a sessão e o contexto antes da chamada privilegiada.

API publicada com sessões reais: entrada inválida administrativa retorna 400; tentativa RH retorna 403. Sessões de ensaio encerradas. Consulta final: zero cadastros manuais e zero registros da matrícula fictícia remanescentes.

Chrome local com API simulada: preenchimento manual, retorno com origem manual e situação pendente, conferência e disponibilização do botão de integração. A integração real foi exercitada no ensaio SQL, não pelo mock do navegador. Evidência local `.tools/rh-registry-local.png`, ignorada pelo Git. Servidor e aba temporários encerrados.

## Limites e próxima entrega

Não há conciliação automática entre cadastro manual e futura carga CNES: ambos são preservados e a matrícula conflitante exige análise administrativa. Casos preexistentes devem usar associação explícita ao cadastro anterior, não nova pessoa manual. Campo CBO manual não ganha validação automática de catálogo oficial.

A listagem ainda precisa de busca no servidor, situação clara da integração e acesso contextual a partir do calendário; UI02 permanece parcial. Completar esses pontos é o próximo bloco. Conferência real da Amazonas, operadores nominais, direitos de férias e aceite institucional continuam pendentes. Nenhuma conclusão de homologação foi inferida destes testes.

Advisors antes/depois sem novos alertas: permanecem 26 informações de RLS sem política (tabelas fechadas ao cliente) e o aviso de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) já existente. [Explicação do linter RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Configurações de Auth não foram alteradas.
