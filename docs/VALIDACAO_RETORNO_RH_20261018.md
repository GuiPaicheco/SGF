# Prévia RH pela data de retorno — 18/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Nono bloco, código `9f89ba5`. Migração `20261018112843_rh_return_date_preview.sql` aplicada e `manage-rh` v6 publicada. O cálculo integra programação e edição sem alterar registros históricos nem o cálculo do fluxo legado.

## Comportamento

- Formulário permite escolher início do afastamento ou retorno ao trabalho. Envia somente a data do modo ativo; modo/data ficam preservados no plano calculado pelo retorno e reaparecem na reprogramação. Pedidos antigos do novo fluxo que só informam início continuam compatíveis.
- Retorno informado é uma data exata em dia útil, fora dos eventos ativos do calendário institucional e do day-off de aniversário. Data incompatível é recusada, sem ajuste silencioso para outra data.
- Em dias úteis, o servidor conta para trás, considerando fins de semana, eventos e aniversário. Em dias corridos, subtrai a quantidade de dias do retorno informado. Como diferentes términos podem conduzir ao mesmo retorno após um fim de semana, esse modo adota essa subtração direta; a prévia mostra início, término e retorno para conferência.
- No fracionamento, retorno escolhido é o do **primeiro período**. Início do segundo continua separado e deve respeitar o retorno do primeiro e os demais limites existentes. O rótulo e a orientação tornam essa distinção explícita.
- Mantém regimes de 25/16 dias úteis ou 30 corridos, prêmio 30/60/90, complemento e banco de horas declarado. Início calculado continua sujeito à admissão e ao período aquisitivo. Insuficiência exige a mesma exceção explícita e justificada.
- Limites de datas/quantidade e varredura de até 730 dias impedem cálculo ilimitado. Mudança relevante no calendário depois da prévia invalida a gravação antiga; versões e idempotência continuam ativas.

## Evidências

**375 testes Node aprovados**, build estático e verificação Deno aprovados. Testes adicionais verificam data única, modos inválidos, data inexistente, compatibilidade com payload anterior e preservação do modo na edição.

Ensaio SQL transacional com rollback antes e depois da migração, cenário `rhreturn` incluído no CI: feriado sintético, aniversário, fim de semana, horas fracionadas, insuficiência, mudança no calendário entre prévia/gravação, replay, edição com versão anterior preservada, regimes, fracionamentos 15+10 e 10+15, complemento, prêmio 30/60/90, limite superior de data, aquisição e admissão. Comparação entre cálculo direto/inverso preserva datas em dias úteis e retorno/quantidade em dias corridos.

Chrome com interface real e **API simulada**: escolher retorno → conferir prévia → programar registro fictício → editar e verificar modo/data preservados e horas disponíveis novamente em branco. Evidência `.tools/rh-return-local.png`, ignorada pelo Git. Aba e servidor local encerrados. Não representa integração completa navegador/banco publicado.

API publicada com sessões reais e payload de retorno: cadastro ainda pendente recebeu `400 RH_ENTRY_REVIEW_REQUIRED`; RH sem operador recebeu `403 RH_OPERATOR_REQUIRED`. Sessões encerradas. Nenhum cadastro real foi conferido, operador autorizado ou afastamento real lançado para testar. Advisor sem novos avisos; proteção contra senha vazada permanece aviso preexistente.

## Próximo bloco

Revisão de impressão/PDF e acessibilidade para o piloto, sem declarar homologação institucional. Regras municipais, completude/vigência do calendário de feriados, escala mínima, revisão dos cadastros, indicação dos operadores e aceite da Diretoria seguem pendentes. O cálculo usa os eventos ativos cadastrados; não consulta fonte externa a cada prévia nem presume que o calendário de anos futuros esteja completo.
