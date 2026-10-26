# Homologação do SGFS

Ambiente separado criado em 26/10/2026 a partir da main, commit 7d44627.

- Branch: `homologacao`. Não mesclar configurações de ambiente na main.
- Vercel: `sgf-homologacao`, projeto `prj_qTQe6R789JZCnA8D3cLUKDpmIOPB`.
- URL: https://sgf-homologacao.vercel.app/
- Supabase: `SGF-homologacao`, referência `pouluaiadcgppxbzqdjw`.
- Produção preservada: `sgfbetim` e `GeraFerias` (`ijhvbzomakbbxverqfqh`).

O banco foi reconstruído pelas 89 migrations versionadas, sem copiar usuários,
senhas, sessões, dados pessoais ou arquivos da produção. As contas são independentes.
Há um administrador de teste; suas credenciais ficam apenas no arquivo local
`.env.homologacao.local`, ignorado pelo Git. Não publicar esse arquivo.

O build bloqueia publicação em outro projeto Vercel. A API CNES exige a referência
Supabase de homologação. Frontend, CSP e recuperação apontam para homologação.
Não usar scripts históricos de piloto, reset ou importação com credenciais de produção.

As migrations enviadas via MCP possuem timestamps gerados pelo serviço; antes de
usar `supabase db push`, conferir e reconciliar o histórico com os arquivos locais.
As funções são publicadas separadamente do frontend.

Para promover uma funcionalidade, revisar somente os commits funcionais em PR;
preservar URL, chaves, guardas e identificação próprios de cada ambiente.
