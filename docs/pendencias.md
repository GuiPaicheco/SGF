# Pendências do SGF

Atualização: 08/10/2026. Esta é a lista ativa, agrupada por dependência. Contém somente trabalho restante; implementação existente e validação pendente são diferenciadas. Detalhes anteriores estão em [HISTORICO_PENDENCIAS_20261008.md](HISTORICO_PENDENCIAS_20261008.md) e não formam uma segunda fila de tarefas.

## Situação confirmada

- Piloto hospedado em https://sgfbetim.vercel.app/, com GitHub e Supabase compartilhado autorizados para homologação. Não é aceite institucional de produção.
- Fundação de pessoa, múltiplos vínculos/CNES, equipes, seleção de contexto, distribuição diária e gestão por unidade já implementadas; falta completar e homologar os fluxos abaixo.
- Recuperação de senha da conta teste concluída: o usuário confirmou salvar a nova senha e realizar login por e-mail em 08/10. Não repetir essa tarefa como pendência.
- Correções de recuperação publicadas: sessão de callback explícita, mínimo de seis caracteres (oito para Administrador) e mensagens de recusa específicas. Última suíte executada: 227 testes locais aprovados.
- Ensaios SQL reais já realizados: cadastro/aprovação, isolamento RLS, gestão por unidade, ajustes de feriado e redistribuição pendente. Não substituem testes completos de interface, concorrência entre sessões ou homologação institucional.
- Preservar a conta TESTE até decisão explícita sobre limpeza. Não apagar dados nem modificar sua senha para ensaios.
- Plano de três ambientes independentes suspenso. Não publicar novamente a versão legada contra o banco atualizado; separação definitiva fica no grupo 09.

## 01. Cadastro, primeiro acesso e perfis — próximo bloco

1. [ ] Homologar cadastro público e administrativo com CPF único, várias matrículas e vários CNES no mesmo vínculo, sem duplicar identidade ou saldos.
2. [ ] Validar unidade polo opcional, equipes filtradas, uma equipe por atuação/CNES, Não se aplica e lotação interna somente em Secretaria.
3. [ ] Validar aprovação de acesso novo/adicional, senha provisória, troca obrigatória e login por CPF, além do login por e-mail já testado.
4. [ ] Testar Servidor, Diretor, RH e Administrador na interface: escolha/troca de perfil, vínculo e escopo, cabeçalho, navegação e botões internos. Revisar possíveis bloqueios visuais contraditórios com a permissão do backend.
5. [ ] Testar revogação/desativação durante sessão e respostas atrasadas após troca de contexto. Confirmar isolamento entre diretorias que compartilham CNES e manutenção do intervalo de login de três segundos.

## 02. Catálogo organizacional, direitos e saldos por vínculo

1. [ ] Completar/revisar administração de Secretaria, CNES/unidade, lotação interna, equipes e escopos; UBS deve funcionar sem subdivisão administrativa artificial.
2. [ ] Associar direitos, períodos aquisitivos e banco de horas ao vínculo correto, evitando duplicação entre CNES.
3. [ ] Definir institucionalmente a responsabilidade quando duas unidades compartilham a jornada no mesmo dia; o modelo atual aceita um responsável por dia.
4. [ ] Confirmar e preencher os códigos INE de EMULTI 004 BUENO FRANCO e EMULTI 018 VILA CRISTINA.
5. [ ] Homologar a matriz oficial de CNES, lotações internas, equipes, vínculos e autorizadores.

## 03. Solicitações, gestão por unidade e redistribuição

1. [ ] Validar pela interface o ciclo completo: simulação → distribuição dos dias → envio → análise independente por unidade → Aprovar/Recusar → Adicionar ao Calendário. Aprovação não deve confirmar ausência automaticamente.
2. [ ] Validar preenchimento por dia/semana, sextas alternadas, múltiplos CNES, vigência e desativação concorrente de atuações; conferir comprovante e assinaturas do servidor e do RH/chefia que autorizou.
3. [ ] Homologar redistribuição pendente por titular, RH no próprio escopo e Administrador, incluindo revisão criada/removida, justificativa, versões, autoria e avisos. Esse núcleo já foi implementado e ensaiado em SQL.
4. [ ] Definir e implementar tratamento explícito de redistribuição/reprogramação quando já existem decisões, incluindo mudanças de períodos e inclusão/remoção compensatória do calendário. Não sobrescrever decisões silenciosamente.
5. [ ] Testar dois gestores simultâneos, cliques repetidos, versões antigas e operações cruzadas; confirmar ausência de gravações parciais/deadlocks.
6. [ ] Validar compatibilidade do ciclo legado, devolução/reenvio e bloqueio das operações legadas em pedidos do novo modelo.

## 04. Calendário, feriados, escala mínima e conflitos

1. [ ] Homologar calendário por CNES/lotação: planejamento versus confirmado, filtros por cargo/equipe/função, vigência, aniversário, início, fim, retorno e acessibilidade.
2. [ ] Validar intervalo livre entre meses/anos, troca rápida de contexto e desempenho nos dispositivos institucionais.
3. [ ] Homologar ajuste por inclusão, remoção ou mudança de feriado durante férias: preservar início e quantidade de dias, recalcular fim/retorno, responsabilidades, revisões e avisos. Integração já aplicada; falta validação completa pela interface.
4. [ ] Validar dias acrescentados sem responsável, parcelas sobrepostas, períodos legados de contagem desconhecida e decisões existentes; exigir revisão quando não houver atribuição inequívoca.
5. [ ] Homologar gravação/ciclo da escala mínima por atuação, dias explicitamente vazios, composição sugerida, exceções do RH e concorrência com inclusão de afastamentos.
6. [ ] Converter histórico da escala mínima legada apenas quando a associação à atuação for comprovável; preservar casos ambíguos para reconciliação.
7. [ ] Homologar conflitos conforme filtro e criação/encerramento manual justificado, sem recusa automática; conferir impacto de alterações posteriores no planejamento.

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
2. [ ] Homologar solicitações com múltiplos autorizadores e validar os quatro perfis com usuários responsáveis.
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
