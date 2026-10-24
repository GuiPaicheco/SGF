# Filtros e revisão do calendário — 18/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Oitavo bloco, código `1617ba4`. Migração `20261018094038_rh_calendar_filters.sql` aplicada e `manage-rh` v5 publicada. Consulta continua restrita ao CNES do RH; Administrador escolhe explicitamente a unidade.

## Entrega

- Filtros combinados de cargo, CBO, equipe, conferência cadastral, modalidade e situação mensal, além de mês e busca geral. Busca textual literal, sem tratar `%` ou `_` como curingas. Limpeza preserva mês/unidade e reinicia a página.
- Critérios aplicados no servidor antes da contagem e da paginação de 50 atuações; lista mensal de registros RH também respeita modalidade e situação específica. Intervalo continua limitado a um mês, filtros a 120 caracteres/campo, páginas a 0–100, projeção a 1.000 períodos e lista RH a 50 registros com aviso de continuação. Consulta exige botão/Enter; não consulta o banco a cada tecla nem o CNES externo.
- Situação seleciona profissionais com registros correspondentes no mês. “Sem afastamento vigente” considera a modalidade escolhida; “Cancelados (RH)” consulta o histórico novo, sem desenhar cancelamentos na grade. Para evitar ocultar programação, a grade preserva todos os afastamentos vigentes da modalidade escolhida para os profissionais selecionados, mesmo com filtro de situação. Cargas incompletas e vínculos pendentes continuam identificados.
- Sobreposição entre registros distintos no mesmo vínculo/data recebe `!`, aviso textual e contraste visual. Repetição do mesmo registro não gera alerta falso. Trata-se de conferência operacional do legado; bloqueios técnicos da programação/edição permanecem no servidor. Não constitui validação de escala mínima ou autorização normativa.
- Cabeçalho e nome fixos mantidos; área da tabela tem rolagem própria, foco visível, texto quebrável e largura reduzida do nome em tela estreita. Colunas funcionais permanecem separadas.

## Evidências

373 testes Node aprovados, build estático e verificação Deno aprovados. Novos testes cobrem limites, preservação/limpeza de filtros na paginação e alertas de sobreposição.

Ensaio SQL com 66 cadastros fictícios em transação com rollback, antes e depois de aplicar a migração: páginas de 50/16, correspondência na última linha encontrada na primeira página filtrada, filtros combinados e literais, conferência, modalidade, situações, cancelamento fora da grade, isolamento por unidade e acesso direto negado. Cenário `rhfilters` incluído no CI. Nenhuma fixture persistiu.

Chrome com interface real e API simulada local: 60 linhas fictícias, filtro de conferidos, aviso de sobreposição, foco e rolagem horizontal por teclado. Em larguras de 390 e 768 pixels, não houve transbordamento horizontal do documento; a tabela manteve sua própria rolagem. Viewport restaurado e aba/servidor de ensaio encerrados. Evidência local `.tools/rh-calendar-filters-local.png`, ignorada pelo Git. Não equivale à homologação em equipamento institucional ou leitor de tela.

API publicada com sessão administrativa real: consulta padrão e pendentes retornaram 41 atuações; conferidos e cancelados retornaram zero, coerentes com o cadastro ainda não conferido. Situação inválida recebeu `400 RH_INPUT_INVALID`; sessão encerrada. Nenhum lançamento ou autorização real criado. Advisor sem novos avisos de segurança/desempenho; proteção contra senha vazada continua aviso preexistente.

## Próximo bloco e limites

Próximo bloco: cálculo pela data de retorno na prévia RH (UI03), preservando os esquemas atuais. Escala mínima, day-off/feriados e normas precisam de revisão/homologação municipal em CA05/QA09. Múltiplas atuações/equipes, reconciliação histórica, leitor de tela/zoom/equipamentos institucionais, PDF e aceite da Diretoria continuam pendentes. Os filtros operam sobre a projeção cadastral atual; não resolvem a apresentação de históricos cujo funcionário deixou essa projeção.
