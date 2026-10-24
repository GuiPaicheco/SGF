# Revisão técnica para apresentação ao TI

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Data: 29/09/2026. Escopo: frontend, estilos, configuração de publicação, Edge Functions, migrations e documentação do repositório. A revisão local não acessou o banco remoto, usuários reais nem um deploy publicado. A migration nova ainda precisa ser executada e verificada em um banco de homologação; não havia Postgres ou Docker disponível localmente.

**Atualização de 29/09/2026:** as três migrations novas foram aplicadas ao projeto Supabase conectado, e as Edge Functions alteradas foram publicadas. O login `admin` foi confirmado na interface local, assim como a leitura das áreas de solicitações, escala, notificações, inclusões, cadastros, acessos e perfis. Isso não substitui a homologação com contas de cada papel e dados fictícios; o frontend atualizado ainda não foi publicado no Netlify.

**Atualização de 30/09/2026:** foram aplicadas as migrations de fluxo administrativo, aprovação de lotação pelo RH, aprovação e vínculo CNES em uma transação e correção dos nomes de feriados da carga inicial. As funções correspondentes foram publicadas no projeto Supabase conectado. Na interface local, o login administrativo, a fila de solicitações, a escala mensal e nominal, os cadastros e o calendário administrativo foram conferidos; 14 testes automatizados passaram. Permanecem pendentes a homologação com contas de Servidor/RH, a política de senha mínima do Supabase Auth e o deploy do frontend no Netlify.

**Atualização de 30/09/2026 — produção:** o repositório foi conectado ao Netlify e a branch `main` está publicada em `https://sgfbetim.netlify.app`. Foi adicionada uma baseline do banco, e a reconstrução de um Supabase vazio a partir de todas as migrations passou na integração contínua (execução `36749569051`). Os advisors remotos foram executados, os dois índices de chaves estrangeiras faltantes foram aplicados, e as senhas temporárias fixas foram substituídas por credenciais aleatórias fortes. A proteção contra senhas vazadas ainda precisa ser habilitada no painel do Supabase; o recurso depende do plano Pro ou superior.

## Correções feitas nesta revisão

1. O build do Netlify passa a copiar todos os arquivos CSS e JavaScript de `assets/`. Antes, `scale.css` era referenciado por `index.html`, mas não chegava ao site publicado.
2. `submit-request` rejeita datas impossíveis ou invertidas, períodos sobrepostos, quantidades de dias maiores que o intervalo e pedidos de banco de horas superiores ao saldo declarado. A validação foi isolada e recebeu testes locais.
3. O frontend mostra um erro de inicialização se a biblioteca Supabase do CDN não carregar.
4. O alerta de conflito de escala deixa de considerar duas lotações ausentes como a mesma lotação.
5. O botão de impressão usa o listener do aplicativo, compatível com a CSP que bloqueia manipuladores inline.
6. As horas pedidas por banco de horas passam a ser calculadas a partir dos dias solicitados e da jornada. O saldo declarado permanece separado; a migration ajusta pedidos ainda não concluídos.
7. A entrada pública foi simplificada para Simulação Rápida sem dados pessoais. O endpoint de envio exige sessão aprovada e cadastro funcional vinculado à conta.

## Prioridades antes de produção

| Prioridade | Questão | Encaminhamento |
|---|---|---|
| Alta | O cálculo de direito e dos períodos ocorre no navegador; a API ainda não recalcula integralmente as regras | Homologar as regras com o RH e implementar cálculo e validação autoritativos no servidor |
| Alta | Não houve teste integrado com sessão, RLS, Edge Functions e fluxo completo por papel | Criar ambiente de homologação e executar roteiro ponta a ponta com dados fictícios |
| Alta | Pedidos de banco de horas já concluídos antes desta correção podem ter debitado o saldo declarado inteiro | Conferir extratos e corrigir eventuais diferenças mediante procedimento auditável do RH |
| Alta | As Edge Functions aceitam CORS de qualquer origem | Definir domínios de produção e preview; restringir origens após a decisão de hospedagem |
| Média | URL e chave publicável do projeto estão embutidas no frontend, assim como os domínios da CSP | Criar processo explícito de configuração por ambiente |
| Média | `assets/app.js` concentra navegação, cálculos, consultas e renderização em um arquivo grande | Extrair módulos por domínio gradualmente, após estabilizar os fluxos e preservar testes de regressão |
| Média | Reprogramação aceita períodos informados pelo cliente com validação temporal limitada | Validar novamente regras e quantidades no servidor e testar transições adversas |
| Média | O cache de `assets/*` é imutável; cada alteração publicada depende da atualização dos parâmetros de versão no HTML | Automatizar identificação de arquivos ou revisar a política de cache no deploy |

## Fluxos que merecem melhoria

- **Solicitação:** preencher dados funcionais a partir do cadastro autenticado e impedir divergência antes da simulação; preservar rascunho de simulações longas.
- **RH:** exibir a próxima ação exigida em cada etapa do pedido e destacar inclusões pendentes que impedem a análise normal.
- **Calendário:** tratar conflito como alerta e registrar uma decisão explícita do responsável quando uma sobreposição for aceita.
- **Comunicação:** permitir reimpressão do comprovante e preparar texto copiável para o e-mail institucional, sem presumir envio automático.
- **Observabilidade:** registrar falhas operacionais com identificador de correlação, sem expor erros internos do banco ao usuário.

As decisões sobre regras de férias, políticas de acesso e dados oficiais devem ser validadas pelo RH e pelo TI. A lista operacional está em [pendencias.md](pendencias.md).
