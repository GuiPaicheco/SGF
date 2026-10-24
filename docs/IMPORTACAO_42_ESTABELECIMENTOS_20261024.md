# Importação CNES dos 42 estabelecimentos — 24/10/2026

Registro agregado, sem nomes ou identificadores pessoais. O fluxo atual está em [ATUALIZACAO_CNES.md](ATUALIZACAO_CNES.md).

## Correções

- DAPS/Secretaria: a declaração explícita “Estabelecimento não possui Equipes” é reconhecida como lista vazia válida.
- Equipes sem profissionais: a declaração explícita da fonte é reconhecida sem invalidar o estabelecimento inteiro.
- CBO legado alfanumérico, como 2231F9, preservado pelo adaptador, conferência e validação SQL.
- Horas ausentes na ficha de membro da equipe permanecem desconhecidas; a jornada da ficha profissional não é substituída nem zerada.
- Consulta incompleta pode ser repetida integralmente uma vez, dentro do limite total de 120 segundos e da mesma limitação de concorrência. Não há combinação de respostas parciais nem cache de resultado incompleto.

Páginas vazias, inválidas e falhas persistentes continuam bloqueando a atualização.

## Resultado

- **42/42 estabelecimentos** com fonte e profissionais incorporados.
- **2.102 vínculos profissionais** e **2.063 pessoas** na base operacional. Uma pessoa pode ter mais de uma atuação/CBO ou unidade.
- DAPS, CNES **2126486**: **230 vínculos**, todos sem equipe na fonte; exibidos como **Não se aplica**.
- Zero unidades sem fonte, cadastros sem vínculo operacional ou identidades de origem duplicadas por unidade.
- A base iniciou sem lançamentos e permaneceu sem férias/folgas e feriados após a carga. A importação não cria esses registros.
- Nenhum operador foi autorizado automaticamente. A Administração precisa selecionar os responsáveis.

A fonte não declarou competência; a data de coleta foi registrada sem inferir competência pela data atual.

## Procedimento e testes

Coletas completas foram validadas, conferidas e aplicadas pelos endpoints autenticados de prévia/aplicação existentes, sob autorização do responsável para a carga dos 42 estabelecimentos. Falhas transitórias foram reconsultadas; unidades aplicadas não foram duplicadas.

Dados brutos e resultados detalhados ficam em pasta local ignorada pelo Git. O repositório recebe somente código, testes e agregados.

Verificações locais: **462 testes Node** e **9 testes Python** aprovados. Build estático e checagem do repositório público aprovados. Migration aditiva de CBO aplicada e função manage-cnes publicada na versão 9, mantendo autenticação própria e autorização administrativa.

O ensaio SQL de integração passou a incluir CBO alfanumérico e preservação dos afastamentos. A reconstrução isolada é executada pelo CI; não foram persistidas fixtures em produção.

## Contagens conferidas no banco

| Estabelecimento | CNES | Vínculos |
| --- | --- | ---: |
| UBS ALCIDES BRAZ | 2126028 | 60 |
| UBS ALTEROSAS | 2126060 | 65 |
| UBS ALVORADA | 2126427 | 36 |
| UBS AMAZONAS | 6305245 | 40 |
| UBS ANGOLA | 2125919 | 95 |
| UBS BANDEIRINHAS | 3419371 | 35 |
| UBS BUENO FRANCO | 2125935 | 62 |
| UBS CACHOEIRA | 2125994 | 70 |
| UBS CAIC CAPELINHA | 5320348 | 36 |
| UBS CAMPOS ELISEOS | 6213618 | 36 |
| UBS CELSO ALVES PEDROSA | 0856762 | 26 |
| UBS CIDADE VERDE | 2125951 | 34 |
| UBS CITROLANDIA | 2125978 | 49 |
| UBS COLONIA | 5128218 | 35 |
| UBS CRUZEIRO DO SUL | 3419363 | 54 |
| UBS DOM BOSCO | 2126087 | 48 |
| UBS DUQUE DE CAXIAS | 7924097 | 48 |
| UBS GUANABARA | 5139074 | 42 |
| UBS HOMERO GIL | 2125927 | 72 |
| UBS ICAIVERA | 2126192 | 43 |
| UBS IMBIRUCU | 2126141 | 68 |
| UBS LARANJEIRAS | 2126176 | 61 |
| UBS MARIMBA | 2125900 | 35 |
| UBS NITEROI | 4659031 | 28 |
| UBS NOSSA SENHORA DE FATIMA | 6935699 | 34 |
| UBS NOVA BADEN | 5896002 | 40 |
| UBS PARQUE DO CEDRO | 3910865 | 28 |
| UBS PAULO CAMILO | 6409296 | 37 |
| UBS PETROPOLIS | 2125986 | 48 |
| UBS PETROVALE | 2126095 | 48 |
| UBS PTB | 2126109 | 46 |
| UBS SAO JOAO | 4702301 | 26 |
| UBS SAO LUIZ | 4796020 | 31 |
| UBS SITIO POCOES | 2894912 | 51 |
| UBS TERESOPOLIS | 9860673 | 46 |
| UBS TRINCHEIRA | 5307767 | 50 |
| UBS UNIVERSAL | 5505844 | 40 |
| UBS VIANOPOLIS | 2126435 | 39 |
| UBS VILA BEMGE | 2126117 | 47 |
| UBS VILA CRISTINA | 2126168 | 44 |
| UBS VILA RECREIO | 9814809 | 39 |
| DAPS | 2126486 | 230 |

## Próximo passo

Autorizar os operadores responsáveis em cada unidade, conferir os feriados aplicáveis e realizar o primeiro lançamento real autorizado. Importação não presume saldo ou direito de férias e não concede acesso RH aos profissionais.
