# Operação e preparação do piloto

## 1. Cadastros obrigatórios

Cadastre a hierarquia em `lotacoes`, usando `parent_id` e `unit_type` para representar Secretarias, Diretorias, Unidades e Setores. Depois carregue cargos, funções, categorias e servidores.

O CPF em `servidores.cpf` deve conter somente 11 dígitos. Matrícula, CPF e data de nascimento são usados pela função de verificação; a resposta nunca revela qual campo divergiu.

## 2. Acesso ao SGF

O público usa somente a **Simulação Rápida**. Servidor, RH e Administrador entram com **login ou CPF e senha** na mesma tela. A Edge Function `access-auth` resolve o identificador sem expor o e-mail, limita tentativas e devolve a sessão somente quando a senha está correta. Uma identidade pode possuir os três acessos; nesse caso, a pessoa escolhe a área após autenticar e pode trocá-la na navegação.

No banco anterior à migration de múltiplos acessos, a autenticação usa `profiles.role` e o CPF do servidor vinculado. A interface também reconhece esse esquema para não interromper o acesso existente. Nesse estágio, cada conta tem apenas o papel que já possui; a escolha entre vários acessos depende da migration e da publicação conjunta das demais funções.

No cadastro manual ou após reset, `profiles.must_change_password` bloqueia o painel até a definição de uma senha pessoal. O mínimo depende do maior acesso: Servidor 4 caracteres, RH 6, Administrador 8. A política configurada no Supabase Auth precisa aceitar esses limites; confirme-a em homologação. As senhas temporárias fixas são 1234, 123456 e 12345678, respectivamente. Devem ser usadas uma única vez, com troca imediata, e não devem ser distribuídas em canais públicos.

Novos usuários usam **Solicitar acesso** e informam os dados funcionais, a lotação CNES pretendida e um e-mail institucional `@betim.mg.gov.br`. A solicitação entra em `access_requests`; nenhuma conta é criada nessa etapa. O RH pode aprovar apenas Servidor nas lotações de seu escopo; o administrador pode aprovar qualquer acesso. A aprovação cria e convida uma conta nova; quando o CPF já possui conta, acrescenta os acessos à identidade existente sem criar outra senha.

- `público`: simulação sem login, sem registrar solicitações.
- `servidor`: acesso aos próprios registros e envio de pedidos.
- `rh`: análise das etapas da chefia e do RH, operação e cadastros nas lotações vinculadas em `profile_scopes`.
- `administrador`: acesso global, configuração de perfis e estrutura.

O administrador usa **Perfis e acessos** para conferir o CPF, marcar um ou mais acessos e definir o escopo territorial do RH. O RH exige ao menos uma lotação; o Administrador possui acesso global. A conta administradora atual não pode alterar os próprios acessos nessa tela.

Quando um servidor recebe pela primeira vez acesso de gestão, deve trocar a senha antes de usar qualquer área. A alteração de acessos e escopos é atômica e registrada em `audit_events`.

O administrador pode criar contas manualmente em **Cadastros → Usuários e acessos**, selecionar os acessos e a lotação e redefinir a senha temporária. Também pode desativar uma conta; os pedidos, decisões e eventos de auditoria permanecem no histórico. Revise contas desativadas e credenciais temporárias periodicamente.

O acesso provisório compartilhado foi encerrado. O endpoint legado responde permanentemente com HTTP 410 e seus segredos foram removidos. A conta administrativa existente permanece disponível somente pelo login individual, com troca obrigatória da senha temporária. Todo acesso à gestão deve ser individual e rastreável.

### Migração para CPF e múltiplos acessos

No projeto Supabase conectado a este piloto, as migrations até 30/09/2026 foram aplicadas em ordem e as Edge Functions correspondentes foram publicadas. As instruções seguintes servem para outros ambientes e para a conferência antes de um novo deploy. A versão local já foi testada com o login administrativo; a versão do site publicado ainda precisa de atualização e homologação.

A migration `20260929234326_cpf_multi_access.sql` converte Diretor e Gerência em RH, migra o papel anterior para `profiles.roles` e preenche `profiles.cpf` a partir do servidor vinculado. Antes de trocar o frontend e as Edge Functions, execute em homologação:

```sql
select p.id, p.full_name, p.role, s.matricula
from public.profiles p
left join public.servidores s on s.profile_id = p.id
where p.cpf is null;
```

Resolva o CPF das contas vinculadas a servidores com o cadastro funcional conferido pelo RH. A conta administrativa sem registro em `servidores` pode continuar entrando pelo login `admin`, sem CPF; para reunir acessos pelo CPF, cadastre esse dado por uma operação controlada e validada. A migration `20260930002220_restore_login_alias.sql` preenche logins ausentes usando a matrícula ou um identificador técnico único e atribui login nas futuras aprovações. Confira também se não existem identidades diferentes para a mesma pessoa antes de aplicar a migration, pois `profiles.cpf` é único. Publique `access-auth`, `manage-access`, `manage-profiles`, `manage-catalogs`, `manage-inclusions`, `manage-operations` e `submit-request` na mesma janela da mudança do site. O papel efetivo é conferido no banco para cada requisição; a escolha da interface não concede acessos novos.

### Recuperação e primeiro acesso

**Esqueci a senha** recebe login ou CPF e sempre retorna uma resposta neutra, evitando revelar contas existentes. Quando há uma conta com e-mail válido, o Supabase envia um link de recuperação. Convites e recuperações retornam ao SGF para definição de uma senha compatível com o maior acesso da conta.

Cargo e lotação informados na solicitação ficam em `servidores.declared_position` e `servidores.declared_unit` até que o RH associe os registros oficiais de `cargos` e `lotacoes`.

Sem login, a página oferece **Simulação Rápida** e **Entrar no SGF**; na tela de entrada também há **Solicitar acesso**. Na simulação, a pessoa escolhe férias ou banco de horas, dias úteis ou corridos e informa a data de início ou a data de retorno desejada. Para férias, informa a quantidade de dias; para banco de horas, o saldo e a jornada diária. Nos dias úteis, fins de semana, feriados e pontos facultativos não consomem dias; nos corridos, todos os dias do intervalo contam. O retorno é estimado para o próximo dia útil e, quando informado diretamente, deve ser um dia útil. A simulação não coleta identificação, ignora o day-off de aniversário e não grava uma solicitação.

Na tela de login, o acesso existente é a ação principal. **Esqueceu a senha?** fica junto ao campo de senha; **Solicitar acesso** fica em uma área própria para o primeiro acesso. Após autenticar, a navegação superior mostra somente as áreas pertinentes ao perfil. Nas telas de detalhe, as ações cabíveis aparecem após o resumo e as etapas; histórico, calendário e operações auxiliares podem ser abertos quando necessários.

Na configuração de acessos e perfis, a seleção de lotações aparece quando RH está marcado e oferece busca por código ou nome. A rejeição de um acesso exige justificativa e fica separada da aprovação. O formulário de cadastro funcional agrupa identificação, vínculo e justificativa da alteração.

Depois do login, o RLS permite consultar somente o próprio cadastro e as solicitações vinculadas. O funcionário pode iniciar uma solicitação com seus dados preenchidos e acompanhar protocolo, períodos e situação, sem ações de aprovação ou programação.

### Comprovante e comunicação

Ao concluir uma solicitação, o SGF gera um comprovante preparado para impressão ou PDF em uma única página A4. O documento reúne protocolo, situação, identificação funcional, lotação, períodos, retornos, day-off de aniversário eventualmente incluído e observações.

O comprovante possui exatamente dois campos de assinatura:

1. **Servidor(a) solicitante**, que confirma o pedido.
2. **RH ou Chefia Imediata**, preenchido por quem autorizou as férias ou folgas naquele período, com nome, matrícula e carimbo quando aplicável.

O protocolo, isoladamente, não autoriza o afastamento. Depois de coletar as duas assinaturas, uma cópia deve permanecer com o servidor e a via administrativa deve ser entregue conforme o procedimento da lotação.

Em **Meus pedidos → Ver detalhes**, o servidor pode reabrir e reimprimir o comprovante a qualquer momento, além de copiar os dados ou um texto de e-mail já acompanhado de assunto e orientações de entrega. O conteúdo copiado sempre reflete a situação atual armazenada no pedido.

Todo pedido exige uma sessão válida com perfil `servidor`, sem troca de senha pendente, vinculada ao mesmo `servidores.profile_id` da matrícula e do CPF informados. A aprovação de acesso pode criar um cadastro funcional provisório; nesse caso, o primeiro pedido autenticado abre a inclusão funcional correspondente.

Os endpoints legados `employee-auth` e `management-auth` respondem permanentemente com HTTP 410. Todo novo login, convite, recuperação e alteração de senha passa por `access-auth`.

## 3. Fluxo

1. O servidor entra com a conta aprovada, confere os dados funcionais, simula e envia.
2. A Edge Function confirma que CPF e matrícula pertencem ao cadastro vinculado à sessão. Se o cadastro estiver inativo/provisório, abre uma pendência em `employee_inclusion_requests` para conferência do RH.
3. O protocolo, os períodos, as duas etapas de aprovação e a eventual inclusão funcional são gravados em uma única transação. Divergências com CPF ou matrícula já existentes são bloqueadas para evitar associação indevida.
4. O RH analisa a etapa da chefia imediata apenas para servidores do seu escopo e registra decisão, parecer, responsável e data em `request_approvals`. A aprovação libera a etapa RH; a rejeição encerra o fluxo. Enquanto a inclusão não tiver lotação oficial vinculada, a conferência cabe ao administrador.
5. O RH somente registra a segunda decisão depois da aprovação da primeira etapa. A aprovação final libera a programação das férias; a rejeição exige justificativa e encerra o fluxo.
6. Toda mudança de situação é registrada em `request_status_history`.

### Cadastros e estrutura organizacional

Administradores e RH acessam **Cadastros** pela navegação autenticada. A mesma área agrupa servidores e lotações, pendências funcionais, usuários e acessos (administrador) e feriados (administrador). O administrador pode criar e alterar lotações, hierarquia, tipo, código CNES, situação e responsáveis. Os responsáveis selecionados são registrados em `profile_scopes`.

Administradores e RH podem cadastrar e editar servidores, cargos, funções, vínculos e jornada semanal. O RH atua somente nas lotações atribuídas ao seu perfil; alterações estruturais de lotações permanecem exclusivas do administrador.

Toda inclusão, transferência, mudança de cargo, função, vínculo, ativação ou bloqueio funcional gera um registro em `employee_assignment_history`, contendo valores anteriores e novos, motivo, responsável e data. Os eventos também são registrados em `audit_events`.

### Inclusões funcionais

Administradores e RH acessam **Cadastros → Pendências funcionais**. A fila apresenta os dados declarados pelo servidor e o protocolo que originou a inclusão. O RH vê somente cadastros já vinculados às suas lotações; cadastros provisórios ainda sem lotação oficial são tratados pelo administrador.

Na aprovação, o responsável seleciona uma das lotações CNES oficiais, confirma cargo e vínculo e pode registrar um parecer. O procedimento ativa o servidor, vincula cargo e lotação e conclui a pendência em uma única transação. Na rejeição, a justificativa é obrigatória. A matrícula, o CPF e a data de nascimento não são alterados por esse fluxo.

As 48 lotações da carga inicial estão versionadas em `docs/cnes-lotacoes.md`. Antes da produção, o RH deve conferir grafia, hierarquia e situação ativa diretamente com a fonte institucional.

## 4. Banco de horas

`declared_minutes` é o saldo informado pelo servidor; `validated_minutes` é o saldo oficial confirmado pelo RH. A aprovação não deve se apoiar apenas no saldo declarado.

O RH registra créditos e débitos validados na análise da solicitação. Cada lançamento permanece em `time_bank_entries`. Na conclusão de uma folga por banco de horas, somente as horas correspondentes aos dias solicitados e à jornada são debitadas de forma atômica; a conclusão é impedida quando o saldo validado for insuficiente. A migration de 29/09/2026 corrige pedidos ainda não concluídos; pedidos já concluídos antes dela exigem conferência do extrato e eventual ajuste auditável.

## Operação das solicitações

A linha do tempo apresenta todas as mudanças de situação, responsável, data e justificativa. RH e Administrador podem devolver um pedido para correção conforme seu estágio; o servidor pode reenviar ou cancelar uma solicitação devolvida. RH e Administrador podem programar, reprogramar datas, cancelar e concluir.

O calendário de escala apresenta todos os funcionários ativos do escopo em uma grade mensal, com uma linha por funcionário e uma coluna por dia, inclusive quando não há afastamento. Os filtros de lotação, cargo, função e situação atualizam a visão sem alterar os pedidos. As marcações identificam início, fim, retorno, feriado, day-off de aniversário e dias de afastamento; células vermelhas indicam sobreposição por lotação, cargo ou função. Ao selecionar uma célula colorida, o gestor abre a solicitação correspondente.

No painel **Escala mínima nominal**, RH ou administrador escolhe lotação e data e marca, se necessário, os servidores escalados. A lista pode ficar vazia. Somente servidores ativos da lotação escolhida podem ser salvos; o sistema sinaliza afastamentos coincidentes. Não há percentual ou quantidade mínima obrigatória.

Na fila **Solicitações**, RH e administrador podem ordenar por data, servidor, situação, modalidade, início ou lotação. **Arquivar na minha fila** oculta apenas daquela pessoa e mantém o pedido e sua trilha de auditoria; **Arquivadas** permite localizar e restaurar.

Os botões **Mês anterior** e **Próximo mês** mantêm os filtros aplicados. O painel também informa quantidade de funcionários, solicitações do período, dias com conflito e o pico de afastamentos simultâneos. Conflitos são alertas de apoio à decisão e não substituem a análise da chefia.

As mudanças de situação geram notificações internas para o servidor, responsáveis pela lotação e administradores. Em **Notificações**, cada mensagem pode ser aberta na solicitação vinculada ou marcada como lida; também é possível marcar todas como lidas.

A validação formal dos cálculos deve seguir `docs/HOMOLOGACAO_REGRAS.md`.

## 5. Calendário institucional

Feriados e pontos facultativos ativos são carregados da tabela `calendar_events` antes de qualquer simulação. O calendário é público somente para leitura, pois também atende a Simulação Rápida sem login. O administrador gerencia data, nome, tipo, fonte e situação em **Cadastros → Feriados**. Se o calendário não puder ser carregado, o frontend bloqueia a simulação para evitar cálculo incorreto.

## 6. Revisões periódicas

- Atualizar `calendar_events` e o calendário do frontend antes de cada exercício.
- Revisar usuários, papéis e escopos mensalmente.
- Executar Supabase Security Advisor após toda alteração de schema.
- Testar restauração de backup antes do uso em produção.
- Não utilizar dados reais em ambientes de demonstração.
