# Conferência final da interface — 23/10/2026

## Escopo implementado

- Feriados sem classificação territorial; tipos e abrangência preservados.
- Atualização CNES com animação por etapa real, revisão separada de novos/alterados, decisões em lote ou individuais e cargo em destaque.
- Ficha vinculada a um estabelecimento; retorno obrigatório à lista para acessar outro.
- Dados públicos em campos, listas e tabelas, sem JSON visível. Endereço em largura completa; nomes de campos acentuados; profissionais sem duplicação na ficha geral.
- Operador autorizado com novo layout, sem alteração de permissões.
- Folga por seleção de dias; afastamento contínuo com retorno opcional e atualização posterior versionada.
- Calendário, histórico, comprovante e exportações compatíveis com afastamentos sem previsão.

## Navegador — versão publicada

Conferidos com Administração e RH da UBS Amazonas:

1. Login por estabelecimento, entrada, saída e seleção de operador já autorizado.
2. Lista de unidades, abertura da UBS, ausência de seletor de troca dentro da ficha, dados completos, profissionais e cargos.
3. Consulta real Atualizar CNES: animação, resultado com 40 profissionais sem alterações e cancelamento da conferência sem gravação.
4. Feriados: classificação ausente, abrangência geral/específica, seleção de unidades e retorno a novo cadastro. Sem criação/exclusão de datas reais.
5. Lista Férias e Cadastros, formulário de férias e cadastro de aniversário: acesso e orientações sem concessão ou alteração de aniversários reais.
6. Folga: dias 26 e 28 selecionados, preservados ao trocar de mês e exibidos separados na prévia. Rascunho descartado.
7. Afastamento: início com retorno vazio aceito na prévia como Sem previsão. Rascunho descartado.
8. Calendário da unidade, legenda, abertura do registro existente e emissão do comprovante atual, sem imprimir, reprogramar ou cancelar a concessão.
9. Correção e nova conferência visual da ficha CNES após identificar cartões excessivamente altos e rótulos sem acentos.
10. Console do navegador sem erros nas telas visitadas; consulta Vercel de erros/fatais nos últimos 30 minutos sem registros retornados.

## Cobertura automatizada e banco

- 453 testes Node; 4 testes Python; build estático.
- Folgas não consecutivas, deduplicação, chave idempotente e rejeição de reenvio alterado.
- Afastamento sem data final persistida, visível no calendário futuro e impeditivo de sobreposição.
- Atualização de retorno com data exclusiva de trabalho, versão otimista, snapshot anterior e operador no histórico.
- Bloqueio de conclusão de afastamento sem término; isolamento de unidade e ausência de execução direta por authenticated.
- Regressões de calendário anual, day-off, férias úteis, revisão/cancelamento e feriados por unidade.
- Ensaios SQL executados em BEGIN/ROLLBACK; fixtures não persistem. Cenário novo também incluído no CI de banco vazio.
- Migration 20261023171909; manage-rh v16; manage-catalogs v13.

## Preservação e limites

Antes/depois da atualização: 40 entradas CNES, 42 contas RH, 1 lançamento e 11 datas de calendário. Hash integral do lançamento e das datas permaneceu igual. Nenhuma senha redefinida.

As gravações e exclusões foram verificadas com dados sintéticos transacionais, não alterando funcionários reais no navegador. A conferência visual foi feita em desktop; testes automatizados não substituem aceite de impressão, acessibilidade com tecnologia assistiva e uso em equipamentos institucionais. A revisão técnica não é homologação jurídica, aprovação do RH Central nem garantia de ausência absoluta de defeitos.

Permanecem o piloto institucional, os termos de governança e a decisão de política de senhas descritos no arquivo de pendências.
