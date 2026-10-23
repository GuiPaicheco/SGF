# Histórico de pendências — até a preparação do piloto de 23/10/2026

## Entrega atual — acabamento final e afastamentos (23/10)

1. [x] Retirar classificação territorial dos feriados; manter apenas tipo e abrangência geral ou unidades selecionadas. Preservar o dado histórico sem pedir classificação em novos cadastros.
2. [x] Atualização CNES com animação por etapa real e respeito a movimento reduzido.
3. [x] Conferência em grupos de novos profissionais e cadastros alterados; comparação por campo, decisões individuais ou em lote e confirmação antes de salvar.
4. [x] Unidade fixa na ficha CNES; voltar à lista para acessar outro estabelecimento.
5. [x] Nome e cargo em destaque; dados completos organizados em campos, listas e tabelas, sem JSON visível. Identificação técnica de importação preservada.
6. [x] Seleção de operador autorizado redesenhada somente visualmente, mantendo permissões e identificação existentes.
7. [x] Folga e Afastamento: calendário clicável com dias não consecutivos; afastamento contínuo com início e retorno opcional; alteração posterior de retorno com versão, justificativa e histórico.
8. [x] Calendário, consulta CNES e comprovante reconhecem afastamento sem previsão sem fabricar uma data final; detecção de sobreposição, idempotência, escopo e autoria no servidor.
9. [x] Textos voltados ao RH e administrador, com orientações de uso e minimização de dados sensíveis.
10. [x] 453 testes Node, 4 Python, build e ensaios SQL com rollback aprovados. Regressões de calendário anual/day-off, feriados por unidade e programação/revisão de férias aprovadas.
11. [x] Supabase atualizado: migration 20261023171909, manage-rh v16 e manage-catalogs v13. Nenhuma senha alterada.
12. [x] GitHub/Vercel atualizados e conferência visual da versão publicada com administrador e RH: login, operador, CNES/consulta API, feriados, formulários de férias/day-off, prévias de folga/afastamento, calendário e comprovante. Corrigidos agrupamentos de campos, rótulos, alinhamentos e legenda. Gravações/exclusões verificadas com fixtures e rollback, sem alterar atos reais no navegador. Evidências e limites em [Conferência final](CONFERENCIA_FINAL_20261023.md).

## Ajustes atuais — unidades, login e feriados por abrangência

1. [x] Lista das unidades com apenas Acessar CNES; ficha completa, atualização principal via API, profissionais e day-off dentro da unidade, junto das ações administrativas.
2. [x] Retirar envio PDF da interface e bloquear preview/apply de arquivos na API administrativa. Preservar parsers e migrations históricos sem oferecer o fluxo encerrado.
3. [x] Login por seleção dos 42 estabelecimentos, com opção separada Administração; identificador correto enviado à autenticação e senhas atuais preservadas.
4. [x] Feriados gerais ou específicos para uma/várias unidades, sem classificação territorial (retirada no acabamento final). Dados antigos ficam gerais, sem inventar classificação normativa.
5. [x] Excluir feriado fisicamente, com confirmação, versão e auditoria; recálculo atômico das férias úteis afetadas e isolamento dos calendários por unidade. Conflito impede gravação parcial.
6. [x] Ensaios SQL sintéticos com rollback: isolamento, grupo de unidades, mesma data em escopos diferentes, exclusão física, auditoria e concorrência. Testes da interface/login adicionados.
7. [x] Publicados migration 20261023164729, manage-catalogs v12 e manage-cnes v7; Vercel READY (c6c493e). Aprovados 447 testes Node, 4 Python, CI de banco vazio, ensaios SQL e restauração com comparação de integridade. Preservados os 11 feriados, sem alteração de senhas.
8. [ ] Decidir política de senhas: recomendadas senhas iniciais aleatórias por unidade, troca obrigatória e redefinição administrativa. Padrão atual de redefinição continua 123456; nenhuma credencial foi alterada neste bloco.
9. [x] Conferência visual técnica com administrador e RH no site publicado; grupo de unidades, login, ficha CNES e consulta real da API conferidos. Aceite institucional permanece separado.

## Ajustes atuais — calendário anual e day-off

1. [x] Consulta do calendário ampliada para até 12 meses na interface, API e banco, incluindo anos bissextos e exportações sem truncamento em 93 dias.
2. [x] Aniversário (dia/mês) confirmado pelo RH gera day-off anual, excluído da contagem de férias regulamentares úteis; início e quantidade preservados, fim e retorno ajustados. Não é exigida solicitação anual; data de nascimento legada sem confirmação do RH não concede day-off. Não muda férias em dias corridos.
3. [x] Cadastro/alteração/remoção de aniversário RH e cadastro/cancelamento de day-off datado recalculam férias úteis programadas do vínculo, com versões e auditoria; bloqueio atômico em conflito com outro afastamento/parcela. Day-off e férias não geram falso alerta de sobreposição na mesma data.
4. [x] Testes de período anual, calendário e comprovante; ensaio SQL sintético de prévia, gravação, recálculo, cancelamento, idempotência, histórico e conflito executado com rollback.
5. [x] Migration 20261023134116 e manage-rh v15 publicados; site publicado no Vercel (da43adb, READY). 444 testes Node e 4 Python passaram, além dos ensaios SQL com rollback e consulta real do ano completo com 40 profissionais.

## Bloco atual — API CNES, consulta e operações RH

Esta seção prevalece sobre os itens históricos abaixo: atualização não remove ausentes; somente o admin altera cadastros. RH lança férias, folgas e day-off.

1. [x] Base obtida de origin/main b355215 em worktree isolada, preservando alterações locais anteriores.
2. [x] Consulta Python autenticada no próprio SGF; adaptação para a conferência CNES existente, sem CPF/matrícula ou login de profissional.
3. [x] Atualizar CNES com prévia; preservar ausentes e remoções explícitas, IDs, informações RH e afastamentos. Fluxo alternativo PDF foi encerrado no bloco de unidades/login/feriados acima.
4. [x] Ver CNES com estabelecimento, profissionais, equipes e dados RH separados; coletas e histórico em schema privado.
5. [x] Remoção explícita pelo admin, com justificativa e versão, sem apagar histórico ou permitir reativação pela atualização.
6. [x] Cadastrar dayoff substitui Visualizar cadastro; Lançar Folga registra autorização externa, sem banco de horas ou concessão automática.
7. [x] Calendário/comprovante/exportações distinguem D/L; idempotência, versão, operador, escopo e conflitos preservados.
8. [x] Ensaios sintéticos com rollback e testes de contrato/autorizações; consulta real sem gravação.
9. [x] Migração 20261023124526 aplicada; manage-cnes v6 e manage-rh v14 publicados. Preservados 40 registros CNES, 42 contas RH e o lançamento existente.
10. [x] CI completo aprovado (Node/Python, banco vazio, ensaios SQL e restauração); versão incorporada à main e deploy Vercel pronto. Verificação local adicional: 441 testes Node e 4 Python; proteção contra duplicação do payload CNES no envio.
11. [ ] Conferência acompanhada no navegador com admin e RH antes do uso institucional; manter governança/aceite pendentes.

Contrato e procedimentos: [Atualização CNES](ATUALIZACAO_CNES.md). A data de consulta não é competência. Aniversário confirmado pelo RH gera day-off anual; data de nascimento legada sem confirmação permanece informativa.

## Registro das etapas anteriores (19/10)

Registro histórico, subordinado ao bloco atual acima. A orientação mais recente substitui a inclusão manual e a exigência de matrícula dos blocos anteriores. O [planejamento anterior](HISTORICO_PENDENCIAS_20261018_ANTES_PDF.md) fica como histórico; sua ordem não deve ser retomada automaticamente. Os blocos abaixo incorporam a pesquisa normativa de férias e a retirada de banco de horas.

## Requisitos prioritários e implementação

- [x] Aba RH renomeada para Férias e Cadastros: nome, profissão, Lançar Férias, Lançar Folga desativado e Visualizar cadastro. RH informa aniversário apenas como dia/mês; alteração auditada e versionada, restrita à própria unidade, sem sobrescrever CNES ou recalcular histórico.
- [x] Lançar no calendário valida e grava numa única ação, com chave contra duplicação; redireciona para funcionário e intervalo incluindo retorno. Falhas exibem mensagem; envio sem confirmação pode ser repetido com a mesma chave.
- [x] Campo Número do processo ou memorando; comunicação ao RH retirada. Data ausente permanece nula e prazo não é atestado automaticamente; conferência de antecedência fica no processo externo.
- [x] Calendário sem Programar/Ações. Unidade, competência do período consultado e cabeçalhos fixos. Visão longitudinal padrão por funcionário e nominal por período de afastamento. Retiradas as colunas de aniversário e retorno previsto; aniversário aparece somente na célula correspondente dentro do período e retorno permanece como marca R. Competência da importação continua no cadastro da unidade.
- [x] Filtros do calendário por checkbox de funcionários, cargos e equipes efetivamente existentes na unidade, em ordem alfabética e independentes da página atual. Seleções dentro de cada filtro são alternativas; filtros diferentes são cruzados. Retirados os filtros Situação e Modalidade da interface; o calendário consulta todas as modalidades existentes. Equipe vazia é normalizada para Não se aplica, sem modificar a evidência CNES nem snapshots históricos.
- [x] Conflitos entre duas ou mais pessoas afastadas no mesmo dia: critérios combináveis de mesmo cargo, CBO e equipe, exigindo coincidência em todos os critérios marcados. Alerta visual, sem bloquear lançamento, conforme decisão do usuário. Consulta de apenas funcionários com conflito; cálculo da unidade inteira antes de filtros de nomes/paginação, com equipes múltiplas, dias atribuídos do legado, cancelamentos excluídos e mesma pessoa com vários vínculos não contada duas vezes.
- [x] Exportação direta de PDF A4 paisagem, todas as colunas funcionais e todos os funcionários filtrados, em faixas de até sete dias, com identificação, competência, cabeçalhos, legenda e numeração repetidos. Quebras verticais preservam as linhas; textos longos são quebrados dentro das células.
- [x] Exportação XLSX substitui CSV na interface: calendário colorido, filtros, linhas/colunas congeladas, datas e cargas tipadas, CBO como texto e aba com detalhes dos afastamentos. Bibliotecas locais carregadas apenas ao exportar; dados não enviados a serviços de conversão.
- [x] Política funcional definida pelo responsável em 23/10: aniversário confirmado pelo RH é day-off anual e não conta nas férias regulamentares úteis, sem desconto duplicado em feriado/fim de semana. Férias corridas não foram alteradas; alcance normativo institucional permanece sujeito ao aceite do RH Central.
- [x] Lançar Folga implementado no bloco de 23/10: período explícito e referência da autorização externa, com auditoria e conflitos; sem fabricar folgas ou saldo de banco de horas.

- [x] Lançamento simplificado: perguntar o fim do período aquisitivo, calcular o início de 12 meses / quinquênio no servidor e usar admissão apenas se já conhecida. Explicação recolhida com exemplo inclusivo; férias já gozadas não reiniciam o ciclo. Manter os limites, saldos e impedimentos normativos.
- [x] Corrigir digitação do fim aquisitivo: não reconstruir formulário em eventos de edição da data; atualizar apenas opções de fracionamento ao sair do campo. Observações opcionais recolhidas.
- [x] Retirar aceites repetidos do lançamento e da prévia, registrando que a ciência não foi coletada no SGF, sem marcar consentimento ou conferência como verdadeiros. Preservar o contrato e os registros históricos anteriores.

- [x] Corrigir integração incompleta da importação administrativa antiga: os 40 funcionários CNES da UBS Amazonas foram integrados a partir da importação já realizada pelo administrador, sem pedir nova conferência, reenviar PDF, inventar competência ou alterar férias/histórico. Correção idempotente com auditoria; registros manuais, inativos e alterações posteriores excluídos.

- [x] Aba Lançar Férias exclusiva do RH institucional; retirada do administrador, inclusive ação de novo lançamento no calendário administrativo. Abas ocultas até identificar o operador.
- [x] Preservar busca e página no lançamento; período, filtros e colunas do calendário ao trocar abas. Consultas de calendário/diretório reutilizadas em memória por até 30 segundos, com limite de 30 consultas, isolamento por acesso e invalidação nas alterações. Busca/consulta explícita e validações de férias consultam o servidor.

- [x] Lista de funcionários no lançamento, em ordem alfabética fixa antes da paginação, sem opções de reordenação; nome, cargo, CBO, equipe e carga horária, com botão por funcionário. Consulta leve independente do calendário; somente funcionários CNES ativos da unidade do RH.

- [x] Calendário administrativo sem unidade selecionada automaticamente; UBS em ordem alfabética e Secretaria por último.
- [x] Consulta mensal ou por datas, com nomes, cargo e equipe; filtros e critérios de conflito recolhidos. Intervalos de até 93 dias por consulta.
- [x] Matrícula deixa de ser requisito para funcionários CNES; não fabricar matrícula. Coluna independente de carga horária, por exemplo `40h`.
- [x] Cargo/ocupação vem da descrição CNES; equipes cruzadas por CNS/CBO, sem união por nome.
- [x] Rolagem horizontal, ocultação e reorganização das colunas funcionais; calendário sem edição direta dos dados cadastrais.
- [x] Exportação XLSX e PDF de todos os funcionários filtrados, inclusive páginas posteriores, com todos os dados funcionais; ocultação de colunas continua sendo uma preferência de visualização da tela.
- [x] Administração concentrada em Calendário, Cadastro das unidades e Feriados; antigas configurações retiradas das rotas atuais.
- [x] Cadastro das unidades centraliza funcionários, importação, competência e autorização de operadores, com filtros e ordem alfabética.
- [x] Redefinição de senha da unidade para `123456`, com confirmação e encerramento das sessões; não redefinir contas sem ação explícita do Administrador.
- [x] Importação por seleção/arraste de PDF; conferência de CNES e competência confirmada separadamente das datas de emissão/atualização.
- [x] Conferência individual de inclusões, alterações e ausências. Rejeitar uma alteração mantém o cadastro anterior; ausências confirmadas impedem novos lançamentos sem apagar vínculos, férias, folgas ou histórico.
- [x] Atualização cadastral preserva IDs de vínculo e snapshots históricos; reativação reconhece o mesmo vínculo e competências anteriores são recusadas. Integração dos registros aceitos ocorre sem cadastro manual, sem login do funcionário e sem criar direitos/saldos.
- [x] Endpoints antigos de solicitações e autocadastro encerrados (410); configurações antigas recusadas pela API, mantendo feriados. Inclusão manual retirada da interface e da API; função antiga sem permissão de execução pelo serviço; origem manual não pode integrar vínculo nem autorizar operador no fluxo atual.
- [x] Feriados com inclusão/edição recolhida e listagem por data; removidas as demais áreas antigas de configuração.

## Verificação desta revisão

- [x] Identidade visual retomada em 18/10: verde institucional e dourado, cartões centralizados, filtros agrupados, tabelas com maior contraste e controles recolhíveis padronizados. Calendário mantém rolagem interna. Conferência no navegador em desktop e largura móvel, 396 testes e build aprovados; alterações visuais de tabelas limitadas à tela para preservar o PDF.

- [x] PDF fornecido: 10 páginas, 40 profissionais, três equipes e 24 associações; nomes/ocupações/cargas conferidos por extração independente, sem divergências nesses campos.
- [x] Ensaio SQL com rollback: importar, programar, atualizar e confirmar ausência preserva a folga e o vínculo; consulta por intervalo encontra o registro e ausência impede novo lançamento.
- [x] 396 testes Node e Deno check das funções aprovados nesta etapa; banco e APIs publicados tecnicamente.
- [x] Leitor PDF ensaiado no navegador; calendário por período, ocultação/reordenação de colunas e CSV baixado conferidos. HTML real de impressão ensaiado em três páginas A4 horizontais, com nomes/cargas/datas dentro dos limites.
- [x] Publicação web conferida com sessão administrativa: três guias, 42 unidades ordenadas, calendário sem seleção inicial e formulário de edição de feriados. CI integrado de `5ecb4e2` aprovado.
- [ ] Conferir impressão nativa/equipamentos institucionais e seleção/arraste do arquivo no ambiente real; automação desses recursos foi limitada pela extensão.
- [ ] Conferência cadastral e aceite real pelos responsáveis das unidades. Nenhuma importação real foi aprovada automaticamente a partir do PDF enviado.

## Blocos atuais — férias regulamentares e férias-prêmio

- [x] **Bloco 1 — Base técnica cadastral e acesso:** importação CNES preserva vínculo, férias, snapshots e versões; ensaio integrado atual cobre atualização, ausência, reativação, competência, operador obrigatório e isolamento entre unidades. Login neutro, identificação no início da sessão e sem troca no calendário.
- [x] **Bloco 2 — Lançamento e conferência normativa:** matriz oficial em [Normas de férias](NORMAS_FERIAS_BETIM.md); duração por aquisição/regime, reduções, parcelas, impedimentos, protocolo, concordância, referência documental, histórico conhecido de consumo e prévia confirmada. Regras no servidor para criação e revisão. Vínculos especiais não recebem direito presumido.
- [x] **Banco de horas retirado do escopo:** sem novas folgas, complementação de férias, trabalho adicional ou exceção por horas insuficientes; retirada também da simulação pública. Registros antigos permanecem consultáveis/canceláveis e não podem gerar nova programação dessa modalidade.
- [ ] **Aceite dos blocos 1 e 2:** RH/SARH deve conferir o enquadramento e os assentamentos reais, as referências documentais e a regra especial quando aplicável. CNES não prova direito adquirido nem saldo. Nenhum funcionário real recebeu férias automaticamente.
- [x] **Bloco técnico — Manutenção e comprovante:** edição/cancelamento com versão, motivo e preservação do histórico; conflito recarrega o estado atual sem repetir a ação. Comprovante inclui regime, aquisição, base normativa, referência, protocolo e versão da conferência, sem divulgar contagens de licenças. Antes de imprimir/copiar o documento atual, consultar novamente o registro; mudanças exigem revisão e falha de conexão impede exportação desatualizada. Versões antigas permanecem identificadas como substituídas.
- [ ] **Aceite do comprovante nos equipamentos institucionais:** conferir impressão nativa, assinaturas e circulação do documento pela unidade. As fixtures técnicas não substituem esse aceite.
- [ ] **Próximo bloco — Piloto completo:** teste institucional com importação aprovada, identificação inicial, conferência, lançamento, alteração, cancelamento e reimportação; aceite dos responsáveis antes de ampliar o uso.

### Evidências desta entrega

- 397 testes Node e Deno check de manage-rh e manage-operations aprovados. Rota antiga de créditos de horas encerrada com 410. CI integrado do núcleo (508184e) aprovado, incluindo banco vazio, ensaios e restauração sintética.
- SQL normativo executado no PostgreSQL isolado e no Supabase com rollback: corte em 02/12/2025, 30/20 e 25/16, ponto facultativo, feriado, aniversário sem acréscimo, impedimentos, fracionamento CLT e prêmio.
- Ensaio integrado no Supabase com rollback: importação sintética, programação, reenvio idempotente, operador e escopo, revisão, atualização/ausência/reativação sem perda de histórico; prêmio com prevenção de reutilização, cancelamento e nova prévia.
- SQL e função manage-rh atualizados. Ensaios históricos de contratos encerrados são explicitamente separados dos cenários normativos atuais no CI.
- Consulta de segurança: não surgiram novos objetos expostos nem concessões amplas. Os avisos anteriores de RLS sem política em tabelas bloqueadas e proteção de senhas vazadas permanecem como pendências de infraestrutura, sem mudança nesta entrega.

### Manutenção e comprovante — 19/10/2026

- 404 testes Node aprovados; ensaio SQL com rollback confirma revisão, preservação do snapshot, recusa de cancelamento com versão antiga, recusa de conclusão antes do término e cancelamento sem apagar a conferência normativa.
- A4 conferido por renderização e extração: exemplo normativo em uma página e histórico extenso em duas, sem perda de texto nem elementos fora dos limites. Contagens de licenças e dados internos da avaliação não aparecem no comprovante.
- Alterações deste bloco são de interface/documento e testes; não houve alteração de esquema nem concessão real.

## Limites e continuidade

O leitor reconhece ficha completa textual no layout CNES ensaiado; PDFs digitalizados ou de outro layout são recusados, sem incorporação parcial silenciosa. PDF sem competência explícita exige mês informado pelo Administrador. Data de emissão não prova competência nem atualização da fonte.

Dados necessários às regras de um afastamento que não existam no CNES continuam sendo conferidos no lançamento (admissão/exercício, aquisição, faltas, licenças e enquadramento jurídico), sem exigir cadastro manual do funcionário. Não inventar esses dados nem direitos.

A revisão não é homologação normativa/institucional. Relatórios analíticos e estatísticas continuam futuros; XLSX/PDF do calendário pertencem ao escopo urgente. Manual/treinamento continuam depois da funcionalidade real.

### Calendário, conflitos e exportações — 19/10/2026

- 433 testes Node aprovados, incluindo leitura de XLSX real e geração de PDF real. Build estático aprovado. Ensaio SQL com rollback cobre filtros exatos, catálogos completos, conflitos além da primeira página, cruzamento de critérios, múltiplas equipes, cancelamentos e identidade com vários vínculos; nenhum afastamento fictício persiste.
- PDF renderizado com 42 funcionários fictícios, cargos extensos, visão nominal e 31 dias: 20 páginas A4 paisagem, com conteúdo e cores conferidos. XLSX reaberto, inspecionado e renderizado nas duas abas; datas, carga numérica, zeros iniciais do CBO, filtros e congelamento confirmados por leitura do arquivo.
- Migração calendar_conflicts_and_facets e manage-rh v13 publicados. API autenticada conferida: catálogos da unidade, seleção exata por nome e pesquisa combinada de conflitos.
- Próximo passo: ensaio acompanhado pelo RH do fluxo de lançamento, revisão, cancelamento e compartilhamento dos arquivos; registrar ajustes do uso real antes de retomar novas modalidades. Regra de day-off e governança continuam pendentes, sem concessão presumida.

## Governança e termo de ciência — pendente

- [ ] Elaborar formulário para assinatura dos operadores do sistema: ciência sobre tratamento de dados, confidencialidade, acesso autorizado e deveres funcionais. Definir quem assina, quando, versão do texto, guarda e revogação de acesso.
- [ ] Descrever a conferência das normativas, do direito e do saldo pelo RH, com anuências e documentos de concessão mantidos no processo administrativo externo; definir procedimento para divergências e atualização normativa.
- [ ] Definir responsáveis pelo controle de dados dentro e fora do SGF, finalidade e base legal do tratamento, minimização, compartilhamento, retenção, atendimento aos titulares e incidentes, com encarregado de dados e assessoria jurídica. Evitar consentimento genérico como base automática para tratamento público.
- [ ] Submeter o termo à assessoria jurídica e ao encarregado. A assinatura distribui deveres e documenta ciência; não presumir exclusão das responsabilidades legais da Prefeitura/DAPS ou dos agentes de tratamento. Não substituir concessão de férias por termo de uso.

Próxima simplificação a avaliar: manter o regime jurídico já conferido por vínculo (separado do CNES) e mostrar perguntas de faltas/licenças apenas conforme a modalidade; não inferir regime de CBO ou descrição CNES.

### Ajuste final do MVP — 19/10/2026

- [x] Retirar o filtro Modalidade do calendário e consultar todas as modalidades, inclusive ao restaurar uma visualização anterior.
- Próximo passo: pequenos ajustes visuais indicados pelo usuário e acompanhamento do uso do MVP pelo RH.

- [x] Usar Cargo com nomes das profissões em lugar da seleção numérica de CBO no calendário; limpar filtros de CBO ao restaurar consultas anteriores.

### Início das férias e cenário da UBS Amazonas — 19/10/2026

- [x] Marcar o primeiro dia efetivo do período como I, em lugar de F/P naquele dia; dias seguintes mantêm F/P. Mesmo comportamento nas visões longitudinal/nominal, PDF e XLSX, sem acrescentar dias nem alterar concessões.
- [x] Cenário visual da UBS Amazonas utilizado para testar até 32 funcionários e 33 períodos simulados, sem gravar concessões. Retirado integralmente após os testes, por solicitação do responsável para iniciar uso real.
- [x] Identificação de SIMULAÇÃO na tela e nos títulos do PDF/XLSX; exportações preservam filtros, paginação e todos os períodos simulados. Funcionários, cargos, equipes e aniversários continuam vindo do cadastro autorizado.
- [x] 439 testes Node aprovados e build estático aprovado; início I, preservação de datas, cenário determinístico, filtros, paginação, isolamento por unidade, ocultação e falha de autorização verificados.
- Etapa encerrada: cenário retirado para uso real; arquivos e controles de simulação não integram a publicação atual.

### Preparação para uso real — 19/10/2026

- [x] Retirar módulo, inclusão no HTML, controles, aviso e estilos do cenário de teste. Manter o marcador I e as exportações do calendário real.
- [x] Limpeza única autorizada pelo responsável: removidos 1 lançamento RH, 3 solicitações antigas (2 férias e 1 folga), seus períodos/dependências e 2 movimentos com 1 conta do banco de horas antigo. Sem migração destrutiva que possa ser repetida automaticamente.
- [x] Ensaiar a limpeza com rollback e depois executar em transação; abortar caso as contagens previamente conferidas mudem. Comparar integralmente 22 conjuntos cadastrais antes/depois e preservar auditoria da operação.
- [x] Conferência após gravação: zero lançamentos RH, solicitações antigas, períodos, revisões e movimentos de banco de horas; preservados 46 perfis, 43 funcionários/vínculos, 40 entradas CNES, 42 contas RH, 4 autorizações de operadores e 11 feriados. Dados cadastrais não alterados.
- [x] 434 testes Node e build aprovados após retirar os testes exclusivos do cenário; regra do primeiro dia I continua verificada.
- Próximo passo: iniciar o uso real com os cadastros existentes e acompanhar os primeiros lançamentos do RH.
