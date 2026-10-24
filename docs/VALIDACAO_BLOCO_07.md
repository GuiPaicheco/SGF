# Bloco 07 — históricos e reconstrução

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## 01. Reconciliação sem inferência

Inventário do piloto em 09/10/2026: sete solicitações, seis contextuais e uma legada cancelada; duas decisões legadas preservadas; nenhuma escala mínima legada; nenhuma solicitação moderna sem distribuição diária; nenhum servidor sem vínculo. Treze notificações e 61 eventos de auditoria não têm contexto CNES. Ausência de contexto não significa corrupção: avisos pessoais e ações administrativas globais não devem receber uma unidade inventada.

`scripts/reconcile-history.sql` executa inventário em transação somente leitura, sem nomes, CPF ou e-mail. Não modifica identificadores, autores, decisões ou datas históricas. Pedidos legados ativos exigem conferência documental pelo RH; registros terminais permanecem na origem.

## 02. Compatibilidade dos campos legados

1. `servidores.lotacao_id`, matrícula e cargo antigos continuam necessários para leitura histórica e rotas de compatibilidade. Novos vínculos usam `employment_bonds` e `employment_bond_units`.
2. `request_approvals` permanece como histórico antigo; decisões novas usam `request_unit_reviews` e responsabilidade diária.
3. `minimum_scale_days` e `minimum_scale_assignments` estão vazias no piloto, mas não serão removidas apenas por isso: migrations anteriores e compatibilidade ainda as referenciam.
4. Notificações pessoais sem CNES permanecem limitadas ao destinatário; eventos globais/sem escopo não devem ser convertidos para RH com base no cadastro atual.
5. O calendário tem uma leitura legada por pessoa/lotação. Se houver múltiplas atuações compatíveis, o pedido não é atribuído automaticamente nem duplicado: retorna aviso de vínculo ambíguo para conferência documental pelo RH. Testes cobrem ambiguidade, cancelamento e ausência de aviso para outra unidade. Função `manage-operations` publicada na versão 17; calendário conferido no navegador com `app.js`/`scale-range.js` versão `20261009-block7-1`, sem erro de console. O aviso de ambiguidade foi validado automaticamente, não com dados persistidos no piloto.
6. Remoção futura exige inventário de dependências, associação comprovada, ensaio em cópia, comparação de resultados e versão de compatibilidade. Não executar `DROP`, preencher CNES automaticamente ou reparar a tabela de migrations apenas para igualar quantidades de versões.

## 03. Base demonstrativa

`node scripts/prepare-demo.mjs` gera SQL com rollback por padrão. Dados reservados `d7000000`, nomes/protocolos `DEMO07`, e-mails `example.invalid`; não usa a conta de recuperação e não define senhas nem envia e-mails. Uma pessoa, duas matrículas, dois CNES e seis atribuições diárias; pedidos pendente, aprovado e incluído no calendário por ações separadas.

O ensaio no Supabase compartilhado passou e foi revertido integralmente. A base não foi gravada permanentemente no piloto. Persistência exige tanto `--persist-demo` quanto `set sgf.demo_enabled='yes'`; executar somente em destino isolado previamente conferido. Não é idempotente: colisões abortam, não sobrescrevem registros. Os períodos curtos são fixtures técnicas, não exemplos de direitos legais ou homologação normativa. `supabase/seed-demo.sql` é anterior ao modelo de múltiplos vínculos e não deve ser usado para esta demonstração.

## 04. Integração e restauração

O workflow aplica toda a cadeia em banco vazio sem seed, executa ensaios SQL transacionais e prepara restauração de dump sintético em um segundo banco. `scripts/verify-database-rebuild.mjs` é restrito ao container Docker de CI; não aceita URL externa e recusa destino existente. Compara conteúdo das tabelas, políticas RLS, definições/autoria/permissões de funções, permissões e flags RLS de tabelas, constraints e triggers.

283 testes locais aprovados; sintaxe JavaScript, build estático e `git diff --check` verificados. Ensaio por API repetido: criação de motivo técnico, duas gravações simultâneas com resultados 200/409, imutabilidade, campos obrigatórios, auditoria e desativação final; catálogo original preservado. Nenhuma senha alterada. Consulta de segurança: zero ERROR, 16 INFO de tabelas internas sem política de acesso direto, uma WARN preexistente de proteção contra senhas vazadas, mantida no bloco 09 ([orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

Reconstrução expôs dependência do guard legado no proprietário `postgres`. Migration `20261009172300_legacy_guard_service_identity.sql` aplicada no piloto: reconhece JWT autenticado de serviço, sem confiar em cabeçalho de ator para bypass e preservando regras de identidade/transição. Fixtures de CI declaram o papel técnico; permissões de montagem de contas não foram ampliadas no piloto.

Reconstrução vazia, todos os ensaios SQL integrados (incluindo isolamento RLS) e restauração concluídos com sucesso no [run 37968449955](https://github.com/GuiPaicheco/SGF/actions/runs/37968449955), commit `12f1903`. O dump integral do PostgreSQL sintético foi restaurado em banco novo; todas as comparações de integridade passaram. Falhas anteriores de fixtures e do verificador foram corrigidas antes deste resultado.

O destino preserva proprietário, encoding, provedor ICU e locale da origem ([PostgreSQL: CREATE DATABASE](https://www.postgresql.org/docs/17/sql-createdatabase.html)). A migration `20261009174400_profiles_roles_restore_stability.sql`, aplicada também no piloto, expressa os mesmos limites de quantidade de perfis com comparações explícitas, evitando reagrupamento de `BETWEEN` no dump/restore. Os quatro perfis permitidos não mudaram; sete casos de fronteira confirmaram equivalência das expressões antigas e novas. Não houve ampliação de permissões.

Esse ensaio não exporta nem restaura o banco compartilhado. Dump do PostgreSQL não substitui backup de objetos do Storage, configurações de Auth/SMTP, segredos, funções Edge, domínio e configuração de hospedagem. Os papéis globais já existem no cluster local de destino; migração entre projetos exige procedimento próprio. Segurança, retenção, cópia operacional protegida e recuperação institucional continuam no bloco 09.
