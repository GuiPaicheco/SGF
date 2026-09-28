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

### Acesso do servidor

O servidor usa a opção **Área do servidor**. Em **Solicitar acesso**, confirma nome, CPF, data de nascimento e matrícula, informa cargo e lotação e cria uma senha individual de no mínimo oito caracteres. A Edge Function `employee-auth` cria a credencial no Supabase Auth e vincula o UUID ao campo `servidores.profile_id`.

Cargo e lotação informados no primeiro acesso ficam em `servidores.declared_position` e `servidores.declared_unit` até que o RH associe os registros oficiais de `cargos` e `lotacoes`. Todo novo acesso recebe inicialmente o perfil `servidor`.

Depois do login, o RLS permite consultar somente o próprio cadastro e as solicitações vinculadas. O funcionário pode iniciar uma solicitação com seus dados preenchidos e acompanhar protocolo, períodos e situação, sem ações de aprovação ou programação.

## 3. Fluxo

1. O servidor informa os dados funcionais, simula e envia.
2. A Edge Function procura o servidor por CPF e matrícula. Se ele ainda não existir, cria um cadastro inativo provisório e uma pendência em `employee_inclusion_requests` para conferência do RH.
3. O protocolo, os períodos, as duas etapas de aprovação e a eventual inclusão funcional são gravados em uma única transação. Divergências com CPF ou matrícula já existentes são bloqueadas para evitar associação indevida.
4. A chefia analisa apenas servidores do seu escopo; enquanto a inclusão não tiver lotação oficial vinculada, a conferência cabe ao RH ou administrador.
5. O RH programa, reprograma, rejeita, cancela ou conclui.
6. Toda mudança de status é registrada em `request_status_history`.

## 4. Banco de horas

`declared_minutes` é o saldo informado pelo servidor; `validated_minutes` é o saldo oficial confirmado pelo RH. A aprovação não deve se apoiar apenas no saldo declarado.

## 5. Revisões periódicas

- Atualizar `calendar_events` e o calendário do frontend antes de cada exercício.
- Revisar usuários, papéis e escopos mensalmente.
- Executar Supabase Security Advisor após toda alteração de schema.
- Testar restauração de backup antes do uso em produção.
- Não utilizar dados reais em ambientes de demonstração.
