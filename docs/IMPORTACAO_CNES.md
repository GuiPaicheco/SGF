# Coleta CNES para conferência

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

O coletor consulta as páginas oficiais do CNES de profissionais, equipes e integrantes. Ele não grava no banco. A segunda etapa, também implementada em 17/10, permite ao Administrador incorporar seu arquivo no **cadastro CNES em conferência** pelo painel. O novo fluxo de lançamentos RH ainda está em implementação.

## Executar

Requisito: Node.js 24. O catálogo em `config/rh-units.json` contém as 41 UBS e a Secretaria (login DAPS). Códigos são strings, preservando zeros à esquerda; não há senha nesse catálogo.

```powershell
# Uma unidade: imprime apenas contagens, sem gravar dados pessoais.
node scripts/collect-cnes.mjs --cnes 6305245

# Todas as unidades, sequencialmente; uma falha não interrompe as demais.
node scripts/collect-cnes.mjs --all

# Gerar arquivos privados de conferência, somente quando necessário.
node scripts/collect-cnes.mjs --cnes 6305245 --save-review
```

Com `--save-review`, a saída fica em `.sgf-imports/<instante>/<cnes>.json`. A pasta é ignorada pelo Git e não é copiada pelo build estático. Os arquivos contêm nomes e identificadores profissionais usados na conciliação; restringir acesso no computador e não compartilhar/publicar como artefatos de CI. O modo de arquivo privado solicitado pelo Node não substitui configuração de permissões do Windows. Cada execução usa uma pasta própria e recusa sobrescrever o mesmo arquivo.

O código de saída é 1 quando alguma unidade falha e 0 quando todas as unidades selecionadas são coletadas. `--help` mostra as opções. A saída do terminal não inclui nomes, CNS, HTML ou corpo de erro remoto.

## Proteções e limites

- Uma requisição por vez, intervalo mínimo de 300 ms, timeout de 15 segundos por requisição e no máximo uma retentativa para falha transitória. Não executar várias instâncias simultâneas para acelerar a coleta.
- Limite de 2 MB por resposta, 5.000 registros profissionais e 100 equipes/10.000 integrantes por unidade. Estes são limites protetivos da ferramenta, não capacidade homologada do sistema.
- Somente origem oficial HTTPS e caminhos previstos; sem redirecionamentos. Links de equipes devem pertencer ao CNES e município esperados.
- Layout desconhecido, valores inválidos e total de horas inconsistente geram erro. Página de manutenção não vira cadastro vazio. Respostas explícitas de estabelecimento sem equipes/equipe sem profissionais são aceitas e continuam sujeitas à conferência.
- Correspondência por CNS/principal e CBO, nunca só pelo nome. Mais de um vínculo candidato gera pendência, sem escolher arbitrariamente.
- Repetição de linhas idênticas é deduplicada na coleta. `sourceKey` identifica conteúdo do registro coletado; não é matrícula municipal nem substitui a futura chave de conciliação com o cadastro existente.

## Conferência e próxima etapa

Toda coleta vem com `requiresReview: true`, data da consulta e competência desconhecida quando não informada pela fonte. Não inferir atualidade diária, admissão municipal, cargo municipal, matrícula ou unidade polo apenas pela ordem da listagem.

Manter componentes de jornada, situação, vínculos, equipes e datas de entrada/desligamento para conferência. Contagens podem incluir registros históricos ou mais de uma ocupação da mesma pessoa: não representam automaticamente pessoas ativas distintas. Membro não conciliado fica em `pending`; profissional sem associação não deve receber equipe inventada.

### Incorporar e conferir pelo painel

1. Entrar como Administrador e abrir **Cadastros → Conferência CNES**.
2. Selecionar unidade e enviar seu arquivo JSON de coleta (máximo 4 MB).
3. Conferir totais e diferenças. A tela mostra até 50 detalhes de mudança e preserva ausentes/ajustes municipais.
4. Confirmar a incorporação. Uma carga repetida não duplica registros; cadastro alterado desde a prévia exige nova conferência.
5. Usar **Conferir** para preencher somente dados municipais conhecidos. Campo vazio permanece sem valor municipal; não inventar matrícula, cargo, admissão ou equipe.
6. Quando houver cadastro anterior, buscar pela matrícula e selecionar explicitamente a associação. Somente registros da mesma unidade são oferecidos; o legado não é sobrescrito.

Fonte CNES e campos municipais ficam separados, com conferência pendente após mudança da fonte. Não são criados conta, direito ou saldo automaticamente. O vínculo com o cadastro anterior não equivale a autorização para afastamento.

Evidências, publicação e limitações: [VALIDACAO_IMPORTACAO_CNES_20261017.md](VALIDACAO_IMPORTACAO_CNES_20261017.md). Preparação das demais unidades pode ocorrer enquanto a Diretora da Amazonas realiza o primeiro teste real; cadastro manual permanece alternativa a implementar no novo cadastro.
