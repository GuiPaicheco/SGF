# Validação técnica do bloco 04

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Data: 09/10/2026. Ambiente: piloto compartilhado, sem aceite institucional.

## 01. Correções

- Histórico cíclico da escala mínima não perde fontes anteriores a três meses. Consulta paginada e restrita aos contextos autorizados.
- Histórico nominal usa os cadastros carregados, não apenas candidatos vigentes na data selecionada; atuação histórica indisponível não é apresentada como escala vazia.
- Calendário horizontal recebe foco por teclado, com indicação de foco e textos que não dependem somente das cores.
- Navegação entre dias reutiliza dados por até 30 segundos apenas no mesmo contexto/intervalo. Atualização manual e gravações recarregam pedidos, feriados e projeções.
- Escala mínima compartilha a trava transacional dos afastamentos. Versões impedem sobrescrita por gestores concorrentes.
- Recalcular férias não cria silenciosamente sobreposição com outro pedido da mesma matrícula: conserva datas anteriores e exige revisão.
- Migration `20261009115330_block_four_planning_integrity.sql` aplicada; `manage-operations` versão 11 publicada com verificação JWT.

## 02. Evidências

1. Suíte local: 265 testes, incluindo isolamento CNES/lotação, filtros de conflitos, intervalos entre meses/anos, vigência e marcadores do calendário.
2. Banco real, transações com rollback: 32 verificações aprovadas — 16 de feriados/distribuição e 16 de escala/conflitos/sobreposições. Nenhuma fixture transacional mantida.
3. API real: gravação simultânea por Administrador e RH resulta em 200/409; tentativa de gravar escala de outro CNES recebe 403. Tabelas internas não expostas diretamente ao cliente; leitura usa a operação autorizada.
4. Interface: salvar composição nominal, sugestão semanal, salvar dia vazio e verificar que o ciclo seguinte usa esse vazio; criação e resolução de conflito com justificativa, autoria e histórico.
5. Feriado sintético por API, acompanhado na interface: pedido de dez dias úteis mantém início 02/03/2027, fim muda de 15 para 16/03 e retorno de 16 para 17/03. Dia novo exige indicação explícita; RH do CNES A só pode escolher A. Atribuição pela tela elimina a pendência, sem aprovação automática.
6. Mudança do feriado de 03 para 04/03 reavalia responsabilidades. Desativação restaura fim 15/03 e retorno 16/03. Avisos de calendário/distribuição observados no contexto RH. Nenhum pedido de outra pessoa no período, conferido antes de cada alteração.
7. Banco legado: zero dias e zero atribuições em `minimum_scale_days`/`minimum_scale_assignments`. Não havia histórico a converter; nenhuma associação arbitrária foi criada. Dados futuros ambíguos continuam exigindo reconciliação no bloco 07.
8. Pós-publicação: deployment Vercel READY do commit `b42d93c`; navegador recebeu app/CSS `20261009-block4-1`. Intervalo visual 15/12/2026–15/01/2027 apresentou todas as 32 datas, extremos corretos e região focável por teclado. Sem os padrões de codificação quebrada pesquisados nessa tela; não é revisão de todas as telas.
9. Limpeza conferida no banco: conta técnica desativada; zero pedidos ativos, zero atribuições de escala e zero feriados ativos do ensaio. Histórico preservado. Advisors sem ERROR, com 16 INFO de tabelas internas sem políticas de acesso direto e WARN preexistente de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), mantido no bloco 09.

## 03. Reprodução e limites

`node --test tests/*.test.mjs`; `node scripts/prepare-workflow-rehearsal.mjs calendar` e `block4` imprimem ensaios SQL completos com rollback. O script `verify-block-three-pilot.mjs` oferece os modos `block4`, `calendar4-add`, `calendar4-move`, `calendar4-remove` e `cleanup`, exclusivamente para a conta técnica identificada. Credenciais somente em variáveis de ambiente; nenhuma senha versionada.

Conta técnica desativada após ensaios, solicitações canceladas e atuação retirada da escala de teste por operação compensatória; histórico e autoria preservados. Feriado técnico desativado e conflito resolvido. Conta de recuperação confirmada pelo usuário e usuários reais preservados.

Não equivale a ensaio de carga, teste em equipamentos da Prefeitura, revisão completa de acessibilidade ou aprovação normativa. Esses aceites continuam no bloco 08. Revisão abrangente de destinatários/deduplicação e todas as mutações segue no bloco 05.

Supabase/Postgres orientaram bloqueios, escopo e ensaios transacionais; Vercel e Computer Use orientaram publicação e verificação visual do piloto. Capturas locais ignoradas pelo Git em `.sgf-backups/bloco04/`.
