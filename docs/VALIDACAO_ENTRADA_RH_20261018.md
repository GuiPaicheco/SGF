# Entrada e navegação centradas no RH — 18/10/2026

Décimo primeiro bloco. A prioridade passa a ser funcionalidade operacional, com atualização visual a cada entrega; manual e treinamento ficam depois.

## Entrega

- Entrada pública com apenas login e simulação rápida, explicando que o RH programa os afastamentos.
- Login orientado à unidade/Administração, sem oferta de autocadastro ou senha provisória pública. Recuperação e credenciais existentes preservadas.
- Administração abre no calendário após login/seleção de contexto ou retorno à tela inicial. Navegação oferece calendário, conferência CNES, contas/operadores, configurações e registros anteriores.
- RH institucional continua selecionando operador antes do calendário; navegação identifica o calendário da unidade.
- A política de rotas nega autocadastro e as etapas antigas de criação de solicitação, inclusive tentativa de navegação direta. Servidor legado mantém consulta de seus registros, sem botão de nova solicitação.

## Verificação

381 testes Node aprovados, incluindo entrada pública, encaminhamento autenticado, login administrativo nos dois esquemas compatíveis e bloqueio das rotas antigas. Build estático concluído. Chrome local: tela inicial e login conferidos visualmente, com ausência de autocadastro. Evidência local ignorada pelo Git: `.tools/rh-entry-local.png`. Nenhum funcionário ou afastamento criado nesta etapa.

## Limites e sequência

Este bloco retira caminhos da interface; não desativa serviços de cadastro/solicitação no backend. Código legado e operações de transição ainda existem e precisam de revisão de dependências antes da retirada. Registros anteriores não foram convertidos em consulta exclusivamente de leitura. Não houve exclusão de dados, contas, saldos ou histórico, nem alteração de autenticação, RLS ou migrations.

Próximo bloco: cadastro operacional dos funcionários, incluindo alternativa manual e integração dos dados conferidos aos vínculos. AC07/UI04 continuam parciais; retirar endpoints antigos e os componentes sem uso de forma explícita, preservando leitura histórica. A publicação técnica não representa homologação institucional.
