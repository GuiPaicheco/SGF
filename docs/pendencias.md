# Pendências do SGF

Plano ativo e ordenado das alterações do sistema. Os passos abaixo devem ser executados na ordem indicada porque identidade, vínculos, escopos de acesso, solicitações e calendários compartilham o mesmo modelo de dados.

**Última revisão completa:** 05/10/2026, confrontando a solicitação atual, o cadastro e login existentes, o frontend, as Edge Functions, as migrations, o modelo remoto do Supabase e o catálogo de equipes fornecido.

> **Regra atual — 07/10/2026:** o responsável autorizou usar o banco atual como homologação e atualizar o GitHub. Produção e homologação compartilham o mesmo projeto; uso institucional ainda exige aceite. A versão legada fica preservada no histórico, mas não deve operar contra o banco atualizado.

**Histórico:** inicialmente os ensaios foram revertidos e a publicação não estava autorizada. A decisão posterior de 07/10 substituiu essa restrição: migrations e funções já estão aplicadas no projeto compartilhado, conforme o checklist vigente abaixo. Não confundir ensaio de DDL com homologação de fluxos.

## Situação atual

### Tópico 01 — validação de cadastro, login e perfis — em execução

#### Recuperação de senha — correção de 07/10

**Correção adicional — 08/10:** os logs confirmaram `weak_password` ao salvar: Supabase exige seis caracteres, mas o SGF permitia quatro para Servidor. Mínimo alinhado em frontend/backend (seis; oito para Administrador), mantendo compatibilidade de login existente. Recusas `weak_password` e `same_password` agora retornam orientação específica, sem retirar a troca obrigatória. Suíte local: 227 testes aprovados. A troca real da senha pessoal continua pendente de confirmação do usuário.

1. [x] Investigar o erro ao salvar: Auth registrou `/recover` com sucesso e `/verify` aceito três minutos depois; não há evidência de expiração naquele primeiro clique. O frontend tratava qualquer ausência de sessão como link expirado.
2. [x] Inicializar o cliente após o estado da aplicação e aguardar explicitamente `setSession` no retorno de convite/recuperação antes de carregar o perfil e exibir o formulário. Remover tokens da URL, limpar contexto anterior e não reutilizar sessão de outra conta em callback inválido.
3. [x] Bloquear formulário sem sessão válida e distinguir falha de sessão de expiração. Executar seis testes novos de callback; suíte local completa com 225 testes aprovados, sintaxe e build estático conferidos.
4. [x] Publicar commit `7fa2353` no GitHub/main e conferir página e JavaScript no domínio Vercel com HTTP 200 e versão `20261007-recovery-2`. Novo envio registrado pelo Supabase em 07/10 às 15:56 BRT; confirmação do backend não comprova recebimento na caixa postal.
5. [ ] Validar com o usuário abrir somente o e-mail mais recente, salvar uma senha pessoal e entrar novamente. Ainda não declarar recuperação homologada.

#### Demais verificações do tópico

1. [x] Executar dez verificações reais SQL de cadastro/aprovação: duas matrículas, três atuações, pessoa única, normalização de e-mail, quatro papéis, escopo, autoria e bloqueios de duplicidade/dupla aprovação. Ensaio `registration-workflow-rehearsal.sql`, gerador com argumento `registration`, transação revertida; zero contas e pedidos das fixtures restantes.
2. [x] Corrigir resposta/erro atrasado do catálogo público para não sobrescrever login/início; duas cargas concorrentes preservam a mais recente. Três testes executáveis de regressão.
3. [ ] Executar cadastro público e administrativo completo pelas Edge Functions/interface, incluindo primeiro acesso, contextos nos quatro perfis e revogação/desativação durante sessão. O ensaio SQL não cria senha nem comprova entrega de e-mail.
4. [ ] Validar recuperação com e-mail acessível: conta fictícia explicitamente autorizada criada em 07/10, identificada como TESTE, matrícula `TESTE-RECUPERACAO-20261007`, perfil somente Servidor, um vínculo e equipe Não se aplica. Fluxo público de pedido/aprovação e login por e-mail com senha provisória executados online; troca obrigatória confirmada. Pedido de recuperação aceito pelo backend. Aguardando usuário confirmar recebimento, usar o link, escolher nova senha e validar novo login. Não remover a conta antes de concluir; não considerar o tópico inteiro homologado.

### Conferência do ambiente publicado — 07/10/2026

1. [x] Conferir no Supabase os releases `multi_unit_pilot_release`, `multi_unit_pilot_read_labels` e `calendar_planning_release`. Último release aplicado em 07/10, com `access-auth` v10, `manage-catalogs` v7 e `manage-operations` v7 ativas.
2. [x] Reexecutar os 11 cenários SQL de isolamento de acesso no banco compartilhado, em transação revertida: todos aprovados. Confirmar nenhuma conta técnica restante, 48 CNES, 176 equipes e um vínculo existente preservado; todas as tabelas públicas com RLS habilitada.
3. [x] Disponibilizar o piloto atual no Vercel. **Situação: candidato de homologação em desenvolvimento, não versão final homologada.** Publicar migrations não conclui funcionalidades ainda ausentes.
4. [ ] Homologar de ponta a ponta cadastro com múltiplos vínculos → aprovação → primeiro acesso → distribuição diária → decisão por unidade → inclusão explícita no calendário.
5. [x] Integrar ajuste automático por feriado com períodos, responsabilidades e avisos, preservando início e quantidade de dias. Casos legados sem contagem conhecida, sobreposição ou perda de escopo exigem revisão; dias ambíguos exigem distribuição explícita. Ensaio SQL real: 16 verificações aprovadas antes e depois da aplicação.
6. [x] Implementar redistribuição pendente para titular do vínculo, RH no próprio escopo e Administrador; criar revisão para unidade nova, retirar revisão vazia somente se pendente e preservar snapshot na auditoria. Oito verificações SQL aprovadas. Decisões existentes impedem redistribuição silenciosa; ainda falta validar concorrência real e interface completa.
7. [ ] Conferir recuperação de senha no novo domínio, revisão visual e aceite institucional. Nenhuma mudança de usuário/senha ou limpeza de dados foi feita nesta conferência.

### Entrega de calendário e redistribuição — 07/10/2026

1. [x] Corrigir edição de feriados por ID e versão, inclusive mudança de data, sem criar evento novo indevidamente.
2. [x] Serializar operações de calendário, envio, gestão e redistribuição por trava transacional compartilhada; rejeitar versões antigas. O teste sequencial não comprova concorrência entre conexões.
3. [x] Exibir dias sem responsável e motivo de revisão no detalhe da solicitação; bloquear aprovação/inclusão quando o calendário exige revisão.
4. [x] Restringir retorno da recuperação a URLs explicitamente permitidas; padrão `https://sgfbetim.vercel.app/`. Campo de recuperação aceita CPF/e-mail com até 160 caracteres e mantém login administrativo legado.
5. [x] Executar 216 testes locais, análise de sintaxe e build estático. Reexecutar no PostgreSQL 16 verificações de calendário, oito de redistribuição e 17 de gestão, em transações revertidas. Confirmar zero usuários/pedidos das fixtures restantes.
6. [x] Consultar Security Advisor após aplicação: sem alertas ERROR; 14 INFO de tabelas fechadas ao navegador por desenho e aviso preexistente de proteção contra senhas vazadas desativada.
7. [ ] Validar duas sessões simultâneas, ciclo completo pela interface e revisão visual de todas as telas.
8. [x] Conferir e configurar Site URL/Redirect URLs no Supabase após autenticação e autorização do responsável: `https://sgfbetim.vercel.app/`, único retorno autorizado e sem curingas. Ainda falta testar recebimento/uso do e-mail; não considerar recuperação homologada somente pela configuração.
9. [ ] Concluir aceite institucional, reconstrução em banco vazio e restauração de backup. Permanecem dependências dos blocos 10–12.
10. [x] Versionar e enviar a entrega ao GitHub: commit `345349d67b6c3cd66fad2a033ef18244fecc0dd9`, em `main`, sem incluir a alteração local de `logo.png`.
11. [x] Liberar publicação Vercel: bloqueio causado pelo e-mail Git local não associado à conta GitHub. Configurada apenas neste repositório a identidade já usada no deploy anterior; commit adicional `3e2675c`, sem reescrever histórico. Deploy `dpl_EJVkxq61Lv1v5PSYA1HVZ26B2XEU` **READY**, produção `https://sgfbetim.vercel.app/`. Bloqueios anteriores preservados no histórico.
12. [x] Validar login administrativo, fila de solicitações e carregamento da escala mensal publicada, com legenda, feriados, filtros, conflitos manuais e escala mínima. Corrigir condição visual que ocultava o editor de redistribuição do RH, apesar da permissão no backend; cobrir essa condição no teste de regressão. Reexecutar os 216 testes locais: aprovados. Ausência de pedidos impede validar decisões/detalhes completos sem fixtures adicionais; carregamento não comprova gravação desses formulários.

### Bloco concluído: ensaio real de gestão por unidade — 07/10/2026

1. [x] Executar 17 verificações no PostgreSQL usando `service_role` e contexto de RH/Administrador, com fixtures integralmente revertidas.
2. [x] Confirmar aprovação independente por unidade, sem inclusão automática no calendário; agregado permanece em análise enquanto outra unidade estiver pendente.
3. [x] Confirmar inclusão explícita somente após aprovação; agregado somente fica programado quando todas as unidades forem adicionadas.
4. [x] Recusar decisão de RH fora da própria diretoria, mesmo compartilhando CNES; rejeitar versão desatualizada sem criar notificação adicional.
5. [x] Validar recusa obrigatoriamente justificada, saldo insuficiente consistente e persistência de código/rótulo/horas informadas.
6. [x] Confirmar autoria, CNES, versões e auditoria das cinco decisões executadas; confirmar aviso da recusa ao titular.
7. [x] Guardar ensaio reproduzível em `tests/unit-workflow-rehearsal.sql` e gerador transacional em `scripts/prepare-workflow-rehearsal.mjs`. Não é seed nem migration.
8. [ ] Validar o mesmo fluxo pela interface e duas sessões simultâneas. Conflito de versão sequencial não é prova de ausência de deadlocks em concorrência real.

### Publicação do piloto compartilhado — plano vigente em 07/10/2026

Este bloco substitui as restrições locais e o plano de três bancos descritos historicamente abaixo. Não houve contratação de plano pago nem clonagem de bancos.

1. [x] Guardar snapshot parcial pré-migração em `.sgf-backups/20261007-pre-upgrade/`, ignorada pelo Git: dados públicos, usuários/identidades Auth, funções, colunas, constraints, índices, políticas, triggers e sete Edge Functions antigas. Não equivale a dump integral restaurável; não inclui sessões, Storage, Vault ou configurações do projeto.
2. [x] Ensaiar e aplicar as sete migrations no release remoto `multi_unit_pilot_release`, mais correção `multi_unit_pilot_read_labels`. Preservados os dois perfis e o servidor existentes; um vínculo/atuação migrado, 176 equipes e 48 CNES. Nenhuma solicitação existente foi removida.
3. [x] Publicar `access-auth`, `manage-access`, `manage-profiles`, `manage-catalogs`, `manage-inclusions`, `manage-operations` e `submit-request`, incluindo dependências compartilhadas.
4. [x] Incorporar hotfixes compatíveis: senha provisória `123456`, troca obrigatória, bloqueio da provisória como senha definitiva e mensagem de falha no envio de recuperação. Aprovar acesso adicional não redefine senha existente.
5. [x] Validar 213 testes locais e 11 testes reais SQL de RLS antes/depois da aplicação, com fixtures revertidas. Confirmar online login administrativo, listas de perfis/acessos/catálogos/inclusões e consulta completa do painel. Correção de leitura de rótulos não concede escrita no navegador.
6. [x] Consultar Security Advisor: sem erros estruturais; tabelas somente de serviço permanecem fechadas ao navegador por desenho. Proteção de senhas vazadas segue desativada e exige plano compatível.
7. [x] Publicar frontend no Vercel, substituindo a dependência dos créditos do Netlify: **https://sgfbetim.vercel.app**, projeto `sgfbetim`, ligado ao `main` do GitHub. Deploy Ready `dpl_4GwGjB3UYc9ovCkBtKcYME5ubvtV`, commit `49ffd32`. Build estático em `dist`; 213 testes aprovados, cabeçalhos de segurança presentes, assets HTTP 200 e documentos/configurações internos HTTP 404. Histórico do bloqueio anterior abaixo preservado para rastreabilidade.
   - [x] Sincronizar `main` no GitHub pela API, sem force-push: commit `a62d4f4f7423b2b634df3020debf83dd77d205f4`, com o `main` anterior como pai. Árvore publicada `50e67204001901be621f380b5d28f224cda7c90f` idêntica à árvore local preparada; 74 arquivos alterados enviados, sem backups ou alteração local de `logo.png`. As falhas de push abaixo são históricas; o bloqueio do GitHub foi contornado pela API.
   - Commits locais `274ebcb` (piloto) e `6fa8b5d` (integração do histórico estável) prontos. Três tentativas de push no `main` recusadas pelo GitHub com `Internal Server Error`, inclusive usando HTTP/1.1; remoto conferido ainda em `52742f8`. Não houve force-push.
   - Netlify ainda publica `a786d982`, deploy `6abd412661ee2500085fef27`. Conector disponível apenas para consulta de deploy e navegador com timeout; não foi possível publicar por esses caminhos. Preparar pacote estático `../SGF-piloto-20261007.zip` para publicação manual no projeto existente. Não testar o site antigo contra o banco novo.
   - Diagnóstico confirmado posteriormente no painel: a equipe Paicheco esgotou os créditos de publicação. Deploys de produção estão pausados; botão Trigger deploy desabilitado e publicações anteriores marcadas como `Skipped due to account credit usage exceeded`. ZIP/manual não contorna o limite. Aguardar novo ciclo ou responsável reativar créditos/plano; nenhum upgrade contratado. Evidência local em `.sgf-backups/netlify-credit-block.jpg`, fora do Git. Nova tentativa de push também recusada pelo GitHub com erro interno.
8. [ ] Homologar cadastro/aprovação/primeiro acesso e solicitações com os múltiplos vínculos no site atualizado. Login administrativo e carregamento do painel confirmados no navegador Vercel em 07/10; sem erros de console nesse teste. Conferir URL do site e redirects do Supabase Auth para recuperação de senha no novo endereço Vercel.
9. [ ] Validar as três ações de gestão, avisos, auditoria, concorrência e calendários; aplicação do DDL não encerra essas pendências.
10. [ ] Retomar os blocos funcionais seguintes após disponibilizar este piloto.

Os itens abaixo descritos como “somente local” são históricos de implementação: código/DDL já disponibilizados conforme este bloco, mas seus testes de fluxo ainda permanecem pendentes. As pastas `SGF-homologacao-*` continuam snapshots bloqueados, sem bancos próprios. O workspace atual segue como fonte do desenvolvimento. Não operar a versão legada contra o banco novo.

### Histórico da separação dos ambientes — plano suspenso em 07/10/2026

O plano abaixo foi suspenso em favor do piloto compartilhado. Seus itens não são pendências ativas: as cópias locais ficam preservadas e bloqueadas, sem contratação ou criação de bancos novos.

1. [x] Conferir a base estável: HEAD de `../SGF-estavel` corresponde ao `main` remoto, commit `52742f88e5776f457e55f26024090b5080c1a56a`; checkout estável sem alterações.
2. [x] Preparar `../SGF-homologacao-estavel` e `../SGF-homologacao-novo` com os arquivos estáveis e de desenvolvimento, incluindo alterações locais e arquivos novos. São snapshots sem repositório Git, sem `.env`, `.vscode`, cache, `dist` e configuração de deploy Netlify.
3. [x] Remover URL/chave de produção do ponto de conexão das cópias e bloquear sua inicialização até configurar bancos próprios. Não publicar essas cópias enquanto bloqueadas. Configurações de deploy serão recriadas para cada destino.
4. [ ] Decidir infraestrutura: organização está no plano Free, com limite de dois projetos ativos. Três ambientes simultâneos na nuvem exigem plano pago; alternativa é uma homologação com Supabase local. Consulta `get_cost` indisponível no conector; custo ainda não aprovado.
5. [ ] Criar destinos independentes e realizar backup lógico consistente da origem. Clonar estrutura, dados e usuários de autenticação, sem reutilizar sessões, chaves API, SMTP, webhooks, rotinas externas ou credenciais de produção. Inventariar Vault/Storage antes de restaurar; não armazenar dumps com dados pessoais no Git.
6. [ ] Restaurar e conferir contagens, relacionamentos, permissões, funções, configurações de Auth/Realtime/Storage e bloqueio de e-mails reais. Nenhum banco foi clonado ou migration aplicada nesta preparação.
7. [ ] Aplicar as migrations novas somente na homologação nova; manter a homologação estável compatível com produção.
8. [ ] Configurar frontends e destinos de hospedagem separados, identificar visualmente cada ambiente e validar logins/CRUD/isolamento.
9. [ ] Continuar os blocos abaixo na homologação nova após comprovar isolamento; validar concorrência, avisos, calendários e auditoria antes de considerar concluídos.

As cópias são snapshots de preparação, não ambientes operacionais nem backups do banco. O workspace atual permanece como fonte do piloto compartilhado.

### Manutenção da versão estável — 06/10/2026

- [x] Separar a correção de acesso na pasta `../SGF-estavel`, branch `codex/stable-access-fix`, baseada na versão publicada.
- [x] Padronizar somente na estável a senha provisória `123456` para criação, aprovação de conta nova e reset administrativo, com troca obrigatória.
- [x] Corrigir o retorno de falhas no envio de recuperação de senha e validar a atualização do indicador de primeiro acesso.
- [x] Publicar as três Edge Functions compatíveis com o banco legado; nenhuma migration do novo modelo foi aplicada.
- [x] Validar online solicitação, aprovação, primeiro login, troca obrigatória e reset administrativo; remover a conta técnica temporária após a validação.
- [x] Versionar o hotfix separadamente no GitHub (`main` remoto), preservando o desenvolvimento na branch local `codex/multi-unit-development`.
- [ ] Publicar o frontend estável no Netlify: o site ainda serve o deploy anterior e não disparou publicação automática pelos pushes. Pacote pronto: `../SGF-estavel-publicacao.zip`.
- [x] Incorporar os hotfixes compatíveis à versão em desenvolvimento.
- Banco independente e publicação do frontend legado substituídos pelo piloto compartilhado autorizado em 07/10.

A manutenção legada acima é histórica. A autorização de 07/10 permite publicar o novo modelo no piloto compartilhado.

**Em execução:** interface administrativa e consulta de redistribuição diária preparadas localmente, integradas à alteração justificada. Somente entre unidades já participantes e com todas as análises pendentes. Próximas frentes: permissões de servidor/RH, revisão de unidades novas/removidas e decisões existentes, demais avisos e auditoria integral. SQL e revisão visual em homologação ainda pendentes. Revisão parcial de 06/10/2026.

### Blocos agrupados — ordem de continuidade

1. [x] Preparar localmente identidade autenticada na gravação → auditoria da distribuição inicial → registro/avisos de redistribuição → alertas de confirmação/cancelamento que afetem outros pedidos → testes e documentação. Executar SQL e homologar antes de considerar o bloco operacionalmente concluído.
2. [ ] Completar edição segura da distribuição após envio, com autorização, justificativa, concorrência, integridade dos dias/revisões e tratamento das decisões existentes; completar avisos de reprogramação, mudanças de períodos e demais eventos.
3. [ ] Completar auditoria de cadastros, acessos/inclusões, permissões, banco de horas e alterações operacionais ainda não cobertas.
4. [ ] Completar separação final das áreas/permissões; intervalo livre no calendário e seletor de atuação para recusas por CNES preparados localmente, ainda requerem homologação.
5. [ ] Completar direitos/saldos por vínculo, catálogo organizacional, migração e reconciliação de históricos e hotfixes compatíveis.
6. [ ] Homologar decisões institucionais, referências e regras com RH/Jurídico.
7. [ ] Testar concorrência/notificações e revisar visualmente todos os fluxos no piloto compartilhado já autorizado e atualizado. Banco independente permanece plano futuro, não bloqueio do piloto atual.
8. [ ] Fazer revisão final de segurança, ambientes, documentação e aceite institucional. Versionamento e publicação técnica já autorizados; isso não constitui aceite para uso institucional.

### Acompanhamento enumerado

1. [x] Fundação de pessoa, múltiplos vínculos, CNES, lotações e equipes.
2. [x] Pedido público e cadastro administrativo com múltiplos vínculos/CNES.
3. [x] Login por CPF/e-mail e escolha de perfil, vínculo e contexto ativo.
4. [x] Validação server-side e RLS do contexto ativo nas funções operacionais atuais.
5. [x] Distribuição diária da solicitação entre os CNES responsáveis.
6. [x] Gestão simplificada: Aprovar, Recusar e Adicionar ao Calendário, com revisão independente por CNES.
7. [ ] Calendários independentes por CNES/lotação, notificações e visualização consolidada.
8. [ ] Conflitos filtráveis e conflitos manuais justificados.
9. [ ] Auditoria integral do ator, papel, vínculo, CNES e lotação.
10. [ ] Recusas estruturadas, regras normativas e referências homologadas.
11. [ ] Migração integral, base demonstrativa, testes em Supabase local e homologação.
12. [ ] Revisão final, versionamento no GitHub e publicação — somente após autorização.

### Entrega local atual

- [x] Criar a migration retrocompatível `20261005112507_multi_unit_employment_foundation.sql`.
- [x] Separar o catálogo de CNES das lotações administrativas sem remover os campos legados.
- [x] Criar vínculos funcionais e atuações vínculo/CNES com vigência e carga horária próprias.
- [x] Criar a associação de uma única equipe por atuação vínculo/CNES, incluindo Não se aplica.
- [x] Migrar localmente, pela própria migration, os registros legados para a nova estrutura.
- [x] Ativar RLS, revogar acesso público e reservar as novas tabelas às funções confiáveis do servidor.
- [x] Acrescentar vínculo, CNES, lotação, papel e justificativa ao contexto disponível para auditoria.
- [x] Adicionar testes estruturais e comportamentais dos novos fluxos; suíte local com **209 testes aprovados**.
- [x] Implementar localmente Banco de Horas Insuficiente, Conflito com Funcionário e Outros na recusa por CNES, com campos condicionais e validação frontend/Edge Function/SQL.
- [x] Registrar código, rótulo histórico, dados específicos e justificativa da recusa; apresentar ao servidor e preservar na auditoria/notificações. Não alterar saldo automaticamente.
- [ ] Executar o SQL e validar visualmente recusas por unidade em homologação. Os testes atuais combinam validação executável e verificações estruturais do SQL.
- [x] Implementar tela administrativa do catálogo: criar/editar nome e ordem, ativar/desativar, justificar alteração, preservar código/modo e decisões históricas. Preparar gravação atômica auditada, versão concorrente e proteção do último motivo ativo.
- [ ] Executar SQL, testar concorrência real e validar visualmente o catálogo em homologação. A verificação atual da transação SQL é estrutural.
- [x] Adaptar localmente recusas do fluxo legado de chefia/RH aos mesmos motivos e campos obrigatórios; persistir código, rótulo histórico e dados na etapa, apresentar no acompanhamento e registrar autoria/justificativa/auditoria.
- [x] Encaminhar decisões legadas pela Edge Function com identidade autenticada; preparar isolamento pela lotação legada, ordem das etapas, versão concorrente e bloqueio de uso para pedidos do novo modelo por CNES. Revogar a antiga RPC e a edição direta das etapas pelo navegador na migration local.
- [ ] Executar SQL e validar recusas legadas, reenvio/devolução, permissões, notificações e concorrência reais em homologação; não marcar a padronização integral como concluída.
- [x] Preparar seletor de atuação na recusa por CNES: nome, matrícula, cargo e unidade; consulta restrita às revisões gerenciáveis, validação do identificador no servidor e conferência SQL do CNES/lotação, situação ativa e vigência completa. Nome histórico resolvido pelo banco, não pelo texto enviado pelo navegador.
- [ ] Homologar o seletor com múltiplos CNES, diretorias de CNES compartilhado e desativação concorrente; no fluxo legado, manter nome declarado até existir associação de atuação comprovável.
- [x] Separar localmente os canais de avisos de Servidor, Diretor, RH e Administrador; leitura e marcação como lida validam destinatário e contexto ativo.
- [x] Criar consulta local do histórico com paginação, período, evento, autor, registro afetado e vínculo; Administrador possui filtros adicionais de CNES/lotação.
- [x] Restringir RH/Diretor ao escopo ativo e a um resumo dos eventos, sem retornar payloads completos de cadastros. Remover campos de senha, tokens e chaves dos detalhes administrativos.
- [x] Preparar preenchimento de papel/contexto em novos eventos de auditoria apenas quando comprovável; não inferir contexto histórico ausente.
- [x] Corrigir as gravações recentes de escala mínima/conflitos para usar `previous_value`, nome real da coluna de auditoria, em vez de `old_value`.
- [ ] Executar o preenchimento de auditoria e a consulta em banco de homologação, revisar todas as mutações e validar visualmente o histórico.
- [x] Preparar disparos de criação/decisão da revisão de unidade e criação/encerramento de conflitos manuais, com chave de evento para evitar duplicação por destinatário/perfil/escopo.
- [x] Preparar avisos de feriado/ponto facultativo alterado, desativado ou movido, considerando datas antiga/nova e retorno; não modificar decisões registradas automaticamente.
- [ ] Executar os triggers e validar destinatários, duplicidade, permissões e navegação dos avisos em banco de homologação; os testes SQL atuais são estruturais.
- [ ] Classificar avisos antigos de gestão que não possuem escopo confiável. Permanecem preservados no banco, mas ocultos nos canais de RH/Diretor até reconciliação; avisos pessoais legados e administrativos identificáveis são preservados nos respectivos canais.
- [x] Preparar avisos da escala mínima a partir da auditoria da gravação: gestão do CNES/lotação, atuações incluídas/retiradas e titulares de solicitações coincidentes com o dia/distribuição/revisão do mesmo escopo. Não expor listas de colegas nos avisos pessoais nem alterar decisões/saldos.
- [x] Suprimir avisos por regravação da mesma composição/origem, preservando aviso do primeiro dia explicitamente vazio. Usar chaves por evento, vínculo e escopo para deduplicação e separar aviso pessoal do canal de gestão.
- [ ] Executar SQL dos avisos da escala mínima e testar destinatários, deduplicação, eventos vazios, origem do ciclo e concorrência em homologação; os cinco novos testes são estruturais.
- [x] Preparar registro/avisos de alterações posteriores de responsabilidade nos escopos anterior/novo, com autoria autenticada, antes/depois, deduplicação por transação/pedido/escopo e sem reinterpretar exclusão em cascata como redistribuição.
- [x] Preparar alertas de afastamento confirmado/cancelado para outros pedidos com dias coincidentes no mesmo CNES/lotação, excluindo a própria pessoa, feriados, fins de semana e aniversários conforme as regras locais atuais. Alertas de coincidência não são impedimentos ou recusas automáticas.
- [x] Encaminhar papel/contexto/ator validados na gravação de solicitação; rejeitar contas desativadas e preparar auditoria inicial dos dias agrupada por pedido/CNES/lotação, sem repetir avisos de nova revisão.
- [ ] Executar os novos triggers e validar autoria, destinatários, duplicação, transações e concorrência em homologação; os sete novos testes são estruturais, não execução do SQL.
- [x] Preparar RPC/Edge Function administrativa de redistribuição de um dia existente entre unidades já participantes: todas as revisões pendentes, atuação autorizadora ativa/vigente do mesmo vínculo, justificativa obrigatória, versão da distribuição e invalidação de versões das revisões. Não deixar um CNES sem dias nem criar/remover revisões nesta fase. Testes SQL estruturais, ainda sem execução em banco.
- [x] Preparar interface administrativa de redistribuição no detalhe do pedido, consulta da versão atual e candidatos por dia, mensagens de bloqueio/sem alternativa, nomes escapados, justificativa e recarga após salvar. Candidatos restritos ao vínculo, vigência e revisões existentes; esconder atuação atual e impedir esvaziar unidade nesta fase.
- [ ] Definir e implementar autorização específica do servidor/RH, criação/remoção de revisões e tratamento de análises já decididas. Interface atual restrita ao Administrador; não habilitar edição direta das tabelas.
- [ ] Homologar a redistribuição com concorrência real, auditoria e notificações em banco independente. Os triggers preparados não habilitam edição direta.
- [ ] Completar avisos de mudanças de períodos, reprogramações e outros eventos de afastamento que afetem análises existentes, além de confirmação/cancelamento já preparados.
- [x] Corrigir a redistribuição para gravar atuação, CNES e lotação juntos; preparar avisos aos pedidos coincidentes nos escopos antigo/novo, com deduplicação por transação/pedido/contexto, exclusão da própria pessoa, feriados, finais de semana e aniversários. Não revelar nomes de colegas nos avisos.
- [x] Preparar proteção SQL contra uso da rotina legada de reprogramação/decisão global em pedidos por CNES. Permitir somente cancelamento global pelo Administrador, sem mudança de períodos; manter a rotina interna legada no schema privado. Alteração de períodos só aceita na operação legada de reprogramação.
- [ ] Homologar atualização conjunta dos campos de distribuição, destinatários nos escopos antigo/novo e proteção contra chamadas legadas diretas. A reprogramação por CNES e seus avisos continuam pendentes, não substituídos pelo bloqueio preventivo.
- [x] Implementar localmente conflitos manuais por CNES/lotação, período e atuação opcional; exigir justificativa, registrar autoria e destacar os dias no calendário.
- [x] Resolver/cancelar conflitos sem apagar o histórico, com motivo obrigatório, autoria de encerramento, versão concorrente e auditoria antes/depois.
- [ ] Executar o SQL dos conflitos manuais e validar visualmente criação, escopos, encerramento e concorrência em homologação; a cobertura SQL atual é estrutural.
- [x] Corrigir os conflitos automáticos: cargo, equipe, cargo e equipe, função ou simultaneidade na unidade, respeitando o recorte visível e o CNES/lotação interna.
- [x] Exibir critério, nomes envolvidos e data no detalhamento do dia; Não se aplica e campos ausentes não criam conflitos por equipe/função.
- [x] Carregar o calendário por vínculo/atuação, com os dias atribuídos ao CNES e isolamento entre lotações internas que compartilham CNES.
- [x] Separar a visão padrão de afastamentos confirmados da visão de planejamento; aprovação não confirma a ausência.
- [x] Disponibilizar filtro CNES/unidade, rótulos de confirmação e acesso por teclado aos pedidos no calendário.
- [x] Testar projeção por unidade, isolamento do RH, vigência, cancelamentos e compatibilidade de pedidos legados, sem expor CPF no retorno do calendário.
- [ ] Validar visualmente o novo calendário em homologação e testar consultas/RLS em banco real; os testes locais não substituem essa validação.
- [x] Adaptar localmente leitura, seleção nominal e gravação da escala mínima por atuação vínculo/CNES/lotação interna, preservando o último ciclo semanal e dias explicitamente vazios.
- [x] Preparar gravação atômica com validação de escopo, vigência, afastamento confirmado, versão concorrente e auditoria anterior/posterior; Diretor consulta sem editor de escala mínima.
- [ ] Executar em homologação a nova gravação e os testes reais de concorrência/RLS; os testes de SQL atuais são estruturais, não execução do banco.
- [ ] Converter o histórico das escalas mínimas legadas para atuações sem atribuições ambíguas. Os registros antigos estão preservados, mas ainda não são exibidos pelo novo editor.
- [ ] Validar conflitos cruzados entre inclusão de afastamento e edição simultânea da escala mínima, além de afastamentos legados.
- [x] Importar e relacionar localmente o catálogo de 176 equipes aos CNES oficiais, mantendo duas eMulti sinalizadas para conferência.
- [x] Adaptar o pedido público de acesso e sua aprovação para escrever e ler vários vínculos/CNES de forma atômica.
- [x] Disponibilizar CNES, cargos, tipos de equipe, equipes e lotações internas por uma rota pública controlada da Edge Function.
- [x] Permitir login e recuperação por CPF ou e-mail, preservando temporariamente o alias administrativo legado.
- [x] Adaptar o cadastro manual administrativo para os mesmos dados e validações de múltiplos vínculos/CNES do pedido público.
- [x] Exibir e persistir na sessão a escolha combinada de perfil, vínculo, CNES e lotação após o login.
- [x] Validar o contexto escolhido no servidor e aplicá-lo às funções atuais de solicitações, operações, escala, cadastros, acessos, inclusões e perfis.
- [x] Tornar a política RLS de servidores e solicitações sensível ao CNES/lotação ativos, sem confiar apenas no papel informado pelo navegador.
- [x] Registrar vínculo, CNES e lotação de origem nas novas solicitações sem quebrar a compatibilidade com o cadastro legado.
- [ ] Executar as migrations em Supabase local para validar o SQL e permitir a revisão visual integral; a máquina atual não possui CLI/Docker disponíveis.

**Ordem de dependência:**

`01. Conceitos e dados → 02. Pessoa e vínculos → 03. CNES, lotação e equipes → 04. Cadastro e login → 05. Solicitação por dia/CNES → 06. Gestão e calendário → 07. Conflitos → 08. Auditoria → 09. Regras e mensagens → 10. Migração e testes → 11. Homologação → 12. Publicação`

O modelo atual mantém matrícula, lotação e equipe diretamente em um único registro de servidor. Isso não comporta corretamente uma pessoa com várias matrículas, unidades, cargas horárias ou responsáveis por aprovação. A alteração, portanto, será estrutural e não apenas visual.

## 01. Consolidar conceitos e regras institucionais — em andamento

### Definições já consolidadas

- [x] Usar o **CPF** como identidade principal da pessoa e o e-mail como identificador alternativo de login.
- [x] Tratar a **matrícula** como identificador do vínculo funcional, e não da pessoa.
- [x] Permitir que uma pessoa tenha várias matrículas e que cada vínculo atue em um ou mais CNES/unidades.
- [x] Permitir que cada CNES cadastrado seja responsável pela autorização dos dias correspondentes de uma solicitação.
- [x] Permitir somente uma equipe por combinação vínculo/CNES.
- [x] Manter a opção **Não se aplica** para funções administrativas ou sem equipe assistencial.
- [x] Separar os conceitos:
  - **CNES/unidade:** estabelecimento responsável pela atuação e aprovação;
  - **lotação interna:** subdivisão administrativa disponível somente dentro de uma Secretaria;
  - **unidade polo:** referência opcional do vínculo, sem substituir os CNES de atuação;
  - **equipe:** eSF, eMulti, eSB, eAPP, eCR ou Não se aplica.

### Decisões ainda necessárias antes da migração definitiva

- [x] Adotar uma mesma matrícula com várias unidades, conforme o fluxo solicitado pelo usuário; matrículas diferentes continuam sendo vínculos diferentes. Validar a operação com responsáveis institucionais sem reabrir a decisão de produto.
- [ ] Definir a regra para um dia em que duas unidades sejam simultaneamente responsáveis pela jornada do servidor.
- [x] Adotar uma solicitação principal com análises independentes por CNES/lotação e estado agregado, conforme o modelo implementado. Homologação operacional permanece no passo 11.
- [ ] Confirmar os códigos oficiais das equipes `EMULTI 004 BUENO FRANCO` e `EMULTI 018 VILA CRISTINA`, que vieram sem o código numérico final no arquivo fornecido.

## 02. Remodelar pessoa, vínculos e atuações — fundação local concluída

- [x] Manter a identidade de autenticação no perfil, com CPF e e-mail normalizados e únicos por pessoa.
- [x] Separar o cadastro atual em entidades equivalentes a:
  - **pessoa/servidor:** nome, CPF, e-mail, data de nascimento e dados comuns;
  - **vínculo funcional:** matrícula, cargo, jornada, tipo de vínculo, admissão, situação e unidade polo opcional;
  - **atuação do vínculo:** CNES/unidade, carga horária na unidade, situação e responsabilidade de aprovação;
  - **equipe da atuação:** uma equipe por vínculo/CNES, incluindo Não se aplica.
- [x] Remover no novo modelo a limitação de uma única matrícula, lotação e equipe por servidor, preservando os campos legados durante a transição.
- [x] Criar chaves de unicidade que impeçam CPF, e-mail, matrícula e combinações vínculo/CNES duplicados de forma indevida.
- [x] Registrar início e fim de vigência dos vínculos, atuações e equipes para preservar o histórico quando o servidor mudar de unidade.
- [ ] Associar direitos, períodos aquisitivos e banco de horas ao vínculo correto, evitando saldos duplicados quando a pessoa atuar em mais de um CNES.
- [x] Criar índices para CPF normalizado, e-mail normalizado, matrícula, vínculo, CNES, lotação, equipe e períodos de vigência.
- [x] Aplicar RLS e funções de serviço para que o navegador não consiga ampliar vínculos, escopos ou permissões diretamente.

## 03. Estruturar CNES, Secretarias, lotações e equipes

- [ ] Separar no catálogo os tipos **Secretaria**, **lotação interna de Secretaria** e **CNES/unidade de saúde**.
- [x] Permitir lotação interna somente quando o registro pai for uma Secretaria.
- [ ] Tratar UBS e demais unidades assistenciais como a própria lotação, sem exigir uma subdivisão paralela.
- [x] Permitir que lotações internas distintas compartilhem o mesmo CNES quando pertencerem a uma Secretaria.
- [ ] Revisar os escopos dos perfis para apontarem explicitamente para CNES e, quando aplicável, para lotação interna.
- [x] Criar catálogo de tipos de equipe: eSF, eMulti, eSB, eAPP, eCR e Não se aplica.
- [x] Criar catálogo de equipes relacionado ao CNES, contendo código, nome oficial, tipo, situação e origem dos dados.
- [x] Importar as **176 equipes** fornecidas: 114 eSF, 18 eMulti, 41 eSB, 2 eAPP e 1 eCR.
- [x] Relacionar os nomes do anexo aos CNES oficiais existentes sem criar unidades duplicadas por diferenças de grafia.
- [x] Filtrar equipes pela unidade escolhida e bloquear combinações incompatíveis no frontend e no servidor.
- [x] Preparar a importação idempotente em migration local, com validação automática das 176 equipes e dos dois registros pendentes.
- [ ] Preencher os códigos INE de `EMULTI 004 BUENO FRANCO` e `EMULTI 018 VILA CRISTINA` após confirmação institucional.

## 04. Refazer cadastro, primeiro acesso e login

- [x] Usar o mesmo fluxo conceitual no pedido de acesso e no cadastro manual administrativo:
  - **01. Dados pessoais:** nome, e-mail, CPF e data de nascimento;
  - **02. Vínculos:** matrícula, cargo, jornada/tipo de vínculo e botão **+ Adicionar vínculo**;
  - em cada vínculo: unidade polo opcional, um ou mais CNES/unidades e uma equipe filtrada para cada CNES;
  - mostrar lotação interna somente se a unidade selecionada pertencer a uma Secretaria.
- [x] Permitir adicionar, editar e remover vínculos e unidades antes do envio sem perder os demais dados preenchidos.
- [x] Validar CPF, e-mail, matrícula e duplicidades igualmente no frontend e no servidor no novo pedido público.
- [x] Ao encontrar CPF já cadastrado durante a aprovação, acrescentar os novos vínculos à mesma pessoa em vez de criar outro servidor.
- [x] Permitir login por **CPF ou e-mail**, com resposta neutra para identificadores inexistentes.
- [x] Manter o intervalo mínimo de três segundos entre envios de login, sem limite cumulativo de tentativas, e manter proteção adicional no servidor contra abuso automatizado.
- [x] Permitir recuperação de acesso por CPF ou e-mail sem revelar se a conta existe.
- [x] Após o login, exibir em uma escolha combinada o **perfil de acesso** e o contexto ativo: vínculo/matrícula, CNES e lotação interna quando aplicável.
- [x] Permitir troca de perfil e contexto durante a sessão sem novo login; a validação do contexto em cada operação de backend continua no passo 06.
- [x] Mostrar no cabeçalho o papel, cargo e CNES/lotação atualmente ativos para evitar ações no contexto errado.

## 05. Vincular cada dia da solicitação ao CNES responsável — implementação local concluída

- [x] Carregar todos os CNES ativos do vínculo escolhido ao iniciar a solicitação.
- [x] Exibir primeiro a simulação/calendário do período e somente depois solicitar a distribuição dos dias entre os CNES autorizadores.
- [x] Permitir selecionar o CNES responsável por cada dia útil de afastamento.
- [x] Oferecer preenchimento rápido para todos os dias ou por dia da semana e permitir exceções manuais, atendendo escalas alternadas como as sextas-feiras do exemplo apresentado.
- [x] Exigir que todo dia de trabalho abrangido pela solicitação tenha exatamente um CNES responsável antes do envio.
- [x] Impedir atribuição em fins de semana, feriados e day-off; a jornada individual ainda depende da homologação institucional.
- [x] Validar no servidor se o vínculo, a atuação e o CNES estão ativos e pertencem à pessoa selecionada.
- [x] Armazenar a distribuição diária em entidade própria, sem depender apenas das datas inicial e final do período.
- [x] Registrar quem criou a solicitação e quem atribuiu a responsabilidade diária.
- [x] Exibir no comprovante as unidades responsáveis e os respectivos dias.
- [x] Implementar localmente aviso de nova análise para RH/Diretor do CNES/lotação responsável, com acesso validado por contexto; validar os disparos em homologação.

## 06. Simplificar gestão, aprovação e entrada no calendário — núcleo local concluído

### Bloco atual: permissões e áreas de acesso — 07/10/2026

- [x] Centralizar matriz explícita de ações nas funções de operações, catálogos, inclusões e acessos; ações desconhecidas e chaves herdadas são bloqueadas. Diretor mantém análise por CNES, mas não recebe escala mínima editável, banco de horas ou administração estrutural. Servidor só pode reenviar pedido próprio pelo fluxo legado permitido.
- [x] Revalidar papel concedido, conta ativa e senha obrigatória no banco a cada validação de contexto; rejeitar CNES/lotação desativados, contexto de gestão sem CNES e vínculo de outra pessoa ou pessoa desativada.
- [x] Unificar verificação do servidor afetado nas operações/inclusões, distinguindo lotações internas do mesmo CNES e atuações gerais sem lotação interna; retirar fallback que ampliava consulta por cadastro legado.
- [x] Restringir leitura e análise de pedidos de acesso pelo RH ao pedido inteiro dentro do contexto ativo, incluindo todas as unidades/vínculos e lotação interna. Pedidos mistos devem ser encaminhados ao Administrador; RH continua concedendo somente perfil Servidor.
- [x] Filtrar escolhas de atuação para remover unidades, CNES, lotações e pessoas desativados; não oferecer contexto de gestão sem mapeamento CNES válido.
- [x] Limpar dados de catálogos, acessos, inclusões, perfis, distribuição e escala mínima ao trocar contexto. Aplicar capacidades aos controles e guardas de clique/envio de formulários, sem substituir autorização no servidor.
- [x] Exercitar 11 novos testes executáveis/estruturais de fronteiras de acesso e validar sintaxe de seis Edge Functions. Suíte total: 206 testes aprovados.
- [x] Confirmar em ensaio SQL revertido que envio contextual, revisão CNES e escala mínima são executáveis por `service_role`, mas não por `anon` ou `authenticated`.
- [ ] Validar navegador com os quatro perfis, ações/retornos atrasados durante troca de contexto, políticas RLS completas e revogação/desativação concorrente em execução real. Testes simulados e conferência de grants não substituem essas verificações. Tópico ainda não homologado integralmente.
- [x] Corrigir RLS de pedidos para exigir revisão do CNES/lotação selecionados, não somente vínculo da pessoa com a unidade. Servidor lê seus pedidos do vínculo selecionado; bloquear papel nulo, pessoa/CNES/lotação desativados e gestão sem CNES. Revogar escrita direta do navegador em pedidos/períodos.
- [x] Executar 11 cenários no PostgreSQL do projeto com fixtures e papel SQL `authenticated`, não somente mocks: RH e Diretor isolados por lotação compartilhando CNES, Administrador consolidado, titular por vínculo, papel administrativo forjado, conta bloqueada, CNES inativo, CNES ausente e escopo revogado; conferir ausência de UPDATE direto pelo navegador. Transação integral revertida. Arquivo reproduzível: `tests/access-rls-rehearsal.sql`; executar somente após migrations dentro de transação revertida.
- [x] Inspecionar página inicial/login local no navegador e realizar login administrativo no backend atual. Confirmar bloqueio do painel: relação `vacation_requests`/`employment_bonds` ausente no banco legado. Não interpretar esse teste como homologação da interface interna do novo modelo.
- [x] Resolver ambiente integrado: novo modelo aplicado no Supabase compartilhado por autorização e frontend atualizado publicado no Vercel em 07/10. A inspeção dos quatro perfis e concorrência continua pendente; o antigo bloqueio do banco legado não existe mais no piloto atual.

- [x] Preparar matriz explícita de telas por perfil no frontend, aplicada à navegação e à renderização: Servidor nas telas próprias, Diretor na consulta/gestão, RH nas áreas operacionais e Administrador na administração global. Tratar senha obrigatória, perfil não escolhido, visitante e rota desconhecida; não substituir permissões/RLS do servidor por bloqueio visual.
- [ ] Homologar a matriz de telas, revisar botões internos/ações diretas e confirmar os limites das áreas operacionais de RH; a separação integral depende também das permissões do backend.
- [x] Esclarecer com o usuário o ajuste por feriado: preservar início e quantidade de dias de direito, recalcular fim/retorno e notificar o servidor; não tratar inclusão de feriado como nova solicitação. Reprogramação manual é uma operação distinta.
- [x] Preparar cálculo SQL interno que preserva a quantidade em dias úteis ou corridos, trata fins de semana, feriados e aniversário e limita varreduras. Verificar no PostgreSQL do projeto atual, via função temporária e rollback, cenários de 25 dias úteis, feriado adicional, feriado na extensão e dias corridos.
- [x] Preparar registro explícito de `counting_mode` nos períodos novos, desde o frontend até Edge Function/SQL; manter períodos antigos sem contagem comprovada como desconhecidos, sem inferir pelo tipo ou quantidade.
- [x] Confirmar regra dos dias acrescentados: unidade única elegível recebe automaticamente; com múltiplos escopos, usar escala funcional explícita da data; sem definição inequívoca, pendência ao RH. Notificar servidor, gestores dos CNES vinculados ao pedido e Administradores, não todos os usuários do sistema.
- [x] Preparar e testar seleção de responsáveis pelos dias novos, respeitando vínculo, vigência, unidade ativa/autorizadora e lotação interna. Não inferir sextas alternadas nem usar escala mínima ou férias anteriores como jornada habitual. Módulo puro ainda não integrado à persistência.
- [x] Preparar planejamento do pedido inteiro para inclusão/remoção de feriados: preservar início/direito e atribuições remanescentes, calcular dias retirados/acrescentados e retorno, identificar ausência de mudanças e separar dias pendentes de RH. Bloquear sobreposição de parcelas, contagem legada desconhecida e atuação existente inelegível, sem alterações parciais. Nove testes comportamentais; integração transacional e notificações continuam pendentes.
- [ ] Integrar ajuste por feriado à gravação do calendário, recalcular e persistir períodos/distribuições atomicamente, preservar histórico/decisões e notificar servidor/gestão. Tratar fracionamento com sobreposição e períodos legados sem contagem registrada antes de ativar. Cálculo temporário verificado não significa fluxo automático publicado.
- [ ] Dividir claramente as áreas de acesso:
  - **Servidor:** solicitar, acompanhar, corrigir quando permitido e emitir comprovantes próprios;
  - **Diretor/RH/Gestão:** analisar solicitações, conflitos, calendário e escala apenas dos próprios escopos;
  - **Administrador:** visão global, cadastros estruturais, acessos, correções, desativações, permissões e auditoria.
- [x] Reduzir as ações da gestão sobre cada revisão CNES a **Aprovar**, **Recusar** e **Adicionar ao Calendário**.
- [x] Criar estado explícito de solicitação aprovada, mas ainda não adicionada ao calendário.
- [x] Garantir que nenhuma ausência apareça como confirmada no calendário antes da ação **Adicionar ao Calendário**.
- [x] Implementar localmente calendário independente por CNES/lotação, com leitura compartilhada entre gestores do mesmo escopo; validar em banco de homologação.
- [x] Revalidar vínculo, escopo, transição e situação imediatamente antes de cada decisão.
- [x] Implementar controle de concorrência por versão para decisões simultâneas.
- [x] Tornar as transições idempotentes e bloquear cliques repetidos fora da ordem permitida.
- [x] Registrar o ator e o contexto ativo em aprovação, recusa e inclusão no calendário.
- [x] Definir e implementar estado agregado de solicitações com mais de um CNES: rejeitada, em análise, aprovada ou programada.
- [x] Preparar localmente avisos por nova revisão, decisão da revisão, feriado alterado e conflito manual criado/encerrado.
- [ ] Homologar avisos preparados de redistribuição, escala mínima e confirmação/cancelamento; completar mudanças de períodos/reprogramações e outros eventos que afetem o planejamento.

## 07. Tornar os conflitos filtráveis e permitir registro manual

- [x] Calcular localmente conflitos dentro do contexto e dos filtros escolhidos pelo gestor, sem confundir toda simultaneidade com conflito de cargo/equipe.
- [x] Combinar filtros por CNES, lotação, cargo, equipe, função, mês e situação; oferecer critérios de mesmo cargo, mesma equipe, cargo e equipe, mesma função ou simultaneidade na unidade.
- [x] Mostrar o critério usado, os servidores envolvidos e a data no detalhe do dia. Alertas não são impedimentos legais nem recusas automáticas.
- [ ] Validar os filtros e alertas visualmente com RH/Gestão em homologação; o cálculo automatizado já possui testes locais.
- [x] Preparar recorte por intervalo livre de até 93 dias, inclusive entre meses/anos, preservando visão mensal. Validar datas antes de consultar; reunir consultas mensais com escopo existente, deduplicar por atuação/pedido e filtrar conflitos manuais pelo intervalo. Resumos, foco diário e cabeçalhos acompanham o recorte.
- [ ] Homologar visualmente intervalos personalizados com RH/Gestão, validar consultas reais entre meses, escala mínima/ciclo e desempenho em dispositivos institucionais.
- [x] Corrigir indicadores diários para considerar somente atuações vigentes naquele dia, priorizar ausência confirmada sobre planejamento da mesma atuação e distinguir retornos por atuação. Suprimir aniversário, retorno, escala mínima e alerta individual fora da vigência; marcar células inativas com traço e explicação. Ausência de afastamento confirmado não equivale a disponibilidade de trabalho.
- [x] Descartar resultados atrasados do calendário quando houver nova carga, troca de perfil/contexto ou navegação para outra tela; não substituir a visão atual por resposta anterior.
- [ ] Homologar indicadores diários, eventos de aniversário e troca rápida de contexto/recorte em navegador, com atuações iniciadas/encerradas dentro do intervalo. Testes locais cobrem cálculo e integração estrutural, não substituem inspeção visual.
- [x] Implementar localmente registro manual de conflito excepcional, sem recusa automática ou alteração da solicitação.
- [x] Exigir justificativa, período, CNES/lotação, atuação do servidor quando houver, ator e data do registro, com validação no backend.
- [x] Implementar resolução/cancelamento com motivo obrigatório, preservando registro e histórico auditado. Encerrados não sinalizam afastamentos no calendário.
- [ ] Quando um feriado, afastamento ou conflito for cadastrado depois de uma análise, recalcular o calendário e notificar os responsáveis sem alterar silenciosamente uma decisão já registrada.

## 08. Ampliar a marca digital e a auditoria

- [x] Corrigir propagação explícita de `x-sgf-actor` nos catálogos: identidade obtida de `auth.getUser`, não de cabeçalho informado pelo navegador. A troca anterior para cliente com contexto, isoladamente, não transmitia o ator exigido pelo trigger.
- [x] Persistir autoria do pedido na mesma transação SQL dos períodos/distribuição, removendo atualização posterior pela Edge Function; eliminar ambiguidade entre variável e coluna `request_id` na rotina contextual.
- [x] Validar titular/conta ativos e autoria do payload contra identidade autenticada na rotina contextual; exigir autorização, CNES ativo e vigência da atuação/vínculo em cada dia. Rejeitar distribuição duplicada com erro específico e mensagem orientando correção/RH.
- [ ] Homologar envio integral com fixtures controladas e desativação concorrente das atuações. Ensaio das sete migrations atualizado passou com rollback; quatro testes adicionais são estruturais e não comprovam o fluxo integral.
- [x] Encaminhar contexto autenticado ao salvar feriados e preparar auditoria transacional de criação/edição/desativação, com administrador ativo, antes/depois e supressão de regravação idêntica. Exercitar trigger no Supabase em transação revertida: uma criação, uma alteração e nenhum evento extra pelo noop. Não aplicar definitivamente nesta rodada.
- [x] Restringir a consulta de servidores do catálogo RH aos CNES mapeados da lotação ativa e à lotação interna correspondente; unidade assistencial geral usa atuação sem lotação interna. Cobertura estrutural local; validar consulta real com múltiplos escopos.
- [x] Rejeitar datas inexistentes e nomes acima de 200 caracteres ao salvar eventos de calendário.
- [ ] Padronizar em todas as mutações: usuário autor, papel usado, contexto CNES/lotação, data/hora, entidade afetada, valores anteriores e posteriores e justificativa quando aplicável.
- [ ] Auditar cadastro e edição de pessoa, vínculo, CNES, lotação, equipe e unidade polo.
- [ ] Auditar pedidos, aprovação de acesso, recusa de acesso, concessão e revogação de perfis.
- [ ] Auditar criação/correção de solicitação, aprovação, recusa, retorno e inclusão/remoção compensatória do calendário.
- [ ] Auditar autorização e ajuste de banco de horas.
- [ ] Auditar calendário, feriados, day-off, escala mínima e conflitos manuais.
- [ ] Auditar alterações administrativas de papéis, escopos, vínculos e permissões.
- [ ] Evitar exclusão física de dados operacionais; usar desativação, evento compensatório ou anonimização conforme a política institucional.
- [x] Implementar localmente consulta paginada do histórico para Administrador e resumo restrito ao escopo de RH/Diretor; validar SQL e interface em homologação.
- [x] Implementar filtros por período, código do evento, ID do ator, ID do registro afetado e ID do vínculo; Administrador filtra também IDs de CNES/lotação.
- [x] Implementar localmente busca parcial por nome do autor e matrícula do vínculo, mantendo os filtros de escopo e a paginação no servidor. Validar tamanho/tipo da entrada e tratar curingas como texto literal.
- [x] Implementar localmente busca pelo nome do servidor afetado, distinta do autor, combinável com matrícula/escopo e aplicada antes da paginação. Preparar resolução de relações conhecidas de cadastro, pedido, revisão CNES, etapa legada, vínculo, atuação, perfil com pessoa única e conflito manual de atuação.
- [x] Preparar registro do nome do afetado em novos eventos e reconciliação explícita dos antigos pelo nome atual, identificado na interface; não inferir sujeito pelo ator, vínculo de acesso, CPF ou texto livre. Eventos coletivos/sem relação comprovável permanecem sem sujeito único.
- [ ] Ampliar identificação para eventos de acesso/inclusão e entidades ainda não cobertas, validando relações históricas e tratando eventos com múltiplos servidores sem escolher arbitrariamente uma pessoa.
- [ ] Validar as buscas amigáveis em Supabase de homologação e revisar a interface; os testes locais usam consultas simuladas, não executam PostgREST.

## 09. Padronizar recusas, impedimentos legais e orientação ao usuário

- [x] Preparar catálogo local de motivos, com ativo/inativo, ordem, modo de preenchimento e campos obrigatórios; gravação revalida o motivo ativo.
- [x] Disponibilizar localmente administração auditada do catálogo na interface, exclusiva do Administrador, sem exclusão física de motivos. Código e modo de preenchimento são permanentes; rótulos históricos das decisões permanecem preservados.
- [ ] Homologar interface, permissões, gravação auditada e concorrência do catálogo no banco independente.
- [x] Implementar inicialmente na análise por CNES:
  - **Banco de Horas Insuficiente:** informar saldo real validado e quantidade necessária;
  - **Conflito com Funcionário:** informar quem, motivo e data/período do conflito;
  - **Outros:** justificativa textual obrigatória.
- [x] Reutilizar localmente motivos e validação frontend nas recusas das etapas legadas; revalidar na Edge Function e no SQL, sem inventar motivos para decisões históricas anteriores.
- [ ] Homologar o ciclo legado completo, inclusive devolução/reenvio e sua interação com a versão das etapas e dados históricos de recusa.
- [ ] Separar **impedimento normativo**, verificado antes do envio, de **recusa administrativa**, decidida pelo RH/Gestão.
- [ ] Bloquear o envio quando uma regra legal ou funcional não for atendida e explicar de forma objetiva qual condição falhou.
- [ ] Criar catálogo de mensagens de regra com título, explicação, referência legal, canal de apoio e período de vigência.
- [ ] Exibir a lei, decreto, norma ou artigo aplicável somente depois da homologação institucional da referência.
- [ ] Orientar dúvidas sobre direitos, períodos e regras ao RH da unidade/lotação.
- [ ] Orientar problemas técnicos, acesso ou funcionamento aos Administradores ou à TI da Prefeitura de Betim.
- [ ] Não inserir referências legais presumidas ou não homologadas.

## 10. Migrar dados, preservar compatibilidade e testar

- [ ] Criar migration transicional que preserve todos os servidores, perfis, solicitações, decisões, calendários e auditorias existentes.
- [ ] Converter matrícula, lotação e equipe atuais no primeiro vínculo e primeira atuação de cada servidor.
- [ ] Migrar solicitações antigas com CNES derivado do cadastro histórico e marca explícita de origem legada.
- [ ] Manter leituras compatíveis durante a transição e remover os campos legados somente após a validação completa.
- [ ] Atualizar as Edge Functions de autenticação, acesso, perfis, catálogos, inclusões, envio de solicitação e operações.
- [ ] Atualizar todas as consultas do frontend que hoje dependem diretamente de `servidores.matricula`, `servidores.lotacao_id` ou `servidores.team_name`.
- [ ] Atualizar a base demonstrativa com pessoas de múltiplos vínculos, múltiplos CNES e atribuição diária de aprovação.
- [ ] Criar e executar testes para:
  - login por CPF e e-mail;
  - CPF único com várias matrículas;
  - vínculo em vários CNES e uma equipe por CNES;
  - filtro de equipes por unidade;
  - lotação interna somente em Secretaria;
  - seleção de perfil e contexto após login;
  - atribuição de cada dia ao CNES correto;
  - isolamento de RH/Gestão por escopo;
  - aprovação sem entrada automática no calendário;
  - concorrência entre gestores;
  - conflitos automáticos e manuais;
  - recusas estruturadas;
  - auditoria completa do ator e contexto.
- [x] Cobrir estruturalmente a validação server-side do contexto, sua propagação às Edge Functions e a RLS sensível a CNES/lotação.
- [ ] Executar testes automatizados, análise estática, advisors do Supabase e reconstrução integral em banco vazio.
- [x] Ensaiar em 07/10/2026 as sete migrations locais de 05/10 no PostgreSQL do projeto atual, em transação revertida: DDL executado, fundação/revisões criadas e 176 equipes importadas dentro do ensaio. Conferir rollback por consulta separada. Isso não aplica migrations definitivamente nem valida todos os corpos PL/pgSQL e fluxos de negócio.
- [ ] Exercitar RPCs e triggers com dados controlados, perfis/escopos reais e concorrência; ensaio DDL não substitui esses testes. Não aplicar definitivamente revogações e novo modelo antes de garantir compatibilidade operacional com a estável.

## 11. Homologar regras e operação

- [ ] Homologar com RH/Jurídico os cálculos de admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados, banco de horas e day-off. Usar `docs/HOMOLOGACAO_REGRAS.md` como base.
- [ ] Homologar a matriz oficial CNES × lotação interna × equipes × responsáveis por aprovação.
- [ ] Homologar o comportamento de solicitações com mais de um CNES responsável.
- [ ] Validar com usuários reais os perfis Servidor, Diretor, RH/Gestão e Administrador.
- [ ] Validar navegadores e equipamentos usados pela Prefeitura.
- [ ] Testar recuperação de acesso, concorrência, trilha de auditoria, restauração e backup.

## 12. Preparar produção, segurança e publicação — somente ao final

- [ ] Separar ambientes Supabase de desenvolvimento, homologação e produção.
- [ ] Ativar proteção contra senhas vazadas e manter a política de senha homologada.
- [ ] Definir o domínio institucional e revisar URLs de retorno.
- [ ] Restringir CORS aos domínios autorizados.
- [ ] Substituir o nome provisório da conta administrativa legada `admin` pelo responsável definido.
- [ ] Executar auditoria final de integridade, segurança, acessibilidade e responsividade.
- [ ] Somente após a conclusão e o aceite de todos os passos: criar commit, enviar ao GitHub e publicar a versão aprovada.

## Critérios de conclusão desta mudança

- [ ] A pessoa entra por CPF ou e-mail e escolhe perfil, vínculo e contexto ativo.
- [ ] Uma pessoa possui várias matrículas e atuações sem duplicar identidade ou histórico.
- [ ] Cada atuação possui um CNES e no máximo uma equipe válida daquela unidade.
- [ ] Cada dia solicitado possui um CNES autorizador válido.
- [ ] RH/Gestão enxerga somente seus escopos; Administrador possui controle global auditado.
- [ ] Aprovar não inclui automaticamente a ausência no calendário.
- [ ] Conflitos respeitam filtros e aceitam registros manuais justificados.
- [ ] Recusas são estruturadas e impedimentos normativos são explicados antes do envio.
- [ ] Toda ação relevante registra autor, papel e contexto.
- [ ] Migração, testes, documentação e homologação são concluídos antes de qualquer envio ao GitHub.
