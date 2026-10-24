# Contribuições ao SGFS

O código é público para consulta, com licença proprietária de uso institucional. Leia [LICENSE](LICENSE); não presuma permissões de uma licença open source.

## Propor uma alteração

Descreva o problema, comportamento esperado e telas afetadas. Use exemplos fictícios. Vulnerabilidades e dados pessoais não devem ser publicados em issues; consulte [SECURITY.md](SECURITY.md).

Antes de desenvolver, leia [README.md](README.md), [arquitetura](docs/ARQUITETURA.md) e [desenvolvimento](docs/DESENVOLVIMENTO.md). Confirme um ambiente isolado antes de operar dados.

## Alterar o código

- Preserve a identidade SGFS e as referências à Diretoria IV de Atenção Primária à Saúde e à Prefeitura Municipal de Betim.
- Mantenha autorização no servidor; esconder controles não substitui permissão.
- Não altere IDs, apague dados ou desative RLS para resolver um problema visual.
- Preserve histórico do RH na atualização CNES e use migrations revisadas para mudanças de banco.
- Mantenha versões das dependências fixadas e avisos/licenças dos terceiros.
- Diferencie documentação atual de evidências históricas.

## Enviar um pull request

Explique problema, mudança, validação e limitações. Execute os testes pertinentes e o build. Mudanças de interface devem incluir conferência visual desktop/celular; alterações de banco precisam de ensaio isolado. Use capturas sem dados pessoais.

Não inclua segredos, backups, documentos ou exports reais. Confira os arquivos preparados com `git diff --cached` e execute `node scripts/check-public-repository.mjs` antes do envio.
