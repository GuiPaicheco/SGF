# Pendências do SGF

Backlog ativo do sistema. Itens entregues e validados são removidos; o histórico permanece no Git.

Última revisão completa: 29/09/2026, confrontando frontend, migrations, Edge Functions, documentação e banco remoto.

**Total:** 20 pendências.

## Etapa 1 — Regras e operação

- [ ] Homologar com o RH os cálculos de admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados e day-off.
- [ ] Completar o banco de horas: jornada, saldo declarado, validação pelo RH, lançamentos, complemento de férias e consumo após aprovação.
- [ ] Exibir a linha do tempo de `request_status_history`, com situação anterior, nova situação, responsável, data e observação.
- [ ] Completar programação, reprogramação, devolução para correção, cancelamento e conclusão, respeitando as permissões de cada perfil.
- [ ] Criar calendário de escala por lotação, cargo e função, destacando conflitos e risco de falta de pessoal antes da aprovação.
- [ ] Ampliar os indicadores por situação, modalidade, lotação e período.
- [ ] Notificar servidor, diretor e RH sobre envio, decisão e alteração da solicitação.

## Etapa 2 — Comprovante e comunicação

- [ ] Homologar a impressão nos navegadores da Prefeitura e garantir uma única página com cabeçalho, protocolo, dados, períodos, situação, carimbo e assinaturas.
- [ ] Gerar assunto e texto copiáveis para comunicação por e-mail, incluindo as orientações de entrega do comprovante.
- [ ] Permitir reimprimir e copiar os dados do comprovante em “Meus pedidos”.

## Etapa 3 — UI, acessibilidade e testes

- [ ] Tornar os estados de validação compreensíveis sem depender apenas de verde e vermelho.
- [ ] Validar responsividade e alinhamento em celular, tablet e desktop.
- [ ] Executar testes ponta a ponta dos perfis servidor, diretor, RH e administrador, além dos fluxos públicos.
- [ ] Adicionar testes automatizados para datas, permissões, autenticação e transições de situação.
- [ ] Revisar textos, acentuação, mensagens de erro e instruções antes da homologação.

## Etapa 4 — Publicação e produção

- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth.
- [ ] Conectar o repositório ao Netlify e homologar o primeiro deploy conforme `docs/HOSPEDAGEM.md`.
- [ ] Definir o domínio de produção e cadastrá-lo em **Site URL** e **Redirect URLs** no Supabase Auth.
- [ ] Restringir o CORS das Edge Functions ao domínio de produção e à política aprovada para Deploy Previews.
- [ ] Executar a validação pós-deploy nos navegadores utilizados pela Prefeitura.

## Encerramento

Depois das quatro etapas, executar a auditoria final de integridade e segurança do código e do banco.

> Preservar a identidade visual, a responsividade, a documentação e o versionamento contínuo no GitHub em todas as entregas.
