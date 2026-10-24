# Preparação do repositório público — 23/10/2026

Registro desta entrega. O índice vigente está em [README.md](README.md).

## Alterações

- README com identidade SGFS, funcionalidades atuais, execução, configuração, testes e implantação.
- Índice de documentação e guias atuais de arquitetura, operação, uso, homologação, desenvolvimento, publicação e privacidade.
- 42 documentos anteriores identificados como referências históricas/técnicas, sem reapresentar fluxos retirados como instruções atuais.
- CONTRIBUTING, SECURITY, changelog e modelos de issue/PR.
- Configuração de editor removida do versionamento; ampliados os padrões de ignore para saídas locais e arquivos privados.
- Checagem heurística de padrões de segredo e arquivos internos no CI, com mensagens sem divulgar os valores encontrados.
- Build estático Netlify alinhado ao script atual. Nenhuma implantação Netlify foi realizada.
- Licença proprietária existente preservada; a visibilidade pública não foi convertida em licença open source.

## Verificação

- 460 testes Node aprovados, incluindo os casos da checagem de publicação.
- Quatro testes Python aprovados em ambiente virtual com as dependências de requirements.txt.
- Build estático aprovado; arquivos de ambiente, documentação, código de servidor e backups não fazem parte da saída estática.
- 166 links locais verificados em 60 documentos principais; nenhum quebrado.
- Checagem dos arquivos rastreados sem padrões bloqueados.
- Checagem pontual de padrões de segredo em 1.112 blobs de texto do histórico Git disponível, sem ocorrências. Nenhum valor encontrado seria impresso pelo verificador.
- Backup e configuração local do editor continuam ignorados.

Os testes Python emitiram aviso de depreciação da integração Starlette/httpx; os quatro testes passaram. A dependência não foi trocada silenciosamente nesta entrega.

## Limites

A checagem é heurística: não constitui auditoria completa, revisão jurídica, análise de infraestrutura ou garantia de inexistência de segredos/dados pessoais. A inspeção de texto não comprova anonimização de imagens e apresentações históricas.

Não foram alterados dados, contas, credenciais, RLS, regras funcionais ou a identidade visual em execução. Nenhum histórico Git foi reescrito.

## Continuidade

Manter os guias atuais como referência, usar ambiente isolado para testes com gravação e executar a checagem de publicação em cada atualização. O primeiro uso real continua dependendo de incorporação CNES, autorização de operadores, feriados e decisões institucionais listadas em [pendencias.md](pendencias.md).
