# SGF — Sistema de Gestão de Funcionários

Sistema auxiliar para o RH, as chefias e os servidores da Prefeitura Municipal de Betim. Centraliza cadastros funcionais, vínculos por matrícula, unidades de atuação e processos de gestão de pessoal.

O módulo atual contempla férias, folgas e planejamento de escala. Essas funcionalidades fazem parte do SGF, mas não limitam seu escopo.

**Estado:** piloto em desenvolvimento, ainda sem homologação institucional definitiva. O ambiente publicado está em [sgfbetim.vercel.app](https://sgfbetim.vercel.app/). As pendências e evidências de validação estão em [docs/pendencias.md](docs/pendencias.md).

## Funcionalidades

- Identificação por CPF ou e-mail e múltiplos vínculos por matrícula.
- CNES/unidades autorizadoras e equipe por unidade, com opção “Não se aplica”.
- Simulação de períodos e envio/acompanhamento de solicitações autenticadas.
- Distribuição diária entre unidades e análise independente por CNES/lotação.
- Aprovação, recusa justificada e inclusão explícita no calendário.
- Calendário nominal, escala mínima, filtros e conflitos de planejamento.
- Direitos e banco de horas por vínculo.
- Feriados, recálculo de períodos, notificações e histórico de ações.
- Administração de estrutura organizacional, cadastros e acessos.

Simulações e comprovantes não autorizam, por si só, o afastamento. As regras dependem da validação institucional e da decisão administrativa.

## Perfis e escopos

| Perfil | Responsabilidade |
| --- | --- |
| Servidor | Solicitar e acompanhar os próprios pedidos no vínculo selecionado. |
| RH/Diretor | Gerenciar somente o CNES/lotação escolhido entre os escopos concedidos. |
| Administrador | Administrar estrutura, permissões e cadastros, com visão global. |

Uma conta pode possuir mais de um perfil e contexto. RH/Diretor usa o código interno `rh`; o valor antigo `diretor` é preservado para compatibilidade e histórico, não como um quarto perfil operacional. Diretorias que compartilham um CNES continuam separadas pela lotação interna.

## Tecnologia

- Frontend estático em HTML, CSS e JavaScript, sem framework ou bundler.
- Supabase Auth, PostgreSQL com RLS e Edge Functions.
- Edge Functions em TypeScript/Deno.
- Testes locais com o runner nativo do Node.js.
- Publicação atual no Vercel, a partir da branch `main`.

A biblioteca `@supabase/supabase-js` está fixada em `2.117.2` no frontend e nas funções.

## Executar localmente

Requisitos:

- Git para obter o repositório.
- Node.js 24 para testes e geração do site estático.
- Um navegador moderno e um servidor HTTP estático.
- Acesso ao backend Supabase configurado para os fluxos conectados.

Na raiz do projeto, uma opção de servidor local é Python 3:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`. Não é necessário executar `npm install` para o frontend. Evite abrir `index.html` por `file://`.

**Atenção:** servir a interface localmente não cria um banco isolado. O frontend chama o projeto Supabase definido em `assets/app.js`. Não execute testes destrutivos ou cadastros fictícios indiscriminadamente contra uma base institucional.

## Configuração

### Frontend

As constantes `SUPABASE_URL` e `SUPABASE_KEY`, em `assets/app.js`, identificam o backend e sua chave publicável. Essa chave pode ser enviada ao navegador; não substitui autenticação, RLS ou autorização por contexto.

Ao mudar de projeto/domínio, revise também:

- `connect-src` em `index.html` e nos cabeçalhos de `vercel.json`;
- URLs de autenticação e recuperação no Supabase;
- configuração de recuperação nas Edge Functions;
- `netlify.toml`, somente se esse destino alternativo for utilizado.

Este frontend não carrega automaticamente arquivos `.env`. Criar um `.env` sem mudar o mecanismo de configuração não altera as constantes publicadas.

### Backend

As funções leem suas configurações do ambiente seguro do Supabase:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL` | Endereço do projeto. |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações privilegiadas, exclusivamente no servidor. |
| `SUPABASE_ANON_KEY` | Fluxos de autenticação que a utilizam. |
| `SGF_RECOVERY_URLS` | Retornos adicionais de recuperação, quando configurados. |

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, senhas ou tokens no frontend, no GitHub ou em relatórios. Arquivos de ambiente, diretórios privados de ensaio e configurações locais de hospedagem são ignorados pelo Git.

## Testes e build

Na raiz do repositório:

```bash
node --check assets/app.js
node --test tests/*.test.mjs
node scripts/build-static.mjs
```

O build copia `index.html`, `logo.png` e os arquivos JS/CSS de `assets/` para `dist/`. Não publica documentos internos, SQL, scripts de ensaio nem Edge Functions. `dist/` é uma saída gerada e não deve ser editada como fonte.

Os testes cobrem lógica, contratos de acesso, validações, fluxos e regressões. Testes que inspecionam código ou SQL não comprovam execução real no navegador ou no banco.

O workflow em `.github/workflows/tests.yml` executa testes locais, reconstrução do banco, ensaios SQL e restauração sintética em ambiente isolado. Consulte o resultado do workflow da versão que será publicada; um deploy pronto não significa que todos os testes de CI passaram.

Scripts de ensaio remoto podem gravar dados. Leia as instruções e os guardas de cada script antes de executá-lo; eles não fazem parte da inicialização normal do projeto.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `index.html` | Entrada da aplicação, metadados e carregamento de recursos. |
| `assets/` | Interface, estilos e módulos de regras/navegação. |
| `supabase/functions/` | Autenticação, solicitações e operações administrativas. |
| `supabase/functions/_shared/` | Validação de contexto e regras compartilhadas no backend. |
| `supabase/migrations/` | Evolução versionada do banco. |
| `supabase/config.toml` | Configuração do projeto Supabase local. |
| `tests/` | Testes automatizados e cenários SQL. |
| `scripts/` | Build e ferramentas de verificação/ensaio. |
| `docs/` | Manual, implantação, validações e pendências. |
| `vercel.json` | Build, diretório publicado e cabeçalhos HTTP atuais. |
| `netlify.toml` | Configuração de hospedagem alternativa/histórica. |

## Implantação e manutenção

O destino atual é Vercel:

- Comando de build: `node scripts/build-static.mjs`.
- Diretório publicado: `dist`.
- Integração Git: branch `main`.

O backend é implantado separadamente no Supabase. Para uma instalação nova, prepare um projeto autorizado, aplique a cadeia completa de migrations e publique as funções correspondentes. Para uma base existente, confira o histórico aplicado antes de executar alterações; não reaplique migrations já registradas nem use reset contra o banco compartilhado.

Mudanças devem manter frontend, schema e funções compatíveis. Confira testes, build, migrações, configuração de autenticação e publicação do commit correto. Ao alterar JS/CSS publicados, atualize as referências versionadas dos recursos quando necessário.

Procedimentos e limites estão em [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md). Não conecte o frontend legado ao banco atual.

## Segurança e uso institucional

- RH/Diretor opera apenas no contexto concedido; Administrador possui acesso global.
- O backend valida identidade, perfil e escopo; as restrições não dependem apenas de esconder botões.
- Dados funcionais e pessoais não devem ser usados em demonstrações públicas.
- Testes devem usar dados fictícios e ter destino, autorização e encerramento definidos.
- Backup, retenção, proteção de senhas e preparação operacional permanecem sujeitos às pendências institucionais.
- Não descarte histórico nem redefina credenciais como preparação automática de testes.

O piloto compartilhado não representa separação definitiva entre desenvolvimento, homologação e produção. Regras e aceite do RH Central serão tratados ao final das mudanças, antes do uso institucional definitivo.

## Documentação

- [Manual de uso](docs/MANUAL_USO.md)
- [Hospedagem e configuração](docs/HOSPEDAGEM.md)
- [Pendências ativas](docs/pendencias.md)
- [Auditoria técnica e correções](docs/AUDITORIA_TECNICA_20261014.md)
- [Guia de homologação](docs/GUIA_HOMOLOGACAO.md)
- [Homologação das regras](docs/HOMOLOGACAO_REGRAS.md)
- [Auditoria e retenção](docs/AUDITORIA_RETENCAO.md)
- [Ponto de retomada](docs/RETOMADA_20261014.md)

Materiais de treinamento e registros históricos ficam em `docs/`, separados desta documentação de entrada. Capturas e slides anteriores podem não representar a interface atual.

## Licença

Software proprietário para uso institucional. Consulte [LICENSE](LICENSE) para os termos de uso, manutenção e distribuição.
