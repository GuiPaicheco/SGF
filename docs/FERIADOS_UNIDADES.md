# Feriados por unidade e acesso ao CNES

## Cadastro das unidades

Na lista, use **Acessar CNES**. Dentro do estabelecimento estão **Atualizar CNES**, ficha completa da fonte, profissionais e day-offs do RH. Cada profissional tem os dados incorporados e os dados correspondentes da última coleta, quando disponível. Informações do RH permanecem separadas da fonte CNES. A atualização continua exigindo conferência e preserva ausentes e afastamentos.

Não há mais envio de PDF: as ações de arquivo foram encerradas também na função administrativa. O código de leitura anterior permanece apenas como histórico/testes. Importações antigas sem ficha do estabelecimento mostram essa ausência até a primeira atualização pela API; não se inventam dados faltantes.

## Feriados

- **Geral:** vale para todas as unidades, inclusive unidades futuras.
- **Específico:** marque uma unidade ou um grupo de unidades. Selecionar todas cria uma lista explícita, diferente de Geral.
- **Classificação:** federal, estadual, municipal ou institucional; essa informação é declarada pelo administrador, não uma validação jurídica automática. Datas anteriores permanecem gerais e com classificação não informada até serem conferidas.
- A mesma data pode ter eventos de escopos diferentes. O cálculo deduplica as datas aplicáveis para não descontar duas vezes.
- **Excluir:** remove o evento do banco; auditoria e versões anteriores dos afastamentos são mantidas. Não há nova operação de inativação na tela.

Criar, editar ou excluir recalcula férias regulamentares úteis programadas dos vínculos afetados. Início e quantidade são preservados; fim e retorno são conferidos pelos feriados aplicáveis à unidade e pelo day-off. Se o recálculo criar sobreposição com outro afastamento ou parcela, toda a operação é revertida e o administrador recebe orientação para ajustar os períodos. Registros concluídos e cancelados não são reescritos.

O calendário RH, a prévia e a gravação usam o mesmo escopo. A simulação pública sem unidade usa apenas feriados gerais. O fluxo antigo de pedidos está encerrado: suas rotinas históricas continuam tratando apenas o calendário geral, sem incorporar datas exclusivas de outra unidade.

## Login e senhas

Escolha um dos 42 estabelecimentos ou **Administração do SGF** e informe a senha correspondente. A lista é pública e não contém senhas; escolher uma unidade não concede autorização.

Nenhuma senha existente foi alterada. A redefinição administrativa atual ainda utiliza 123456 e exige confirmação. Recomenda-se substituir esse processo por senha inicial aleatória, exclusiva por unidade e com troca obrigatória; a adoção e a comunicação das novas credenciais dependem de decisão do responsável. Não derivar senhas de CNES, nome da unidade ou datas públicas.

## Validação

Os ensaios de `tests/scoped-holidays-rehearsal.sql` devem ser executados dentro de BEGIN/ROLLBACK, sem persistir usuários, feriados ou afastamentos fictícios. A conferência visual com admin/RH e o aceite institucional continuam necessários.
