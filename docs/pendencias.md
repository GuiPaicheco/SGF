# Pendências do SGF — revisão urgente de 18/10/2026

Esta é a única fila ativa. A orientação mais recente substitui a inclusão manual e a exigência de matrícula dos blocos anteriores. O [planejamento anterior](HISTORICO_PENDENCIAS_20261018_ANTES_PDF.md) fica como histórico; sua ordem não deve ser retomada automaticamente. Os blocos abaixo incorporam a pesquisa normativa de férias e a retirada de banco de horas.

## Requisitos prioritários e implementação

- [x] Corrigir despacho da rota Lançar Férias (aba visível sem renderizador); teste de integração para RH e Administrador. Selecionar unidade carrega funcionários automaticamente.
- [x] Preservar unidade, busca e seleção no lançamento; período, filtros e colunas do calendário ao trocar abas. Consultas de calendário/diretório reutilizadas em memória por até 30 segundos, com limite de 30 consultas, isolamento por acesso e invalidação nas alterações. Busca/consulta explícita e validações de férias consultam o servidor.

- [x] Aba Lançar Férias ao lado do calendário, para administrador e RH; busca paginada de funcionários CNES e acesso direto ao formulário normativo, preservando identificação do operador e escopo da unidade.

- [x] Calendário administrativo sem unidade selecionada automaticamente; UBS em ordem alfabética e Secretaria por último.
- [x] Consulta mensal ou por datas, com CBO, cargo, equipe, modalidade e situação; filtros adicionais recolhidos. Intervalos de até 93 dias por consulta.
- [x] Matrícula deixa de ser requisito para funcionários CNES; não fabricar matrícula. Coluna independente de carga horária, por exemplo `40h`.
- [x] Cargo/ocupação vem da descrição CNES; equipes cruzadas por CNS/CBO, sem união por nome.
- [x] Rolagem horizontal, ocultação e reorganização das colunas funcionais; calendário sem edição direta dos dados cadastrais.
- [x] Exportação CSV de todos os funcionários filtrados e impressão/PDF com a mesma seleção de colunas, organizada por faixas de sete dias.
- [x] Administração concentrada em Calendário, Cadastro das unidades e Feriados; antigas configurações retiradas das rotas atuais.
- [x] Cadastro das unidades centraliza funcionários, importação, competência e autorização de operadores, com filtros e ordem alfabética.
- [x] Redefinição de senha da unidade para `123456`, com confirmação e encerramento das sessões; não redefinir contas sem ação explícita do Administrador.
- [x] Importação por seleção/arraste de PDF; conferência de CNES e competência confirmada separadamente das datas de emissão/atualização.
- [x] Conferência individual de inclusões, alterações e ausências. Rejeitar uma alteração mantém o cadastro anterior; ausências confirmadas impedem novos lançamentos sem apagar vínculos, férias, folgas ou histórico.
- [x] Atualização cadastral preserva IDs de vínculo e snapshots históricos; reativação reconhece o mesmo vínculo e competências anteriores são recusadas. Integração dos registros aceitos ocorre sem cadastro manual, sem login do funcionário e sem criar direitos/saldos.
- [x] Endpoints antigos de solicitações e autocadastro encerrados (410); configurações antigas recusadas pela API, mantendo feriados. Inclusão manual retirada da interface e da API; função antiga sem permissão de execução pelo serviço; origem manual não pode integrar vínculo nem autorizar operador no fluxo atual.
- [x] Feriados com inclusão/edição recolhida e listagem por data; removidas as demais áreas antigas de configuração.

## Verificação desta revisão

- [x] Identidade visual retomada em 18/10: verde institucional e dourado, cartões centralizados, filtros agrupados, tabelas com maior contraste e controles recolhíveis padronizados. Calendário mantém rolagem interna. Conferência no navegador em desktop e largura móvel, 396 testes e build aprovados; alterações visuais de tabelas limitadas à tela para preservar o PDF.

- [x] PDF fornecido: 10 páginas, 40 profissionais, três equipes e 24 associações; nomes/ocupações/cargas conferidos por extração independente, sem divergências nesses campos.
- [x] Ensaio SQL com rollback: importar, programar, atualizar e confirmar ausência preserva a folga e o vínculo; consulta por intervalo encontra o registro e ausência impede novo lançamento.
- [x] 396 testes Node e Deno check das funções aprovados nesta etapa; banco e APIs publicados tecnicamente.
- [x] Leitor PDF ensaiado no navegador; calendário por período, ocultação/reordenação de colunas e CSV baixado conferidos. HTML real de impressão ensaiado em três páginas A4 horizontais, com nomes/cargas/datas dentro dos limites.
- [x] Publicação web conferida com sessão administrativa: três guias, 42 unidades ordenadas, calendário sem seleção inicial e formulário de edição de feriados. CI integrado de `5ecb4e2` aprovado.
- [ ] Conferir impressão nativa/equipamentos institucionais e seleção/arraste do arquivo no ambiente real; automação desses recursos foi limitada pela extensão.
- [ ] Conferência cadastral e aceite real pelos responsáveis das unidades. Nenhuma importação real foi aprovada automaticamente a partir do PDF enviado.

## Blocos atuais — férias regulamentares e férias-prêmio

- [x] **Bloco 1 — Base técnica cadastral e acesso:** importação CNES preserva vínculo, férias, snapshots e versões; ensaio integrado atual cobre atualização, ausência, reativação, competência, operador obrigatório e isolamento entre unidades. Login neutro, identificação no início da sessão e sem troca no calendário.
- [x] **Bloco 2 — Lançamento e conferência normativa:** matriz oficial em [Normas de férias](NORMAS_FERIAS_BETIM.md); duração por aquisição/regime, reduções, parcelas, impedimentos, protocolo, concordância, referência documental, histórico conhecido de consumo e prévia confirmada. Regras no servidor para criação e revisão. Vínculos especiais não recebem direito presumido.
- [x] **Banco de horas retirado do escopo:** sem novas folgas, complementação de férias, trabalho adicional ou exceção por horas insuficientes; retirada também da simulação pública. Registros antigos permanecem consultáveis/canceláveis e não podem gerar nova programação dessa modalidade.
- [ ] **Aceite dos blocos 1 e 2:** RH/SARH deve conferir o enquadramento e os assentamentos reais, as referências documentais e a regra especial quando aplicável. CNES não prova direito adquirido nem saldo. Nenhum funcionário real recebeu férias automaticamente.
- [x] **Bloco técnico — Manutenção e comprovante:** edição/cancelamento com versão, motivo e preservação do histórico; conflito recarrega o estado atual sem repetir a ação. Comprovante inclui regime, aquisição, base normativa, referência, protocolo e versão da conferência, sem divulgar contagens de licenças. Antes de imprimir/copiar o documento atual, consultar novamente o registro; mudanças exigem revisão e falha de conexão impede exportação desatualizada. Versões antigas permanecem identificadas como substituídas.
- [ ] **Aceite do comprovante nos equipamentos institucionais:** conferir impressão nativa, assinaturas e circulação do documento pela unidade. As fixtures técnicas não substituem esse aceite.
- [ ] **Próximo bloco — Piloto completo:** teste institucional com importação aprovada, identificação inicial, conferência, lançamento, alteração, cancelamento e reimportação; aceite dos responsáveis antes de ampliar o uso.

### Evidências desta entrega

- 397 testes Node e Deno check de manage-rh e manage-operations aprovados. Rota antiga de créditos de horas encerrada com 410. CI integrado do núcleo (508184e) aprovado, incluindo banco vazio, ensaios e restauração sintética.
- SQL normativo executado no PostgreSQL isolado e no Supabase com rollback: corte em 02/12/2025, 30/20 e 25/16, ponto facultativo, feriado, aniversário sem acréscimo, impedimentos, fracionamento CLT e prêmio.
- Ensaio integrado no Supabase com rollback: importação sintética, programação, reenvio idempotente, operador e escopo, revisão, atualização/ausência/reativação sem perda de histórico; prêmio com prevenção de reutilização, cancelamento e nova prévia.
- SQL e função manage-rh atualizados. Ensaios históricos de contratos encerrados são explicitamente separados dos cenários normativos atuais no CI.
- Consulta de segurança: não surgiram novos objetos expostos nem concessões amplas. Os avisos anteriores de RLS sem política em tabelas bloqueadas e proteção de senhas vazadas permanecem como pendências de infraestrutura, sem mudança nesta entrega.

### Manutenção e comprovante — 19/10/2026

- 404 testes Node aprovados; ensaio SQL com rollback confirma revisão, preservação do snapshot, recusa de cancelamento com versão antiga, recusa de conclusão antes do término e cancelamento sem apagar a conferência normativa.
- A4 conferido por renderização e extração: exemplo normativo em uma página e histórico extenso em duas, sem perda de texto nem elementos fora dos limites. Contagens de licenças e dados internos da avaliação não aparecem no comprovante.
- Alterações deste bloco são de interface/documento e testes; não houve alteração de esquema nem concessão real.

## Limites e continuidade

O leitor reconhece ficha completa textual no layout CNES ensaiado; PDFs digitalizados ou de outro layout são recusados, sem incorporação parcial silenciosa. PDF sem competência explícita exige mês informado pelo Administrador. Data de emissão não prova competência nem atualização da fonte.

Dados necessários às regras de um afastamento que não existam no CNES continuam sendo conferidos no lançamento (admissão/exercício, aquisição, faltas, licenças e enquadramento jurídico), sem exigir cadastro manual do funcionário. Não inventar esses dados nem direitos.

A revisão não é homologação normativa/institucional. Relatórios analíticos e estatísticas continuam futuros; CSV/PDF do calendário pertencem ao escopo urgente. Manual/treinamento continuam depois da funcionalidade real.
