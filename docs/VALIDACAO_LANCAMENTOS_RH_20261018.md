# Lançamentos diretos do RH — 18/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Entrega técnica do quinto bloco, commits `d4ae58a` e `8c691c2`. Migração `20261018081927_rh_direct_leaves.sql` aplicada e `manage-rh` v3 publicada. CI do código: [execução 39111075794 aprovada](https://github.com/GuiPaicheco/SGF/actions/runs/39111075794).

## Comportamento entregue

Funcionário com cadastro conferido e vínculo/polo confirmado pode receber programação direta pelo calendário. RH precisa de operador autorizado selecionado; Administrador escolhe explicitamente a unidade. Beneficiário não precisa de login.

Férias regulamentares, fracionamento permitido, férias-prêmio e folgas usam prévia calculada no servidor. Jornada diária efetiva é informada, sem inferência pela carga semanal. Banco de horas é informado por lançamento: horas necessárias, possíveis e faltantes aparecem na conferência. Insuficiência exige opção explícita, justificativa e nova prévia antes da confirmação final. Nenhum saldo persistente é debitado, criado ou estornado pelo fluxo novo.

Gravação valida sessão, operador, polo, versões, sobreposição e repetição do período aquisitivo. Chave de idempotência permite repetir envio incerto sem duplicar. Alterações cadastrais invalidam a prévia. Snapshot preserva dados funcionais, horas e operador declarado; consulta traz histórico. Cancelamento e conclusão exigem versão, motivo e confirmação; conclusão antecipada é recusada. Cancelados saem da grade e continuam consultáveis na lista mensal de registros.

## Evidências

- 362 testes Node aprovados; build estático e verificação Deno aprovados.
- Ensaio SQL transacional com dados fictícios e rollback, também executado pelo CI em banco reconstruído. Cobre insuficiência, exceção, repetição, conflitos, modalidades, troca de operador, sessão removida, acesso cruzado, snapshot, cancelamento e preservação de saldos/pedidos antigos.
- Navegador Chrome com interface real e **API simulada localmente**, sem escrita em produção: horas insuficientes → exceção inicialmente desmarcada → justificativa → nova prévia → confirmação → detalhe → cancelamento. Evidência local em `.tools/rh-leave-preview-local.png` (arquivo ignorado pelo Git). Esse ensaio não representa integração completa navegador/banco.
- API publicada com sessões reais: Administrador recebeu `400 RH_ENTRY_REVIEW_REQUIRED` ao consultar recursos de cadastro ainda pendente; RH Amazonas recebeu `403 RH_OPERATOR_REQUIRED` sem operador. Sessões de teste encerradas. Nenhum cadastro foi conferido ou operador real autorizado para viabilizar testes.
- Advisor de segurança sem novo alerta de segurança; tabela privada com RLS sem políticas de cliente é intencional. Aviso preexistente de proteção contra senha vazada permanece.

## Limites e próximo bloco

Comprovante formal, impressão, edição/reprogramação e cálculo pela data de retorno continuam pendentes. Snapshot do detalhe não substitui comprovante. Direitos, regimes e jornada precisam de homologação municipal. A reconciliação do legado e a apresentação mensal de funcionários que deixaram a projeção cadastral também permanecem abertas; os registros históricos são preservados.

Os 40 cadastros importados da Amazonas continuam aguardando conferência. Primeiro uso real exige conferir vínculos/polo e indicar operadores autorizados, seguido do aceite da Diretoria. Publicação técnica não equivale à homologação institucional.
