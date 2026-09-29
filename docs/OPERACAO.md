# Operação e preparação do piloto

## 1. Cadastros obrigatórios

Cadastre a hierarquia em `lotacoes`, usando `parent_id` e `unit_type` para representar Secretarias, Diretorias, Unidades e Setores. Depois carregue cargos, funções, categorias e servidores.

O CPF em `servidores.cpf` deve conter somente 11 dígitos. Matrícula, CPF e data de nascimento são usados pela função de verificação; a resposta nunca revela qual campo divergiu.

## 2. Acesso administrativo

A conta inicial de homologação entra pela **Área de gerenciamento** usando o identificador `admin`. O e-mail interno do Supabase Auth não é informado ao navegador; a Edge Function `management-auth` resolve o identificador, aplica limitação de tentativas e devolve a sessão somente quando a senha está correta.

No primeiro acesso, `profiles.must_change_password` bloqueia o painel até a definição de uma senha pessoal com pelo menos dez caracteres. A senha inicial não deve ser registrada no código, na documentação nem em mensagens permanentes.

Para novos usuários de gestão, crie o usuário em Supabase Auth com uma senha temporária individual. Depois crie o registro correspondente em `profiles`, usando o mesmo UUID, e defina um `login_identifier` exclusivo e `must_change_password = true`.

- `administrador`: acesso global e configuração.
- `rh`: acesso administrativo às lotações vinculadas em `profile_scopes`.
- `diretor`: acesso aos servidores e solicitações das lotações vinculadas em `profile_scopes`.
- `servidor`: acesso aos próprios registros, quando uma conta for vinculada.

O administrador usa **Perfis e acessos** para definir o papel, o identificador de entrada e os escopos territoriais. Diretor e RH exigem pelo menos uma lotação; somente o administrador possui acesso global. A conta administradora atual não pode alterar o próprio papel nessa tela.

Quando um servidor é promovido para uma função de gestão, o próximo acesso administrativo exige a troca da senha. A alteração de papel e escopos é atômica e registrada em `audit_events`.

Não use uma senha compartilhada como `1234` após o piloto. Exija troca da senha temporária e desligue imediatamente contas de pessoas que perderem a atribuição.

O acesso provisório compartilhado foi encerrado. O endpoint legado responde permanentemente com HTTP 410 e seus segredos foram removidos. A conta administrativa existente permanece disponível somente pelo login individual, com troca obrigatória da senha temporária. Todo acesso à gestão deve ser individual e rastreável.

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

### Inclusões funcionais

Administradores e RH acessam **Inclusões funcionais** pelo painel de gerenciamento. A fila apresenta os dados declarados pelo servidor e o protocolo que originou a inclusão. O RH vê somente cadastros já vinculados às suas lotações; cadastros provisórios ainda sem lotação oficial são tratados pelo administrador.

Na aprovação, o responsável seleciona uma das lotações CNES oficiais, confirma cargo e vínculo e pode registrar um parecer. O procedimento ativa o servidor, vincula cargo e lotação e conclui a pendência em uma única transação. Na rejeição, a justificativa é obrigatória. A matrícula, o CPF e a data de nascimento não são alterados por esse fluxo.

As 48 lotações da carga inicial estão versionadas em `docs/cnes-lotacoes.md`. Antes da produção, o RH deve conferir grafia, hierarquia e situação ativa diretamente com a fonte institucional.

## 4. Banco de horas

`declared_minutes` é o saldo informado pelo servidor; `validated_minutes` é o saldo oficial confirmado pelo RH. A aprovação não deve se apoiar apenas no saldo declarado.

## 5. Calendário institucional

Feriados e pontos facultativos ativos são carregados da tabela `calendar_events` antes de qualquer simulação. O calendário é público somente para leitura, pois também atende solicitações sem login. Alterações anuais devem ser registradas no banco pelo responsável autorizado, mantendo nome, tipo, data, fonte e situação do evento. Se o calendário não puder ser carregado, o frontend bloqueia a simulação para evitar cálculo incorreto.

## 6. Revisões periódicas

- Atualizar `calendar_events` e o calendário do frontend antes de cada exercício.
- Revisar usuários, papéis e escopos mensalmente.
- Executar Supabase Security Advisor após toda alteração de schema.
- Testar restauração de backup antes do uso em produção.
- Não utilizar dados reais em ambientes de demonstração.
