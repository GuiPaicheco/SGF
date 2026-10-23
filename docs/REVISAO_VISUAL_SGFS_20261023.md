# Revisão visual SGFS — 23/10/2026

Base atualizada por fast-forward para `468a8d4`, preservando os novos fluxos do GitHub.

## Resultado

- Identidade SGFS — Sistema de Gestão de Funcionários da Saúde; verde institucional e dourado preservados.
- Rodapé com Diretoria IV de Atenção Primária à Saúde e Prefeitura Municipal de Betim.
- Início com duas ações claras; login com formulário destacado e orientação lateral.
- Cabeçalho institucional sem repetir o nome da unidade; navegação com identificação da aba ativa.
- Calendário ocupa mais largura; filtros principais compactos, com critérios avançados sob demanda. Verificado o alinhamento tanto por mês como por intervalo.
- Espaçamento, contraste, foco de teclado e controles uniformizados. Cartões móveis dos funcionários preservados.
- Camada CSS restrita à tela: não modifica dimensões de impressão. Sem bibliotecas, fontes externas, consultas adicionais ou alterações de banco.

## Verificação executada

Prévia estática local com os mesmos arquivos gerados para publicação e consultas autenticadas existentes:

| Tela / fluxo | Evidência |
| --- | --- |
| Início e login | Inspeção visual desktop, tablet de 768 px e celulares de 320/390 px; sem rolagem horizontal da página nas larguras verificadas. |
| Identificação do operador | Entrada do RH e escolha do operador; abas liberadas após identificação. |
| Calendário | Consulta dos 40 profissionais; filtros mensal/intervalo, painel avançado aberto/fechado; dados e registros existentes renderizados. Desktop de 1280 px e celular de 390 px. |
| Férias e Cadastros | Lista alfabética em tabela no desktop e cartões no celular. |
| Programar férias | Formulário real aberto, campos e hierarquia inspecionados; nenhum lançamento enviado. |
| Folga e Afastamento | Formulário real aberto no celular; calendário de seleção, campos inferiores, foco e rodapé inspecionados; nenhum registro enviado. |
| Recuperar senha | Tela aberta em 320 px; nenhum e-mail solicitado. |
| Simulação rápida | 25 dias úteis a partir de 18/01/2027; resultado apresentado com último dia 19/02 e retorno 22/02, sem persistência de dados. |

Console sem erros/avisos na consulta realizada. Suite Node: 456 aprovados, zero falhas. Build estático e `git diff --check` aprovados.

## Limites e próximo passo

A Administração autenticada aguarda login do responsável na aba Chrome de revisão: a senha foi alterada na base recebida do GitHub. Não declarar suas telas como visualmente verificadas nesta revisão. Também não foram repetidos lançamentos, cancelamentos, importações CNES ou alteração de acessos no banco real. A revisão é visual; não representa ensaio de carga ou medição de latência do backend.

Próximo passo: concluir a inspeção administrativa autenticada e receber o retorno visual do piloto, preservando os registros reais.
