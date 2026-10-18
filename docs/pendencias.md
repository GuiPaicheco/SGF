# Pendências do SGF — revisão urgente de 18/10/2026

Esta é a única fila ativa. A orientação mais recente substitui a inclusão manual e a exigência de matrícula dos blocos anteriores. O [planejamento anterior](HISTORICO_PENDENCIAS_20261018_ANTES_PDF.md) fica como histórico; sua ordem não deve ser retomada automaticamente. Novos blocos serão considerados após esta revisão.

## Requisitos prioritários e implementação

- [x] Calendário administrativo sem unidade selecionada automaticamente; UBS em ordem alfabética e Secretaria por último.
- [x] Consulta mensal ou por datas, com CBO, cargo, equipe, modalidade e situação; filtros adicionais recolhidos. Intervalos de até 93 dias por consulta.
- [x] Matrícula deixa de ser requisito para funcionários CNES; não fabricar matrícula. Coluna independente de carga horária, por exemplo `40h`.
- [x] Cargo/ocupação vem da descrição CNES; equipes cruzadas por CNS/CBO, sem união por nome.
- [x] Rolagem horizontal, ocultação e reorganização das colunas funcionais; calendário sem edição direta dos dados cadastrais.
- [x] Exportação CSV de todos os funcionários filtrados e impressão/PDF com a mesma seleção de colunas, organizada por faixas de sete dias.
- [x] Administração concentrada em Calendário, Cadastro das unidades e Feriados; antigas configurações retiradas das rotas atuais.
- [x] Cadastro das unidades centraliza funcionários, importação, competência e autorização de operadores, com filtros e ordem alfabética.
- [x] Redefinição de senha da unidade para `123456`, com confirmação e encerramento das sessões; não redefinir contas sem ação explícita do Administrador.
- [x] Importação por seleção/arraste de PDF; conferência de CNES e competência confirmada separadamente das datas de emissão/atualização.
- [x] Conferência individual de inclusões, alterações e ausências. Rejeitar uma alteração mantém o cadastro anterior; ausências confirmadas impedem novos lançamentos sem apagar vínculos, férias, folgas ou histórico.
- [x] Atualização cadastral preserva IDs de vínculo e snapshots históricos. Integração dos registros aceitos ocorre sem cadastro manual, sem login do funcionário e sem criar direitos/saldos.
- [x] Inclusão manual retirada da interface e da API; função antiga sem permissão de execução pelo serviço; origem manual não pode integrar vínculo nem autorizar operador no fluxo atual.
- [x] Feriados com inclusão/edição recolhida e listagem por data; removidas as demais áreas antigas de configuração.

## Verificação desta revisão

- [x] PDF fornecido: 10 páginas, 40 profissionais, três equipes e 24 associações; nomes/ocupações/cargas conferidos por extração independente, sem divergências nesses campos.
- [x] Ensaio SQL com rollback: importar, programar, atualizar e confirmar ausência preserva a folga e o vínculo; consulta por intervalo encontra o registro e ausência impede novo lançamento.
- [x] 392 testes Node e Deno check das funções aprovados nesta etapa; banco e APIs publicados tecnicamente.
- [ ] Concluir ensaio visual do fluxo PDF, calendário/colunas/exportações e conferir publicação web/CI.
- [ ] Conferência cadastral e aceite real pelos responsáveis das unidades. Nenhuma importação real foi aprovada automaticamente a partir do PDF enviado.

## Limites e continuidade

O leitor reconhece ficha completa textual no layout CNES ensaiado; PDFs digitalizados ou de outro layout são recusados, sem incorporação parcial silenciosa. PDF sem competência explícita exige mês informado pelo Administrador. Data de emissão não prova competência nem atualização da fonte.

Dados necessários às regras de um afastamento que não existam no CNES continuam sendo conferidos no lançamento (por exemplo nascimento/day-off e admissão), sem exigir cadastro manual do funcionário. Não inventar esses dados nem direitos.

A revisão não é homologação normativa/institucional. Relatórios analíticos e estatísticas continuam futuros; CSV/PDF do calendário pertencem ao escopo urgente. Manual/treinamento continuam depois da funcionalidade real.
