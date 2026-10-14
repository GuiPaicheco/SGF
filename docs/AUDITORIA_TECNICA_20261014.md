# Auditoria técnica — SGF

Data: 14/10/2026. Referência: código local a partir de `d781e54`. Perfis funcionais solicitados: **Servidor, RH/Diretor e Administrador**.

## Atualização — correções A01–A06

Os achados abaixo descrevem a auditoria original, anterior às correções. Foram corrigidos posteriormente nesta data:

- A01: RH/Diretor unificado com código interno `rh`; enum antigo preservado para histórico. Migração remota gerou a versão `20261014153031`, espelhada no repositório. Trigger invoker normaliza inserções/alterações e constraint admite somente os três papéis canônicos. Escopos não foram alterados. Contexto salvo `diretor` deixa de ser válido: reabra/entre e selecione RH/Diretor.
- A02: busca e linha administrativas usam a matrícula do vínculo; busca também inclui CNES contextual.
- A03: detalhe consulta `unit-calendar` nos meses dos períodos; usa projeções por atuação e o critério/visão escolhidos na Escala. Conflitos não atravessam lacunas ou unidades. Critério e visão são informados no detalhe; falha de consulta aparece como indisponibilidade, não como ausência comprovada de conflito.
- A04/A05: atribuições são preservadas nos dias/unidades válidos; preenchimento em lote e observações sincronizam o rascunho.
- A06: envio captura rascunho e visão; resposta antiga não altera o novo rascunho nem navega. Operações bloqueiam cliques duplicados e checam a visão antes de avisar/navegar; decisões por unidade não mostram aviso em contexto posterior.

Verificação: **302 testes locais aprovados**, incluindo 11 regressões desta auditoria. Supabase: normalização ensaiada com rollback e comparação integral dos escopos/quantidade de contas; após aplicação, nenhuma conta possui papel operacional Diretor. Ensaios reais de isolamento (11 verificações) e cadastro multi-vínculo (10) passaram e foram revertidos, sem fixtures persistidas. Enum e eventos históricos não foram removidos. Edge Functions já existentes aceitam `rh`; não foi necessário redeploy de funções.

CLI Supabase/npx não estavam disponíveis no terminal; a migração foi criada pelo conector, e o arquivo local usa a versão efetivamente gerada pelo serviço, não uma data inventada. Índice de changelog Markdown não pôde ser lido pela ferramenta web; a sintaxe do trigger foi conferida na [documentação PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createtrigger.html).

Advisors após a migração: tabelas de acesso exclusivo ao backend continuam com RLS sem política pública (INFO); não foram abertas para remover o aviso. Proteção contra senhas vazadas permanece desativada (WARN), já pertencente ao bloco 09: [orientação de proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não foi contratado plano ou reduzida proteção.

O script de diagnóstico agora reexecuta as regressões corrigidas. As reproduções defeituosas e seus limites permanecem documentadas nas seções seguintes como histórico. Volume, foco assíncrono geral, acessibilidade completa e experiência real no navegador continuam pendentes; estas correções não encerram todo o bloco 08.

Repetição ampliada: nove cenários SQL integrados passaram com rollback (acesso, cadastro, revisão por unidade, calendário, distribuição, legado, blocos 04/05/06). Foi detectada uma dependência de data nas fixtures antigas: vínculos com `valid_from=current_date` eram usados em pedidos fixos de outubro. A vigência fictícia foi explicitada em 2020; o ensaio de calendário passou sem alterar a regra de vigência do sistema. Nenhuma fixture persistiu no piloto. Reconstrução/dump integral nesta versão ainda depende do CI, não foi declarada executada localmente.

## 01. Método e limites

Auditoria de código, contratos de acesso e testes locais, sem navegador, chamadas à API ou gravações no Supabase. Suíte existente: **291/291 aprovada**. Diagnósticos novos executados por `node scripts/audit-technical-ui.mjs`: usam trechos reais de `assets/app.js` em VM, dados fictícios, DOM/rede simulados e respostas adiadas.

O diagnóstico reproduz comportamentos indesejados atuais; não é um teste de correção e não entra na contagem da suíte. Não é auditoria visual, certificação WCAG, ensaio de carga, revisão exaustiva de vulnerabilidades ou confirmação do estado do banco publicado. Nenhum problema abaixo foi corrigido nesta rodada. `logo.png` previamente alterado foi preservado.

Orientação Supabase utilizada para distinguir autorização de interface, servidor e banco, sem alterar permissões nem tratar falha de navegação como prova de falha no banco.

## 02. Matriz dos três perfis funcionais

| Perfil pretendido | Cobertura técnica desta rodada | Situação/limites |
|---|---|---|
| Servidor | Rotas próprias, contexto por vínculo, simulação, períodos, distribuição, submissão, recuperação e acompanhamento; testes existentes e diagnósticos de rascunho/envio | Erros A04–A06 reproduzidos; uso real das telas não executado |
| RH/Diretor | Rotas/capacidades no frontend e lista de ações/contexto no servidor; busca, revisão por CNES, calendário e conflitos; testes de isolamento e transições existentes | Código ainda divide RH e Diretor (A01); busca e conflito do detalhe falham nos cenários A02/A03 |
| Administrador | Rotas globais e bloqueio das telas de solicitação como servidor, ações exclusivas de estrutura/permissões; testes de contexto e concessões existentes | Busca moderna e conflito global afetados; volume de dados exige ensaio adicional |

Não houve execução interativa de criar/resetar/desativar contas, editar catálogos, alterar feriados, aprovar/recusar pedidos ou modificar saldos. Os testes que inspecionam SQL e strings não demonstram execução dessas operações no banco nesta rodada.

## 03. Achados confirmados

### A01 — Alta: três perfis funcionais, mas quatro papéis operacionais no código

Evidências: `assets/access-policy.js` mantém `servidor`, `rh`, `diretor`, `administrador`; `_shared/action-policy.ts` separa `management` de `operators`; `renderWorkspaceNav` oferece Cadastros/Acessos para RH, mas não Diretor. Escala mínima, banco de horas e redistribuição também diferem. Testes atuais verificam deliberadamente essa separação.

Impacto: nomear ambos como RH/Diretor sem alterar os contratos não os torna equivalentes; pessoas com papel Diretor continuariam sem parte da gestão esperada. É uma divergência do produto, não prova de acesso indevido.

Recomendação: definir um perfil de gestão unificado, compatibilizar papéis existentes sem ampliar escopos de CNES/lotação, revisar frontend/Edge/SQL/concessões e migrar com histórico preservado. Não resolver apenas trocando rótulo ou concedendo Administrador.

### A02 — Média: matrícula moderna ignorada na busca e identificação administrativa

Evidência: `loadRequests` já busca `bond.registration`, mas `renderDashboard` monta a busca e a linha com `servidor.matricula`. Diagnóstico: pedido do segundo vínculo, matrícula `MATRICULA-SEGUNDA`, não encontrado pela busca; a matrícula legada é encontrada.

Impacto: gestor pode acreditar que não existe pedido daquela matrícula ou identificar o vínculo errado. Recomendação: preferir matrícula do vínculo, com fallback legado somente quando ausente; incluir CNES contextual na busca e apresentação quando relevante.

### A03 — Média: conflito no detalhe não usa os períodos reais nem o mesmo critério do calendário

Evidência: `requestConflicts` compara `start_date/end_date` globais e usa lotação **ou** cargo **ou** função. `renderDetail` chama essa função também em pedidos modernos. Diagnóstico: pedido fracionado em 01–02 e 29–30/04/2027 aponta conflito com outro em 15–16/04; outro pedido de mesmo cargo em unidade diferente também é apontado na visão global.

Impacto: alerta falso ou incoerente com o calendário filtrado. Para gestor de uma única unidade, RLS pode limitar o conjunto; isso não corrige a lógica global nem a lacuna entre períodos. Não confundir com conflito manual justificado, que é um fluxo separado.

Recomendação: unificar o critério de conflitos do detalhe com o calendário, usando dias/atribuições reais, escopo e filtros; distinguir planejamento de confirmação. Não usar alerta como impedimento legal automático.

### A04 — Média: voltar às datas elimina atribuições mesmo sem mudar o período

Evidência: o envio de `dates-form` sempre executa `state.request.dayResponsibilities = []`. Diagnóstico: mesmas datas antes/depois, uma atribuição salva → zero.

Impacto: servidor refaz o planejamento CNES por dia apenas por revisar uma etapa. Recomendação: preservar atribuições de dias ainda válidos e exigir escolha somente para dias novos ou contextos inválidos.

### A05 — Média: preenchimento rápido não atualiza o estado do rascunho

Evidência: ações `responsibility-fill-all/weekday` atualizam `select.value`, mas não o estado nem o fluxo de mudança. Diagnóstico: dois selects preenchidos com X; zero atribuições no estado.

Limite: envio imediato lê os selects e salva corretamente; não há evidência de envio com unidade omitida por esse motivo. A perda ocorre ao abandonar/re-renderizar a confirmação antes de enviar. Observações também só são copiadas no envio.

Recomendação: sincronizar rascunho nas ações em lote e nas observações, preservando-o entre etapas; não armazenar dados pessoais indiscriminadamente em armazenamento persistente.

### A06 — Alta: envio antigo pode sobrescrever estado de uma navegação posterior

Evidência: `submitRequest` não captura identidade do rascunho/visão antes de aguardar a resposta; após `await` grava em `state.request` e chama `go('receipt')`. Outros fluxos já usam `captureView`, demonstrando proteção possível, mas não aplicada aqui.

Diagnóstico com rede simulada: iniciar envio A, trocar o objeto de rascunho para B, resolver resposta A → protocolo A escrito em B e navegação para comprovante. Não é ensaio real entre sessões e não demonstra gravação de pedido de uma pessoa em nome de outra no servidor.

Impacto: perda de rascunho, comprovante fora do contexto e possível confusão depois de sair/trocar perfil enquanto envia. Recomendação: capturar contexto, usuário, rascunho e navegação; reconciliar resposta com o pedido correto, sem alterar a tela/contexto posterior. Repetir diagnóstico para operações e recarga de dados após salvar.

## 04. Riscos e melhorias que ainda exigem ensaio

1. **Volume:** `loadRequests` carrega coleção e relações completas sem paginação no servidor; paginação administrativa é local. Não foi medido limite efetivo da API, truncamento ou tempo. Ensaiar com base sintética grande e depois definir paginação/consulta detalhada sob demanda.
2. **Histórico:** formulário expõe códigos e UUIDs para busca. Oferecer filtros legíveis e opções avançadas recolhidas; isso é recomendação de praticidade, não defeito funcional confirmado.
3. **Servidor:** lista de pedidos sem filtros/paginação e sem destaque de matrícula na tabela. Avaliar conforme volume e escolha de contexto.
4. **Foco assíncrono e mensagens:** foco do app ocorre antes de algumas renderizações aguardadas; observar teclado/leitor de tela para confirmar anúncio e foco final. Toast de curta duração não deve ser a única explicação de erro persistente.
5. **Calendário e rascunhos longos:** conferir atualização enquanto a tela permanece aberta, perda de dados na navegação e orientação depois de recálculo; não foi repetido ensaio real de feriado nesta rodada.
6. **Impressão e zoom:** melhorias de CSS já existem, mas A4, 200%, tablet, leitor de tela e matriz completa de formulários precisam de teste visual.

## 05. Ordem de correção sugerida

1. Consolidar o contrato dos três perfis (A01), mantendo isolamento por unidade e autoria.
2. Proteger respostas assíncronas e rascunhos (A06).
3. Corrigir identificação/busca por vínculo (A02).
4. Unificar conflitos com calendário (A03).
5. Preservar atribuições e preenchimento rápido (A04/A05).
6. Ensaiar volume/filtros/foco e completar revisão visual.

Os 291 testes aprovados não anulam estes achados: a suíte atual não cobre os cenários reproduzidos. Depois das correções, converter os diagnósticos em testes de regressão com o comportamento desejado.
