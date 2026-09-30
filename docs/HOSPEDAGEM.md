# Hospedagem do SGF no Netlify

O SGF é uma aplicação estática. O Netlify deve publicar somente a pasta `dist`, gerada pelo comando definido em `netlify.toml`. Assim, migrations, funções Supabase e documentos internos não ficam acessíveis pelo site.

O repositório está conectado ao projeto Netlify `sgfbetim`. O deploy contínuo da branch `main` está ativo em `https://sgfbetim.netlify.app`; essa URL é do piloto e não substitui a definição do domínio institucional definitivo.

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
- Entrar e recuperar a senha pelo login `admin` em uma conta sem CPF.
- Confirmar no navegador que as respostas possuem CSP, `X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy`.
- Tentar acessar `/supabase/migrations/` e `/docs/`; esses caminhos não devem publicar arquivos internos.
- Testar impressão e responsividade nos navegadores usados pela Prefeitura.

## Operação

Cada `push` na branch `main` produzirá uma nova publicação quando o deploy contínuo estiver habilitado. Pull requests podem usar Deploy Previews. A pasta local `.netlify` e eventuais arquivos `.env` são ignorados pelo Git.

Enquanto o domínio final não estiver definido, as Edge Functions aceitam requisições CORS de qualquer origem. A origem deve ser restringida após a homologação do domínio de produção e da política de previews.
