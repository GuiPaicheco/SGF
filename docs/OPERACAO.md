# Operação e preparação do piloto

## Catálogo e recursos por matrícula — 08/10/2026

Em **Cadastros → CNES e equipes**, o Administrador pesquisa, cadastra e edita unidades e equipes. CNES possui sete dígitos e seu código não é substituído em um cadastro existente. Equipes são identificadas pelo nome, tipo/número e unidade, como **eMulti 004 Bueno Franco** ou **eMulti 018 Vila Cristina**; não é necessário INE. Ausência de INE não é pendência nem impede seleção. Metadados históricos permanecem armazenados, sem campos visíveis ou exigência de preenchimento. Desativação preserva histórico.

Em **Cadastros → Lotações**, selecione o CNES cadastrado. UBS utiliza a própria unidade; somente subdivisão de Secretaria usa **Lotação interna**, com Secretaria superior. Diretorias podem compartilhar CNES sem compartilhar o escopo interno. Responsáveis ativos RH/Diretor e cada mudança estrutural são registrados com justificativa e versão.

Em **Cadastros → Direitos e saldos por matrícula**, selecione o vínculo, não apenas o nome da pessoa. RH opera somente vínculos de seu contexto; Administrador opera globalmente. Edite dados funcionais da matrícula, polo dentre suas unidades, períodos aquisitivos e saldo validado com justificativa. Créditos/débitos manuais registram autor, data e versão. Saldos declarados pelo servidor não são saldos validados pelo RH.

O banco é único por vínculo mesmo com vários CNES. Aprovar não debita horas. A primeira inclusão no calendário debita uma vez as horas solicitadas; inclusões adicionais da mesma solicitação não duplicam o débito. Saldo insuficiente reverte a inclusão inteira. Rejeição/cancelamento após consumo gera estorno único, mantendo o extrato. Teste completo do ciclo de interface e concorrência real continua no bloco 03.

Direitos informados são referências conferidas pelo RH, não concessão automática nem consumo automático de dias. Um direito de outra matrícula não pode sustentar a solicitação. Saldo legado é associado automaticamente somente quando há exatamente um vínculo; situações ambíguas são sinalizadas para reconciliação, sem cópia para cada CNES. Histórico legado permanece preservado.

Os ensaios do bloco 02 estão em `tests/block-two-rehearsal.sql`, com BEGIN/ROLLBACK obrigatórios e 29 verificações. Resultado e limites: [VALIDACAO_BLOCO_02.md](VALIDACAO_BLOCO_02.md).

## Ensaio SQL de gestão por CNES

`node scripts/prepare-workflow-rehearsal.mjs` imprime um script completo com `BEGIN` e `ROLLBACK`. Executá-lo como uma única requisição SQL no ambiente autorizado; nunca remover o rollback ou executar apenas as fixtures. Não cria contas acessíveis por senha nem envia e-mails externos, mas exercita as notificações internas transacionais.

Em 07/10/2026, as 17 verificações passaram no Supabase compartilhado: aprovação distinta da entrada no calendário, agregação por unidade, isolamento de diretoria, versão desatualizada, recusa estruturada, auditoria e aviso ao titular. Consulta posterior confirmou zero usuários, pedidos e lotações das fixtures. Isso não substitui testes HTTP/navegador nem duas sessões concorrentes reais. Os 11 testes de RLS permanecem no arquivo separado `tests/access-rls-rehearsal.sql`.

## Piloto compartilhado — 07/10/2026

O banco atual já recebeu o novo modelo, por autorização expressa do responsável. Foram aplicadas as sete migrations novas como `multi_unit_pilot_release` e a correção `multi_unit_pilot_read_labels`; sete Edge Functions foram publicadas. Não executar novamente esses arquivos no mesmo banco. As migrations locais continuam sendo a fonte para reconstrução em banco vazio; os timestamps remotos são atribuídos pelo conector.

O site/GitHub devem usar o frontend atual, não a versão legada. Produção e homologação não estão isoladas. Preservados os usuários e dados existentes. Snapshot parcial pré-migração em `.sgf-backups/20261007-pre-upgrade/`, ignorada pelo Git; não substitui backup integral ou restauração testada. Não compartilhar seus arquivos: contêm dados pessoais e hashes de autenticação.

Login administrativo, consultas de gestão e painel de pedidos foram validados online; 213 testes locais e 11 testes SQL de RLS passaram. Testes SQL usam BEGIN/ROLLBACK e não deixam fixtures. Aprovação por CNES, calendário, notificações, auditoria e concorrência ainda precisam de homologação completa. Novas contas e resets usam `123456` com troca obrigatória, apenas como política provisória do piloto; revisar antes do uso institucional.

## Separação de acessos — implementação local de 07/10/2026

Escolha o perfil e o CNES/lotação antes de operar. RH/Diretor sem mapeamento CNES ativo não recebe contexto operacional. Contas bloqueadas, papéis revogados e cadastros desativados são revalidados pelo servidor, mesmo quando a escolha anterior permaneceu salva na sessão.

Diretor analisa revisões por CNES e consulta calendário/histórico; edição de escala mínima, banco de horas e organização da fila são do RH/Administrador. Alterações estruturais de cargos, funções, lotações e permissões são administrativas. A matriz de ações bloqueia chamadas desconhecidas por padrão; esconder um botão não substitui autorização do servidor.

Pedidos de acesso que contenham unidades ou lotações internas fora do contexto do RH devem ser encaminhados ao Administrador. O RH não aprova um pedido completo somente por ter uma unidade em comum. Ao trocar perfil/contexto, os dados administrativos carregados são limpos.

Verificação local: 209 testes aprovados e sintaxe de seis Edge Functions conferida. Ensaio SQL revertido confirmou execução das RPCs sensíveis somente pelo servidor, não pelo navegador. Outros 11 cenários executados como `authenticated` verificaram leitura de pedidos por escopo/vínculo, bloqueio de papel forjado, conta/CNES desativados, contexto incompleto e escopo revogado, além de ausência de UPDATE direto. Ainda são necessárias inspeção visual interna e revogação/desativação concorrente; esse bloco não está publicado nem integralmente homologado.

A inspeção local de 07/10 confirmou login administrativo funcional, mas o painel do novo frontend não pode carregar contra o banco legado: falta a relação entre solicitações e vínculos. Antes de homologar as áreas internas, preparar ambiente integrado ou transição coordenada do banco/functions preservando a estável. Não ativar as revogações do novo modelo isoladamente no banco compartilhado.

## Ajuste de férias após feriado — regra confirmada, integração pendente

Regra dos dias acrescentados confirmada em 07/10: atribuir à única atuação elegível; com mais de uma unidade/lotação, seguir a escala funcional explícita daquela data. Sem definição inequívoca, deixar a atribuição para o RH, sem adivinhar sextas alternadas. Escala mínima e afastamentos anteriores não comprovam a jornada habitual. Os avisos devem alcançar servidor, gestores das unidades vinculadas à solicitação e Administradores. A seleção foi implementada em módulo puro com testes, ainda sem ligação à gravação automática.

As sete migrations locais foram ensaiadas no PostgreSQL atual com rollback: execução DDL e importação de 176 equipes concluídas dentro da transação. Consulta posterior confirmou que vínculos/revisões e contagem explícita não permaneceram no banco. Esse ensaio não equivale a deploy nem a testes completos dos fluxos/RPCs.

Conforme orientação do usuário, incluir um feriado durante férias em dias úteis deve preservar a data inicial e a quantidade de dias de direito, recalcular término/retorno e avisar o servidor. Não é uma nova solicitação. A extensão respeita dias não úteis: não corresponde necessariamente a somar um dia corrido. Dias corridos conservam sua quantidade; o retorno é ajustado ao próximo dia útil aplicável.

O cálculo foi verificado no PostgreSQL atual em função temporária, com rollback e sem alterações permanentes: 25 dias úteis desde 05/10/2026, sem exclusões, terminam em 06/11 com retorno em 09/11; excluindo 12/10, terminam em 09/11 com retorno em 10/11; excluindo também 09/11, terminam em 10/11 com retorno em 11/11. São cenários controlados, não o calendário oficial completo.

Nos períodos novos, a contagem será registrada explicitamente como útil/corrida. Registros antigos sem essa informação exigem reconciliação. Persistência automática, notificações e distribuição dos dias acrescentados ainda não foram ativadas. Falta definir responsáveis por dias novos e tratamento de períodos fracionados afetados. O usuário autorizou usar o banco atual; publicação e migração integral ainda exigem revisão de compatibilidade com a versão estável.

## Separação de telas por perfil — preparação local

A navegação e a renderização seguem a mesma matriz de acesso. Servidor usa pedidos próprios e solicitação; Diretor consulta solicitações, escala e histórico do contexto; RH também acessa cadastros operacionais, inclusões e pedidos de acesso; Administrador acessa perfis, permissões, referências, feriados e motivos de recusa. Uma rota não permitida retorna à área inicial do perfil. Primeiro acesso com troca de senha obrigatória tem prioridade. Isso é uma proteção de interface: cada consulta e gravação continua dependendo da autorização do servidor e do escopo validado. Homologação integral permanece pendente.

## Redistribuição diária — preparação local

No detalhe de um pedido por CNES, o Administrador encontra **Redistribuir responsabilidade de um dia**. Escolha o dia, selecione a nova unidade elegível, informe a justificativa de 3 a 2000 caracteres e salve. A tela recarrega o pedido e as versões das análises após cada alteração. Não altera o período ou saldo.

Nesta primeira fase, todas as análises devem estar pendentes, a atuação deve pertencer ao mesmo vínculo e estar ativa/autorizadora e vigente na data. Só é possível transferir para unidades já participantes, conservando ao menos um dia em cada CNES/lotação. Não há liberação para servidor/RH, unidades novas/removidas ou decisões já tomadas. Em caso de conflito de versão, atualize o pedido e confira a distribuição antes de tentar novamente. Código preparado apenas localmente: execução SQL, concorrência real e inspeção visual em homologação continuam pendentes.

## Calendário por unidade — versão local em desenvolvimento

O painel diário conta somente atuações vigentes na data selecionada. Células fora da vigência exibem um traço e não mostram aniversário, retorno ou escala mínima. Se a mesma atuação tiver pedidos planejados e confirmados coincidentes, o confirmado tem prioridade no resumo. A contagem é por atuação, não por pessoa única; “sem afastamento confirmado” não significa disponível para trabalhar, pois jornada, feriados e outros eventos também precisam ser considerados. Resultados atrasados de uma visão anterior são descartados ao trocar o recorte, contexto ou tela.

Em **Recorte de datas**, escolha **Mês completo** ou **Intervalo personalizado**. No intervalo, informe início/fim e clique em **Atualizar visão**; são aceitos até 93 dias, inclusive entre meses ou anos. Cabeçalhos mostram dia/mês, resumos e conflitos consideram o intervalo e os mesmos filtros de CNES, lotação, cargo, equipe, função e situação. A consulta reúne os meses sem duplicar atuações/pedidos e não amplia as permissões. Os botões de mês anterior/próximo retornam à visão mensal. O recorte está preparado localmente; validação visual, desempenho e consultas reais continuam pendentes em homologação.

Redistribuições atualizam conjuntamente a atuação, o CNES e a lotação do dia. Estão preparados avisos para pedidos de outras pessoas que coincidam naquele dia nos contextos anterior e novo; esses avisos não identificam colegas nem recusam solicitações automaticamente. Feriados, fins de semana e aniversários são excluídos conforme as regras locais atuais. Destinatários e deduplicação ainda exigem homologação SQL.

Pedidos por CNES não podem ser reprogramados pela rotina legada: ela não reconstrói a distribuição diária e as revisões. Nesta etapa, somente o Administrador pode cancelar globalmente um pedido novo, sem alterar seus períodos. Aprovar, recusar e adicionar ao calendário continuam no fluxo específico por unidade. Reprogramação por CNES permanece pendente.

O calendário apresenta uma linha por vínculo/atuação na unidade. RH/Diretor consulta o contexto escolhido no acesso; Administrador pode filtrar CNES e lotação na visão consolidada. Somente os dias atribuídos àquela atuação aparecem como afastamento.

A visão padrão **Calendário confirmado** exibe revisões já adicionadas ao calendário. **Planejamento e confirmados** também mostra pedidos em análise ou aprovados: estes continuam provisórios, com indicação visual própria. Aprovar e adicionar ao calendário são ações diferentes. Se uma pessoa atua em duas unidades, cada unidade possui sua própria revisão e seus próprios dias.

Na escala mínima, RH/Administrador escolhe a unidade/lotação e o dia. Cada opção identifica uma atuação do vínculo; a sugestão usa o último dia salvo do mesmo dia da semana, removendo atuações sem vigência ou com afastamento confirmado. É possível salvar um dia sem nomes. Ao salvar, a versão é conferida: se outro gestor alterou o dia, atualize a visão e revise antes de reenviar. Diretor consulta o calendário, sem editor da escala mínima.

Para analisar conflitos, selecione a equipe e o **Critério de conflito**: mesmo cargo, mesma equipe, mesmo cargo e equipe, mesma função ou qualquer simultaneidade na unidade. Clique em **Atualizar visão** e selecione um dia. O detalhe informa os nomes e a data envolvidos. Somente os pedidos visíveis nos filtros e na visão escolhida entram no cálculo; CNES/lotação interna diferentes não são misturados. Não se aplica não representa uma equipe compartilhada. Os alertas auxiliam o planejamento: não recusam solicitações nem indicam, por si só, um impedimento legal. Na seção **Conflitos manuais**, informe unidade/lotação, atuação opcional, início, fim e justificativa. Alertas da unidade atingem todas as atuações do escopo; os vinculados a uma atuação sinalizam apenas aquela linha. Para encerrar, escolha **Resolver** ou **Cancelar registro** e informe o motivo. Os registros encerrados deixam de sinalizar o calendário, mas conservam autoria, datas e justificativas no histórico do mês. Filtros de cargo/equipe/função restringem os registros relacionados a atuações; alertas gerais da unidade continuam visíveis.

Esta implementação ainda exige execução das migrations e validação em homologação. Notificações por escopo, conversão do histórico legado e testes reais de concorrência permanecem pendentes. As escalas antigas estão preservadas no banco, mas ainda não aparecem no editor novo. A versão estável não foi alterada nesta entrega.

O SQL local também prepara avisos em **Notificações** quando a escala mínima muda: gestão da unidade/lotação, servidores incluídos/retirados e titulares de solicitações cuja distribuição coincida com aquele dia e escopo. Os avisos pessoais não exibem a composição nominal dos colegas. Regravar a mesma seleção e origem não produz outro aviso; criar um dia explicitamente vazio ou mudar a origem do ciclo pode produzir aviso de planejamento. Decisões e saldos não são alterados automaticamente. Consulte os avisos no perfil/vínculo/contexto correspondente e atualize o calendário para conferir a escala. São avisos internos, não envios de e-mail. Esta entrega requer execução e validação dos disparos no banco de homologação; mudanças posteriores da distribuição diária e de afastamentos que afetem outras análises ainda estão pendentes.

### Distribuição diária e avisos relacionados — preparação local

A gravação de solicitação encaminha ao banco a identidade autenticada e o contexto validado, sem aceitar autoria enviada pelo navegador. A distribuição inicial possui auditoria agrupada por pedido/CNES/lotação. O SQL também prepara auditoria de futuras alterações de responsável com antes/depois e avisos aos escopos anterior/novo; alterações sem efeito e exclusão em cascata do pedido não são interpretadas como redistribuição. Ainda não existe nesta entrega uma tela/RPC completa para editar essa distribuição após o envio: autorização, vigência, justificativa, concorrência e consistência das análises devem ser implementadas/homologadas antes de habilitá-la. Os triggers não reabrem decisões automaticamente.

Ao adicionar um afastamento ao calendário ou cancelar um pedido moderno com revisão confirmada, são preparados avisos para titulares e gestores de outros pedidos com dias coincidentes no mesmo contexto. A coincidência respeita a distribuição diária, exclui a própria pessoa e desconsidera fins de semana, feriados e aniversários segundo as regras locais atuais. O aviso não identifica colegas nem conclui que houve conflito de cargo/equipe: orienta atualizar o calendário e conferir os filtros/cobertura com RH. Mudanças de períodos e reprogramações ainda precisam de cobertura adicional. Esses disparos e registros exigem execução em homologação; os testes atuais não executam os triggers SQL.

## 1. Cadastros obrigatórios

### Recusa estruturada por CNES — versão local

Ao analisar uma solicitação, selecione o motivo antes de **Recusar**. Banco de Horas Insuficiente exige o saldo conferido pelo RH e a quantidade necessária em horas; a necessária deve superar o saldo. Esses valores são declarados pela gestão e não alteram nem substituem a conferência do extrato. No fluxo por CNES, Conflito com Funcionário exige selecionar a atuação pelo nome, matrícula, cargo e unidade, informar início/fim do período e explicar o conflito. Selecione o CNES/lotação da revisão que será recusada; o banco confere situação ativa e vigência durante todo o intervalo e registra o nome cadastrado. A lista não inclui o próprio solicitante. Sem atuação elegível, confira o cadastro e o contexto. No fluxo legado, o nome ainda é declarado manualmente, sem associação presumida. Outros exige justificativa textual. Todas as recusas exigem uma explicação de 3 a 2000 caracteres. O seletor está preparado somente no desenvolvimento local; execução SQL e validação visual em homologação permanecem pendentes.

O motivo e os dados ficam associados à decisão, ao acompanhamento do servidor e ao histórico. Aprovar e adicionar ao calendário não exigem os campos de recusa. Essa decisão administrativa não substitui a verificação de regras antes do envio. Dúvidas de direitos devem ser tratadas com RH e normas homologadas; problemas técnicos, com Administradores/TI da Prefeitura de Betim. Nenhuma referência legal nova foi presumida nesta entrega.

Nos pedidos legados, a versão local conserva as etapas **Chefia imediata → RH**. Para recusar uma etapa, RH/Administrador seleciona o mesmo motivo padronizado, preenche os campos específicos e justifica. A recusa fica associada à etapa, ao autor e ao histórico; saldos não são alterados automaticamente. Aprovações não exigem motivo de recusa e não inserem automaticamente o afastamento no calendário. Pedidos do novo modelo não podem ser decididos pela rotina legada. O banco legado não possui necessariamente contexto histórico completo: a gestão usa a lotação legada comprovável, sem atribuir retrospectivamente outro CNES. Permissões, devolução/reenvio, notificações e concorrência ainda exigem execução em homologação antes da publicação.

Na versão local, o Administrador acessa **Cadastros → Motivos de recusa** para criar motivos ou editar nome, ordem e situação. Cada alteração exige justificativa e registra o autor no histórico. O código deve conter de 3 a 64 caracteres, começando por letra minúscula e usando somente letras minúsculas, números e sublinhado. Escolha os campos exigidos: saldo de banco de horas, funcionário/período de conflito ou justificativa textual. Código e modo são permanentes; para mudar os campos exigidos, crie outro motivo e desative o anterior. Não há exclusão física, e decisões anteriores mantêm seu rótulo histórico. Pelo menos um motivo permanece ativo. Em caso de edição simultânea, atualize o catálogo antes de reaplicar a alteração. A interface, permissões e transação SQL ainda precisam de validação em homologação.

### Histórico de ações — versão local

Abra **Histórico** na navegação de gestão. Selecione início/fim (até 366 dias), parte do **Nome do autor**, **Nome do servidor afetado** e/ou **Matrícula do vínculo** (de 2 a 120 caracteres), código do evento e, opcionalmente, IDs do autor, registro ou vínculo. Nome do autor identifica quem realizou a ação, não necessariamente o servidor afetado. Filtros preenchidos são combinados; eventos sem vínculo conhecido não aparecem na busca por matrícula, mas continuam disponíveis sem esse filtro. Administrador também filtra CNES/lotação. A consulta apresenta até 50 eventos por página, autor, papel, contexto e justificativa registrada. Expanda **Antes e depois da ação** para comparar os dados disponíveis: RH/Diretor recebe somente um resumo restrito ao próprio escopo; os detalhes administrativos omitem campos de senha, tokens e chaves. As buscas novas ainda exigem execução no banco de homologação e conferência visual.

A identificação do servidor afetado depende de uma relação comprovável com a entidade auditada. Nos novos eventos, o nome é registrado na data da ação. Eventos antigos relacionados a registros existentes podem ser reconciliados com o nome atual, exibido como **nome atual na reconciliação**, sem presumir o nome que existia na época. Eventos coletivos, de acesso/inclusão ainda não conciliados ou sem relação comprovável não aparecem na busca por servidor afetado, mas continuam preservados na consulta geral. A reconciliação não amplia o escopo nem associa o servidor com base apenas no autor ou no vínculo usado para acessar o sistema.

A busca amigável por nomes/matrícula e a cobertura integral das mutações ainda estão pendentes. Eventos antigos sem autoria/contexto comprováveis não recebem informação presumida; podem aparecer sem contexto ao Administrador e não são liberados ao RH por associação inferida. O novo preenchimento e a consulta precisam de validação em banco de homologação antes da publicação.

### Notificações por contexto — versão local

O painel mostra avisos destinados ao usuário no perfil ativo. RH/Diretor consulta somente o CNES/lotação escolhido; o Servidor consulta seu vínculo/unidade e os avisos pessoais legados identificáveis. Administrador consulta seu próprio canal global. Marcar avisos como lidos afeta somente esse canal/contexto, não os avisos de outro perfil ou unidade.

Os novos disparos foram preparados para criação e decisão da análise por unidade, criação/encerramento de conflito manual e alteração/desativação/mudança de data de feriado ou ponto facultativo. Após o aviso, atualize o calendário e confira período e retorno com o RH: uma alteração de feriado não modifica silenciosamente a decisão registrada nem recalcula os totais persistidos. A execução dos triggers ainda depende de homologação. Avisos antigos de gestão sem escopo confiável permanecem no banco, mas exigem classificação antes de aparecerem nos canais novos.

Cadastre a hierarquia em `lotacoes`, usando `parent_id` e `unit_type` para representar Secretarias, Diretorias, Unidades e Setores. Depois carregue cargos, funções, categorias e servidores.

O CPF em `servidores.cpf` deve conter somente 11 dígitos. Matrícula, CPF e data de nascimento são usados pela função de verificação; a resposta nunca revela qual campo divergiu.

## 2. Acesso ao SGF

### Proteção contra rajadas de login

- O botão de entrada entra em contagem regressiva por pelo menos 3 segundos após uma falha.
- O servidor aplica o mesmo intervalo de forma atômica, portanto recarregar a página ou chamar a API diretamente não contorna o bloqueio.
- Não existe bloqueio acumulado por quantidade de tentativas: terminado o intervalo de 3 segundos, o usuário pode tentar novamente.
- O intervalo é aplicado por origem mesmo quando o usuário alterna o login ou CPF informado.
- Respostas bloqueadas usam HTTP `429`, cabeçalho `Retry-After` e informam no botão quantos segundos faltam.

O público usa somente a **Simulação Rápida**. Servidor, RH e Administrador entram com **login ou CPF e senha** na mesma tela. A Edge Function `access-auth` resolve o identificador sem expor o e-mail, limita tentativas e devolve a sessão somente quando a senha está correta. Uma identidade pode possuir os três acessos; nesse caso, a pessoa escolhe a área após autenticar e pode trocá-la na navegação.

No banco anterior à migration de múltiplos acessos, a autenticação usa `profiles.role` e o CPF do servidor vinculado. A interface também reconhece esse esquema para não interromper o acesso existente. Nesse estágio, cada conta tem apenas o papel que já possui; a escolha entre vários acessos depende da migration e da publicação conjunta das demais funções.

No cadastro manual ou após reset, `profiles.must_change_password` bloqueia o painel até a definição de uma senha pessoal. O sistema gera uma senha temporária aleatória de 16 caracteres, compatível com mínimo de 8 caracteres e requisitos de maiúscula, minúscula, número e símbolo. Ela é exibida uma única vez ao administrador e deve ser transmitida por canal institucional, com troca imediata no primeiro login.

Novos usuários usam **Solicitar acesso** e informam os dados funcionais, a lotação CNES pretendida e um e-mail institucional `@betim.mg.gov.br`. A solicitação entra em `access_requests`; nenhuma conta é criada nessa etapa. O RH pode aprovar apenas Servidor nas lotações de seu escopo; o administrador pode aprovar qualquer acesso. A aprovação cria e convida uma conta nova; quando o CPF já possui conta, acrescenta os acessos à identidade existente sem criar outra senha.

- `público`: simulação sem login, sem registrar solicitações.
- `servidor`: acesso aos próprios registros e envio de pedidos.
- `rh`: análise das etapas da chefia e do RH, operação e cadastros nas lotações vinculadas em `profile_scopes`.
- `administrador`: acesso global, configuração de perfis e estrutura.

O administrador usa **Perfis e acessos** para conferir o CPF, marcar um ou mais acessos e definir o escopo territorial do RH. O RH exige ao menos uma lotação; o Administrador possui acesso global. A conta administradora atual não pode alterar os próprios acessos nessa tela.

Quando um servidor recebe pela primeira vez acesso de gestão, deve trocar a senha antes de usar qualquer área. A alteração de acessos e escopos é atômica e registrada em `audit_events`.

O administrador pode criar contas manualmente em **Cadastros → Usuários e acessos**, selecionar os acessos e a lotação e redefinir a senha temporária. Também pode desativar uma conta; os pedidos, decisões e eventos de auditoria permanecem no histórico. Revise contas desativadas e credenciais temporárias periodicamente.

O acesso provisório compartilhado foi encerrado. O endpoint legado responde permanentemente com HTTP 410 e seus segredos foram removidos. A conta administrativa existente permanece disponível somente pelo login individual, com troca obrigatória da senha temporária. Todo acesso à gestão deve ser individual e rastreável.

### Migração para CPF e múltiplos acessos

No projeto Supabase conectado a este piloto, as migrations até 30/09/2026 foram aplicadas em ordem e as Edge Functions correspondentes foram publicadas. As instruções seguintes servem para outros ambientes e para a conferência antes de um novo deploy. A versão local já foi testada com o login administrativo; a versão do site publicado ainda precisa de atualização e homologação.

A migration `20260929234326_cpf_multi_access.sql` converte Diretor e Gerência em RH, migra o papel anterior para `profiles.roles` e preenche `profiles.cpf` a partir do servidor vinculado. Antes de trocar o frontend e as Edge Functions, execute em homologação:

```sql
select p.id, p.full_name, p.role, s.matricula
from public.profiles p
left join public.servidores s on s.profile_id = p.id
where p.cpf is null;
```

Resolva o CPF das contas vinculadas a servidores com o cadastro funcional conferido pelo RH. A conta administrativa sem registro em `servidores` pode continuar entrando pelo login `admin`, sem CPF; para reunir acessos pelo CPF, cadastre esse dado por uma operação controlada e validada. A migration `20260930002220_restore_login_alias.sql` preenche logins ausentes usando a matrícula ou um identificador técnico único e atribui login nas futuras aprovações. Confira também se não existem identidades diferentes para a mesma pessoa antes de aplicar a migration, pois `profiles.cpf` é único. Publique `access-auth`, `manage-access`, `manage-profiles`, `manage-catalogs`, `manage-inclusions`, `manage-operations` e `submit-request` na mesma janela da mudança do site. O papel efetivo é conferido no banco para cada requisição; a escolha da interface não concede acessos novos.

### Recuperação e primeiro acesso

**Esqueci a senha** recebe login ou CPF e sempre retorna uma resposta neutra, evitando revelar contas existentes. Quando há uma conta com e-mail válido, o Supabase envia um link de recuperação. Convites e recuperações retornam ao SGF para definição de uma senha compatível com o maior acesso da conta.

Cargo e lotação informados na solicitação ficam em `servidores.declared_position` e `servidores.declared_unit` até que o RH associe os registros oficiais de `cargos` e `lotacoes`.

Sem login, a página oferece **Simulação Rápida** e **Entrar no SGF**; na tela de entrada também há **Solicitar acesso**. Na simulação, a pessoa escolhe férias ou banco de horas, dias úteis ou corridos e informa a data de início ou a data de retorno desejada. Para férias, informa a quantidade de dias; para banco de horas, o saldo e a jornada diária. Nos dias úteis, fins de semana, feriados e pontos facultativos não consomem dias; nos corridos, todos os dias do intervalo contam. O retorno é estimado para o próximo dia útil e, quando informado diretamente, deve ser um dia útil. A simulação não coleta identificação, ignora o day-off de aniversário e não grava uma solicitação.

Na tela de login, o acesso existente é a ação principal. **Esqueceu a senha?** fica junto ao campo de senha; **Solicitar acesso** fica em uma área própria para o primeiro acesso. Após autenticar, a navegação superior mostra somente as áreas pertinentes ao perfil. Nas telas de detalhe, as ações cabíveis aparecem após o resumo e as etapas; histórico, calendário e operações auxiliares podem ser abertos quando necessários.

Na configuração de acessos e perfis, a seleção de lotações aparece quando RH está marcado e oferece busca por código ou nome. A rejeição de um acesso exige justificativa e fica separada da aprovação. O formulário de cadastro funcional agrupa identificação, vínculo e justificativa da alteração.

Depois do login, o RLS permite consultar somente o próprio cadastro e as solicitações vinculadas. O funcionário pode iniciar uma solicitação com seus dados preenchidos e acompanhar protocolo, períodos e situação, sem ações de aprovação ou programação.

### Comprovante e comunicação

Ao concluir uma solicitação, o SGF gera um comprovante preparado para impressão ou PDF em uma única página A4. O documento reúne protocolo, situação, identificação funcional, lotação, períodos, retornos, day-off de aniversário eventualmente incluído e observações.

O comprovante possui exatamente dois campos de assinatura:

1. **Servidor(a) solicitante**, que confirma o pedido.
2. **RH ou Chefia Imediata**, preenchido por quem autorizou as férias ou folgas naquele período, com nome, matrícula e carimbo quando aplicável.

O protocolo, isoladamente, não autoriza o afastamento. Depois de coletar as duas assinaturas, uma cópia deve permanecer com o servidor e a via administrativa deve ser entregue conforme o procedimento da lotação.

Em **Meus pedidos → Ver detalhes**, o servidor pode reabrir e reimprimir o comprovante a qualquer momento, além de copiar os dados ou um texto de e-mail já acompanhado de assunto e orientações de entrega. O conteúdo copiado sempre reflete a situação atual armazenada no pedido.

Todo pedido exige uma sessão válida com perfil `servidor`, sem troca de senha pendente, vinculada ao mesmo `servidores.profile_id` da matrícula e do CPF informados. A aprovação de acesso pode criar um cadastro funcional provisório; nesse caso, o primeiro pedido autenticado abre a inclusão funcional correspondente.

Os endpoints legados `employee-auth` e `management-auth` respondem permanentemente com HTTP 410. Todo novo login, convite, recuperação e alteração de senha passa por `access-auth`.

## 3. Fluxo

1. O servidor entra com a conta aprovada, confere os dados funcionais, simula e envia.
2. A Edge Function confirma que CPF e matrícula pertencem ao cadastro vinculado à sessão. Se o cadastro estiver inativo/provisório, abre uma pendência em `employee_inclusion_requests` para conferência do RH.
3. O protocolo, os períodos, as duas etapas de aprovação e a eventual inclusão funcional são gravados em uma única transação. Divergências com CPF ou matrícula já existentes são bloqueadas para evitar associação indevida.
4. O RH analisa a etapa da chefia imediata apenas para servidores do seu escopo e registra decisão, parecer, responsável e data em `request_approvals`. A aprovação libera a etapa RH; a rejeição encerra o fluxo. Enquanto a inclusão não tiver lotação oficial vinculada, a conferência cabe ao administrador.
5. O RH somente registra a segunda decisão depois da aprovação da primeira etapa. A aprovação final libera a programação das férias; a rejeição exige justificativa e encerra o fluxo.
6. Toda mudança de situação é registrada em `request_status_history`.

### Cadastros e estrutura organizacional

Administradores e RH acessam **Cadastros** pela navegação autenticada. A mesma área agrupa servidores e lotações, pendências funcionais, usuários e acessos (administrador) e feriados (administrador). O administrador pode criar e alterar lotações, hierarquia, tipo, código CNES, situação e responsáveis. Os responsáveis selecionados são registrados em `profile_scopes`.

Administradores e RH podem cadastrar e editar servidores, cargos, funções, vínculos e jornada semanal. O RH atua somente nas lotações atribuídas ao seu perfil; alterações estruturais de lotações permanecem exclusivas do administrador.

Toda inclusão, transferência, mudança de cargo, função, vínculo, ativação ou bloqueio funcional gera um registro em `employee_assignment_history`, contendo valores anteriores e novos, motivo, responsável e data. Os eventos também são registrados em `audit_events`.

### Inclusões funcionais

Administradores e RH acessam **Cadastros → Pendências funcionais**. A fila apresenta os dados declarados pelo servidor e o protocolo que originou a inclusão. O RH vê somente cadastros já vinculados às suas lotações; cadastros provisórios ainda sem lotação oficial são tratados pelo administrador.

Na aprovação, o responsável seleciona uma das lotações CNES oficiais, confirma cargo e vínculo e pode registrar um parecer. O procedimento ativa o servidor, vincula cargo e lotação e conclui a pendência em uma única transação. Na rejeição, a justificativa é obrigatória. A matrícula, o CPF e a data de nascimento não são alterados por esse fluxo.

As 48 lotações da carga inicial estão versionadas em `docs/cnes-lotacoes.md`. Antes da produção, o RH deve conferir grafia, hierarquia e situação ativa diretamente com a fonte institucional.

## 4. Banco de horas

`declared_minutes` é o saldo informado pelo servidor; `validated_minutes` é o saldo oficial confirmado pelo RH. A aprovação não deve se apoiar apenas no saldo declarado.

No modelo atual, o RH registra créditos e débitos na matrícula selecionada, em `bond_time_bank_entries`. A primeira ação **Adicionar ao Calendário** consome as horas solicitadas uma única vez por pedido, mesmo com vários CNES. Aprovar não debita horas. Recusa global ou cancelamento estorna eventual consumo, sem apagar o extrato. Saldo insuficiente impede a confirmação inteira. Registros legados continuam no extrato por pessoa (`time_bank_entries`), com consumo na conclusão; não misturar esses saldos com os vínculos atuais. Pedidos antigos já concluídos exigem conferência e eventual ajuste auditável.

## Operação das solicitações

A linha do tempo apresenta mudanças de situação, responsável, data e justificativa. No modelo atual, cada CNES/lotação analisa somente os seus dias e dispõe de **Aprovar**, **Recusar** com justificativa ou **Adicionar ao Calendário** após aprovação. A aprovação não confirma ausência. Uma recusa encerra o pedido inteiro; decisões anteriores ficam no histórico, mas não confirmam afastamento nem bloqueiam a escala.

Pedidos legados preservam chefia → RH → inclusão explícita no calendário. RH/Administrador podem devolver para correção; o titular pode responder e reenviar. Para cancelar, o servidor procura o RH. Operações legadas não podem decidir ou alterar silenciosamente pedidos com distribuição por CNES.

O calendário de escala apresenta todos os funcionários ativos do escopo em uma grade mensal, com uma linha por funcionário e uma coluna por dia, inclusive quando não há afastamento. Os filtros de lotação, cargo, função e situação atualizam a visão sem alterar os pedidos. As marcações identificam início, fim, retorno, feriado, day-off de aniversário e dias de afastamento; células vermelhas indicam sobreposição por lotação, cargo ou função. Ao selecionar uma célula colorida, o gestor abre a solicitação correspondente.

No painel **Escala mínima nominal**, RH ou administrador escolhe lotação e data e marca, se necessário, os servidores escalados. A lista pode ficar vazia. Somente servidores ativos da lotação escolhida podem ser salvos; o sistema sinaliza afastamentos coincidentes. Não há percentual ou quantidade mínima obrigatória.

Na fila **Solicitações**, RH e administrador podem ordenar por data, servidor, situação, modalidade, início ou lotação. **Arquivar na minha fila** oculta apenas daquela pessoa e mantém o pedido e sua trilha de auditoria; **Arquivadas** permite localizar e restaurar.

Os botões **Mês anterior** e **Próximo mês** mantêm os filtros aplicados. O painel também informa quantidade de funcionários, solicitações do período, dias com conflito e o pico de afastamentos simultâneos. Conflitos são alertas de apoio à decisão e não substituem a análise da chefia.

As mudanças de situação geram notificações internas para o servidor, responsáveis pela lotação e administradores. Em **Notificações**, cada mensagem pode ser aberta na solicitação vinculada ou marcada como lida; também é possível marcar todas como lidas.

A validação formal dos cálculos deve seguir `docs/HOMOLOGACAO_REGRAS.md`.

## 5. Calendário institucional

Feriados e pontos facultativos ativos são carregados da tabela `calendar_events` antes de qualquer simulação. O calendário é público somente para leitura, pois também atende a Simulação Rápida sem login. O administrador gerencia data, nome, tipo, fonte e situação em **Cadastros → Feriados**. Se o calendário não puder ser carregado, o frontend bloqueia a simulação para evitar cálculo incorreto.

## Equipes e escala mínima

- Todo cadastro funcional informa a equipe; quando não houver equipe aplicável, selecione **Não se aplica**.
- A escala mínima é apresentada no padrão **Cargo - Equipe e Função - Nome**.
- Para uma data ainda não planejada, o sistema sugere a última escala salva na mesma lotação e no mesmo dia da semana. Servidores afastados na nova data são desmarcados automaticamente.
- O RH pode alterar a sugestão e salvá-la, inclusive vazia. As últimas escalas ficam disponíveis no próprio painel para conferência do ciclo.

## Alterações no calendário

Ao cadastrar ou alterar um feriado/ponto facultativo ativo dentro de um afastamento compatível, o sistema preserva início e quantidade de dias, recalcula fim/retorno e avisa o servidor e os responsáveis envolvidos. Dias novos sem responsável inequívoco e dados históricos sem contagem confiável exigem revisão explícita. Não inferir responsáveis nem ignorar avisos de revisão. A homologação integrada dessa rotina permanece no bloco 04.

## 6. Revisões periódicas

- Atualizar `calendar_events` e o calendário do frontend antes de cada exercício.
- Revisar usuários, papéis e escopos mensalmente.
- Executar Supabase Security Advisor após toda alteração de schema.
- Testar restauração de backup antes do uso em produção.
- Não utilizar dados reais em ambientes de demonstração.

## Ambiente de demonstração

O arquivo `supabase/seed-demo.sql` cria uma massa fictícia e idempotente para apresentações. Os registros usam os prefixos `DEMO` e `SGF-DEMO`, contemplam diferentes cargos, equipes, modalidades e situações, além de escala mínima, banco de horas e notificações. Execute-o somente no projeto destinado à demonstração ou homologação.

Antes de apresentar, confira se os filtros estão limitados aos registros fictícios e se nenhuma informação pessoal aparece nas capturas de tela. A carga pode ser reaplicada para restaurar o cenário; ela não remove dados institucionais existentes.
# Ajustes de planejamento publicados em 07/10/2026

Notificações/auditoria (09/10): consultar avisos no perfil e CNES ativos; usar as páginas para avisos anteriores. Histórico administrativo permite nome do autor/afetado, matrícula, evento e período; RH/Diretor recebem somente resumos do próprio contexto. Procedimento de correção, desativação, preservação e condições de anonimização em [AUDITORIA_RETENCAO.md](AUDITORIA_RETENCAO.md); evidências em [VALIDACAO_BLOCO_05.md](VALIDACAO_BLOCO_05.md). Não apagar trilhas ou redefinir senhas de contas existentes para ensaios.

Feriados ativos recalculam pedidos compatíveis preservando início e quantidade de dias, com aviso ao titular e aos responsáveis dos escopos envolvidos. Aprovado não significa incluído no calendário. Histórico sem contagem confiável, sobreposição e perda de escopo não são corrigidos por inferência: o pedido fica sinalizado para revisão. Dia novo com mais de uma unidade possível depende de atribuição explícita pelo RH/Administrador.

Redistribuição comum exige todas as revisões pendentes; decisões existentes não são apagadas. O titular altera somente seu vínculo selecionado, e RH somente seu escopo. Cada alteração exige justificativa e versão atual. Operações compartilham uma trava transacional global no piloto; medir contenção antes de ampliar o uso.

Ensaios reproduzíveis: `node scripts/prepare-workflow-rehearsal.mjs unit`, `calendar` ou `distribution`. Executar a saída inteira no banco atualizado: ela inclui BEGIN/ROLLBACK, não é seed. Não remover o rollback.

Recuperação: Site URL e redirect autorizado `https://sgfbetim.vercel.app/`. O backend aceita somente esse endereço por padrão; outras URLs exatas exigem `SGF_RECOVERY_URLS`, configuração exclusiva do servidor. Entrega, salvamento de senha e login da conta teste confirmados pelo usuário em 08/10/2026; não repetir redefinições dessa conta para ensaios.

## Reprogramação com nova análise — 08/10/2026

1. Antes das decisões, use **Redistribuir responsabilidade de um dia**. Titular altera apenas sua matrícula; RH apenas seu escopo; Administrador pode coordenar unidades. Justificativa e versão atual são obrigatórias.
2. Após decisões, procure o Administrador. Em **Reprogramar ou redistribuir com nova análise**, mantenha o início se mudar somente os responsáveis, ou informe o novo início de cada parcela.
3. Clique em **Simular novo período e distribuição**. A quantidade e a contagem são preservadas; confira fim, retorno e o responsável por todos os dias.
4. Justifique e confirme a ciência da substituição. O pedido anterior será cancelado e sairá do calendário; eventual consumo será estornado. Datas, decisões e autoria anteriores não são apagadas.
5. O novo protocolo fica vinculado ao anterior e aguarda todas as análises. Cada unidade deverá aprovar e adicionar novamente ao calendário. O comprovante tem uma assinatura do servidor e outra de quem autorizou no RH/chefia.
6. Se outra sessão decidir, alterar calendário/cadastro ou substituir o pedido, atualize e simule novamente. Não repetir o clique para forçar a gravação.

Ensaios do bloco: `node --test tests/*.test.mjs`; SQL em `tests/block-three-rehearsal.sql` e `node scripts/prepare-workflow-rehearsal.mjs legacy`, sempre com rollback. O script `scripts/verify-block-three-pilot.mjs` é exclusivo do ensaio identificado de 08/10, requer credenciais por variáveis de ambiente e não é carga institucional. Evidências e limites em [VALIDACAO_BLOCO_03.md](VALIDACAO_BLOCO_03.md).
