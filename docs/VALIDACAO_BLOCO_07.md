# Bloco 07 — históricos e reconstrução

## 01. Reconciliação sem inferência

Inventário do piloto em 09/10/2026: sete solicitações, seis contextuais e uma legada cancelada; duas decisões legadas preservadas; nenhuma escala mínima legada; nenhuma solicitação moderna sem distribuição diária; nenhum servidor sem vínculo. Treze notificações e 61 eventos de auditoria não têm contexto CNES. Ausência de contexto não significa corrupção: avisos pessoais e ações administrativas globais não devem receber uma unidade inventada.

`scripts/reconcile-history.sql` executa inventário em transação somente leitura, sem nomes, CPF ou e-mail. Não modifica identificadores, autores, decisões ou datas históricas. Pedidos legados ativos exigem conferência documental pelo RH; registros terminais permanecem na origem.

## 02. Compatibilidade dos campos legados

1. `servidores.lotacao_id`, matrícula e cargo antigos continuam necessários para leitura histórica e rotas de compatibilidade. Novos vínculos usam `employment_bonds` e `employment_bond_units`.
2. `request_approvals` permanece como histórico antigo; decisões novas usam `request_unit_reviews` e responsabilidade diária.
3. `minimum_scale_days` e `minimum_scale_assignments` estão vazias no piloto, mas não serão removidas apenas por isso: migrations anteriores e compatibilidade ainda as referenciam.
4. Notificações pessoais sem CNES permanecem limitadas ao destinatário; eventos globais/sem escopo não devem ser convertidos para RH com base no cadastro atual.
5. O calendário tem uma leitura legada por pessoa/lotação. Se houver múltiplas matrículas na mesma unidade, essa associação pode ser ambígua: não usar essa leitura como prova de vínculo histórico. A restrição explícita dessa ambiguidade ainda precisa de teste e entrega antes de encerrar o bloco.
6. Remoção futura exige inventário de dependências, associação comprovada, ensaio em cópia, comparação de resultados e versão de compatibilidade. Não executar `DROP`, preencher CNES automaticamente ou reparar a tabela de migrations apenas para igualar quantidades de versões.

## 03. Base demonstrativa

`node scripts/prepare-demo.mjs` gera SQL com rollback por padrão. Dados reservados `d7000000`, nomes/protocolos `DEMO07`, e-mails `example.invalid`; não usa a conta de recuperação e não define senhas nem envia e-mails. Uma pessoa, duas matrículas, dois CNES e seis atribuições diárias; pedidos pendente, aprovado e incluído no calendário por ações separadas.

O ensaio no Supabase compartilhado passou e foi revertido integralmente. A base não foi gravada permanentemente no piloto. Persistência exige tanto `--persist-demo` quanto `set sgf.demo_enabled='yes'`; executar somente em destino isolado previamente conferido. Não é idempotente: colisões abortam, não sobrescrevem registros. Os períodos curtos são fixtures técnicas, não exemplos de direitos legais ou homologação normativa. `supabase/seed-demo.sql` é anterior ao modelo de múltiplos vínculos e não deve ser usado para esta demonstração.

## 04. Integração e restauração

O workflow aplica toda a cadeia em banco vazio sem seed, executa ensaios SQL transacionais e prepara restauração de dump sintético em um segundo banco. `scripts/verify-database-rebuild.mjs` é restrito ao container Docker de CI; não aceita URL externa e recusa destino existente. Compara conteúdo das tabelas, políticas RLS e quantidade de funções.

A reconstrução vazia passou no run 37939410740. Esse primeiro run falhou na preparação de um ensaio por diferença de papel SQL; a restauração foi pulada, portanto **não está validada por esse run**. A correção está sendo verificada novamente. Não declarar backup restaurável antes da conclusão bem-sucedida.

Esse ensaio não exporta nem restaura o banco compartilhado. Dump do PostgreSQL não substitui backup de objetos do Storage, configurações de Auth/SMTP, segredos, funções Edge, domínio e configuração de hospedagem. Os papéis globais já existem no cluster local de destino; migração entre projetos exige procedimento próprio. Segurança, retenção, cópia operacional protegida e recuperação institucional continuam no bloco 09.
