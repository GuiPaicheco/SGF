# Pendências do SGF

Este arquivo contém somente trabalho ainda não concluído. Itens entregues devem ser removidos após validação, não mantidos como checklist histórico.

Repositório: https://github.com/GuiPaicheco/SGF.git

## 1. Acesso, usuários e perfis — prioridade atual

- [ ] Unificar a experiência de login: matrícula ou identificador, senha, “Esqueci a senha” e “Solicitar acesso”. Hoje servidor e gestão usam formulários e identificadores diferentes.
- [ ] Implementar recuperação segura de senha para servidores e gestores.
- [ ] Criar uma fila administrativa para aprovar ou rejeitar solicitações de acesso.
- [ ] Não emitir uma conta autenticada para cadastro funcional provisório antes da aprovação administrativa.
- [ ] Exigir sessão vinculada para pedidos atribuídos a um servidor já cadastrado; manter o fluxo sem login somente para inclusão funcional pendente, sem alterar saldo de banco de horas.
- [ ] Decidir e implementar a política de acesso por CNES. Não criar contas compartilhadas com senha global sem uma decisão formal sobre rastreabilidade.
- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth antes da produção.

## 2. Cadastros e estrutura organizacional

- [ ] Criar a gestão de lotações, permitindo alterar nome, hierarquia, código CNES e responsáveis.
- [ ] Criar a gestão de servidores, cargos, funções e vínculos por lotação.
- [ ] Permitir ativar, bloquear e transferir servidores entre lotações mantendo histórico.

## 3. Solicitações e calendário

- [ ] Reintroduzir o calendário visual na simulação e no acompanhamento.
- [ ] Marcar claramente o início do afastamento em vermelho, o último dia do período, o retorno em verde, feriados/pontos facultativos e o day-off de aniversário.
- [ ] Explicar no calendário que a data inicial representa o primeiro dia em que o servidor não trabalhará.
- [ ] Carregar feriados e pontos facultativos do banco, em vez de manter apenas datas fixas no frontend.
- [ ] Validar os cálculos de férias por data de admissão, término do período aquisitivo, vínculo e faltas com casos oficiais do RH.
- [ ] Validar a simulação por data de início e por data de retorno, incluindo fracionamento, feriados e day-off.
- [ ] Completar o banco de horas com saldo declarado, saldo validado pelo RH, jornada, lançamentos e consumo após aprovação.
- [ ] Permitir que banco de horas complemente férias, com validação administrativa do saldo.
- [ ] Exibir conflitos de escala por lotação, cargo e função antes da aprovação.

## 4. Aprovação e gestão

- [ ] Implementar explicitamente as etapas de decisão da chefia imediata e do RH usando `request_approvals`.
- [ ] Exibir pareceres, responsáveis, datas e histórico completo de cada mudança.
- [ ] Implementar programação, reprogramação, devolução para correção, cancelamento e conclusão com regras por perfil.
- [ ] Criar visão de calendário/escala por unidade, cargo e função para identificar períodos com falta de pessoal.
- [ ] Criar indicadores administrativos por situação, modalidade, lotação e período.
- [ ] Notificar servidor, chefia e RH sobre envio, decisão e alteração da solicitação.

## 5. Comprovante e comunicação

- [ ] Revisar e testar a impressão do comprovante nos navegadores usados pela Prefeitura.
- [ ] Garantir que o comprovante seja impresso em uma única página, com cabeçalho, protocolo, dados, períodos, situação, carimbo e assinaturas.
- [ ] Gerar texto copiável em formato de e-mail, com assunto e mensagem.
- [ ] Orientar o servidor a enviar o texto à chefia/RH e imprimir, assinar e entregar o comprovante quando exigido.
- [ ] Permitir imprimir ou copiar novamente a partir de “Meus pedidos”.

## 6. UI, acessibilidade e qualidade

- [ ] Revisar os estados visuais verde/vermelho dos campos sem depender apenas de cor para indicar validade.
- [ ] Testar responsividade e alinhamento em celular, tablet e desktop.
- [ ] Fazer testes ponta a ponta dos quatro perfis e dos fluxos sem login.
- [ ] Adicionar testes automatizados para cálculos de datas, permissões, login e transições de situação.
- [ ] Revisar textos, acentuação, mensagens de erro e instruções antes da homologação.

## 7. Publicação e produção

- [ ] Conectar o repositório ao Netlify e homologar o primeiro deploy conforme `docs/HOSPEDAGEM.md`.
- [ ] Definir o domínio de produção e cadastrá-lo em **Site URL** e **Redirect URLs** no Supabase Auth.
- [ ] Restringir o CORS das Edge Functions ao domínio de produção e à política aprovada para Deploy Previews.
- [ ] Executar a validação pós-deploy nos navegadores utilizados pela Prefeitura.

## Ordem sugerida

1. Aprovação de acesso e recuperação segura de senha.
2. Gestão de cadastros e estrutura organizacional.
3. Calendário visual e validação dos cálculos.
4. Fluxo completo de aprovação e visão de escala.
5. Comprovante, comunicação, testes e homologação.
6. Publicação no Netlify e homologação do domínio de produção.
7. Por fim, verificar a integridade do código e do banco e realizar a auditoria de segurança.

> Manter a identidade visual profissional, a responsividade e o versionamento contínuo no GitHub.
