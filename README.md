# SGF — Sistema de Gestão de Férias e Folgas

Aplicação auxiliar para servidores, chefias e RH da Prefeitura Municipal de Betim. O sistema simula períodos, registra solicitações no Supabase, acompanha autorizações e emite comprovantes.

## Executar localmente

O frontend não precisa de build. Sirva a pasta por HTTP (por exemplo, com a extensão Live Server do VS Code) e abra `index.html`. Abrir diretamente por `file://` pode ser bloqueado por políticas do navegador ou do CDN.

## Estrutura

- `index.html`: shell acessível da aplicação.
- `assets/app.css`: identidade visual, responsividade e impressão A4.
- `assets/app.js`: simulação, autenticação e painel.
- `supabase/migrations`: histórico versionado do banco.
- `supabase/functions/submit-request`: envio anônimo validado no servidor.
- `docs/OPERACAO.md`: preparação do ambiente e operação do piloto.
- `pendencias.md`: backlog vivo e decisões ainda dependentes do RH/STI.

## Segurança

- O navegador usa somente a chave publicável do Supabase.
- A chave `service_role` nunca deve ser adicionada ao repositório ou ao frontend.
- Solicitações anônimas passam pela Edge Function, que valida matrícula, CPF e nascimento e limita tentativas.
- O painel usa Supabase Auth e RLS com escopo por lotação.
- Mudanças de status são validadas no banco e registradas em histórico.

## Publicação

Antes do piloto, leia `docs/OPERACAO.md`, carregue os cadastros oficiais e execute os advisors de segurança e desempenho do Supabase.
