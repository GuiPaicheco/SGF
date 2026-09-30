# Pendências do SGF

Backlog ativo do sistema. Itens entregues e validados são removidos; o histórico permanece no Git.

Última revisão completa: 30/09/2026, confrontando frontend, testes, documentação, migrations, Edge Functions ativas e banco remoto. Nesta revisão também foram validados o cadastro de equipe, o ciclo histórico da escala mínima e as notificações por alteração de feriado; como foram concluídos, não permanecem no backlog.

**Total:** 11 pendências.

## Homologação externa

- [ ] Homologar com o RH os cálculos de admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados e day-off.

Roteiro preparado em `docs/HOMOLOGACAO_REGRAS.md`; a conclusão depende do aceite formal do RH.

## Etapa 1 — Publicação e produção

- [ ] Versionar o esquema inicial do Supabase e validar a instalação completa das migrations em um projeto vazio.
- [ ] Após o aceite do RH, recalcular e validar no servidor o direito, o fracionamento e as datas de todos os pedidos, inclusive reprogramações.
- [ ] Separar a configuração de homologação e produção (URL, chave publicável, redirects e CSP) e documentar o processo de publicação de cada ambiente.
- [ ] Ativar a proteção contra senhas vazadas no Supabase Auth.
- [ ] Confirmar no Supabase Auth se a política de comprimento mínimo aceita as senhas temporárias de 4/6/8 caracteres. Homologar a criação manual e a troca forçada para cada maior acesso.
- [ ] Substituir, com o responsável, o nome provisório da conta administrativa legada `admin`; a lotação CNES já está definida como **SECRETARIA MUNICIPAL DE SAÚDE DE BETIM**.
- [ ] Conectar o repositório ao Netlify e homologar o primeiro deploy conforme `docs/HOSPEDAGEM.md`.
- [ ] Definir o domínio de produção e cadastrá-lo em **Site URL** e **Redirect URLs** no Supabase Auth.
- [ ] Restringir o CORS das Edge Functions ao domínio de produção e à política aprovada para Deploy Previews.
- [ ] Executar a validação pós-deploy nos navegadores utilizados pela Prefeitura.

## Encerramento

Depois da etapa de publicação e da homologação externa, executar a auditoria final de integridade e segurança do código e do banco.

> Preservar a identidade visual, a responsividade, a documentação e o versionamento contínuo no GitHub em todas as entregas.
