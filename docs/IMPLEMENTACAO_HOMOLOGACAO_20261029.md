# SGFS — manutenção em homologação, 29/10/2026

Trabalho autorizado exclusivamente na branch `homologacao`, pasta `SGF-atualizado`. Produção não recebeu código, configuração, dados, migrações ou deploys. A referência pública `e58fdb6` do planejamento não estava no checkout inicial; o trabalho partiu do commit efetivamente publicado em homologação, `f3fa094`, obtido por fast-forward sem descartar alterações locais.

## Isolamento e evidências

| Recurso | Evidência verificada |
| --- | --- |
| Frontend | Vercel `sgf-homologacao`, projeto `prj_qTQe6R789JZCnA8D3cLUKDpmIOPB`; domínio `sgf-homologacao.vercel.app`; branch publicada `homologacao` |
| Conexões do frontend | JavaScript servido e CSP apontam a `pouluaiadcgppxbzqdjw`; sem referência ao projeto de produção no runtime consultado |
| Banco | Projeto `SGF-homologacao`, PostgreSQL próprio, ativo; consulta direta pelo conector com o ID autorizado |
| Auth | Conta administrativa própria, confirmada e ativa; emissor do token autenticado conferido em `pouluaiadcgppxbzqdjw.supabase.co/auth/v1` |
| Storage | Zero buckets e zero objetos no projeto de homologação; nenhum endpoint externo de Storage identificado no runtime |
| Edge Functions | Nove funções próprias no início; chamadas e implantações direcionadas explicitamente ao projeto autorizado; `SUPABASE_URL`/chaves fornecidas pelo ambiente do projeto |
| API CNES | Guarda local impede execução com URL Supabase diferente da homologação; consultas da fonte não alteram o banco automaticamente |

O arquivo local `.env.homologacao.local` tinha senha administrativa inválida. O e-mail, vínculo Auth/perfil, confirmação e ausência de bloqueio foram conferidos antes da redefinição expressamente autorizada. A nova senha foi salva somente nesse arquivo ignorado pelo Git. Sessões anteriores foram invalidadas. O recurso assinado temporário de recuperação foi encerrado: a função remanescente `homologacao-admin-recovery` exige JWT e retorna somente 410. Não contém operação de recuperação ativa.

## Diagnóstico e resultado por módulo

| Classe | Evidência / implementação |
| --- | --- |
| CÓDIGO | `manage-catalogs` usava expressão regular que rejeitava datas válidas; validação real de data passou para `calendar-input.mjs`, com testes de ano bissexto e classificação/fonte |
| CÓDIGO | UI e listagem omitiam `jurisdiction`. Foram integrados esfera e `source_url` existentes, sem criar coluna paralela |
| CÓDIGO | Função SQL aplicada preservava `nao_informada`, diferente da migration original. Nova migration exige classificação explícita em novos cadastros/edições; não fez backfill presumido |
| DADOS | Havia nove datas sem classificação e zero férias RH. As nove datas foram mantidas. Não se reproduziu no ambiente o caso real de 14 versus 10 dias ou a diferença 250/230; não se acessou produção para copiar esses dados |
| UI/CÓDIGO | Feriados distinguem carregamento, erro e vazio, preservam o formulário em falhas e oferecem nova consulta |
| UI/CÓDIGO | Feriados exigem prévia de impacto transacional antes da confirmação. Digest abrange payload, calendário e versões; alterações concorrentes invalidam a prévia. O ensaio da prévia é revertido por subtransação |
| CÓDIGO | Recálculo que afetaria férias iniciadas ou passadas é bloqueado e revertido. Não se reescrevem versões históricas pelo cadastro de feriados |
| UI/CÓDIGO | Retorno de férias sem salvar restaura a lista de profissionais com busca/página. Após salvar, conserva o encaminhamento ao período no calendário |
| UI/CÓDIGO | Dia de férias RH abre consulta por ID, vínculo e parcela. Várias ocorrências exigem escolha explícita; dias vazios, folgas e ausências não criam férias. Consulta suporta teclado, Escape e retorno de foco |
| UI/CÓDIGO | Detalhe distingue fase temporal e situação administrativa, mostra aquisitivo/regime conhecidos, indica legado não conferido, traduz importação DAPS e esclarece jornada/retorno ausentes. Não fabrica saldo conferido |
| CÓDIGO | Edição e cancelamento comuns de férias iniciadas são recusados no banco; revisão futura continua reutilizando digest, versão, motivo, idempotência e versões anteriores |
| UI/CÓDIGO | Formulário de férias apresenta a prévia antes da confirmação. Não ocorre mais gravação imediata ao gerar a simulação |
| UI/CÓDIGO | Consulta de conciliação paginada e limitada à unidade reúne alertas de aquisitivo/regime/retorno ausentes, divergência em contagem corrida, situação passada e revisão de origem. Não altera registros nem conclui erro jurídico |
| UI/CÓDIGO | Definições de população CNES e calendário aparecem na consulta de conciliação; módulos técnicos CNES permanecem recolhidos e explicados |
| UI/CÓDIGO | Troca da senha da própria unidade exige operador ativo, senha atual, nova senha de 8–72 caracteres, nova validação de sessão e encerramento global. Não recebe alvo, CNES, conta ou operador arbitrários do cliente; auditoria não inclui credenciais |
| UI/CÓDIGO | Administração reúne acesso aos componentes existentes de contas/operadores, unidades, feriados e histórico. Nenhum botão de SQL livre, limpeza ou sincronização foi criado |
| UI | Rolagem lateral reproduzida no calendário a 200% de zoom corrigida na largura dos controles do componente. Grade mantém rolagem interna |
| CÓDIGO | Teste autenticado revelou que ações administrativas RH enviavam sessão nula. Passaram a enviar o ID da sessão cuja assinatura já foi verificada pelo Auth |
| PROPOSTA | Minuta de uso/privacidade em documento separado, sem ativação ou aceite em nome de terceiros |

## Permissões e decisões de esquema

| Ação | Administração | Conta de unidade com operador | Sem sessão / operador revogado |
| --- | --- | --- | --- |
| Feriados: listar, prévia, confirmar | Permitido com perfil revalidado | Negado | Negado |
| Calendário / conciliação | Unidade explícita | Somente unidade própria | Negado |
| Consulta por dia / histórico RH | Escopo autorizado | Unidade e vínculo autorizados | Negado |
| Edição / cancelamento comuns | Somente antes do primeiro período | Mesma regra, polo e autorização revalidados | Negado |
| Troca da própria senha institucional | Usa fluxo administrativo existente para redefinição | Senha atual e operador requeridos; sem escolha de alvo | Negado |
| Interrupção, anulação, sincronização | Não habilitado nesta entrega | Não habilitado | Negado |

Reutilizados `calendar_events.jurisdiction`, `source_url`, `private.rh_leaves`, revisões, requisições de edição, registros de auditoria e vínculos atuais. Nenhuma nova tabela ou segunda fonte de saldo. Duas migrations aditivas substituem funções e acrescentam a consulta de conciliação; migrations anteriores não foram editadas. Grants de escrita continuam exclusivos do serviço, com perfil e escopo revalidados.

## Validação executada

- 473 testes JavaScript passaram na rodada final de implementação.
- Nove testes Python da API CNES passaram, com três subtestes. Houve aviso preexistente de depreciação Starlette/httpx.
- Ensaio SQL completo em `BEGIN/ROLLBACK`: duas unidades sintéticas, escopos de feriado, recálculo, versão, exclusão de feriado e auditoria; prévia sem persistência, digest inválido/obsoleto, fonte/classificação, bloqueio temporal, relatório por unidade, sessão inválida e operador revogado. Retornou a confirmação de sucesso do bloco final.
- API publicada: login próprio, emissor Auth, contrato de listagem, ausência de autenticação 401, perfil forjado 403, data bissexta válida, data inválida, classificação ausente e gravação sem prévia recusadas; nove datas originais preservadas.
- Conta institucional sintética provisionada somente em homologação para teste real: falta de operador recusada, senha atual errada recusada, troca correta, token anterior sem acesso, novo login com a nova senha e auditoria. Conta de teste bloqueada ao final; cadastro e evidência foram preservados.
- Navegador real com dados sintéticos: 360/390/768/1024/1366/1920, zoom 200%, primeiro/meio/último dia, seleção de ocorrências, ID correto, consulta sem escrita, Escape/foco, volta à lista e estados de feriados. Capturas locais em `output/sgfs-maintenance`, ignoradas pelo Git.
- Build estático, sintaxe e verificação de whitespace/repositório público executados. Os testes de exportação existentes não substituem aceite visual de todos os PDFs/XLSX com dados institucionais.

## Pendências e limites concretos

1. **Anulação de lançamento incorreto:** o modelo rastreado expõe `programada`, `cancelada` e `concluida`. Arquivamento pertence a solicitações antigas e não apaga férias RH. Não foi encontrado mecanismo de anulação que preserve semântica distinta. Exige definir estados, competência, efeito sobre direitos e revisão de todas as consultas antes de habilitar.
2. **Interrupção/remanescente:** falta definição institucional sobre ato competente, transição normativa, prêmio/CLT/escalas e exceção de saldo. O Decreto 51.744/2025 exige justificativa do Secretário e reprogramação do remanescente. Não se improvisou esse fluxo com edição comum.
3. **Deslocar parcela:** edição/reprogramação futura mantém formulário existente e prévia de todos os períodos. Um atalho dedicado para deslocar uma parcela, preservar quantidade e decidir alcance sobre as demais não foi habilitado; faltam os casos excepcionais do motor e validação normativa.
4. **Termos obrigatórios:** documento, controlador, canais, retenção e política de reapresentação ainda não aprovados. A minuta não é documento institucional vigente; não se coletou aceite juridicamente vinculante.
5. **Senha provisória:** troca da própria unidade está operacional; credenciais provisórias únicas, validade e troca obrigatória geral ainda dependem da política aprovada. Não se alteraram senhas de outras contas existentes.
6. **Recorrência e carga de feriados:** cadastro explícito por ocorrência tem fonte e abrangência; regras móveis/recorrentes e carga nacional não foram automatizadas sem matriz de fontes e vigências aprovada. As nove datas legadas precisam de conferência, não classificação automática.
7. **Conciliação real:** o caso 14/10 e as populações 250/230 não existem na homologação examinada. O relatório oferece o procedimento e alertas; a conferência da fonte deve ser humana, sem copiar dados pessoais de produção.
8. **Legado e acessibilidade:** consulta contextual da grade abrange férias RH; solicitações legadas conservam seus contratos de consulta. Leitor de tela humano, toda a matriz de telas/exportações e aceite institucional permanecem pendentes. Não houve prova de restauração completa de backup neste trabalho; exportar tabelas não equivale a backup.
9. **Sincronização/hostname:** continuam somente como planejamento; nenhuma escrita em produção ou sincronização entre ambientes.

Fontes normativas novamente consultadas: [Lei 7.989/2025](https://legislativo.camarabetim.mg.gov.br/NormaJuridica/ShowNormaJuridica/85241), [Decreto 51.744/2025](https://legislativo.camarabetim.mg.gov.br/NormaJuridica/ShowNormaJuridica/85298), [Estatuto consolidado](https://legislativo.camarabetim.mg.gov.br/DocumentoNormaJuridica/ShowDocumentoNormaJuridica/2279) e [Portal do Servidor](https://servidor.betim.digital/servidores/beneficios/ferias). O decreto usa período concessivo na transição e o portal, aquisitivo. Essa diferença continua para RH/Jurídico; nenhuma retroatividade foi aplicada.

Advisors após as migrations: nenhum ERROR; 30 INFO de RLS habilitada sem políticas em tabelas internas já restritas e um WARN preexistente de proteção contra senhas vazadas desabilitada. Nenhum controle foi desabilitado para eliminar aviso. [Orientação oficial de proteção de senha](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verificação após publicação

O frontend foi publicado no projeto Vercel de homologação e chegou ao estado READY. O domínio público de homologação recebeu a versão da branch; não foi promovido nenhum recurso para `sgfbetim`.

O teste no navegador encontrou uma segunda divergência de acesso: o alias cadastrado da conta administrativa não correspondia à opção Administração enviada pela UI. Foi alinhado apenas o alias dessa conta de homologação, com auditoria, preservando o ID e a credencial Auth. O login pela própria tela passou após esse ajuste.

No site implantado, o navegador confirmou login administrativo, calendário DAPS, relatório de conciliação, feriados com classificação, contas/operadores e histórico de ações, sem erros JavaScript e com todas as chamadas Supabase observadas limitadas a `pouluaiadcgppxbzqdjw`. O teste por API foi repetido com o recurso temporário de recuperação encerrado (410 autenticado). As nove datas originais permanecem, e os ensaios SQL completos foram repetidos com rollback após os testes de senha.

A restauração integral permanece pendente: não foi encontrado Docker disponível neste workspace Windows para executar o roteiro local existente. Não foi criado ou restaurado nenhum banco sobre produção.
