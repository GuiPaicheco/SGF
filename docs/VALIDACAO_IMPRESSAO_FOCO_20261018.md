# Impressão A4 e foco do RH — 18/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Décimo bloco, código `15a2770`. Mudanças apenas no frontend e em ferramentas de verificação; nenhuma migração ou alteração de dados de produção.

## Impressão

O ensaio do mesmo HTML/CSS do comprovante em renderizador independente expôs paginação excessiva e disposição ruim dos campos no modelo anterior. O CSS de impressão agora usa fluxo de blocos para dados e tabelas de largura fixa para protocolo/assinaturas, elimina altura mínima de página e o flex do documento, preserva blocos importantes, permite observações extensas atravessarem páginas e mantém o rótulo com seu texto. Acrescenta numeração de páginas quando suportada pelo motor de impressão; rodapé inclui protocolo e versão. Tela e cópia de dados continuam disponíveis.

PDFs finais de ensaio, exclusivamente fictícios, gerados em `output/pdf/` (ignorados pelo Git):

- `comprovante-curto.pdf`: **1 página A4**, dois períodos, day-off, nome/equipe extensos e assinaturas.
- `comprovante-extenso.pdf`: **2 páginas A4**, equipe longa, observações de 1.000 caracteres e justificativa de exceção de 500 caracteres, sem truncar conteúdo.

Todas as três páginas finais foram rasterizadas com Poppler e revistas visualmente. `scripts/verify-receipt-pdfs.py` confirmou tamanho A4, quantidade esperada de páginas, presença integral dos campos/observações/justificativa, assinaturas e limites dos caracteres. `scripts/render-receipt-fixtures.mjs` gera o HTML/JSON diretamente pelo módulo real do comprovante, sem duplicar o desenho em outro gerador.

Renderizador: [WeasyPrint 70.0, documentação oficial](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html), executável Windows obtido da [distribuição oficial](https://github.com/Kozea/WeasyPrint/releases/tag/v70.0), SHA-256 do ZIP `ab1151f210b4e6bb7aa7a79e91a67e8ddb760094c107bfda55241b6aaefe7d53`. Usado somente no ensaio local, sem inclusão no site, instalação global ou envio de dados externos.

Reprodução: executar `node scripts/render-receipt-fixtures.mjs`; converter os dois HTML de `tmp/pdfs/` com WeasyPrint para PDFs de mesmo nome em `output/pdf/`; executar `python scripts/verify-receipt-pdfs.py` com `pdfplumber` disponível. Arquivos intermediários podem ser regenerados e não são publicados pelo build.

**Limite:** a janela nativa de impressão do Chrome não ficou acessível pela automação. Os PDFs foram verificados por motor independente; isso não prova a paginação de todos os navegadores, impressoras e configurações institucionais. Reimpressão legada, PDF nativo e equipamento real continuam em CP06/QA07. Não houve certificação PDF/UA, leitura por tecnologia assistiva ou aceite das assinaturas pela Diretoria.

## Teclado e foco

- Novo módulo compartilhado `rh-focus.js`: foco no erro ou título após carregar/formar nova prévia/detalhe/comprovante; foco preservado no seletor após mudar modalidade, fracionamento ou modo de data. Textos recebem `tabindex=-1`, sem criar paradas adicionais de Tab.
- Estado de carregamento exposto com `aria-busy`; filtros/paginação podem devolver foco à área rolável do calendário. Comprovante registra restauração do foco após fechar a impressão, quando o navegador emitir `afterprint`.
- Detalhe desativa respostas/foco antigos quando o usuário sai para outra tela do fluxo. Erro de consulta mantém botão de retorno funcional. Cópia manual continua disponível quando a área de transferência falhar.
- Chrome local com dados fictícios e API simulada: título inicialmente focado; seletor continua focado após troca; prévia recebe foco; Tab alcança confirmação inicialmente desmarcada; comprovante recebe foco e Tab alcança botão de impressão. Evidência `.tools/rh-keyboard-local.png`, ignorada pelo Git. Abas e servidor encerrados.

**378 testes Node aprovados**, build estático concluído, verificações dos dois PDFs aprovadas. PDF e teclado foram ensaiados localmente; não são ensaio funcional com funcionários reais. Leitor de tela, zoom 200%, equipamentos institucionais e homologação geral continuam abertos.

## Próximo bloco

Manual atualizado do RH/Administração e roteiro de homologação da UBS Amazonas (QA08/QA06), com passos, pré-requisitos e evidências de aceite. Conferência cadastral, escolha de operadores e aprovação institucional continuam com os responsáveis.
