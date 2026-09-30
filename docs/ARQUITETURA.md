# Arquitetura e fluxos do SGF

## Componentes

```text
Navegador (index.html + assets/*)
  ├─ Supabase Auth: sessão individual
  ├─ Data API + RLS: leituras do próprio servidor ou do escopo de gestão
  └─ Edge Functions: envio, login e operações privilegiadas
       └─ PostgreSQL: cadastros, solicitações, aprovações, histórico e auditoria
```

O frontend é uma aplicação estática sem roteador ou framework. `assets/app.js` mantém a tela e o formulário em memória, renderiza HTML e chama o Supabase. Recarregar a página pode descartar uma simulação ainda não enviada. A sessão autenticada é mantida pelo cliente Supabase.

O Netlify serve somente `dist/`. As Edge Functions mantêm a chave de serviço no servidor; operações administrativas validam o token e o papel antes de executar funções SQL. O RLS limita leituras e escritas feitas diretamente com a sessão do usuário. As migrations registram a evolução de um esquema Supabase preexistente.

## Papéis e escopos

| Papel | Acesso previsto |
|---|---|
| Público | Fazer simulação rápida sem dados pessoais, solicitar acesso e entrar no SGF |
| Servidor | Enviar pedido vinculado à própria conta e acompanhar seus registros |
| RH | Consultar escala, decidir as etapas da chefia e do RH, gerir inclusões e cadastros do escopo, programar e concluir |
| Administrador | Gerir contas, papéis, escopos, lotações e fluxos administrativos |

`profiles.cpf` identifica a pessoa para reunir acessos e `profiles.login_identifier` oferece uma alternativa de entrada, inclusive para a conta administrativa sem CPF. `profiles.roles` reúne os acessos autenticados concedidos. `profiles.role` permanece como papel primário de compatibilidade, sem definir sozinho a área ativa. O navegador envia o acesso escolhido em `x-sgf-role`; o banco valida esse valor contra `profiles.roles` antes de usá-lo no RLS. `profile_scopes` vincula o RH às lotações; `servidores.profile_id` vincula a conta ao cadastro funcional. A hierarquia é representada por `lotacoes.parent_id`.

O enum histórico `public.app_role` ainda contém os rótulos antigos `diretor` e `gerencia`, pois uma migration PostgreSQL não remove valores de enum diretamente. As restrições de `profiles.roles` e `profiles.role` impedem que esses rótulos sejam concedidos ou mantidos em contas após a conversão para RH.

## Dados e estados

- `servidores`, `lotacoes`, `cargos` e `funcoes`: cadastro e estrutura funcional.
- `vacation_requests` e `request_periods`: pedido, protocolo e períodos.
- `request_approvals`: decisões separadas da chefia e do RH.
- `request_status_history`, `employee_assignment_history` e `audit_events`: rastreabilidade.
- `time_bank_accounts` e `time_bank_entries`: saldo declarado, saldo validado e lançamentos.
- `employee_inclusion_requests` e `access_requests`: filas distintas de inclusão funcional e criação de conta.
- `calendar_events`: feriados e pontos facultativos usados nas simulações pública e autenticada.
- `notifications`: avisos internos de mudança de situação.

Sequência principal: `enviada` → `em_analise` (chefia aprovou) → `aprovada` (RH aprovou) → `programada` → `concluida`. Há ramificações de rejeição, devolução, reenvio, reprogramação e cancelamento. A função SQL determina as transições permitidas; o frontend somente apresenta as ações correspondentes.

## Limites atuais da arquitetura

- As regras de direito, fracionamento e contagem de dias ainda exigem homologação do RH. O navegador calcula a simulação; o servidor faz uma validação estrutural, mas não recalcula integralmente o direito.
- A configuração do projeto Supabase está embutida no frontend. Separar homologação e produção exige alterar URL, chave publicável e CSP.
- O banco não pode ser criado do zero apenas com as migrations versionadas: falta a baseline do esquema anterior à primeira migration.
- Não há suíte ponta a ponta para os quatro papéis ou ambiente local Supabase configurado neste repositório.

Consulte [OPERACAO.md](OPERACAO.md) para procedimentos e [REVISAO_TECNICA.md](REVISAO_TECNICA.md) para prioridades de evolução.
