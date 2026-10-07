# SGF — Sistema de Gestão de Férias e Folgas

**Piloto publicado:** https://sgfbetim.vercel.app — Vercel, com deploy contínuo da branch `main`. Backend Supabase preservado. Publicação não substitui a homologação funcional/institucional; consulte [hospedagem](docs/HOSPEDAGEM.md).

> **Piloto de homologação — 07/10/2026:** banco atual atualizado para múltiplos vínculos/CNES, distribuição diária e análise por unidade. Produção e homologação usam o mesmo Supabase por decisão do responsável. Sete migrations e sete Edge Functions publicadas; 213 testes locais e 11 cenários SQL de RLS aprovados. Validação institucional e testes completos de fluxo permanecem pendentes. Consulte [versões](docs/VERSOES.md) e [pendências](docs/pendencias.md); a descrição legada abaixo será revisada com a conclusão dos fluxos.

Aplicação de apoio aos fluxos de férias e folgas dos servidores da Prefeitura Municipal de Betim. O SGF permite simular períodos, registrar pedidos, acompanhar decisões da chefia e do RH, administrar cadastros e visualizar a escala. **O comprovante registra o protocolo; ele não autoriza o afastamento.**

> **Estado do projeto (02/10/2026):** piloto em desenvolvimento. Os fluxos foram implementados e verificados localmente, mas as regras de direito a férias e a política de senhas ainda exigem homologação institucional antes de uso em produção. Veja [pendências](docs/pendencias.md) e [revisão técnica](docs/REVISAO_TECNICA.md).

## Para apresentar ao TI

| Tema | Situação atual |
|---|---|
| Interface | Site estático em HTML, CSS e JavaScript, sem compilação do frontend |
| Dados e autenticação | Supabase Auth, PostgreSQL com RLS e Edge Functions |
| Hospedagem atual | Vercel publica somente `dist/`; o backend permanece no Supabase |
| Acessos | Público (simulação), Servidor, Diretor, RH e Administrador; uma conta pode reunir os quatro acessos autenticados |
| Rastreabilidade | Protocolo, duas aprovações, histórico de situação, lançamentos e eventos de auditoria |
| Administração | CNES e lotação principal, calendário institucional, escala mínima nominal, cadastro e desativação com histórico preservado |
| Uso em produção | Condicionado à homologação do RH e às verificações descritas abaixo |

### Fluxo resumido

1. Sem login, a pessoa usa **Simulação Rápida**: escolhe férias ou folga, dias úteis ou corridos e se quer calcular pela data de início ou pela data de retorno. Para férias, informa a quantidade de dias; para folga, o saldo de horas e a carga horária diária. Dias úteis desconsideram fins de semana, feriados e pontos facultativos; dias corridos contam todos os dias do intervalo. A data de retorno deve ser um dia útil. O day-off de aniversário é ignorado e nenhum pedido é registrado.
2. Para solicitar acesso, informa dados funcionais, e-mail institucional e lotação CNES. O RH pode aprovar Servidor em sua lotação; o administrador pode conceder qualquer acesso. Se o CPF já tiver conta, os acessos são acrescentados à mesma identidade.
3. Já autenticado, o servidor escolhe a modalidade, confere os dados funcionais e simula as datas. O envio registra protocolo, períodos e etapas de aprovação. Se o cadastro funcional ainda estiver pendente, abre também uma pendência de inclusão.
4. O RH analisa a etapa da chefia imediata no seu escopo. Após essa aprovação, registra a segunda decisão na etapa RH. As duas decisões continuam separadas e auditáveis.
5. O RH pode programar, reprogramar, cancelar ou concluir conforme a situação. A conclusão que consome banco de horas exige saldo validado.
6. O servidor acompanha situação, pareceres, histórico e notificações em **Meus pedidos**. Diretor, RH e administrador consultam a escala mensal, definem a lista nominal opcional por dia e lotação e veem alertas de sobreposição. RH e administrador podem arquivar pedidos apenas em sua própria fila.

Na interface, **Entrar no SGF** é a ação principal da página inicial. O login reúne acesso existente, recuperação de senha e solicitação de novo acesso em caminhos separados. Depois de entrar, a navegação superior concentra as áreas disponíveis para cada perfil; cada tela destaca sua próxima ação. Na análise de pedidos, a decisão aparece antes dos detalhes de histórico e calendário.

O login usa login ou CPF e senha. A conta administrativa antiga, mesmo sem CPF, entra com o login `admin`. Quando a conta reúne mais de um acesso, a pessoa escolhe **Servidor**, **RH** ou **Administrador** após autenticar e pode trocar de área pela navegação. O administrador concede acessos em conjunto, define as lotações do RH e envia convite somente para uma conta nova. **Público** é o acesso sem login, limitado à simulação.

No projeto Supabase atualmente conectado, as migrations de banco de horas, múltiplos acessos por CPF, recuperação do login antigo, lotação principal, arquivamento, escala nominal e aprovação de lotação pelo RH foram aplicadas até 30/09/2026, junto com as Edge Functions correspondentes. O login `admin` foi testado na interface local. O site publicado no Netlify ainda requer uma nova publicação e homologação. Em outros ambientes, aplique as migrations na ordem e publique as funções antes de usar este frontend.

## Executar a interface localmente

Requisitos: navegador moderno, acesso à internet e um servidor HTTP estático. Não há `npm install` nem build local. Com Python 3:

```bash
python -m http.server 8080
```

Ou, com Node.js:

```bash
npx --yes http-server . -p 8080 -c-1
```

Abra `http://localhost:8080`. Também é possível usar o Live Server do VS Code. A página chama o **projeto Supabase configurado no código**; uma execução local não constitui ambiente isolado de demonstração. Use somente dados fictícios e uma instância preparada para testes. Abrir `index.html` por `file://` pode falhar por restrições do navegador.

Para um ambiente independente, configure a URL e a chave publicável do Supabase em `assets/app.js`, ajuste os domínios de `connect-src` em `index.html` e `netlify.toml`, prepare o banco e publique as Edge Functions. A chave `service_role` pertence exclusivamente ao ambiente seguro das Edge Functions.

## Estrutura do repositório

| Caminho | Responsabilidade |
|---|---|
| `index.html` | Estrutura inicial, metadados e carregamento de recursos |
| `assets/app.js` | Navegação, simulação de períodos e telas dos quatro perfis |
| `assets/*.css` | Estilos da interface, calendário, escala e impressão |
| `supabase/functions/` | Login, envio, gestão de acessos, cadastros, inclusões e operações |
| `supabase/migrations/` | Alterações versionadas do banco existente |
| `netlify.toml` | Build estático, publicação e cabeçalhos HTTP |
| `docs/` | Operação, hospedagem, homologação, arquitetura e pendências |
| `tests/` | Testes de interface, acessos, permissões, situações e consistência dos pedidos |

O mapa de componentes, entidades e permissões está em [ARQUITETURA.md](docs/ARQUITETURA.md). O roteiro operacional detalhado está em [OPERACAO.md](docs/OPERACAO.md).

## Verificações locais

Com Node.js 24 ou superior:

```bash
node --check assets/app.js
node --test tests/*.test.mjs
```

Esses comandos verificam a sintaxe do frontend, a simulação rápida, os quatro contextos de acesso, permissões, mudanças de situação, acessibilidade básica, responsividade estrutural e consistência dos períodos enviados. O GitHub Actions executa a mesma suíte em cada envio à `main` e em pull requests. Os resultados da revisão visual e da conferência remota estão em [VALIDACAO_UI.md](docs/VALIDACAO_UI.md). Os testes não substituem a homologação dos cálculos pelo RH nem a validação pós-publicação nos navegadores institucionais.

## Implantação e configuração

1. Preparar um projeto Supabase de homologação, credenciais individuais e cadastros fictícios.
2. A migration `20260928140000_sgf_baseline.sql` cria as entidades iniciais em um projeto vazio. O GitHub Actions inicia um Supabase local e reaplica toda a cadeia de migrations a cada alteração; mantenha esse job aprovado antes de publicar mudanças de banco.
3. Antes da migration `20260929234326_cpf_multi_access.sql`, conferir o CPF das contas vinculadas a servidores e corrigir divergências na base. Aplicar também `20260930002220_restore_login_alias.sql`: ela preserva o login `admin`, cria identificadores para contas sem login e passa a atribuir login às novas contas. Uma conta sem CPF pode entrar por login, mas precisa de CPF validado para reunir acessos pela mesma identidade. Aplicar as migrations em ordem e publicar **todas** as Edge Functions alteradas na mesma janela da mudança. Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` nas funções que as usam. Não copiar segredos para o frontend.
4. Conferir URL e chave publicável em `assets/app.js`, políticas de RLS, domínios de autenticação, redirects e CSP. Configurar calendário e cadastros institucionais.
5. Seguir [HOSPEDAGEM.md](docs/HOSPEDAGEM.md) para publicar e validar o Netlify. A pasta `dist/` contém somente os arquivos do site; migrations e documentos operacionais não são publicados.
6. Executar a [homologação de regras](docs/HOMOLOGACAO_REGRAS.md), os testes por perfil e a revisão de segurança antes de qualquer uso real.

O frontend usa `@supabase/supabase-js` via CDN, fixado na versão `2.117.2`; as funções usam a mesma versão via importação `npm:` no Deno. A configuração atual aponta para o projeto Supabase do piloto; a separação das credenciais publicáveis e dos domínios do ambiente definitivo continua obrigatória antes da produção institucional.

## Segurança e dados pessoais

- O navegador possui somente a chave publicável. As funções administrativas validam a sessão e o papel; o banco aplica RLS e escopos por lotação.
- CPF, nascimento, matrícula, e-mail e histórico funcional são dados pessoais. Demonstrações devem usar dados fictícios; permissões, retenção, backup e tratamento institucional precisam de aceite do TI/RH.
- O envio de solicitações exige sessão autenticada, perfil de servidor liberado e vínculo entre conta, CPF e matrícula. A área pública permite simular, entrar ou solicitar acesso, sem enviar pedidos.
- As datas são simuladas no navegador. O endpoint confere formato, ordem, duração e saldo declarado em pedidos de banco de horas, mas a **validação normativa do direito e do cálculo ainda precisa ser homologada e consolidada no servidor** antes da produção.
- CORS das Edge Functions permanece aberto até a definição dos domínios oficiais e previews. Restringi-lo integra a preparação para produção.

## Documentos e licença

- [Operação do piloto](docs/OPERACAO.md)
- [Arquitetura e fluxos](docs/ARQUITETURA.md)
- [Hospedagem](docs/HOSPEDAGEM.md)
- [Homologação das regras](docs/HOMOLOGACAO_REGRAS.md)
- [Revisão técnica e decisões](docs/REVISAO_TECNICA.md)
- [Pendências](docs/pendencias.md)
- [Lotações CNES para conferência](docs/cnes-lotacoes.md)

O projeto usa [licença proprietária](LICENSE). A autorização de uso institucional e as condições de modificação constam no próprio documento.
