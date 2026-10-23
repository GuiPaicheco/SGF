# Pendências do SGF — piloto de 23/10/2026

Esta é a lista atual. Itens concluídos foram transferidos para o [histórico](HISTORICO_PENDENCIAS_20261023.md). Não retomar requisitos antigos de CPF/matrícula, autocadastro ou importação por arquivo.

## 01. Preparação técnica desta versão

1. [x] Login: UBS em ordem alfabética, DAPS na penúltima opção e Administração do SGF na última.
2. [x] Cabeçalho administrativo com Administração do SGF, independente do nome histórico da conta.
3. [x] Credencial administrativa alterada e validada; anterior recusada. Nenhuma credencial armazenada no repositório.
4. [x] Remover ramos inalcançáveis do autocadastro na API, mantendo resposta 410 e testes do histórico.
5. [x] Revisar textos de execução, datas brasileiras e rótulos de situação; retirar orientação de etapa do erro CNES.
6. [x] Excluir somente os dois feriados de teste inativos autorizados, com auditoria. Preservados os nove feriados válidos, cadastro e afastamento real.
7. [x] Conferir integridade e permissões: 55 tabelas com RLS, 324 restrições validadas, vínculos CNES sem órfãos e afastamentos na unidade correta. Estruturas históricas preservadas.
8. [x] Melhorar navegação móvel e lista RH: abas sem nomes cortados; funcionários em cartões nas telas pequenas e tabela no desktop.
9. [x] Testes Node/Python e build; funções access-auth v16 e manage-cnes v8 publicadas.
10. [x] Interface publicada e CI completo aprovado; conferidos login/cabeçalho administrativo, celular (320/390 px), tablet (768 px), desktop e lista RH. Últimos ajustes de grade, seletor de mês e alinhamento registrados no [relatório do piloto](REVISAO_PILOTO_20261023.md).

## 02. Acompanhamento do piloto

1. [ ] RH responsável executar cenário real autorizado: férias, folga, afastamento com/sem retorno, alteração, cancelamento e consulta do histórico.
2. [ ] Conferir impressão/assinaturas do comprovante nos equipamentos institucionais e exportações no software utilizado pela unidade.
3. [ ] Validar interpretação normativa, enquadramento e assentamentos com RH Central/SARH. O CNES não comprova saldo ou direito adquirido.
4. [ ] Registrar problemas observados pelos participantes, com tela, ação, resultado esperado e data; priorizar correções sem apagar histórico.

## 03. Governança e segurança operacional

1. [ ] Definir política das contas institucionais e substituição das senhas padrão antes de ampliar o uso. Esta entrega alterou somente a credencial administrativa solicitada.
2. [ ] Avaliar proteção contra senhas vazadas no plano Supabase disponível; não contratar plano nem mudar requisitos globais silenciosamente.
3. [ ] Aprovar termo de ciência dos operadores, finalidade/base legal, responsáveis, retenção, compartilhamento e procedimento de incidentes com jurídico/encarregado.
4. [ ] Definir responsáveis por suporte, backups, restauração e atualização das normas; ensaio isolado de restauração não substitui rotina institucional.

## Referências

- [Guia operacional atual](GUIA_OPERACOES_FINAIS.md)
- [Revisão técnica e limites do piloto](REVISAO_PILOTO_20261023.md)
- [Conferência visual anterior](CONFERENCIA_FINAL_20261023.md)

Versão preparada para piloto não é garantia de ausência absoluta de defeitos nem aceite jurídico/institucional. Novas funcionalidades ficam fora deste fechamento até o retorno do piloto.
