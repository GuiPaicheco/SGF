# Pendências do SGF

Atualização: 09/10/2026. Esta é a lista ativa, agrupada por dependência. Contém somente trabalho restante; implementação existente e validação pendente são diferenciadas. Detalhes anteriores estão em [HISTORICO_PENDENCIAS_20261008.md](HISTORICO_PENDENCIAS_20261008.md) e não formam uma segunda fila de tarefas.

## Situação confirmada

- Piloto hospedado em https://sgfbetim.vercel.app/, com GitHub e Supabase compartilhado autorizados para homologação. Não é aceite institucional de produção.
- Fundação de pessoa, múltiplos vínculos/CNES, equipes, seleção de contexto, distribuição diária e gestão por unidade já implementadas; falta completar e homologar os fluxos abaixo.
- Recuperação de senha da conta teste concluída: o usuário confirmou salvar a nova senha e realizar login por e-mail em 08/10. Não repetir essa tarefa como pendência.
- Correções de recuperação publicadas: sessão de callback explícita, mínimo de seis caracteres (oito para Administrador) e mensagens de recusa específicas. Última suíte executada: 265 testes locais aprovados.
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

## 05. Notificações e auditoria

1. [ ] Completar avisos de mudanças de períodos, reprogramações e demais eventos operacionais ainda não cobertos.
2. [ ] Validar disparos existentes de nova análise, decisões, redistribuição, feriados, conflitos, escala mínima e confirmação/cancelamento: destinatários, escopo, deduplicação, navegação e transações.
3. [ ] Reconciliar avisos antigos de gestão sem escopo confiável, sem expô-los indevidamente nem apagar o histórico.
4. [ ] Revisar todas as mutações e completar autoria, papel, vínculo, CNES/lotação, data/hora, antes/depois e justificativa onde aplicável.
5. [ ] Completar cobertura de pessoas/vínculos/equipes/polo, acessos/inclusões, concessões/revogações, banco de horas, alterações operacionais e administrativas.
6. [ ] Ampliar identificação do servidor afetado em eventos ainda não cobertos; não atribuir arbitrariamente um único sujeito a eventos coletivos.
7. [ ] Validar consulta paginada e buscas por autor, afetado, matrícula, evento e período com dados reais, isolamento de RH/Diretor e ausência de segredos nos detalhes.
8. [ ] Formalizar desativação, eventos compensatórios e anonimização conforme política institucional, evitando exclusões físicas indevidas.

## 06. Recusas, regras e orientação ao usuário

1. [ ] Homologar catálogo de motivos: criação/edição, ativação, campos obrigatórios, permissões, auditoria e concorrência.
2. [ ] Validar recusas Banco de Horas Insuficiente, Conflito com Funcionário e Outros, incluindo seletor de atuação, saldo informado e rótulo histórico.
3. [ ] Completar separação entre impedimento normativo antes do envio e recusa administrativa; revisar validações existentes e mensagens objetivas.
4. [ ] Criar catálogo de mensagens com explicação, referência normativa aprovada, vigência e canal de apoio.
5. [ ] Padronizar orientação: direitos/regras ao RH; problemas técnicos aos Administradores/TI. Não inventar referências legais.

## 07. Históricos, migração e testes integrados

1. [ ] Reconciliar solicitações, decisões, notificações e registros legados ainda não mapeados; preservar origem e não inferir CNES/atuação sem evidência.
2. [ ] Revisar consultas e dependências remanescentes dos campos legados; removê-los somente após validação e plano de compatibilidade.
3. [ ] Preparar base demonstrativa controlada com múltiplos vínculos/CNES e atribuição diária, sem misturar dados fictícios não identificados com dados institucionais.
4. [ ] Executar cenários integrados pela interface/Edge Functions, RPCs/triggers, permissões e concorrência real; repetir suíte, análise estática e verificações de segurança após alterações.
5. [ ] Testar reconstrução integral em banco vazio e restauração de backup consistente. Snapshot parcial existente não equivale a backup integral restaurável.

## 08. Homologação institucional, revisão visual e documentação

1. [ ] Obter validação de RH/Jurídico para admissão, aquisição, faltas, fracionamento, feriados, banco de horas, day-off e jornada individual; usar HOMOLOGACAO_REGRAS.md.
2. [ ] Homologar solicitações com múltiplos autorizadores e validar os quatro perfis com usuários responsáveis. Conferir se CNES, lotações internas, equipes, vínculos e autorizadores cadastrados correspondem à organização real; isso não bloqueia o desenvolvimento do piloto nem exige INE.
3. [ ] Revisar todas as telas com dados representativos: codificação de texto, botões, alinhamento, navegação, responsividade e acessibilidade.
4. [ ] Validar navegadores/equipamentos usados pela Prefeitura.
5. [ ] Atualizar manual operacional, hospedagem, guia de testes e treinamento/apresentação com imagens da versão validada.
6. [ ] Registrar evidências e aceite institucional; testes técnicos e recuperação da conta teste não encerram esse grupo.

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
