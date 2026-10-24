# Preservação e correção de histórico

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Procedimento técnico do piloto — 09/10/2026. Não substitui a política de retenção, base legal e autorização de tratamento da Prefeitura.

## 01. Desativar, não apagar

Contas, vínculos, unidades, equipes e catálogos utilizados devem ser desativados pelos fluxos autorizados. Solicitações são encerradas/canceladas, conflitos são resolvidos e lançamentos incorretos recebem compensação justificada. A trilha registra o responsável e preserva a origem. Desativar uma conta não elimina seus pedidos, decisões nem autoria histórica.

## 02. Corrigir por evento compensatório

Conferir primeiro matrícula, unidade, contexto, versão e registro original. Usar a operação correspondente, informando justificativa objetiva; não editar um lançamento antigo para esconder o erro. Reprogramação gera protocolo vinculado; cancelamento devolve recursos quando aplicável. Alterações cadastrais e operacionais auditadas são gravadas com sua trilha na mesma transação do banco. Cadastro administrativo composto e edição de permissões/lotação possuem RPC transacional.

Supabase Auth e Postgres são serviços distintos: alteração de senha, criação/bloqueio de usuário e metadados de Auth não compartilham uma única transação distribuída com os dados funcionais. Se houver falha entre serviços, a TI deve conferir a conta e o estado funcional antes de repetir a operação; não apagar registros concluídos nem redefinir senhas de usuários apenas para testar. O evento de troca de senha guarda somente o estado da obrigatoriedade, nunca a senha.

## 03. Consultar o histórico autorizado

Administrador consulta globalmente. RH e Diretor consultam resumos do CNES/lotação ativos; Servidor não consulta a auditoria administrativa. Buscar por autor, afetado, matrícula, evento e período. Até 50 eventos por página; avisos têm até 30 itens. Novas ações capturam nomes e matrícula na ocasião do evento. Eventos coletivos conservam seus participantes, sem atribuir um único servidor arbitrariamente.

Eventos antigos podem ter apenas nome atual reconciliado, ator desconhecido ou contexto incompleto. Essa ausência é explícita: não inventar quem fez uma operação nem inferir uma unidade. Avisos antigos de gestão sem contexto confiável permanecem preservados e fora do canal de RH/Diretor; somente manutenção autorizada com evidência pode reconciliá-los. Avisos pessoais legados ficam exclusivamente com seu destinatário.

Não inserir senhas, tokens ou chaves em justificativas. O banco e a resposta de consulta removem padrões conhecidos de credenciais, mas isso não autoriza inserir dados sensíveis em texto livre. As páginas são ordenadas por data e ID; em um histórico que recebe novos eventos, atualizar/reiniciar a consulta antes de uma conferência integral. Paginação não constitui exportação com snapshot imutável.

## 04. Anonimização sob aprovação institucional

Não há botão de exclusão física/anonimização irreversível. A API não pode sobrescrever ou apagar a auditoria. Manutenção privilegiada continua tecnicamente possível e requer procedimento controlado, sem apresentar a trilha como inviolável para o proprietário do banco.

Antes de qualquer anonimização, a Prefeitura deve aprovar: responsáveis, finalidade/base legal, prazo por categoria documental, impedimentos de descarte, alcance em nomes capturados/justificativas/backups, pseudônimo e retenção da autoria. Registrar autorização, inventário do alvo e cópia recuperável; ensaiar o plano de alteração e conferência em ambiente adequado; executar somente com aprovação específica; registrar um evento de manutenção e os resultados. Não escolher prazo, anonimizar terceiros ou aplicar descarte automático sem essa decisão.

Essa ratificação pertence ao bloco 08 (aceite institucional); separação de ambientes e restauração integral permanecem nos blocos 07/09.
