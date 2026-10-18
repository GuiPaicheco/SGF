# Edição e reprogramação pelo RH — 18/10/2026

Sétimo bloco, código `89f568d`. Migração `20261018092805_rh_leave_revisions.sql` aplicada e `manage-rh` v4 ativa. A edição mantém o mesmo ID/protocolo e altera somente registros novos do RH que ainda estejam programados. Não transfere o beneficiário nem converte pedidos legados.

## Comportamento

- “Editar / reprogramar” abre os dados existentes e exige motivo, nova conferência de direito/dados e nova prévia do servidor. A prévia compara os períodos vigentes com a proposta.
- Horas disponíveis ficam em branco para nova declaração; a exceção anterior não é aprovada automaticamente. Jornada diária é reapresentada para conferência. Valores históricos nunca são presumidos como saldo atual.
- Conta, sessão, operador, unidade/polo, associação cadastral, direito, versões e conflitos são validados novamente. O próprio afastamento é excluído das reservas/conflitos, sem cancelar ou apagar temporariamente o registro. Outros afastamentos e ciclos continuam impedindo gravações incompatíveis.
- Salvamento usa transação, bloqueio comum do planejamento, versão esperada e chave de idempotência. Falha de rede permite reenviar exatamente o mesmo conteúdo/chave; edição fica bloqueada enquanto o resultado for incerto. Uma segunda alteração simultânea recebe conflito de versão.
- Snapshot e plano anteriores são preservados em tabela privada sem permissão de atualização pelo serviço. Auditoria registra motivo, conta autora, operador declarado, períodos, horas e versões. Cadastro atualizado não reescreve o documento anterior.
- Detalhe apresenta até 20 versões anteriores e até 50 eventos, informando quando existem mais versões. Todas continuam preservadas no banco; paginação de versões mais antigas permanece evolução de consulta. Comprovante histórico contém aviso “VERSÃO SUBSTITUÍDA”, inclusive na cópia dos dados e do e-mail.
- Calendário usa os períodos vigentes; retorno após edição pode selecionar o mês da nova programação. Comprovante atual continua consultando a situação antes de emitir.

## Evidências

- **370 testes Node aprovados**, build estático e verificação Deno aprovados.
- Ensaio SQL com rollback antes e depois da migração: insuficiência, exceção reconfirmada, motivo, replay, chave reutilizada indevidamente, versão antiga, conflito de datas, exclusão do próprio ciclo/direito da reserva, mudança cadastral, cancelado, outro CNES, operador ausente, negação de acesso direto e preservação de saldos/pedidos legados. Incluído no CI como `rhrevisions`.
- Chrome com interface real, dados fictícios e **API simulada localmente**: detalhe → editar → horas em branco → nova prévia comparativa → salvar → versão anterior → comprovante substituído. Evidência local `.tools/rh-revision-local.png`, ignorada pelo Git. Não equivale a ensaio completo navegador/banco publicado.
- API publicada com sessões reais: Administrador recebeu `404 RH_LEAVE_NOT_FOUND` para prévia e alteração de UUID fictício inexistente; RH Amazonas sem operador recebeu `403 RH_OPERATOR_REQUIRED` em ambas. Sessões encerradas.
- Após os ensaios: zero afastamentos, revisões e chaves de edição reais nas tabelas novas. Fixtures não persistiram. Advisor sem novo alerta de segurança ou falta de índice nas tabelas novas; aviso preexistente de proteção contra senha vazada permanece.

## Continuidade

Próximo bloco: filtros e revisão do calendário (CA04–CA07), preparando o piloto da Amazonas. PDF/A4, regras municipais e assinaturas, revisão dos cadastros importados, indicação dos operadores e aceite institucional continuam pendentes. As novas rotinas não autorizam automaticamente funcionários reais nem representam homologação da Diretoria.
