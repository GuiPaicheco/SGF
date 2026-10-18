# Revisão urgente CNES/PDF e calendário — 18/10/2026

Migração `20261018223409_cnes_pdf_workspace`; `manage-cnes` v4 e `manage-rh` v7. Requisitos atuais substituem a alternativa manual anterior. Validação visual e publicação web ainda em andamento neste registro inicial.

O PDF fornecido foi lido localmente: 40 profissionais, três equipes e 24 relações de equipe por CNS/CBO. Nomes, descrições de ocupação e totais de horas dos 40 registros foram comparados com extração independente por pdfplumber, sem divergências nesses campos. Não foi versionado o PDF nem dados reais extraídos. Emissão 18/10/2026, atualização local 31/08/2026 e nacional 13/10/2026 são datas diferentes; a competência exige confirmação administrativa.

Leitura no navegador por PDF.js 4.10.38, carregado sob demanda, com eval e fontes incorporadas desabilitados, limite de 15 MB/50 páginas e worker local. Fonte/distribuição: [release oficial](https://github.com/mozilla/pdf.js/releases/tag/v4.10.38), [documentação](https://mozilla.github.io/pdf.js/examples/); licença Apache 2.0 em `assets/vendor/pdfjs-LICENSE`. O arquivo bruto não é enviado a serviço externo de extração. Conteúdo ilegível, layout não reconhecido, CNES divergente ou vínculo ambíguo bloqueiam a incorporação.

A conciliação conserva a chave anterior quando CNS/CBO identificam uma atuação única; ambiguidade exige conferência. Cada inclusão/alteração/ausência recebe escolha individual. Reenvio tem digest da coleta e decisões; uma decisão diferente posterior não é confundida com a execução anterior. Campos da fonte, competência e metadados são separados dos snapshots de afastamento. Nenhuma atualização escreve nas tabelas de férias/folgas existentes.

O ensaio `cnespdf`, incluído no CI, cria dados exclusivamente fictícios em transação com rollback: integração sem matrícula/CPF/login, criação de folga, atualização de nome/carga com vínculo preservado, igualdade integral do registro histórico, consulta entre meses, ausência confirmada sem sumir com o afastamento e bloqueio de novo lançamento. Repetido após aplicar a migração. 392 testes Node e Deno check aprovados antes da verificação visual final.

A importação real do PDF não foi aplicada: aprovação de cada diferença permanece com o Administrador. Não foram redefinidas senhas reais nem autorizados operadores durante esta implementação. A senha padrão de redefinição agora é 123456 por determinação do responsável; a ação tem confirmação no produto e invalida as sessões da unidade.
