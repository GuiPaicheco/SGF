# Pendências do SGF — gestão pelo RH e DAPS

Atualização: **17/10/2026**. Única fila ativa. Substitui o planejamento baseado em solicitações dos servidores. As alterações funcionais abaixo estão **planejadas**, não implementadas. Nesta entrega foram alterados documentos e pesquisadas fontes; não foram criadas contas, alteradas senhas, importados profissionais ou publicadas mudanças.

Plano anterior arquivado em [HISTORICO_PENDENCIAS_20261014.md](HISTORICO_PENDENCIAS_20261014.md), somente para consulta. Seus checkboxes não formam outra fila ativa. A [análise técnica anterior](ANALISE_REFATORACAO_20261017.md) deve ser interpretada conforme este novo escopo.

## 00. Diretrizes definidas pelo responsável

- Ferramenta voltada ao RH das unidades e à Administração/Diretoria da DAPS. Funcionários são cadastros geridos pelo RH e não precisam de conta para ter afastamentos registrados.
- Substituir o fluxo central de solicitações pelo servidor por registro e controle realizados pelo RH.
- **41 contas RH de UBS + 1 conta RH DAPS = 42 contas RH**, além do Administrador. RH DAPS é um acesso distinto da Administração global.
- Logins conforme tabela abaixo. Senha comum definida pelo responsável na conversa de 17/10, a fornecer no provisionamento seguro, fora do frontend, migrations, logs e documentos versionados. Não impor troca obrigatória nem mudar a senha definida sem consolidar essa decisão.
- Administrador utilizado pelo operador do sistema e pela Diretora, com visão geral das unidades. Relatórios e estatísticas ficam para etapa futura.
- Fonte de profissionais baseada no CNES para **todas as 41 UBS e Secretaria**. UBS Amazonas — 6305245 fará o primeiro teste real; cadastro manual nela é alternativa se a integração não estiver disponível, não limitação do escopo nem bloqueio para carregar as outras unidades.
- Lançamento validado pelo RH entra **diretamente no calendário**, sem fila de solicitação ou aprovações intermediárias.
- Funcionários eMulti ficam sob controle do RH da **unidade polo registrada no CNES**. Articulação com outros RH ocorre entre as unidades; não criar aprovação compartilhada ou distribuição diária para isso.
- RH DAPS abrange inicialmente **todos os funcionários da Secretaria Municipal de Saúde — CNES 2126486**. Separação por diretoria fica para depois; esse RH não recebe visão global das UBS.
- Administrador autoriza funcionários de cada CNES a operar o RH. Após login institucional, a pessoa seleciona seu nome entre os autorizados. Validar a seleção no servidor e registrá-la nas ações; é identificação declarada, não autenticação individual.
- Comprovante: retirar distribuição de datas/unidades responsáveis; adicionar **CBO, Carga Horária e Equipe**. Preservar datas de afastamento e retorno.
- Calendário com colunas independentes: **Nome do funcionário | Cargo | CBO | Equipe**, além da grade de datas.
- Preservar cadastros, múltiplos vínculos, saldos, protocolos, autoria e histórico durante a transição.

## 01. Decisões operacionais e detalhamento restante

Fluxo definido: **login RH → seleção do operador autorizado → funcionários sob responsabilidade do CNES/polo → lançamento → calendário imediato → comprovante**. Administrador acompanha todas as unidades. Decisões marcadas abaixo estão concluídas como requisitos; a implementação continua nos grupos seguintes.

- [x] **FL01 — Entrada no calendário:** decisão do responsável em 17/10: gravação válida do RH já programa no calendário. Sem confirmação posterior, fila de solicitações ou duas aprovações antigas; permanece validação técnica de datas, escopo e saldo quando aplicável.
- [ ] **FL02 — Modalidades:** confirmar permanência de férias regulamentares, férias-prêmio, banco de horas/folgas e day-off; decidir destino da simulação rápida. Até a decisão, preservar funcionalidades sem excluir modalidades por suposição.
- [ ] **FL03 — Ciclo do registro:** definir rascunho, programação, alteração, cancelamento, conclusão e correção de erro, justificativas e momento de consumo/devolução de saldo.
- [x] **FL04 — Múltiplas unidades:** decisão do responsável em 17/10: controle de funcionário eMulti pelo RH da unidade polo no CNES, com articulação humana entre RH. Implementar responsabilidade do polo sem duplicar registro/débito. Casos sem polo identificável exigem conferência cadastral, sem inferência automática.
- [ ] **FL05 — Cadastro e direitos:** definir quais dados o RH pode complementar/corrigir e quais ações exigem Administrador, inclusive matrícula, jornada, equipe, CBO, cargo, direitos e saldos.
- [x] **FL06 — RH DAPS:** decisão do responsável em 17/10: incluir inicialmente todo o quadro da Secretaria Municipal de Saúde, CNES 2126486. Separar diretorias futuramente, preservando vínculos/histórico.
- [ ] **FL07 — Comprovante:** confirmar título, orientação sobre autorização externa, assinaturas e responsável pela emissão. Retirar distribuição diária por unidade mantendo período e retorno.
- [x] **FL08 — Operador:** decisão do responsável em 17/10: Administrador define funcionários autorizados por CNES; após login RH, selecionar um deles antes de operar. Registrar conta institucional e operador selecionado separadamente. Recuperação e revogação serão implementadas em AC06/AC08; seleção de nome não equivale a prova de identidade individual.

Aceite: percurso e matriz de permissões documentados com decisões explícitas para lançamento, edição, cancelamento, cadastro e funcionário multiunidade.

## 02. Contas e unidades — prioridade alta

CNES obtidos do catálogo existente, sujeitos à conferência da fonte. Logins preservam exatamente os nomes solicitados, mesmo quando o nome oficial é mais longo. UPA, hospital e demais órgãos antigos não entram automaticamente no provisionamento.

| Nº | Login RH | CNES de referência |
|---|---|---|
| 01 | UBS ALCIDES BRAZ | 2126028 |
| 02 | UBS ALTEROSAS | 2126060 |
| 03 | UBS ALVORADA | 2126427 |
| 04 | UBS AMAZONAS | 6305245 |
| 05 | UBS ANGOLA | 2125919 |
| 06 | UBS BANDEIRINHAS | 3419371 |
| 07 | UBS BUENO FRANCO | 2125935 |
| 08 | UBS CACHOEIRA | 2125994 |
| 09 | UBS CAIC CAPELINHA | 5320348 |
| 10 | UBS CAMPOS ELISEOS | 6213618 |
| 11 | UBS CELSO ALVES PEDROSA | 0856762 |
| 12 | UBS CIDADE VERDE | 2125951 |
| 13 | UBS CITROLANDIA | 2125978 |
| 14 | UBS COLONIA | 5128218 |
| 15 | UBS CRUZEIRO DO SUL | 3419363 |
| 16 | UBS DOM BOSCO | 2126087 |
| 17 | UBS DUQUE DE CAXIAS | 7924097 |
| 18 | UBS GUANABARA | 5139074 |
| 19 | UBS HOMERO GIL | 2125927 |
| 20 | UBS ICAIVERA | 2126192 |
| 21 | UBS IMBIRUCU | 2126141 |
| 22 | UBS LARANJEIRAS | 2126176 |
| 23 | UBS MARIMBA | 2125900 |
| 24 | UBS NITEROI | 4659031 |
| 25 | UBS NOSSA SENHORA DE FATIMA | 6935699 |
| 26 | UBS NOVA BADEN | 5896002 |
| 27 | UBS PARQUE DO CEDRO | 3910865 |
| 28 | UBS PAULO CAMILO | 6409296 |
| 29 | UBS PETROPOLIS | 2125986 |
| 30 | UBS PETROVALE | 2126095 |
| 31 | UBS PTB | 2126109 |
| 32 | UBS SAO JOAO | 4702301 |
| 33 | UBS SAO LUIZ | 4796020 |
| 34 | UBS SITIO POCOES | 2894912 |
| 35 | UBS TERESOPOLIS | 9860673 |
| 36 | UBS TRINCHEIRA | 5307767 |
| 37 | UBS UNIVERSAL | 5505844 |
| 38 | UBS VIANOPOLIS | 2126435 |
| 39 | UBS VILA BEMGE | 2126117 |
| 40 | UBS VILA CRISTINA | 2126168 |
| 41 | UBS VILA RECREIO | 9814809 |
| 42 | DAPS | 2126486 — toda a Secretaria nesta etapa |

- [ ] **AC01:** adaptar login de unidade com espaços, normalização e unicidade; não exigir CPF pessoal nem criar CPF fictício para conta institucional.
- [ ] **AC02:** separar conta da unidade e cadastro de funcionário; manter Administrador global, definir seu login e preservar recuperação durante a transição.
- [ ] **AC03:** provisionar 42 contas de forma idempotente, verificando conflitos com usuários existentes; não duplicar usuários nem redefinir senhas existentes silenciosamente. Aplicar senha definida aos novos acessos conforme plano de transição.
- [ ] **AC04:** manter autenticação segura pelo Supabase Auth; senha comum não pode virar bypass. Registrar limitação da autoria compartilhada e possibilidade de acesso a outra unidade por quem conhece seu login e a senha comum.
- [ ] **AC05:** aplicar isolamento por unidade/lotação no banco e nas funções, inclusive leitura direta, busca, calendário e comprovante. DAPS RH não é global; Administrador é global.
- [ ] **AC06:** adaptar recuperação, bloqueio, sessões, limitação de tentativas e política de senha ao modelo definido. Não alterar conta TESTE ou senhas antigas para ensaios.
- [ ] **AC07:** após migração validada, retirar da interface cadastro/autosserviço que não pertence mais ao fluxo e decidir destino de acessos Servidor existentes sem apagar histórico.
- [ ] **AC08:** tela exclusiva do Administrador para autorizar/revogar operadores entre funcionários do CNES; seleção obrigatória após login RH, sem lista livre ou operador de outra unidade. Definir cadastro inicial pelo Administrador quando a carga CNES ainda não existir.
- [ ] **AC09:** vincular operador escolhido à sessão/contexto no servidor, conferir autorização vigente em cada gravação e invalidar seleção revogada. Registrar conta Auth, operador, CNES e instante nos eventos; não confiar em ID enviado sem validação nem criar novas contas Auth para cada operador nesta etapa.

Aceite: 42 logins RH mapeados aos escopos previstos, Administrador global e acesso cruzado negado por alteração de parâmetros. Isolamento técnico de sessão não corrige o risco de uma senha conhecida entre contas.

## 03. CNES de todas as unidades e primeiro uso Amazonas — prioridade alta

Pesquisa: [VIABILIDADE_CNES_SUPABASE_20261017.md](VIABILIDADE_CNES_SUPABASE_20261017.md). **Concluído no planejamento:** consultas oficiais de profissionais, equipes e composição de uma equipe da Amazonas responderam HTTP 200, além do WSDL SOAP. Equipes podem ser obtidas em outra consulta do próprio CNES; não foi demonstrada necessidade de fonte externa para esse campo. Cargo municipal e cobertura integral da API ainda exigem verificação. Nenhum dado importado.

- [ ] **CN01:** ensaiar consulta SOAP de profissionais/vínculos para CNES 6305245, com paginação, estabilidade, codificação e condições de consumo. WSDL acessível não é prova de resposta funcional da operação.
- [ ] **CN02:** integrar consultas CNES de estabelecimento/profissionais, equipes e seus integrantes; relacionar profissional, CBO, equipe e datas de entrada/desligamento sem conciliar apenas por nome. Conferir nome, jornada total/componentes, vínculo e situação. Nome de equipe basta na interface; aproveitar identificador externo disponível sem tornar INE obrigatório ao usuário.
- [ ] **CN03:** distinguir competência, atualização da fonte e instante da consulta/importação. Mostrar última base disponível quando não houver atualização diária comprovada.
- [ ] **CN04:** conferir amostra com RH Amazonas para cada vínculo/CBO/equipe, inclusive ausência de equipe e múltiplas atuações. Cargo municipal e matrícula exigem complementação municipal se ausentes.
- [ ] **CN05:** se a API não cobrir tudo, ensaiar download por competência ou exportação autorizada do SCNES municipal. CSV/planilha pode ser entrada após layout validado, mantendo CNES como chave da unidade.
- [ ] **CN06:** escolher fonte principal e alternativa por cobertura, atualidade e manutenção; evitar dependência exclusiva de extração HTML.
- [ ] **CN07:** importar para área de conferência com inclusões, alterações, ausências, origem e competência; RH revisa antes de incorporar. Repetir carga sem duplicar pessoas/vínculos.
- [ ] **CN08:** proteger correções locais e histórico. Ausência na fonte não implica exclusão; conciliar com chaves autorizadas, nunca só por nome ou criando uma pessoa para cada CBO.
- [ ] **CN09:** definir periodicidade, execução manual/automática, retentativas e avisos de falha. Operar com última carga aprovada e processar integração no backend.
- [ ] **CN10:** preparar carga das 41 UBS e de toda a Secretaria, com execução por unidade e isolamento de falhas. Amazonas é primeiro teste real, não requisito de aprovação para pesquisar/carregar todas. Se necessário, permitir cadastro manual Amazonas para iniciar o teste e conciliá-lo depois sem duplicação.

Aceite: cadastro Amazonas conferido pelo RH, competência/origem visíveis, campos ausentes explícitos e nova carga sem duplicação ou perda de ajustes municipais.

## 04. Dados e migração — prioridade alta

- [ ] **DB01:** reaproveitar pessoas, vínculos, atuações, equipes, direitos, saldos e eventos atuais; planejar mudanças incrementais sem recriar banco.
- [ ] **DB02:** modelar CBO e vigência no vínculo/atuação correto, separado do cargo municipal; não reduzir ocupações simultâneas a um campo único da pessoa.
- [ ] **DB03:** separar carga semanal total, carga na unidade e jornada diária usada em cálculos; tratar horas fracionadas se necessário. Não dividir jornada semanal por cinco automaticamente; equipes podem variar por atuação/período.
- [ ] **DB04:** suportar funcionário sem conta e cadastro pendente de matrícula com identificador interno, sem matrícula fictícia; definir validações necessárias antes de consumir saldo/direito.
- [ ] **DB05:** criar contrato de lançamento pelo RH distinguindo autor autenticado e beneficiário. Endpoint atual exige titular Servidor; não basta remover verificação de papel.
- [ ] **DB06:** manter pedidos antigos identificados como legado e decidir destino de pendentes/aprovados/programados; não converter estados nem repetir débito automaticamente.
- [ ] **DB07:** preservar snapshots funcionais em registros/comprovantes; alteração cadastral não reescreve documentos históricos.
- [ ] **DB08:** revisar RLS, funções, constraints, versões e idempotência para lançamentos, alterações, cancelamentos e saldo.
- [ ] **DB09:** ensaiar migration em base isolada, reconciliar contagens/saldos e definir retorno compatível com dados novos; não apagar tabelas antigas antes de remover dependências.
- [ ] **DB10:** definir CNES responsável/polo por vínculo a partir do cadastro validado; não atribuir o polo por ordem da importação. Aplicar regra do polo na autorização de lançamento/alteração e manter o registro único.
- [ ] **DB11:** modelar autorizações de operadores por CNES e seleção por sessão/contexto; separar autor técnico autenticado de operador declarado, preservando nome histórico após revogação ou alteração cadastral.

Aceite: migração reproduzível, sem perda histórica, saldo por matrícula e ausência de duplicação em gravações concorrentes.

## 05. Trabalho do RH e Administrador — prioridade alta

- [ ] **UI01:** entrada com duas áreas operacionais: RH da unidade e Administrador; RH seleciona operador autorizado após login, sem autenticação própria do funcionário beneficiário. Sem operadores autorizados, orientar contato com Administrador e impedir operação.
- [ ] **UI02:** tela principal do RH com funcionários da unidade, busca, matrícula, cargo, CBO, carga, equipe e pendências cadastrais.
- [ ] **UI03:** lançamento por seleção de funcionário/vínculo sob responsabilidade da unidade/polo, modalidade, direito/saldo, datas e conferência; gravar e refletir diretamente no calendário, sem etapa de aprovação. Dados vêm do cadastro e correção respeita permissões.
- [ ] **UI04:** revisar linguagem de solicitações, meus pedidos, acessos, aprovações, notificações e orientações conforme fluxo consolidado.
- [ ] **UI05:** editar/reprogramar, cancelar e concluir conforme FL03, com motivo, histórico e proteção contra envio duplicado.
- [ ] **UI06:** Administrador consulta todas as unidades com filtro/contexto explícito; relatórios e estatísticas futuras não aparecem como disponíveis.
- [ ] **UI07:** preservar rascunhos e proteger respostas tardias em troca de tela/unidade; padronizar foco, carregamento, confirmação e erros persistentes.

Aceite: RH Amazonas completa ciclo para funcionário sem login; Administrador encontra o registro e histórico identifica conta autora de cada ação.

## 06. Comprovante — prioridade alta

- [ ] **CP01:** retirar seção de distribuição de datas/unidades responsáveis da tela, impressão e texto copiado/compartilhado.
- [ ] **CP02:** acrescentar CBO, Carga Horária e Equipe, com unidade de medida da carga e snapshot do vínculo/atuação.
- [ ] **CP03:** preservar nome, matrícula disponível, cargo, unidade, modalidade, período(s), retorno, protocolo, emissão, observações e assinaturas conforme FL07.
- [ ] **CP04:** indicar informação ausente sem inventar valor; definir se ausência bloqueia emissão final ou exige conferência.
- [ ] **CP05:** adaptar título/orientação à nova operação, distinguindo registro e autorização institucional quando aplicável.
- [ ] **CP06:** garantir leitura/reimpressão de legado e validar A4/PDF, nomes/equipes longos e quantidade de páginas sem prejudicar legibilidade.

Aceite: novos comprovantes contêm três campos adicionais, preservam datas de afastamento/retorno e não mostram distribuição por unidade em nenhuma saída.

## 07. Calendário e escala — prioridade alta

- [ ] **CA01:** colunas independentes de Nome do funcionário, Cargo, CBO e Equipe antes da grade; identificar matrícula quando necessário.
- [ ] **CA02:** RH limitado à unidade; Administrador com seleção de unidade e visão geral, identificando unidade de cada linha.
- [ ] **CA03:** calendário projetado pelos lançamentos novos e legado sem duplicação; marcadores conforme estados definidos em FL01/FL03.
- [ ] **CA04:** filtros por funcionário, cargo, CBO, equipe, período e situação, com consulta por período e paginação no servidor.
- [ ] **CA05:** adaptar conflitos, escala mínima, feriados e day-off às modalidades mantidas; separar alerta operacional de impedimento normativo.
- [ ] **CA06:** tratar várias equipes/atuações e afastamento multiunidade segundo FL04, sem esconder vínculos ou contar pessoas indevidamente.
- [ ] **CA07:** validar muitas linhas, cabeçalhos/colunas fixos quando úteis, teclado e leitura em computador/tablet/telas menores.

Aceite: colunas legíveis, filtros correspondentes aos registros e alteração/cancelamento refletidos sem resíduos no calendário.

## 08. Estrutura técnica, capacidade e operação — antes da expansão

Medição de 17/10: Supabase saudável, plano Free, banco de aproximadamente **17 MB**. Plataforma adequada ao escopo; permanência no gratuito depende de volume e requisitos. Fontes/limites em [VIABILIDADE_CNES_SUPABASE_20261017.md](VIABILIDADE_CNES_SUPABASE_20261017.md).

- [ ] **TE01:** extrair gradualmente de app.js API/contexto, navegação/estado, cadastros, lançamentos, comprovante e calendário, preservando contratos; evitar reescrita integral sem necessidade.
- [ ] **TE02:** substituir carga completa de pedidos/relações por listas paginadas, totais no servidor e detalhe sob demanda; revisar índices por unidade/vínculo/período.
- [ ] **TE03:** padronizar contexto/autenticação/erros e respostas assíncronas; corrigir estilos inline incompatíveis com CSP.
- [ ] **TE04:** build reproduzível, saída limpa e versões automáticas de assets; não publicar SQL, dados de importação ou credenciais.
- [ ] **TE05:** dimensionar profissionais, vínculos, registros anuais, dias, auditoria, anexos e simultaneidade; ensaiar volume sintético de vários anos.
- [ ] **TE06:** acompanhar quotas, crescimento, latência, falhas e concorrência; definir critérios de upgrade sem contratar ou mudar plano automaticamente.
- [ ] **TE07:** definir teste sem e-mails reais e separação piloto/produção; testar backup/restauração completos, incluindo itens externos ao PostgreSQL.
- [ ] **TE08:** revisar domínio, CORS, retorno de login, recuperação, privacidade, retenção e acesso administrativo; explicitar limitação de autoria compartilhada.
- [ ] **TE09:** limitar no servidor quantidade de itens por página, intervalo consultado, tamanho dos pedidos e frequência de gravações/importações; estabelecer limites por tipo de operação após medição, com mensagens claras e sem bloquear uso normal de unidades no mesmo IP.
- [ ] **TE10:** impedir gravação duplicada por clique/reenvio com chave de idempotência e transações; validar permissões, operador, datas e versão no servidor. Proteger também endpoints diretamente, independentemente da interface.
- [ ] **TE11:** buscar enquanto digita com atraso controlado, cancelar/ignorar respostas antigas, reutilizar dados do mesmo contexto e carregar calendário por intervalo. Não fazer consulta CNES externa a cada login, renderização ou célula.
- [ ] **TE12:** executar importação em lotes limitados, sem paralelismo irrestrito nas 42 unidades, com progresso, retomada e retentativas limitadas; registrar só o necessário e não duplicar snapshots sem mudança. Aplicar prazo de execução e monitorar consultas lentas.

## 09. Testes, homologação e implantação — fechamento

Base anterior: 309 testes locais aprovados e build concluído em 17/10; não validam funcionalidades novas ainda não implementadas.

- [ ] **QA01:** testar funcionário sem conta, mesma pessoa com duas matrículas/unidades/equipes, CBO/jornada distintos e saldo isolado.
- [ ] **QA02:** validar 42 logins/escopos e Administrador; negar acesso cruzado em API/RLS, busca, detalhe, calendário e comprovante.
- [ ] **QA03:** testar repetição de carga, falha da fonte, divergência/ausência cadastral, equipe/CBO ausentes, mudança de jornada/equipe e preservação de ajustes locais.
- [ ] **QA04:** testar concorrência, repetição, rede lenta, navegação durante gravação, reprogramação, cancelamento e consumo/devolução única de saldo.
- [ ] **QA05:** ensaiar migração, leitura de legado e preservação de autoria, saldos e comprovantes sem duplicação no calendário.
- [ ] **QA06:** primeiro teste real pela Diretora da UBS Amazonas, com cadastro manual se necessário; validar também Administração global e segunda UBS. Preparação/importação das demais unidades pode avançar antes desse aceite, sem declarar homologação concluída.
- [ ] **QA07:** validar teclado, foco, zoom 200%, leitor de tela, tablet, equipamentos institucionais e impressão.
- [ ] **QA08:** atualizar README, arquitetura, manual e treinamento para operação pelo RH, contas de unidade e importação; identificar documentos antigos como históricos.
- [ ] **QA09:** homologar normas de direito, jornada, fracionamento, aquisição/admissão, feriados e banco de horas pelo RH Central, com referências/responsáveis/vigência.
- [ ] **QA10:** registrar aceite funcional/cadastral da Diretoria/RH, plano de implantação/retorno e publicação candidata; diferenciar publicação técnica de aceite institucional.
- [ ] **QA11:** testar operador não autorizado, de outro CNES, revogado durante sessão, troca de operador e tentativa de forjar ID; conferir histórico de conta/operador e ausência de dados de outras unidades.
- [ ] **QA12:** ensaiar limites com buscas rápidas, intervalos exagerados, payload grande, cliques repetidos, importações simultâneas e falha/repetição de rede; demonstrar resposta controlada sem duplicação e sem sobrecarga. Testes de volume somente em ambiente isolado.

## 10. Evolução futura — fora da implementação atual

- [ ] **FU01 — Relatórios:** emissão por unidade, funcionário, período e situação; definir formatos e permissões posteriormente.
- [ ] **FU02 — Estatísticas:** indicadores e comparações entre unidades para a Diretora; definir métricas antes dos painéis.
- [ ] **FU03 — Autoria individual:** avaliar usuários pessoais vinculados ao RH institucional se for necessário identificar nominalmente cada operador.
- [ ] **FU04 — Separar Secretaria:** refinar futuramente o escopo do RH DAPS por diretoria, mantendo inicialmente toda a Secretaria e sem perder histórico.

Relatórios/estatísticas são pendências futuras registradas a pedido do responsável. Visão global operacional do Administrador pertence à refatoração atual e não depende deles.

## Ordem e acompanhamento

1. Implementar contratos a partir das decisões FL01/FL04/FL06/FL08; detalhar modalidades/operações restantes sem reabrir decisões tomadas. Ensaiar profissionais/equipes CNES.
2. Validar dados, contas/escopos e migração; implementar importação com conferência.
3. Entregar ciclo RH Amazonas → lançamento → calendário → comprovante → visão global.
4. Preparar todas as UBS e Secretaria; realizar primeiro teste real Amazonas, com alternativa manual. Validar legado, concorrência, operadores e isolamento antes da liberação geral.
5. Concluir documentação, uso, capacidade, recuperação e homologação; grupo 10 permanece futuro.

Concluir itens somente com evidência apropriada: código, teste local, SQL/API, interface ou aceite do responsável. Pesquisa de fonte não equivale a importação; teste estático não equivale a revisão visual; publicação técnica não equivale a aceite institucional. Preservar conta TESTE, senhas e histórico existentes até plano explícito de transição.
