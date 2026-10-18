# Comprovante do RH — 18/10/2026

Sexto bloco: comprovante disponível no detalhe do lançamento RH. Implementação principal no commit `6994408`; publicação Vercel confirmada pelo status do commit.

## Entrega

- CBO, cargo, carga semanal em h/semana e equipe extraídos do snapshot do lançamento, preservando matrícula, unidade/polo, períodos, retorno, protocolo e operador declarado.
- Nova consulta autenticada do detalhe antes de emitir, para refletir cancelamento ou conclusão feitos em outra sessão. A emissão reutiliza a autorização do endpoint; não adiciona consulta pública nem armazenamento externo.
- Situação cancelada destacada na tela e no texto; não é apresentada como programação vigente.
- Dados ausentes identificados como “Não informado”, acompanhados de orientação de conferência pelo RH. Não são preenchidos com suposições ou com o cargo/equipe atual de outra fonte.
- Distribuição diária por unidades removida do comprovante e das cópias, inclusive legado. Histórico e distribuição legados no banco e nas demais consultas permanecem preservados.
- Impressão/salvar PDF pelo navegador, cópia dos dados e texto de e-mail. Essas ações não enviam e-mail. Falha na área de transferência oferece texto selecionável para cópia manual.
- Comprovante novo intitulado “Comprovante de afastamento”; reimpressão antiga identificada como solicitação do legado. Assinaturas seguem indicação genérica do procedimento institucional, sujeita à definição FL07.

## Verificação

366 testes Node aprovados e build estático concluído. Novos testes verificam snapshot, campos, datas, day-off, exceção de horas, situação cancelada, escape de HTML, campos ausentes, legado e atualização da situação ao emitir. Teste anterior que exigia distribuição diária no comprovante foi atualizado à decisão do responsável, preservando a validação da consulta legada.

Chrome local com dados fictícios e API simulada: programação → detalhe → emitir comprovante validado; fixture visual com nome/equipe extensos, dois períodos, day-off e logomarca carregada. Botões de copiar dados e copiar texto do e-mail apresentaram sucesso. Evidência local `.tools/rh-receipt-local.png`, ignorada pelo Git. Nenhum afastamento real criado e nenhuma credencial publicada.

## Pendências preservadas

Exportação efetiva em PDF, paginação A4 com conteúdo máximo, equipamentos institucionais, teclado/zoom/leitor de tela e aceite de título/assinaturas pela Diretoria permanecem CP06/QA07/FL07. O layout de impressão existente foi mantido com quebra de palavras longas; não se promete uma única página para todo conteúdo. Validação visual em tela não equivale a conferência de PDF.

Próximo bloco: edição/reprogramação com motivo, versões, nova prévia, histórico anterior preservado e atualização do calendário/comprovante; sem débito/estorno do banco de horas declarado.
