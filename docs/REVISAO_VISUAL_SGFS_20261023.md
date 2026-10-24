# Revisão visual SGFS — 23/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

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

Após o responsável fornecer o acesso, a Administração foi conferida em produção: calendário sem unidade pré-selecionada, consulta por intervalo, diretório das unidades, cadastro CNES com 40 profissionais e feriados com abrangência geral/específica. Inspeção em desktop de 1920 px e celular de 390 px. O diretório recebeu cartões móveis para manter o botão de acesso visível. Não foram repetidos lançamentos, cancelamentos, importações CNES ou alteração de acessos no banco real. A revisão é visual; não representa ensaio de carga ou medição de latência do backend.

Publicação Vercel confirmada para o commit visual; início e login SGFS conferidos no endereço público. Captura de evidência sem dados pessoais mantida localmente em `.tools/evidencias/sgfs-inicio-publicado.jpg`.

Próximo passo: receber o retorno visual do piloto e conferir impressos nos equipamentos da unidade, preservando os registros reais.
