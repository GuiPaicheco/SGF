# Pendências do SGF — revisão de 19/10/2026

Esta é a única fila ativa. A orientação mais recente substitui a inclusão manual e a exigência de matrícula dos blocos anteriores. O [planejamento anterior](HISTORICO_PENDENCIAS_20261018_ANTES_PDF.md) fica como histórico; sua ordem não deve ser retomada automaticamente. Os blocos abaixo incorporam a pesquisa normativa de férias e a retirada de banco de horas.

## Requisitos prioritários e implementação

- [x] Aba RH renomeada para Férias e Cadastros: nome, profissão, Lançar Férias, Lançar Folga desativado e Visualizar cadastro. RH informa aniversário apenas como dia/mês; alteração auditada e versionada, restrita à própria unidade, sem sobrescrever CNES ou recalcular histórico.
- [x] Lançar no calendário valida e grava numa única ação, com chave contra duplicação; redireciona para funcionário e intervalo incluindo retorno. Falhas exibem mensagem; envio sem confirmação pode ser repetido com a mesma chave.
- [x] Campo Número do processo ou memorando; comunicação ao RH retirada. Data ausente permanece nula e prazo não é atestado automaticamente; conferência de antecedência fica no processo externo.
- [x] Calendário sem Programar/Ações. Unidade, competência do período consultado e cabeçalhos fixos. Visão longitudinal padrão por funcionário e nominal por período de afastamento. Retiradas as colunas de aniversário e retorno previsto; aniversário aparece somente na célula correspondente dentro do período e retorno permanece como marca R. Competência da importação continua no cadastro da unidade.
- [x] Filtros do calendário por checkbox de funcionários, cargos e equipes efetivamente existentes na unidade, em ordem alfabética e independentes da página atual. Seleções dentro de cada filtro são alternativas; filtros diferentes são cruzados. Retirados os filtros Situação e Modalidade da interface; o calendário consulta todas as modalidades existentes. Equipe vazia é normalizada para Não se aplica, sem modificar a evidência CNES nem snapshots históricos.
- [x] Conflitos entre duas ou mais pessoas afastadas no mesmo dia: critérios combináveis de mesmo cargo, CBO e equipe, exigindo coincidência em todos os critérios marcados. Alerta visual, sem bloquear lançamento, conforme decisão do usuário. Consulta de apenas funcionários com conflito; cálculo da unidade inteira antes de filtros de nomes/paginação, com equipes múltiplas, dias atribuídos do legado, cancelamentos excluídos e mesma pessoa com vários vínculos não contada duas vezes.
- [x] Exportação direta de PDF A4 paisagem, todas as colunas funcionais e todos os funcionários filtrados, em faixas de até sete dias, com identificação, competência, cabeçalhos, legenda e numeração repetidos. Quebras verticais preservam as linhas; textos longos são quebrados dentro das células.
- [x] Exportação XLSX substitui CSV na interface: calendário colorido, filtros, linhas/colunas congeladas, datas e cargas tipadas, CBO como texto e aba com detalhes dos afastamentos. Bibliotecas locais carregadas apenas ao exportar; dados não enviados a serviços de conversão.
- [ ] Definir e documentar regra municipal do day-off de aniversário antes de descontá-lo da duração das férias. Aniversário é exibido quando informado; não equivale a folga concedida.
- [ ] Implementar Lançar Folga em etapa futura; por enquanto o botão permanece inativo. As visões exibem os registros efetivamente existentes, inclusive os históricos, sem fabricar folgas de exemplo.

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
- [x] Cenário visual de teste da UBS Amazonas, ativo inicialmente e com opção de ocultar: até 32 funcionários CNES com vínculo confirmado e 33 períodos simulados, entre outubro/2026 e janeiro/2027. Inclui férias regulamentares, prêmio, intervalos sobrepostos e conflitos intencionais; mesmo cargo/equipe selecionados inicialmente. Sem inserir férias, alterar saldos ou gerar concessões no banco.
- [x] Identificação de SIMULAÇÃO na tela e nos títulos do PDF/XLSX; exportações preservam filtros, paginação e todos os períodos simulados. Funcionários, cargos, equipes e aniversários continuam vindo do cadastro autorizado.
- [x] 439 testes Node aprovados e build estático aprovado; início I, preservação de datas, cenário determinístico, filtros, paginação, isolamento por unidade, ocultação e falha de autorização verificados.
- Próximo passo: usuário conferir outubro/novembro de 2026 na UBS Amazonas, alternar nominal/longitudinal, pesquisar conflitos e testar PDF/XLSX. Ocultar o cenário para conferir somente os registros reais; retirar a simulação ao encerrar a homologação do MVP.
