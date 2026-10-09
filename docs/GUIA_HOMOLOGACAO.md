# Guia de testes e aceite institucional

Piloto de 09/10/2026. Este formulário não representa aceite já obtido. Use dados fictícios identificados, nunca senhas reais no registro. Não reative contas técnicas ou altere a conta TESTE de recuperação apenas para demonstração.

## 01. Preparação

Responsável RH: __________________. Responsável Jurídico: __________________. Responsável TI: __________________.

Versão/commit: __________________. Data: __________________. Ambiente: __________________. Navegador/versão: __________________. Equipamento/OS/resolução: __________________.

Confirmar destino do banco antes de qualquer envio. Frontend local e Vercel atualmente usam o mesmo Supabase. Massa DEMO07 só pode ser persistida em destino isolado conferido; o gerador usa rollback por padrão. Consulte [VALIDACAO_BLOCO_07.md](VALIDACAO_BLOCO_07.md). Não apresentar fixtures técnicas curtas como direitos legais aprovados.

## 02. Casos por perfil

Para cada caso, registrar: resultado esperado, obtido, evidência protegida, responsável, data e situação (aprovado/reprovado/não executado). Caso não executado nunca conta como aprovado.

| ID | Executor | Procedimento e resultado a conferir |
|---|---|---|
| H01 | Público | Simular férias úteis/corridas e banco; nenhuma gravação de pedido ou coleta de identificação |
| H02 | Público | Cadastro com duas matrículas; duas unidades em uma matrícula; equipe filtrada por CNES e Não se aplica |
| H03 | Público/RH/Admin | Aprovação de acesso completo; unidade fora do escopo exige Administrador; primeiro acesso e senha pessoal |
| H04 | Servidor | Login CPF/e-mail, recuperação e escolha de vínculo/contexto; não repetir reset de usuário real |
| H05 | Quatro perfis | Trocar contextos; dados anteriores não aparecem no novo escopo; nenhum botão concede permissão ausente |
| H06 | Servidor | Solicitar para matrícula correta; distribuir dias entre CNES autorizadores vigentes |
| H07 | RH A/RH B | Cada unidade decide apenas seus dias; aprovação não torna a faixa confirmada |
| H08 | RH | Recusar pelos três motivos; conferir justificativa, saldo/datas/colega e aviso ao titular |
| H09 | RH | Adicionar ao calendário; débito único por pedido e saldo suficiente; calendário de cada unidade correto |
| H10 | Dois gestores | Abrir mesma versão e salvar ações concorrentes; segunda gravação rejeitada sem sobrescrever a primeira |
| H11 | Servidor/RH | Corrigir distribuição pendente; reprogramação pelo fluxo permitido, protocolo vinculado e histórico preservado |
| H12 | Gestão | Filtrar cargo/equipe/função; conflitos apenas no critério/escopo/visão atuais, sem recusa automática |
| H13 | RH | Sugestão cíclica e ajuste nominal; dia vazio explícito; encerramento justificado de conflito manual |
| H14 | Admin/Servidor/RH | Feriado incluído, movido e desativado; conferir recálculo, retorno, responsabilidades e avisos de envolvidos |
| H15 | Gestão | Legado ambíguo não aparece duplicado ou atribuído por suposição; revisão documental |
| H16 | Servidor/RH | Comprovante/protocolo/situação; duas assinaturas; impressão A4 sem corte |
| H17 | Gestão/Servidor | Avisos no contexto certo; leitura/paginação; autoria e filtro do histórico; sem credenciais em detalhes |
| H18 | Todos | Logo e Tela inicial, Voltar, teclado, foco, zoom 200%, rótulos, cores acompanhadas de texto |
| H19 | TI | 360×800, 768×1024 e desktop; tabelas rolam internamente; formulário, rodapé e botões sem corte |
| H20 | RH/Jurídico | Casos normativos de HOMOLOGACAO_REGRAS.md; referências, vigências e responsáveis registrados |

## 03. Equipamentos institucionais

| Navegador/versão e equipamento | Executor/data | Casos | Resultado/evidência |
|---|---|---|---|
| A informar pela Prefeitura | — | H01–H20 aplicáveis | Não executado |

A revisão técnica em Chrome deste desenvolvimento não certifica navegadores/dispositivos institucionais. Usar pelo menos um posto real de RH e um acesso de servidor, além de impressão/PDF e conexão habitual. Registrar limitações de desempenho; não inventar medidas de carga.

## 04. Regras, retenção e decisão

Para cada regra: dispositivo/URL oficial, interpretação aprovada, regime/jornada alcançados, vigência, casos esperado/obtido, responsável RH/Jurídico e data. Divergência deve virar pendência antes de consolidar o cálculo no servidor. Não preencher número de lei presumido.

Para retenção: categorias documentais, finalidade/base legal aprovadas, prazo, impedimentos de descarte, responsáveis, cópias e alcance de anonimização. Usar [AUDITORIA_RETENCAO.md](AUDITORIA_RETENCAO.md). Nenhum descarte foi autorizado por este guia.

Decisão final: [ ] aprovado [ ] aprovado com restrições [ ] reprovado [ ] ainda não avaliado.

Restrições/pendências e prazo: __________________.

Aceite nominal RH: __________________. Jurídico (regras): __________________. TI (operação): __________________. Data: __________________.

Não assinar automaticamente. A aprovação não substitui a preparação operacional e de segurança do bloco 09.

Ensaio técnico de 09/10: quatro perfis, duas matrículas e dois CNES, com decisões independentes e débito único, registrado em [VALIDACAO_BLOCO_08.md](VALIDACAO_BLOCO_08.md). Não preenche os campos de aceite institucional acima.
