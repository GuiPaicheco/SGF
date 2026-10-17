# Viabilidade de CNES e Supabase — 17/10/2026

Pesquisa de planejamento. Nenhum profissional importado, conta provisionada ou dado remoto alterado.

## CNES: primeiro ensaio na UBS Amazonas

Código no catálogo do SGF: **6305245**, município Betim, código IBGE de seis posições **310670**. Consulta oficial ensaiada: [profissionais da UBS Amazonas](https://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=3106706305245).

A consulta HTTP retornou 200 com tabela de profissionais. Foram identificadas 40 linhas com padrão de código CBO; isso não comprova 40 pessoas distintas ou 40 vínculos municipais. A tabela apresenta nome, código/descrição CBO, cargas horárias separadas e total, vinculação/tipo/subtipo e situação. Nenhum nome ou CNS foi copiado para este documento. A página usa codificação Windows-1252 e não apresenta, no trecho extraído, referência temporal suficiente para afirmar atualização até hoje. A ausência de equipe nessa tabela não significa ausência da informação no CNES.

### Complemento: equipes consultadas no próprio CNES

Após observação do responsável em 17/10, a [aba de equipes da Amazonas](https://cnes2.datasus.gov.br/Mod_Equipes.asp?VCo_Unidade=3106706305245) foi consultada via HTTP e respondeu 200, com três links de composição. Uma [ficha de profissionais da equipe](https://cnes2.datasus.gov.br/Mod_Equipes_Profisssional.asp?VUnidade=3106706305245&Varea=0070&VTipo=70&VMunicipio=310670&VSeqEq=232467) também respondeu 200; apresenta nome, CNS, CBO, atividade, equipe mínima, carga horária, entrada e desligamento. Não foram copiados dados pessoais para o repositório.

Correção da avaliação inicial: **há caminho público no próprio CNES para obter equipes e integrantes**. “Consulta complementar” significa relacionar essa aba com a de profissionais, não exigir outro sistema. Ainda falta implementar e validar associação por chaves, cobertura de todas as equipes/unidades e disponibilidade dos mesmos campos em API estruturada. Acesso HTML funcional não demonstra que o SOAP retorne equipes.

Escopo confirmado: integração de todas as UBS e Secretaria; Amazonas é primeiro teste real e pode receber cadastro manual se necessário. Para eMulti, controle pelo RH da unidade polo registrada/validada no CNES. RH DAPS contempla inicialmente toda a Secretaria (2126486), com separação por diretoria futura.

### Opções pesquisadas

| Fonte | Evidência | Limite e próximo passo |
|---|---|---|
| Webservice oficial SOAP | [Catálogo DATASUS](https://datasus.saude.gov.br/interoperabilidade-catalogo-de-servicos/) referencia a especificação CNES. O WSDL de produção de `VinculacaoProfissionalService/v1r0` retornou HTTP 200/XML. | WSDL acessível não prova consulta funcional. Ensaiar operação, paginação e resposta real da Amazonas. Confirmar campos disponíveis, principalmente equipe. |
| Consulta pública CNES | Páginas de profissionais, equipes e uma composição de equipe da Amazonas retornaram HTTP 200, com dados complementares no próprio CNES. | Relacionar as consultas por chaves e vigência. HTML não é uma API REST estável e pode exigir adaptação quando o portal mudar. |
| Base por competência | A [documentação oficial de consumo/download](https://wiki.saude.gov.br/cnes/index.php/Categoria%3AConsumo_de_informa%C3%A7%C3%B5es_da_Base_Nacional_do_CNES_via_webservice_e_Download_da_Base_de_Dados) oferece download por competência. | Selecionar arquivos e dicionários de profissionais, vínculos e equipes; relacionar por chaves oficiais e filtrar Betim/unidades. Não importar a base nacional inteira para o SGF. |
| Exportação municipal SCNES | O [Portal CNES documenta o SCNES local e exportações](https://wiki.saude.gov.br/cnes/index.php/Portal_CNES). | Solicitar exportação autorizada ao responsável municipal se a fonte pública não cobrir equipe, atualidade ou identificação. Mapear o layout recebido antes de implementar. |

A [especificação técnica](https://datasus.saude.gov.br/wp-content/uploads/2019/12/Especificacao-Tecnica-para-Integracao-com-o-Cadastro-Nacional-de-Estabelecimentos-de-Sa%C3%BAde.pdf) descreve pesquisa/detalhamento de vínculos e dados de ocupação e jornada. É uma documentação antiga ainda referenciada pelo catálogo: o contrato atual precisa de ensaio. Endpoint WSDL testado: `https://servicos.saude.gov.br/cnes/VinculacaoProfissionalService/v1r0?wsdl`.

Não foi confirmada uma API única que entregue **nome, carga, CBO, cargo municipal, vínculo funcional e equipe**, com atualidade diária, para todas as unidades. Existe caminho oficial de integração e alternativa de extração, suficientes para iniciar a prova de conceito sem prometer cobertura completa.

### Regras recomendadas para os dados

- Exibir competência/data da fonte e instante da importação separadamente. Consulta feita hoje não significa cadastro atualizado hoje; o [cronograma CNES](https://wiki.saude.gov.br/cnes/index.php/Cronograma) possui processamento por competência.
- CBO identifica ocupação; cargo da Prefeitura precisa de correspondência validada pelo RH. Não preencher cargo municipal como se fosse a descrição CBO sem essa decisão.
- Vínculo CNES e matrícula municipal são conceitos diferentes. Não inventar matrícula ou usar nome como identificador único. Permitir preparação de cadastro com identificador interno e conciliação antes de controlar direitos/saldos.
- Guardar jornada semanal total e, quando disponível, por atuação; jornada diária para cálculo de folga requer regra específica. Não dividir automaticamente a jornada semanal por cinco.
- Obter equipes/integrantes pela consulta correspondente do próprio CNES, relacionando chaves e vigência. Quando ausente, marcar pendência e distinguir de “Não se aplica”; não inferir equipe pelo CBO.
- Fazer importação para área de conferência, comparar mudanças e obter revisão do RH. Nunca excluir pessoa ou apagar histórico porque deixou de aparecer numa extração.
- Separar origem CNES, ajustes municipais e snapshots dos registros emitidos. Atualização cadastral não pode alterar retroativamente um comprovante.

Recomendação: avaliar API estruturada em conjunto com as consultas oficiais de equipes já acessíveis; escolher integração ou exportação conforme cobertura/manutenção. Usar importador por arquivo/cadastro manual quando necessário. A aplicação deve funcionar com a última carga aprovada quando a fonte estiver indisponível, sem consultas externas por célula do calendário ou login. Cargas em lotes, retentativas limitadas e conciliação incremental devem evitar sobrecarga no SGF e na fonte.

## Supabase: situação e capacidade

Conferência remota somente de leitura em 17/10/2026:

- Projeto `ijhvbzomakbbxverqfqh` saudável (`ACTIVE_HEALTHY`), PostgreSQL 17.
- Organização no plano **Free**.
- `pg_database_size(current_database())`: **18.304.147 bytes**, exibidos pelo PostgreSQL como **17 MB**. É tamanho do banco, não medição de Storage, tráfego, disco provisionado ou de todas as quotas de cobrança.
- Base atual pequena; não houve teste de carga ou medição de pico simultâneo.

O plano Free documenta quota de **500 MB de banco**; Pro inclui **8 GB de disco por projeto**. As métricas são distintas e outros recursos têm limites próprios. Conferir a [documentação de tamanho](https://supabase.com/docs/guides/platform/database-size) e [planos atuais](https://supabase.com/pricing) antes de qualquer contratação.

**Avaliação:** Supabase/PostgreSQL é adequado como plataforma para 41 UBS, RH DAPS e Administração. Não há evidência de necessidade de trocar de banco. A suficiência do plano gratuito para operação definitiva depende de número de funcionários, registros diários, anos de histórico, anexos, tráfego e concorrência; 42 contas não determinam o consumo.

Prioridades: consultas paginadas, índices por unidade/vínculo/período, importações incrementais, tamanho de auditoria/atribuições por dia, geração de comprovante sem armazenar PDFs duplicados desnecessariamente, métricas de crescimento e recuperação testada. Simular volume representativo de vários anos antes de escolher plano. Decidir disponibilidade e backup institucional à parte do espaço disponível; não contratar nem mudar plano nesta etapa.
