# Operação e preparação do piloto

## 1. Cadastros obrigatórios

Cadastre a hierarquia em `lotacoes`, usando `parent_id` e `unit_type` para representar Secretarias, Diretorias, Unidades e Setores. Depois carregue cargos, funções, categorias e servidores.

O CPF em `servidores.cpf` deve conter somente 11 dígitos. Matrícula, CPF e data de nascimento são usados pela função de verificação; a resposta nunca revela qual campo divergiu.

## 2. Acesso administrativo

Crie o usuário em Supabase Auth com e-mail institucional e uma senha temporária individual. Depois crie o registro correspondente em `profiles` usando o mesmo UUID.

- `administrador`: acesso global e configuração.
- `rh`: acesso global às filas administrativas.
- `gerencia`: acesso apenas às lotações vinculadas em `profile_scopes`.
- `servidor`: acesso aos próprios registros, quando uma conta for vinculada.

Não use uma senha compartilhada como `1234` após o piloto. Exija troca da senha temporária e desligue imediatamente contas de pessoas que perderem a atribuição.

Durante a configuração inicial, a tela simplificada aceita temporariamente o código `1234`. O código é validado pela Edge Function `provisional-login`, possui limitação de tentativas e não está no JavaScript do navegador. Remova esse acesso assim que as contas institucionais individuais forem cadastradas.

## 3. Fluxo

1. O servidor informa os dados funcionais, simula e envia.
2. A Edge Function valida o cadastro e cria protocolo, períodos e duas etapas de aprovação.
3. A chefia analisa apenas servidores do seu escopo.
4. O RH programa, reprograma, rejeita, cancela ou conclui.
5. Toda mudança de status é registrada em `request_status_history`.

## 4. Banco de horas

`declared_minutes` é o saldo informado pelo servidor; `validated_minutes` é o saldo oficial confirmado pelo RH. A aprovação não deve se apoiar apenas no saldo declarado.

## 5. Revisões periódicas

- Atualizar `calendar_events` e o calendário do frontend antes de cada exercício.
- Revisar usuários, papéis e escopos mensalmente.
- Executar Supabase Security Advisor após toda alteração de schema.
- Testar restauração de backup antes do uso em produção.
- Não utilizar dados reais em ambientes de demonstração.
