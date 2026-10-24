# Bloco 08 — revisão técnica e aceite institucional

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

Correções posteriores de 14/10: achados A01–A06 tratados, com 302 testes locais e 21 verificações SQL reais em rollback. RH/Diretor agora é um único perfil operacional (`rh`); enum histórico preservado, sem alterar escopos ou senhas. As menções a quatro perfis nas rodadas de 09/10 abaixo são históricas. Evidências atuais em [AUDITORIA_TECNICA_20261014.md](AUDITORIA_TECNICA_20261014.md). Revisão visual integral e aceite institucional continuam pendentes.

Planejamento atualizado em 14/10/2026: por decisão do responsável, a aprovação do RH Central e os testes de aceite por RH ou Diretor ocorrerão quando as mudanças do sistema estiverem concluídas. A revisão técnica continua agora, sem depender de nomear esses responsáveis antecipadamente. Não representa dispensa nem aprovação das regras. Fila dividida em 08.A (técnica atual) e 08.B (homologação futura) em pendencias.md.

## Atualização técnica — 14/10/2026

- Revisão estática de navegação/foco, região de avisos, idioma/UTF-8, animação e impressão; não equivale a inspeção de todas as telas renderizadas.
- Movimento reduzido: navegação usa rolagem imediata quando a preferência está ativa; spinner e transições de cards/avisos deixam de animar. A escala já possui proteção própria contra movimento.
- Impressão: colunas de protocolo, dados e assinaturas explicitamente restauradas em `@media print`; cabeçalho, observações e aviso evitam quebra interna. Documentos extensos ainda podem ocupar mais de uma página; não foi prometida uma página A4 universal.
- JS/CSS versionados `20261014-block8-3`; duas regressões adicionadas, suíte local 290/290 aprovada. Sem alteração de banco ou dados.
- Inicialização de Computer Use e do navegador falhou antes de qualquer ação por indisponibilidade do caminho de assets do runtime. Zoom 200%, leitor de tela, impressão visual e revisão integral dos formulários continuam não executados. O acesso a arquivos funciona pelo terminal alternativo; essa falha não demonstra defeito no SGF.

Data: 09/10/2026. **Em andamento; não há aceite institucional.** A primeira rodada abaixo foi somente leitura, sem alterar banco, pedidos, contas, saldo, decisões ou senha. A segunda rodada criou exclusivamente dados fictícios novos para ensaio, conforme seção 04. A conta de recuperação existente foi preservada.

## 01. Evidências desta revisão

Chrome no Windows, site publicado https://sgfbetim.vercel.app/, frontend base `0d92653`. Revisão manual, não ensaio de carga ou certificação WCAG.

| Tela/ação | Evidência | Limite |
|---|---|---|
| Inicial, login e recuperação | Textos e navegação conferidos; saída da sessão confirmada | Não enviado novo e-mail nem trocada senha |
| Cadastro público | Campos carregados; eMulti em Bueno Franco filtrou EMULTI 004 BUENO FRANCO; nenhum campo sem label no DOM | Não enviado cadastro nesta rodada |
| Simulação pública | 25 dias úteis desde 03/11/2026: fim 08/12 e retorno 09/12 com calendário atual; captura salva | Estimativa, não validação jurídica |
| Solicitações e detalhe | Lista carregou sete pedidos; detalhe legado cancelado de TESTE BLOCO03 conferido | Não reaberta solicitação ou tomada decisão |
| Comprovante | Protocolo, situação cancelada e duas assinaturas conferidos; captura fictícia salva | Impressão/PDF institucional ainda não executados |
| Cadastros e CNES/equipes | Listas e filtros carregados; escopo administrativo identificado | Não editados cadastros reais |
| Escala | Calendário carregado; distinção confirmado/planejamento, filtros e rótulos observados | Não havia pedido ativo representativo nesta visão; ciclo completo fica pendente |
| Notificações e histórico | Conteúdo carregado, filtros rotulados, sem mojibake detectado no texto renderizado | Nenhum aviso marcado como lido |
| Acessos, perfis, feriados, inclusões e motivos | Telas carregaram; fila funcional vazia tratada; feriados com aviso de recálculo | Não substitui inspeção de cada formulário/detalhe nem dos quatro perfis |

Console: nenhum erro registrado ao final da navegação administrativa. Cadastro, escala, avisos, histórico e catálogo de motivos não apresentaram os padrões de mojibake procurados; cadastro, escala, avisos, histórico e catálogo não apresentaram inputs sem label/aria-label na inspeção correspondente. Isso não é prova de acessibilidade integral.

Responsividade: 360×800 conferido em resultado público, cadastro e escala; largura da página 345 para viewport 360, sem transbordamento horizontal global. Navegação e calendário possuem rolagem interna intencional. Login em 768×1024: largura da página 768, rodapé no final (1024), sem transbordamento; Tab a partir do identificador alcançou Esqueceu a senha com foco visível. Evidência visual inspecionada em celular, tablet e desktop; todas as telas em tablet, navegação completa de teclado, zoom 200%, leitor de tela e equipamentos institucionais ainda precisam do roteiro completo.

## 02. Correções e materiais

1. Botão **Tela inicial** deixa de ser ocultado abaixo de 420px; logo continua funcionando. CSS versionado `20261009-block8-1`, com teste de regressão.

Publicação `a5faeb9` conferida READY no Vercel. No navegador publicado, botão visível em 360×800, largura global 345, retorno de Escala para Olá, Gestão funcionando e foco devolvido ao `#app`. Sessão administrativa encerrada ao terminar; override de viewport removido. Capturas adicionais: `retorno-celular-bloco08.png` e `login-tablet-bloco08.png`.
2. [MANUAL_USO.md](MANUAL_USO.md): procedimento atual por perfil, matrícula/contexto, responsabilidades diárias, calendário, recusas, avisos e comprovante, com imagens reais públicas/fictícias.
3. [GUIA_HOMOLOGACAO.md](GUIA_HOMOLOGACAO.md): 20 casos com executor, resultado esperado/obtido, evidência e aceite nominal; não executados não podem ser aprovados.
4. [ROTEIRO_APRESENTACAO.md](ROTEIRO_APRESENTACAO.md): retiradas instruções de aprovação sequencial do fluxo moderno e de feriado real durante demonstração. Material é roteiro/estrutura, não deck final no Canva.
5. [HOSPEDAGEM.md](HOSPEDAGEM.md): recuperação confirmada em 08/10 e Netlify histórico/pausado. [OPERACAO.md](OPERACAO.md) aponta manual atual e identifica registros antigos como históricos, evitando orientar pelo estado desatualizado.
6. Testes ampliados para UTF-8 estrito em todos os JS/CSS publicados, referências de imagens, limites do aceite e botão de retorno móvel. Suíte completa: 287/287 aprovados; build estático concluído. Verificações automatizadas não equivalem ao aceite institucional.

Imagens em `docs/imagens/`: simulação pública, feriados e comprovante fictício cancelado. Não incluem lista de usuários reais, CPF, e-mail, senha ou token. O build publica somente HTML/logo/JS/CSS, não manuais/imagens internas.

## 03. O que impede encerrar o bloco

Normas/interpretações e vigências aprovadas pelo RH/Jurídico; validação nominal dos quatro perfis e organização real; revisão integral de formulários e acessibilidade; equipamentos/navegadores institucionais e impressão; política de retenção e aceite nominal. Nenhuma lei, prazo legal, assinatura de aceite ou aprovação foi inventada. Não consolidar regra normativa ainda não aprovada.

## 04. Segunda rodada — ciclo moderno e treinamento

Conta nova fictícia TESTE08, sem envio de e-mail, com quatro perfis, duas matrículas e dois CNES. Pelo navegador hospedado foram realizados login, seleção de contexto, distribuição diária, envio, aprovação e inclusão explícita de cada unidade no calendário. Protocolo `SGF-2026-83415558C73E`: 32h, dias 05–08/04/2027, retorno 09/04. Alcides Braz recebeu 05/07; Alterosas recebeu 06/08. A aprovação de uma unidade não decidiu pela outra. API confirmou estado programada, débito único de 32h na matrícula M1 (80h → 48h) e 80h intactas na M2.

Servidor, RH, Diretor e Administrador conferidos em seus contextos; Diretor sem editores de cadastros/acessos. Formulário administrativo em 768×1024 e Acessos em 360×800 sem transbordamento global; campos observados rotulados, sem mojibake identificado. Essas verificações não abrangem todos os formulários. Zoom 200%, leitor de tela, impressão e dispositivos institucionais **não foram executados**.

Correções: limpeza do aviso ao trocar contexto e cancelamento do temporizador anterior; matrícula explícita nos candidatos da escala mínima; datas mensais coerentes com o mês escolhido; contorno de foco de teclado em inputs. JS/CSS versionados `20261009-block8-2`. Suíte ampliada para 288 testes.

Capturas reais fictícias em `docs/imagens/`: perfis, distribuição, protocolo moderno, aprovação RH, calendário moderno e histórico do Diretor (`*-bloco08.jpg`). Nenhuma lista de usuários reais, senha ou token incluída no treinamento. Histórico compartilhado do mesmo protocolo não foi alterado nesta rodada.

Entrega: 14 slides editáveis, com notas do instrutor, em [PowerPoint](apresentacao/SGF_Treinamento_20261009_final.pptx) e [Canva](https://www.canva.com/d/Bd4ZkdD8RE-4lxi). PPTX renderizado e inspecionado página a página; importação do Canva e textos finais conferidos. A apresentação explica o piloto, sem alegar aceite jurídico ou institucional.

Publicação técnica `dff66e1` confirmada READY no Vercel; navegador carregou JS/CSS `20261009-block8-2`, calendário de abril com intervalo 01–30/04/2027, duas matrículas identificadas e região de aviso vazia após troca de contexto. Nenhum erro registrado no console consultado. Suíte local completa e build estático concluídos antes da publicação; não foi afirmado resultado de CI desta publicação.

Encerramento: somente o pedido novo fictício foi cancelado, ambos os saldos de ensaio retornaram a 80h e a conta TESTE08 foi desativada. Histórico preservado, sem exclusão física e sem alteração de contas antigas. Sessão de navegador encerrada e viewport restaurado. Script de ensaio possui validação de identidade/tag e restringe cancelamento aos vínculos dessa fixture.
