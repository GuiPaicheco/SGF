# Hospedagem do SGF

## Piloto atual — Vercel (09/10/2026)

Endereço: **https://sgfbetim.vercel.app**. Projeto `sgfbetim`, conectado ao repositório `GuiPaicheco/SGF`, branch de produção `main`. O backend permanece no Supabase atual; esta mudança de hospedagem não altera o banco.

O arquivo `vercel.json` define build `node scripts/build-static.mjs`, sem instalação de dependências, e publicação exclusiva de `dist`. O build copia apenas `index.html`, `logo.png` e os arquivos CSS/JS de `assets`. Documentos, migrations, funções, backups e `.env` não são publicados. Os cabeçalhos CSP e demais proteções foram mantidos e conferidos online; caminhos internos retornam HTTP 404.

Cada atualização do `main` dispara uma publicação pelo Git integrado. Verifique o estado **Ready**, o commit e o endereço de produção no painel antes de considerar uma versão publicada. Não há segredos adicionais a cadastrar no Vercel: a chave publicável do frontend não é a chave de serviço do Supabase.

Para recuperação de senha por e-mail, conferir no Supabase Auth **Site URL** e **Redirect URLs**, incluindo `https://sgfbetim.vercel.app`. A publicação do frontend não configura automaticamente essa lista. O retorno atual foi autorizado e configurado; o usuário confirmou recuperação e login por e-mail em 08/10. Não repetir essa correção como pendência nem redefinir senhas para testes visuais. Mudança futura de domínio exige nova conferência.

O Netlify anterior permanece preservado, mas com publicações pausadas por limite de créditos; não usar seu frontend legado contra o banco atualizado. Nenhum plano pago foi contratado.

## Configuração alternativa/histórica — Netlify

O SGF é uma aplicação estática. O Netlify deve publicar somente a pasta `dist`, gerada pelo comando definido em `netlify.toml`. Assim, migrations, funções Supabase e documentos internos não ficam acessíveis pelo site.

O repositório foi conectado ao projeto Netlify `sgfbetim`, anteriormente publicado em `https://sgfbetim.netlify.app`. Essa configuração é histórica: publicações pausadas por créditos; o piloto vigente está no Vercel. Não usar o site antigo contra o banco atualizado.

## Publicação recomendada

1. No Netlify, selecione **Add new site > Import an existing project** e conecte o repositório `GuiPaicheco/SGF`.
2. Se a configuração não for detectada automaticamente, use:
   - branch de produção: `main`;
   - comando de build: o valor definido em `netlify.toml`;
   - diretório de publicação: `dist`.
3. Publique primeiro com o subdomínio temporário `*.netlify.app` e execute a validação abaixo.
4. Depois de definir o domínio definitivo, configure no Supabase Auth:
   - **Site URL** com a URL de produção;
   - **Redirect URLs** com a URL de produção e as URLs de preview realmente utilizadas.

O frontend contém somente a URL do projeto e a chave publicável do Supabase. Nunca cadastre `SUPABASE_SERVICE_ROLE_KEY`, senhas ou outros segredos como variáveis expostas ao navegador ou no repositório.

## Validação após o deploy

- Abrir a tela inicial e confirmar que logo, estilos e JavaScript carregam sem erros.
- Fazer uma simulação rápida sem login e confirmar que não há botão de envio nem coleta de dados pessoais.
- Confirmar que `submit-request` rejeita envio sem sessão com HTTP 401.
- Entrar como servidor, criar uma solicitação e consultar **Meus pedidos**.
- Entrar pelo CPF com uma conta que possua Servidor, RH e Administrador; conferir a escolha do acesso, a troca entre áreas e o escopo de cada uma.
- Conferir recuperação em conta de teste autorizada, sem alterar o administrador nem a conta preservada somente para repetir uma prova já concluída.
- Confirmar no navegador que as respostas possuem CSP, `X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy`.
- Tentar acessar `/supabase/migrations/` e `/docs/`; esses caminhos não devem publicar arquivos internos.
- Testar impressão e responsividade nos navegadores usados pela Prefeitura.

## Operação

Cada `push` na branch `main` produzirá uma nova publicação quando o deploy contínuo estiver habilitado. Pull requests podem usar Deploy Previews. A pasta local `.netlify` e eventuais arquivos `.env` são ignorados pelo Git.

Enquanto o domínio final não estiver definido, as Edge Functions aceitam requisições CORS de qualquer origem. A origem deve ser restringida após a homologação do domínio de produção e da política de previews.
