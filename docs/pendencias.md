# Pendências do SGF

Atualização: 09/10/2026. Esta é a lista ativa, agrupada por dependência. Contém somente trabalho restante; implementação existente e validação pendente são diferenciadas. Detalhes anteriores estão em [HISTORICO_PENDENCIAS_20261008.md](HISTORICO_PENDENCIAS_20261008.md) e não formam uma segunda fila de tarefas.

## Situação confirmada

- Piloto hospedado em https://sgfbetim.vercel.app/, com GitHub e Supabase compartilhado autorizados para homologação. Não é aceite institucional de produção.
- Fundação de pessoa, múltiplos vínculos/CNES, equipes, seleção de contexto, distribuição diária e gestão por unidade já implementadas; falta completar e homologar os fluxos abaixo.
- Recuperação de senha da conta teste concluída: o usuário confirmou salvar a nova senha e realizar login por e-mail em 08/10. Não repetir essa tarefa como pendência.
- Correções de recuperação publicadas: sessão de callback explícita, mínimo de seis caracteres (oito para Administrador) e mensagens de recusa específicas. Última suíte executada: 287 testes locais aprovados.
- Ensaios SQL reais já realizados: cadastro/aprovação, isolamento RLS, gestão por unidade, ajustes de feriado e redistribuição pendente. Não substituem testes completos de interface, concorrência entre sessões ou homologação institucional.
- Preservar a conta TESTE até decisão explícita sobre limpeza. Não apagar dados nem modificar sua senha para ensaios.
- Plano de três ambientes independentes suspenso. Não publicar novamente a versão legada contra o banco atualizado; separação definitiva fica no grupo 09.

## 01. Cadastro, primeiro acesso e perfis — concluído tecnicamente

Itens ativos retirados após os ensaios de cadastro/identidade, equipes, primeiro acesso, quatro perfis, revogação/desativação e intervalo de login. Evidências e limites em [VALIDACAO_BLOCO_01.md](VALIDACAO_BLOCO_01.md). Contas técnicas deste bloco desativadas, sem exclusão do histórico; conta TESTE de recuperação preservada. Direitos/saldos por vínculo continuam no bloco 02; aceite institucional continua no bloco 08.

## 02. Catálogo organizacional, direitos e saldos por vínculo — concluído tecnicamente no escopo atual

Administração organizacional e recursos por matrícula implementados e ensaiados. Itens técnicos retirados da fila ativa; evidências, limitações e procedimentos em [VALIDACAO_BLOCO_02.md](VALIDACAO_BLOCO_02.md). INE dispensado pelo responsável em 08/10: equipes são identificadas pelo nome, tipo/número e CNES, sem avisos de código pendente. Dados históricos existentes foram preservados.

O fluxo atual mantém um responsável por dia, escolhido entre as unidades cadastradas; divisão de horas entre unidades no mesmo dia não foi solicitada nem implementada. A hipótese foi retirada da fila deste bloco, sem alterar a regra diária. Conferência cadastral pelo RH continua no bloco 08, como parte do aceite antes do uso institucional; não é funcionalidade faltante. O ciclo completo de interface continua no bloco 03.

## 03. Solicitações, gestão por unidade e redistribuição — concluído tecnicamente

Fluxo integrado, redistribuição pendente, nova análise com protocolo vinculado, decisões independentes e inclusão explícita no calendário implementados e ensaiados. Conferência de interface, concorrência real entre sessões, compatibilidade legada e isolamento de conta com múltiplos perfis realizados. Evidências e limites em [VALIDACAO_BLOCO_03.md](VALIDACAO_BLOCO_03.md). Desativação entre simulação e confirmação validada em SQL; não representa ensaio de carga nem aceite institucional. Calendário amplo e aceite por responsáveis continuam nos grupos 04 e 08.

## 04. Calendário, feriados, escala mínima e conflitos — concluído tecnicamente no piloto

Calendário por atuação/contexto, planejamento separado da confirmação, filtros e marcadores cobertos pelos testes. Feriado incluído, movido e desativado por API com conferência de recálculo, pendência, atribuição diária e avisos na interface. Escala cíclica nominal, dia explicitamente vazio e conflito justificado criados/encerrados pela tela; concorrência real de gravação validada. Correções de integridade e histórico publicadas. Evidências e limites em [VALIDACAO_BLOCO_04.md](VALIDACAO_BLOCO_04.md).

Não há registros nas tabelas legadas de escala mínima a converter. Não criar associações sem evidência; reconciliação de futuros registros ambíguos permanece no bloco 07. Desempenho nos equipamentos institucionais, revisão completa de acessibilidade e aceite do RH continuam no bloco 08; não foram considerados concluídos pelos testes técnicos.

## 05. Notificações e auditoria — concluído tecnicamente no piloto

Avisos operacionais complementados, chaves de feriado corrigidas por protocolo, paginação e marcação de leitura isoladas. Auditoria ampliada com identidade verificada, snapshots de nomes/matrícula, participantes de eventos coletivos e resumos por contexto. Histórico antigo preservado sem inferir escopo; proteção contra alteração/exclusão pela API. Ensaios locais, SQL e API real realizados; evidências e limites em [VALIDACAO_BLOCO_05.md](VALIDACAO_BLOCO_05.md).

Procedimentos de desativação, compensação e anonimização condicionada formalizados em [AUDITORIA_RETENCAO.md](AUDITORIA_RETENCAO.md). Não foi realizado descarte/anonimização nem escolhido prazo legal: ratificação institucional permanece no bloco 08. Separação de ambientes e restauração integral continuam nos blocos 07/09. Contas técnicas desativadas, alertas encerrados e conta TESTE de recuperação preservada.

## 06. Recusas, regras e orientação ao usuário — concluído tecnicamente no piloto

Catálogo de motivos ensaiado com permissões, auditoria, campos obrigatórios e concorrência real; três recusas estruturadas conferidas no banco, com saldo, atuação e rótulo histórico preservados. Impedimentos de datas/admissão/aquisição separados da recusa administrativa e repetidos no banco. Orientação versionada e canais RH/TI entregues. Procedimentos em [CATALOGO_MENSAGENS.md](CATALOGO_MENSAGENS.md); evidências e limites em [VALIDACAO_BLOCO_06.md](VALIDACAO_BLOCO_06.md).

Não existe referência normativa ratificada fornecida para preencher nesta entrega. Campos de aprovação/vigência permanecem explicitamente pendentes; aprovação pelo RH/Jurídico e consolidação normativa integral dos cálculos continuam no bloco 08, não foram eliminadas nem consideradas concluídas. Catálogo versionado no código, sem editor livre de legislação no painel.

## 07. Históricos, migração e testes integrados — concluído tecnicamente no piloto

Inventário, classificação dos históricos, revisão das dependências e plano de compatibilidade registrados em [VALIDACAO_BLOCO_07.md](VALIDACAO_BLOCO_07.md). Não há pedido legado ativo a converter nem escala legada preenchida. Base demonstrativa moderna preparada e ensaiada com rollback no Supabase; não gravada no piloto. Proteção contra vínculo legado ambíguo publicada em `manage-operations` v17. Suíte local: 283/283; concorrência real por API repetida com sucesso. Migrations de identidade de serviço e estabilidade da constraint de perfis aplicadas, sem ampliar permissões. Calendário hospedado conferido sem erros no console. Estes itens foram retirados da fila ativa, sem apagar histórico ou inferir associações.

Reconstrução completa em banco vazio, todos os ensaios SQL integrados e restauração de dump sintético em segundo banco isolado passaram no [run 37968449955](https://github.com/GuiPaicheco/SGF/actions/runs/37968449955). Dados, funções, autoria/permissões, RLS, constraints e triggers comparados sem divergências. O banco compartilhado não foi zerado nem restaurado. Interface/Edge publicada conferida, com evidência local sem dados pessoais; testes de ambiguidade são automatizados, não uma fixture persistida na interface hospedada. Revisão visual completa com dados representativos permanece no bloco 08.

Sem itens técnicos ativos neste bloco. Snapshot parcial não equivale a backup integral restaurável; este ensaio de PostgreSQL não copia configurações de Auth/SMTP, arquivos do Storage, segredos ou hospedagem. Backup operacional e recuperação institucional permanecem no bloco 09.

## 08. Homologação institucional, revisão visual e documentação

**Em andamento.** Revisão pública/administrativa realizada no Chrome, equipe filtrada por CNES conferida, comprovante e principais áreas carregados sem erro de console. Botão Tela inicial corrigido e testado no celular publicado; login/rodapé e foco inicial de teclado conferidos em tablet. 287 testes aprovados. Manual atual, guia de 20 casos, roteiro e imagens entregues; hospedagem corrigida e instruções antigas de operação identificadas como históricas. Evidências e limites em [VALIDACAO_BLOCO_08.md](VALIDACAO_BLOCO_08.md). Não há aceite institucional nem revisão integral de todos os formulários/perfis nesta rodada.

1. [ ] Obter validação de RH/Jurídico para admissão, aquisição, faltas, fracionamento, feriados, banco de horas, day-off e jornada individual; usar HOMOLOGACAO_REGRAS.md. Fornecer referências normativas aprovadas, responsável pelo aceite e vigências para o catálogo de mensagens; consolidar no servidor os cálculos normativos integralmente homologados. Conferências técnicas de datas do bloco 06 não substituem esse aceite.
2. [ ] Homologar solicitações com múltiplos autorizadores e validar os quatro perfis com usuários responsáveis. Conferir se CNES, lotações internas, equipes, vínculos e autorizadores cadastrados correspondem à organização real; isso não bloqueia o desenvolvimento do piloto nem exige INE.
3. [ ] Completar revisão de todas as telas/detalhes dos quatro perfis com dados representativos, incluindo pedidos ativos, correções e decisões: codificação, botões, alinhamento, navegação, responsividade e acessibilidade. Revisão inicial pública/administrativa e teste de UTF-8 ampliado entregues; completar tablet, teclado/zoom/leitor de tela e impressão.
4. [ ] Validar navegadores/equipamentos usados pela Prefeitura.
5. [ ] Montar material final de slides e completar capturas do ciclo moderno validado. Manual de uso, guia de homologação, hospedagem e roteiro/estrutura de treinamento atualizados com imagens públicas/fictícias; não há deck final no Canva nem capturas completas dos quatro perfis.
6. [ ] Registrar evidências e aceite institucional; testes técnicos e recuperação da conta teste não encerram esse grupo.
7. [ ] Ratificar política de retenção, responsáveis e eventual anonimização do histórico, conforme AUDITORIA_RETENCAO.md. Procedimento técnico entregue no bloco 05; nenhum prazo legal ou descarte foi definido pelo sistema.

## 09. Segurança e preparação para uso institucional

1. [ ] Definir separação futura de desenvolvimento, homologação e produção, recursos/custos e bloqueio de e-mails reais em ambientes de teste. Não contratar planos sem autorização.
2. [ ] Definir domínio institucional, restringir CORS e revisar URLs de retorno quando o destino mudar. Retorno atual do Vercel já configurado e testado.
3. [ ] Substituir acesso administrativo legado genérico por responsáveis identificados e revisar concessões.
4. [ ] Homologar política de senha e decidir proteção contra senhas vazadas conforme plano disponível, sem reduzir requisitos atuais.
5. [ ] Concluir revisão de integridade, segurança, privacidade, backup/restauração e observabilidade.
6. [ ] Após aceite, publicar a versão institucional aprovada. GitHub e publicação técnica do piloto já estão autorizados; não constituem pendências de autorização nem aceite de produção.

## Regra de acompanhamento

- Executar grupos nesta ordem, trazendo decisões institucionais necessárias antes de implementar a regra dependente.
- Retirar desta lista somente o que tiver evidência suficiente; registrar se foi teste local, SQL real, interface ou confirmação do usuário.
- Não tratar migrations/funções já publicadas como ainda aguardando aplicação.
- Atualizar esta lista a cada entrega; preservar o histórico sem reutilizar seus checkboxes como tarefas ativas.
