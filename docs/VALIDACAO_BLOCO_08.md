# Bloco 08 — revisão técnica e aceite institucional

Data: 09/10/2026. **Em andamento; não há aceite institucional.** Orientações de Computer Use e verificação de fluxo usadas para observar o navegador e separar leitura de gravação. Não houve alteração de banco, pedidos, contas, saldo, decisões ou senha nesta revisão; login/logout administrativo e navegação foram realizados.

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

Responsividade: 360×800 conferido em resultado público, cadastro e escala; largura da página 345 para viewport 360, sem transbordamento horizontal global. Navegação e calendário possuem rolagem interna intencional. Evidência visual inspecionada em celular e desktop; tablet, zoom 200%, leitor de tela e equipamentos institucionais ainda precisam do roteiro completo.

## 02. Correções e materiais

1. Botão **Tela inicial** deixa de ser ocultado abaixo de 420px; logo continua funcionando. CSS versionado `20261009-block8-1`, com teste de regressão.
2. [MANUAL_USO.md](MANUAL_USO.md): procedimento atual por perfil, matrícula/contexto, responsabilidades diárias, calendário, recusas, avisos e comprovante, com imagens reais públicas/fictícias.
3. [GUIA_HOMOLOGACAO.md](GUIA_HOMOLOGACAO.md): 20 casos com executor, resultado esperado/obtido, evidência e aceite nominal; não executados não podem ser aprovados.
4. [ROTEIRO_APRESENTACAO.md](ROTEIRO_APRESENTACAO.md): retiradas instruções de aprovação sequencial do fluxo moderno e de feriado real durante demonstração. Material é roteiro/estrutura, não deck final no Canva.
5. [HOSPEDAGEM.md](HOSPEDAGEM.md): recuperação confirmada em 08/10 e Netlify histórico/pausado. [OPERACAO.md](OPERACAO.md) aponta manual atual e identifica registros antigos como históricos, evitando orientar pelo estado desatualizado.
6. Testes ampliados para UTF-8 estrito em todos os JS/CSS publicados, referências de imagens, limites do aceite e botão de retorno móvel. Suíte completa: 287/287 aprovados; build estático concluído. Verificações automatizadas não equivalem ao aceite institucional.

Imagens em `docs/imagens/`: simulação pública, feriados e comprovante fictício cancelado. Não incluem lista de usuários reais, CPF, e-mail, senha ou token. O build publica somente HTML/logo/JS/CSS, não manuais/imagens internas.

## 03. O que impede encerrar o bloco

Normas/interpretacões e vigências aprovadas pelo RH/Jurídico; validação nominal dos quatro perfis e organização real; roteiro completo com dados representativos; equipamentos/navegadores institucionais e impressão; material final de slides; política de retenção e aceite nominal. Foram solicitados responsáveis e equipamentos ao usuário. Nenhuma lei, prazo legal, assinatura de aceite ou aprovação foi inventada. Não consolidar regra normativa ainda não aprovada.
