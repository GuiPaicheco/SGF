# Publicação e manutenção

## Antes de publicar

1. Revise a alteração e o destino: repositório, branch, projeto, ambiente e banco.
2. Execute as verificações relevantes do [guia de desenvolvimento](DESENVOLVIMENTO.md), incluindo a checagem do repositório público.
3. Confira se não há dumps, credenciais, PDFs de funcionários, planilhas ou capturas com dados reais no diff.
4. Confirme compatibilidade de banco e funções com a interface. Uma mudança aditiva deve preservar versões ainda em uso.
5. Faça a inspeção visual das telas afetadas, em desktop e celular, registrando limites do teste.

Não publicar arquivos locais `.env`, `.vscode/`, `.vercel/`, backups ou saídas de testes. Nunca copiar o repositório inteiro para a pasta pública.

## Sequência

Quando houver alteração de backend, aplique migrations revisadas e publique funções compatíveis no ambiente autorizado antes da interface. Não reaplique migrations já registradas nem use reset para atualizar uma base em uso.

O push em `main` aciona a integração de publicação configurada. Confira tanto o CI do GitHub quanto o deploy Vercel. Os processos são independentes; um deploy pronto não prova aprovação dos ensaios de banco.

O frontend é construído em `dist/`; a função Python é empacotada pela Vercel. Veja [HOSPEDAGEM.md](HOSPEDAGEM.md).

## Depois de publicar

- Confira o commit servido, SGFS no título e os nomes institucionais no rodapé.
- Abra login e simulação sem enviar dados reais.
- Consulte uma unidade com acesso autorizado, sem criar registros de teste no ambiente institucional.
- Inspecione console, tela pequena, foco e rolagem quando a interface mudar.
- Quando houver alteração de exportação, abra PDF/XLSX com dados fictícios isolados.
- Atualize as pendências e a documentação vigente; registre verificações não executadas.

## Recuperação

Reverter o frontend não reverte banco nem dados. Antes de promover uma versão anterior, verifique a compatibilidade com as migrations e funções que permanecem ativas. Restauração de dados é uma operação independente, a ser feita pelo responsável com backup adequado e plano de recuperação.

Nunca force-push ou reescreva histórico como rotina de publicação. Se um segredo for exposto, revogue-o primeiro e siga [SECURITY.md](../SECURITY.md); removê-lo do último commit não o retira do histórico.
