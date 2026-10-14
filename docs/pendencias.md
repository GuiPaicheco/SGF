# Pendências do SGF

Atualização: 14/10/2026. Esta é a lista ativa, agrupada por dependência. Contém somente trabalho restante; implementação existente e validação pendente são diferenciadas. Detalhes anteriores estão em [HISTORICO_PENDENCIAS_20261008.md](HISTORICO_PENDENCIAS_20261008.md) e não formam uma segunda fila de tarefas.

## Situação confirmada

Ponto de retomada para a próxima sessão: [RETOMADA_20261014.md](RETOMADA_20261014.md). Código funcional publicado, banco conferido e pendências restantes separadas; `logo.png` local preservado fora dos commits.

- Piloto hospedado em https://sgfbetim.vercel.app/, com GitHub e Supabase compartilhado autorizados para homologação. Não é aceite institucional de produção.
- Fundação de pessoa, múltiplos vínculos/CNES, equipes, seleção de contexto, distribuição diária e gestão por unidade já implementadas; falta completar e homologar os fluxos abaixo.
- Recuperação de senha da conta teste concluída: o usuário confirmou salvar a nova senha e realizar login por e-mail em 08/10. Não repetir essa tarefa como pendência.
- Correções de recuperação publicadas: sessão de callback explícita, mínimo de seis caracteres (oito para Administrador) e mensagens de recusa específicas. Última suíte executada: 309 testes locais aprovados em 14/10/2026.
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

### 08.A — Revisão técnica atual

README reestruturado em 14/10 como documentação de entrada do repositório: execução, configuração, build/testes, estrutura, implantação e licença. Conteúdo de treinamento e histórico permanece em docs, sem misturá-lo às instruções atuais. Não altera funcionalidades ou banco.

CNES do cadastro ordenados em 14/10: caixas de atuação e unidade polo usam ordem alfabética por nome em português, sem ordenar pelo código nem alterar o catálogo original. Componente compartilhado cobre cadastro público e administrativo.

Contexto de unidade reafirmado em 14/10: RH/Diretor consulta somente funcionários do CNES/lotação selecionado, não a união de todos os seus escopos. Cadastro usa vínculos da unidade, com resultado vazio quando não há funcionários; diretorias com mesmo CNES continuam separadas. Aviso de contexto adicionado à tela; Administrador conserva visão global. Não alterados vínculos ou permissões nesta rodada.

Auditoria técnica e correções de 14/10: [AUDITORIA_TECNICA_20261014.md](AUDITORIA_TECNICA_20261014.md). Achados A01–A06 corrigidos: três perfis funcionais (Servidor, RH/Diretor e Administrador), busca por vínculo, conflitos pela projeção do calendário, preservação de atribuições/observações, sincronização em lote e proteção de respostas atrasadas. Migração `20261014153031` aplicada no Supabase; escopos e contas preservados, sem trocar senhas ou apagar histórico. Papéis históricos continuam legíveis, mas novos perfis são normalizados para os três acessos. 302 testes locais e nove cenários SQL reais com rollback aprovados; não equivalem a auditoria visual.

Identidade atualizada em 14/10: SGF significa **Sistema de Gestão de Funcionários**. Férias e folgas são funcionalidades atuais, não o escopo definitivo. Nome corrigido no cabeçalho, título/descrição, comprovante, README e roteiro. Slides e capturas históricos de 09/10 ainda retratam a identidade anterior; atualizar na próxima revisão do material, sem tratá-los como versão atual do nome.

Rodada de 14/10: revisão estática de navegação/foco, avisos, idioma, UTF-8, movimento reduzido e estilos de impressão realizada; movimento reduzido e colunas A4 corrigidos, com duas regressões novas e 290/290 testes locais aprovados. Isso não encerra as verificações visuais abaixo. A ferramenta de navegador/Computer Use falhou ao iniciar (caminho de assets indisponível), antes de qualquer interação; não foi possível executar zoom, leitor de tela ou impressão visual nesta rodada. Arquivos continuam acessíveis pelo terminal alternativo. Não reutilizar capturas antigas como evidência destas alterações.

1. [ ] Ensaiar volume, filtros e foco assíncrono; completar revisão das telas/detalhes dos três perfis funcionais, incluindo pedidos ativos, correções e decisões.
2. [ ] Completar navegação por teclado, tablet, zoom 200%, leitor de tela e impressão. Registrar separadamente testes executados e limitações; não declarar acessibilidade integral com base apenas nos testes automatizados.
3. [ ] Atualizar treinamento, inclusive identidade nova e RH/Diretor unificado nas capturas/slides. Manual textual atualizado; material visual ainda é histórico.

### 08.B — Homologação institucional futura, após as mudanças

Decisão do responsável em 14/10/2026: o sistema continuará recebendo mudanças. Quando estiver pronto, alguém do RH Central será indicado para aprovar e alguém do RH ou Diretor para testar. Estes itens não bloqueiam a revisão técnica nem o desenvolvimento atual; permanecem necessários antes do uso institucional definitivo. Não há aceite antecipado.

1. [ ] Submeter regras e referências normativas ao RH Central, com apoio jurídico quando necessário: admissão, aquisição, faltas, fracionamento, feriados, banco de horas, day-off e jornada individual. Registrar responsáveis/vigências e ajustar os cálculos conforme a decisão aprovada.
2. [ ] Executar aceite funcional com RH ou Diretor: solicitações com múltiplos autorizadores, três perfis funcionais (Servidor, RH/Diretor e Administrador) e correspondência de CNES, lotações, equipes, vínculos e autorizadores à organização real. INE não é exigido.
3. [ ] Validar navegadores/equipamentos usados pela Prefeitura na versão candidata ao aceite.
4. [ ] Ratificar política de retenção, responsáveis e eventual anonimização, conforme AUDITORIA_RETENCAO.md. Nenhum prazo legal ou descarte foi definido pelo sistema.
5. [ ] Registrar evidências e aceite nominal da versão final; ensaios técnicos não substituem a aprovação institucional.

Entrega adicional de 09/10: ciclo moderno real com conta nova fictícia, quatro perfis, duas matrículas e dois CNES; aprovações e inclusões independentes, débito único de 32h e saldo da segunda matrícula preservado. Corrigidos aviso residual entre contextos, identificação por matrícula na escala mínima, datas exibidas nos filtros mensais e foco de teclado. Slides finais de 14 páginas entregues no [Canva](https://www.canva.com/d/Bd4ZkdD8RE-4lxi) e em [PowerPoint](apresentacao/SGF_Treinamento_20261009_final.pptx), com capturas fictícias e notas do instrutor. Material retirado da fila ativa; revisão integral de acessibilidade e aceite institucional não foram declarados concluídos.

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
