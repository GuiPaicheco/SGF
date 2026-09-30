# Pendências do SGF

Backlog ativo do sistema. Itens entregues e validados são removidos; o histórico permanece no Git.

Última revisão completa: 30/09/2026, confrontando frontend, testes, documentação, migrations, Edge Functions ativas, banco remoto, integração contínua e publicação no Netlify.

Nesta revisão foram concluídos e removidos do backlog:

- baseline versionada e reconstrução integral das migrations em um Supabase vazio, validada pela integração contínua;
- substituição das senhas provisórias fixas por credenciais aleatórias fortes, exibidas uma única vez;
- conexão do repositório ao Netlify e primeira publicação da branch `main` em `https://sgfbetim.netlify.app`;
- correção dos índices de chaves estrangeiras apontados pelos advisors do Supabase.

**Total:** 8 pendências, todas dependentes de homologação, decisão institucional ou configuração externa.

## Homologação institucional

- [ ] Homologar com o RH os cálculos de admissão, período aquisitivo, vínculo, faltas, início, retorno, fracionamento, feriados e day-off. O roteiro está em `docs/HOMOLOGACAO_REGRAS.md`.
- [ ] Após o aceite do RH, recalcular e validar no servidor o direito, o fracionamento e as datas de todos os pedidos, inclusive reprogramações.
- [ ] Substituir, com o responsável, o nome provisório da conta administrativa legada `admin`; a lotação CNES já está definida como **SECRETARIA MUNICIPAL DE SAÚDE DE BETIM**.
- [ ] Executar a validação pós-deploy nos navegadores e equipamentos utilizados pela Prefeitura, com contas de Servidor, Chefia/Diretor, RH e Administrador.

## Produção e segurança

- [ ] Criar ambientes Supabase separados para homologação e produção e documentar URL, chave publicável, redirects, CSP, migrations e publicação de Edge Functions de cada ambiente.
- [ ] Ativar no Supabase Auth a proteção contra senhas vazadas e manter o comprimento mínimo em pelo menos 8 caracteres. O advisor remoto ainda aponta a proteção como desabilitada; o recurso exige plano Pro ou superior.
- [ ] Definir o domínio institucional de produção e cadastrá-lo em **Site URL** e **Redirect URLs** no Supabase Auth.
- [ ] Depois da definição dos domínios, restringir o CORS das Edge Functions à produção e à política aprovada para Deploy Previews.

## Encerramento

Depois da homologação institucional e das configurações externas, executar a auditoria final de integridade e segurança do código, do banco e do fluxo publicado.

> Preservar a identidade visual, a responsividade, a documentação e o versionamento contínuo no GitHub em todas as entregas.
