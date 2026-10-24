# Operação do SGFS

## Rotina

1. Confira a versão publicada, os avisos de disponibilidade e o acesso às unidades.
2. Atualize os cadastros do CNES com conferência das diferenças, sem sobrescrever o histórico do RH.
3. Mantenha feriados e pontos facultativos corretos antes dos cálculos.
4. Revise operadores autorizados conforme mudanças de equipe e responsabilidade.
5. Trate ocorrências com registro mínimo da ação, data, versão e resultado esperado; mantenha os dados pessoais em canal protegido.

Os procedimentos do produto estão no [manual](MANUAL_USO.md) e no [guia de operações](GUIA_OPERACOES_FINAIS.md). A lista de trabalho restante é [pendencias.md](pendencias.md).

## Contas e dados

A instituição deve definir quem guarda as credenciais das unidades, como substituí-las e como revisar acessos. Não use redefinição de senha como teste de disponibilidade. A identificação do operador não deve ser confundida com login individual.

Backups e restauração precisam de responsável, controle de acesso, retenção e ensaio em ambiente separado. Um snapshot de tabelas da aplicação não equivale a backup integral de Auth, Storage e configuração da plataforma.

Não use `db reset`, scripts de limpeza ou fixtures em produção. Uma limpeza excepcional exige escopo explícito, cópia adequada e verificação posterior. O [registro de 23/10/2026](LIMPEZA_BASE_20261023.md) documenta uma ação já executada, não uma instrução para repeti-la.

## Atualizações e incidentes

Antes de publicar, siga [PUBLICACAO.md](PUBLICACAO.md). Em falha, registre o erro sem credenciais, confira a versão e investigue os logs no ambiente autorizado. Não desabilite RLS, autenticação ou validações para contornar o problema.

Comunique vulnerabilidades por canal privado conforme [SECURITY.md](../SECURITY.md). Para incidentes com dados pessoais, envolva o responsável institucional e o encarregado, segundo o procedimento aprovado.

Relatos datados de operações antigas permanecem no Git e nos documentos históricos; não são instruções da versão vigente.
