# Atualização CNES e lançamentos do RH

## Contrato atual

O Administrador consulta, confere e atualiza o cadastro público do CNES. O RH institucional só opera a própria unidade, com operador autorizado, e lança férias, folgas e day-offs. Não há exigência de CPF/matrícula nem criação de login do profissional na integração.

1. **Atualizar CNES:** consulta autenticada na API Python, prévia de correções/inclusões e confirmação individual. A consulta não grava nada. Ausentes e removidos explicitamente são retidos sem reativação. Respostas incompletas são recusadas integralmente antes de qualquer mutação.
2. **Ver CNES:** identificação/endereço/contatos publicados, ficha e módulos consultados, equipes, profissionais incorporados e informações do RH em seções separadas. Importações antigas sem ficha continuam consultáveis; não se inventam dados do estabelecimento.
3. **Remover funcionário:** ação exclusiva do admin, com motivo e versão. É remoção do uso ativo, não destruição: bloqueia novos lançamentos e revoga autorização do operador, preservando férias, folgas e histórico. A origem pública anterior permanece na auditoria e nas coletas arquivadas. A situação operacional de removido não comprova desligamento no CNES.
4. **Cadastrar dayoff / Lançar Folga:** no day-off de aniversário, o RH confirma dia/mês; a data se repete anualmente sem solicitação do funcionário. Para folga, informa período e referência da autorização externa. Não constitui apuração automática de direito nem crédito/débito de banco de horas. Day-off de aniversário tem um dia em cada ano; folga admite intervalo de até 93 dias corridos. Conflito com outro afastamento no mesmo vínculo bloqueia duplicação, exceto day-off dentro de férias regulamentares úteis: nesse caso, o dia não é descontado das férias e o fim/retorno são recalculados. Cadastro ou cancelamento de day-off recalcula férias úteis programadas do vínculo, preservando versões e auditoria; conflito com outro afastamento ou parcela bloqueia a operação inteira. O aniversário registrado pelo RH gera day-off anual e participa do mesmo recálculo; data de nascimento legada não confirmada pelo RH é apenas informativa. Alterar ou remover o aniversário também recalcula férias úteis programadas. Em 29/02, somente anos bissextos têm a data: não há transferência automática. Feriados e fins de semana não geram desconto duplicado. Férias em dias corridos não recebem essa exclusão.

O calendário atual aceita até **12 meses**, da data inicial até a véspera da mesma data no ano seguinte (com ajuste do aniversário de 29/02 para 28/02). Exemplo: 01/01 a 31/12, ou 01/03/2027 a 29/02/2028. O limite de 93 dias continua apenas para o lançamento de uma folga, não para a consulta do calendário.

O calendário e as exportações usam **D** para day-off e **L** para folga, mantendo I/F/P/B/R/A para os registros anteriores. Cancelamento/conclusão seguem o registro versionado existente. Para corrigir data de folga/day-off, cancelar com motivo e registrar novamente; não utilizar o editor normativo de férias.

## Componentes

- `api/cnes.py`: função Python no mesmo projeto Vercel, protegida pelo Supabase Auth e consulta do perfil administrativo. Não utiliza service-role nem imprime credenciais/dados pessoais.
- `cnes_service/`: núcleo reaproveitado da API-CNES, com imports de pacote e validação reforçada de colunas. Mantém fonte/valores originais; não executa HTML.
- `cnes-api.mjs`: adapta o contrato sem associar equipes apenas por nome/CNS da pessoa; a conferência existente recalcula a correspondência CNS+CBO.
- `private.cnes_unit_sources` e `private.cnes_source_history`: última ficha e coletas anteriores. RLS habilitada, sem acesso direto de anon/authenticated.
- IDs de registro, pessoa e vínculo existentes são preservados. Informações importadas, lançamentos e autoria são independentes.

O cache Python dura até cinco minutos por instância, somente para resultados completos. Há limite de duas coletas simultâneas por instância, espera limitada e timeout total. Isso não é um limitador global distribuído. Cache não substitui persistência nem a conferência. Limites de leitura/payload precisam ser mantidos ao ampliar unidades.

## Execução e verificação

Instalar `requirements.txt`; servir a função por `python -m uvicorn api.cnes:app`. O servidor estático Python simples não executa `/api/cnes`: para desenvolvimento integrado, usar a emulação Vercel ou proxy local para a função.

- `node --test tests/*.test.mjs`
- `python -m unittest discover -s tests -p 'test_cnes*.py'`
- `node scripts/build-static.mjs`
- `tests/cnes-api-rehearsal.sql` **somente dentro de BEGIN/ROLLBACK**. O cenário usa unidades e identidades sintéticas, não o admin real.

Aplicar a migração aditiva e publicar manage-cnes/manage-rh antes de liberar a interface. A função Python é publicada separadamente do conteúdo estático pelo Vercel, com dependências fixadas. Netlify estático não executa essa função.

Não executar importação, exclusão ou lançamento real para testar automaticamente a publicação. Dados já existentes não devem ser limpos.
