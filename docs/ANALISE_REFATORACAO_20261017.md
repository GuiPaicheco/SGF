# Análise para refatoração — 17/10/2026

## Base e alcance

Repositório local atualizado de `73066d9` para `2bfd432` (`origin/main`), por fast-forward de 89 commits. A árvore estava limpa antes da atualização. Nenhuma alteração em banco, contas, senhas ou publicação foi realizada nesta análise.

Revisão estática transversal do frontend, integração de envio/operações, contexto de acesso, políticas de ações, migrations, testes, build e documentação. Não representa leitura exaustiva de cada função SQL nem auditoria de segurança ou homologação completa. Estado remoto de Supabase/Vercel e resultados atuais do CI não foram consultados; informações de publicação nos documentos são evidências históricas.

Verificação local com Node 24.13.1: sintaxe de `assets/app.js` válida, 309 testes aprovados e build estático concluído. Docker, Deno e Supabase CLI não foram encontrados no PATH; reconstrução do banco e execução das Edge Functions não foram repetidas. Parte dos testes verifica padrões de código e não comportamento integrado.

## Fluxo atual a preservar

1. Público: simulação rápida, login, recuperação e solicitação de acesso.
2. Identidade: uma pessoa/CPF, múltiplas matrículas, atuações CNES e lotações internas. Três perfis funcionais: Servidor, RH/Diretor e Administrador; nomes históricos continuam em contratos de compatibilidade.
3. Servidor: seleciona contexto, modalidade e direito/saldo do vínculo, calcula períodos e distribui dias entre unidades autorizadoras; recebe protocolo.
4. Gestão: revisões independentes por unidade, aprovação e inclusão explícita no calendário. Correção de distribuição e substituição de pedido possuem contratos próprios; fluxo legado continua separado.
5. Operação: calendário, conflitos, escala nominal, banco de horas por vínculo, notificações e auditoria contextual.

Invariantes: matrícula não compartilha saldo; mesmo CNES não mistura diretorias; troca de perfil não mantém privilégios; aprovação não equivale a programação; comprovante não autoriza afastamento; histórico/autoria devem sobreviver às alterações.

## Pendências técnicas verificadas e pontos de atenção

| Prioridade | Evidência | Trabalho recomendado |
|---|---|---|
| Alta | `loadRequests`, em `assets/app.js:622`, consulta pedidos com períodos, atribuições, revisões, aprovações, histórico e lançamentos de horas sem `range`, limite ou contagem total. | Paginar e filtrar no servidor; carregar detalhes sob demanda. Medir com dados sintéticos acima do limite configurado da API. Há risco de truncamento e totais incompletos, ainda não reproduzido com volume real. |
| Alta | `assets/app.js` reúne aproximadamente 273 mil caracteres: sessão, estado, cálculos, chamadas HTTP, templates, navegação e eventos. | Extrair por responsabilidade e por fluxo, mantendo o comportamento em cada etapa. Evitar trocar framework e regra de negócio simultaneamente. |
| Alta | `captureView` protege várias consultas, mas `saveLocation` navega para `catalogs` após aguardar resposta sem verificar se usuário/contexto/tela continuam os mesmos. | Padronizar proteção de respostas assíncronas em gravações e carregamentos. Reproduzir salvar → navegar/trocar contexto → receber resposta; não confundir efeito visual tardio com falha de autorização no backend. |
| Média | `render()` dispara renderizadores assíncronos e chama `app.focus()` imediatamente; formulários e tabelas são substituídos depois. | Definir contrato assíncrono de renderização, foco final e mensagens persistentes; validar teclado e leitor de tela. |
| Média | `renderEmployeeDashboard` não oferece filtro/paginação e não mostra matrícula na tabela; o detalhe/comprovante já possui identificação por vínculo. | Projetar consulta e lista com matrícula, filtros, total e estados vazios coerentes com o contexto ativo. |
| Média | `docs/ARQUITETURA.md` afirma ausência de baseline e ambiente local, embora existam baseline, `supabase/config.toml` e CI de reconstrução; apresenta hospedagem Netlify como atual. | Atualizar o mapa arquitetural para refletir Vercel, múltiplos vínculos, revisões por unidade e limites reais dos testes. |
| Média | Cache de assets é `immutable` por um ano; URLs usam versões manuais em `index.html`. | Gerar versões por conteúdo no build ou garantir atualização automática dos identificadores a cada mudança. Risco de próxima publicação reutilizar conteúdo antigo se a versão não mudar; não há defeito de cache atual demonstrado. |
| Média | Build cria/copia para `dist` sem remover arquivos de builds anteriores. | Gerar saída limpa com alvo validado e testar remoção/renomeação de asset. Em execução incremental, arquivos antigos podem continuar publicados. |
| Média | CSP usa `style-src 'self'`, enquanto templates ainda contêm atributos `style`. | Mover estilos inline para classes e verificar console/layout no navegador; a política atual não autoriza esses atributos. Não flexibilizar CSP para acomodá-los. |

Ponto adicional para investigação: `submit-request` valida a matrícula contra `context.registration`, mas depois atribui `payload.registration = byCpf.matricula`. Revisar o encadeamento SQL contextual antes de alterar: o efeito sobre o pedido da segunda matrícula não foi confirmado nesta rodada. Criar caso integrado explícito com matrícula principal diferente da selecionada.

## Pendências existentes que continuam válidas

Os blocos 01–07 de `pendencias.md` têm conclusão técnica documentada. Não reabrir A01–A06 da auditoria de 14/10 como defeitos atuais: as correções já estão na base sincronizada.

Continuam: ensaio de volume/filtros/foco; revisão completa dos três perfis; teclado, tablet, zoom 200%, leitor de tela e impressão; atualização das capturas/slides; homologação normativa e funcional pelo RH; equipamentos institucionais; retenção e aceite nominal. Também permanecem separação de ambientes, domínio/CORS, administração individualizada, política de senhas, backup operacional completo e observabilidade. Reconstrução PostgreSQL em CI não substitui recuperação de Auth/SMTP, Storage, segredos e hospedagem.

## Ordem proposta para as refatorações

1. Registrar as mudanças desejadas de cada perfil: gatilho, dados obrigatórios, decisão, resultado, exceções e responsáveis. Separar mudança de processo de reorganização interna.
2. Consolidar testes comportamentais dos contratos: múltiplas matrículas/unidades, saldo isolado, revisão independente, reenvio/substituição, concorrência e navegação durante respostas atrasadas.
3. Extrair cliente de API/contexto, navegação e controle de operações assíncronas; depois módulos de solicitação, gestão, calendário e cadastros. Preservar interfaces públicas durante a extração.
4. Introduzir consultas paginadas e DTOs de lista/detalhe, sem remover escopos/RLS. Tratar totais no servidor.
5. Implementar as alterações de fluxo definidas pelo responsável em incrementos pequenos; se houver alteração de contrato, coordenar migration, Edge Function e frontend.
6. Atualizar arquitetura, manual e pendências junto de cada entrega; concluir ensaios visuais e de integração da versão candidata.

Não há motivo técnico demonstrado nesta revisão para reescrever todo o sistema. A próxima definição necessária é quais etapas e decisões do fluxo devem mudar; a extração de módulos deve facilitar essas mudanças sem alterar regras institucionais por suposição.
