# Homologação das regras de férias e folgas

Roteiro para validação formal pelo RH. Registrar em cada caso a matrícula de teste, resultado esperado, resultado obtido, responsável e data.

## Casos obrigatórios

| Caso | Variação mínima | Conferir |
|---|---|---|
| Admissão e período aquisitivo | recém-admitido e período completo | direito disponível e mensagem apresentada |
| Vínculo | efetivo e demais vínculos | modalidades e fracionamento permitidos |
| Faltas injustificadas | com e sem redução | quantidade final de dias |
| Início e retorno | início informado e retorno informado | primeiro dia, último dia e retorno |
| Fracionamento | período único e dois períodos | total, intervalo e ordem cronológica |
| Calendário oficial | feriado e ponto facultativo no intervalo | dias não consumidos e retorno |
| Day-off de aniversário | aniversário dentro e fora do intervalo | marcação automática sem consumo |
| Banco de horas | saldo suficiente e insuficiente | jornada, conversão, validação e bloqueio |

## Critérios de aceite

- O calendário visual deve coincidir com as datas persistidas em `request_periods`.
- O retorno deve ocorrer no primeiro dia útil aplicável.
- O day-off deve ser apenas contabilizado e exibido, nunca solicitado.
- Uma folga de banco de horas só pode ser concluída com saldo validado suficiente.
- Divergências devem ser registradas antes da liberação em produção.

## Evidência

Anexar o comprovante impresso e uma captura da linha do tempo para cada caso. A homologação é concluída somente com o aceite nominal do RH.
