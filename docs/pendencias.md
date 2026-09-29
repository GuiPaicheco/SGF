# Pendências do SGF

Este arquivo contém somente trabalho ainda não concluído. Itens entregues e validados são removidos, não mantidos como histórico.

Última revisão completa: 29/09/2026, confrontando frontend, migrations, Edge Functions e banco remoto após a implementação da aprovação explícita pela chefia e pelo RH.

Repositório: https://github.com/GuiPaicheco/SGF.git

## 1. Acesso, usuários e perfis — prioridade atual

- [ ] Unificar a experiência de login: matrícula ou identificador, senha, “Esqueci a senha” e “Solicitar acesso”. Hoje servidor e gestão ainda usam formulários distintos.
- [ ] Implementar recuperação segura de senha para servidores e gestores.
- [ ] Criar uma fila administrativa para aprovar ou rejeitar solicitações de acesso e somente emitir a conta autenticada após aprovação.
- [ ] Exigir sessão vinculada para pedidos atribuídos a servidor já cadastrado; manter o fluxo sem login somente para inclusão funcional pendente, sem alterar saldo de banco de horas.
- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth antes da produção.

## 2. Cadastros e estrutura organizacional

- [ ] Criar a gestão de lotações, permitindo alterar nome, hierarquia, código CNES e responsáveis.
- [ ] Criar a gestão de servidores, cargos, funções e vínculos por lotação.
- [ ] Permitir ativar, bloquear e transferir servidores entre lotações mantendo histórico.

## 3. Solicitações, calendário e saldos

- [ ] Homologar os cálculos com casos oficiais do RH: admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados e day-off.
- [ ] Completar o banco de horas de ponta a ponta: jornada, saldo declarado, saldo validado pelo RH, lançamentos, complemento de férias e consumo após aprovação.
- [ ] Exibir conflitos de escala por lotação, cargo e função antes da aprovação.

## 4. Aprovação e gestão

- [ ] Exibir a linha do tempo completa das mudanças armazenadas em `request_status_history`, com situação anterior, nova situação, responsável, data e observação.
- [ ] Completar programação, reprogramação, devolução para correção, cancelamento e conclusão na interface, com regras por perfil.
- [ ] Criar visão de calendário/escala por unidade, cargo e função para identificar períodos com falta de pessoal.
- [ ] Ampliar os indicadores atuais com modalidade, lotação e período, além da situação.
- [ ] Notificar servidor, chefia e RH sobre envio, decisão e alteração da solicitação.

## 5. Comprovante e comunicação

- [ ] Homologar a impressão nos navegadores da Prefeitura e garantir uma única página com cabeçalho, protocolo, dados, períodos, situação, carimbo e assinaturas.
- [ ] Gerar texto copiável de e-mail, com assunto, mensagem e orientação de envio à chefia/RH e entrega do comprovante quando exigida.
- [ ] Permitir imprimir ou copiar novamente a partir de “Meus pedidos”.

## 6. UI, acessibilidade e qualidade

- [ ] Revisar os estados de validação dos campos para não depender apenas de verde/vermelho.
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

1. Aprovação de acesso, recuperação de senha e proteção dos fluxos sem login.
2. Gestão de cadastros e estrutura organizacional.
3. Homologação dos cálculos e conclusão do banco de horas.
4. Fluxo completo de aprovação, histórico e visão de escala.
5. Comprovante, comunicação, testes e homologação.
6. Publicação no Netlify e homologação do domínio de produção.
7. Auditoria final de integridade e segurança do código e do banco.

> Manter a identidade visual profissional, a responsividade e o versionamento contínuo no GitHub.
