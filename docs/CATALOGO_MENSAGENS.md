# Mensagens e recusas — bloco 06

Versão técnica: 2026-10-09.1. Catálogo executável: `supabase/functions/_shared/user-guidance.ts`; mensagens retornam código, categoria, explicação, canal de apoio e versão. Erro interno desconhecido não expõe resposta SQL ao navegador.

## 01. Conferência antes do envio

Datas impossíveis, ordem/duração incoerente, admissão incompatível com nascimento/início/aquisição e início regulamentar não posterior ao término aquisitivo impedem o envio. Não criam uma decisão de recusa. O banco repete essas conferências nos pedidos contextuais; o endpoint também confere os períodos e a jornada. Cada dia da distribuição exige uma atuação autorizadora vigente.

O aviso da simulação distingue conferência de dados, saldo declarado e saldo efetivamente autorizado. Não foi criada regra nova de carência entre férias nem inventado dispositivo legal. A consistência técnica não certifica integralmente o direito: quantidades, faltas, fracionamento, feriados e regimes exigem o aceite descrito em HOMOLOGACAO_REGRAS.md.

## 02. Decisão administrativa

Somente RH/Administrador autorizado pode recusar uma análise do seu escopo. Justificativa de 3 a 2000 caracteres e motivo ativo são obrigatórios.

1. **Banco de Horas Insuficiente:** saldo real conferido e quantidade necessária, superior ao saldo. Essas informações são comunicadas no histórico; não alteram o saldo da matrícula. Correção de saldo é operação própria, justificada e auditada.
2. **Conflito com Funcionário:** escolha uma atuação de outra pessoa no mesmo CNES/lotação, informe as datas e explique o impedimento. O banco confere vigência e utiliza o nome cadastrado, não o nome enviado pelo cliente. O motivo não afirma que todo alerta automático impede legalmente férias.
3. **Outros:** descreva a razão administrativa. A opção não substitui a conferência das regras anteriores ao envio.

O rótulo e os dados da recusa são preservados mesmo se o catálogo mudar depois. Aprovação e inclusão no calendário continuam operações distintas. Saldo validado insuficiente bloqueia a inclusão, sem registrar automaticamente uma recusa.

## 03. Administração dos motivos

Administrador global pode criar, renomear, ordenar e ativar/desativar motivos, sempre justificando. O modo estruturado é imutável; crie outro motivo para um preenchimento diferente. Pelo menos um motivo deve permanecer ativo. Versão e trava transacional impedem sobrescrever uma alteração concorrente; a tela antiga deve atualizar antes de salvar.

## 04. Referências normativas e vigência

Mensagens de regra incluem `reference.status = pending_institutional_approval`, com `citation`, `approved_by`, `valid_from` e `valid_until` nulos enquanto não houver documento aprovado. Esses campos nulos são deliberados, não prova de ausência de legislação. Não há referência jurídica ratificada disponível para preencher nesta entrega.

Para publicar uma referência: RH/Jurídico fornece o dispositivo, texto/URL oficial, responsável pelo aceite e vigência; TI revisa o catálogo versionado, ensaia as mensagens e publica uma nova versão. Não usar números de lei estimados nem apresentar regra simulada como aceite institucional. Essa aprovação permanece no bloco 08.

## 05. Canais de apoio

- Direitos, dados funcionais, regras e recusas: consulte a norma vigente indicada pelo RH e o RH da sua unidade.
- Falhas técnicas e administração do catálogo: Administradores ou TI da Prefeitura de Betim; informar operação e horário, sem enviar senha.

Este catálogo é versionado no código. Não é um editor livre de leis no painel e não dispensa ratificação institucional.
