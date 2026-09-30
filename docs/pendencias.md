# Pendências do SGF

Backlog ativo do sistema. Itens entregues e validados são removidos; o histórico permanece no Git.

Última revisão: 30/09/2026, após a integração de cadastros, escala nominal, notificações e arquivamento.

**Total:** ver itens abaixo.

## Homologação externa

- [ ] Homologar com o RH os cálculos de admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados e day-off.

Roteiro preparado em `docs/HOMOLOGACAO_REGRAS.md`; a conclusão depende do aceite formal do RH.

## Etapa 1 — Comprovante e comunicação

- [ ] Homologar a impressão nos navegadores da Prefeitura e garantir uma única página com cabeçalho, protocolo, dados, períodos, situação, carimbo e assinaturas.
- [ ] Gerar assunto e texto copiáveis para comunicação por e-mail, incluindo as orientações de entrega do comprovante.
- [ ] Permitir reimprimir e copiar os dados do comprovante em “Meus pedidos”.

## Etapa 2 — UI, acessibilidade e testes

- [ ] Tornar os estados de validação compreensíveis sem depender apenas de verde e vermelho.
- [ ] Validar responsividade e alinhamento em celular, tablet e desktop.
- [ ] Executar testes ponta a ponta dos acessos Público, Servidor, RH e Administrador, incluindo um CPF com os três acessos autenticados.
- [ ] Adicionar testes automatizados para datas, permissões, autenticação e transições de situação.
- [ ] Revisar textos, acentuação, mensagens de erro e instruções antes da homologação.

## Etapa 3 — Publicação e produção

- [ ] Versionar o esquema inicial do Supabase e validar a instalação completa das migrations em um projeto vazio.
- [ ] Após o aceite do RH, recalcular e validar no servidor o direito, o fracionamento e as datas de todos os pedidos, inclusive reprogramações.
- [ ] Conferir pedidos de banco de horas já concluídos antes da separação entre saldo declarado e horas solicitadas; reconciliar eventuais débitos com trilha de auditoria.
- [ ] Separar a configuração de homologação e produção (URL, chave publicável, redirects e CSP) e documentar o processo de publicação de cada ambiente.
- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth.
- [ ] Confirmar no Supabase Auth se a política de comprimento mínimo aceita as senhas temporárias de 4/6/8 caracteres. Homologar a criação manual e a troca forçada para cada maior acesso.
- [ ] Definir com o responsável a lotação CNES e o nome pessoal da conta administrativa legada `admin`, que ainda tem cadastro provisório. O sistema já permite escolher sua lotação em **Cadastros → Usuários e acessos → Minha lotação**.
- [ ] Conectar o repositório ao Netlify e homologar o primeiro deploy conforme `docs/HOSPEDAGEM.md`.
- [ ] Definir o domínio de produção e cadastrá-lo em **Site URL** e **Redirect URLs** no Supabase Auth.
- [ ] Restringir o CORS das Edge Functions ao domínio de produção e à política aprovada para Deploy Previews.
- [ ] Executar a validação pós-deploy nos navegadores utilizados pela Prefeitura.

## Encerramento

Depois das três etapas e da homologação externa, executar a auditoria final de integridade e segurança do código e do banco.

> Preservar a identidade visual, a responsividade, a documentação e o versionamento contínuo no GitHub em todas as entregas.
