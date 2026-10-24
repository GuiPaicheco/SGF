# Revisão da versão piloto — 23/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## Escopo e método

Base: origin/main b4218cc, em worktree limpa antes desta revisão. Inspeção de 64 arquivos próprios de execução (JS/MJS/TS/CSS/HTML, sem fornecedores), revisão da API Python e das dependências fixadas, revisão dos fluxos críticos, testes automatizados e consultas de integridade/permissão no Supabase. Não equivale a uma prova formal de cada caminho possível nem a um pentest independente.

A revisão preserva o cadastro público CNES, o histórico e a divisão entre Administração e RH da unidade. Não há novo cadastro por CPF ou matrícula, concessão automática, alteração de regime jurídico ou reconstrução destrutiva do banco.

## Alterações

1. Ordenação de login: UBS alfabéticas, DAPS, Administração do SGF.
2. Identificação administrativa estável no cabeçalho, sem depender do nome histórico da conta.
3. Credencial administrativa alterada pela API autenticada existente; login novo confirmado e anterior recusado. Nenhuma senha/tokens em arquivos ou relatórios.
4. Retirada de 72 linhas inalcançáveis de autocadastro na autenticação. A resposta 410 continua antes de consultas/gravações. Recuperação, login, contextos e troca de senha mantidos e testados.
5. Texto CNES sem menção a etapa; datas de feriados em DD/MM/AAAA; estados do calendário traduzidos.
6. Navegação móvel sem cortar abas; lista RH em cartões até 600 px; tabela original preservada em telas maiores; controles delimitados e chips com área de toque.
7. Exclusão autorizada de exatamente dois feriados de teste inativos pela operação normal da aplicação, com duas auditorias. Sem limpeza geral ou alteração de feriados válidos.

## Banco e autorização

- 55 tabelas públicas/privadas com RLS habilitada; 324 restrições validadas; nenhuma restrição não validada.
- 40 entradas CNES com vínculos associados; zero vínculos órfãos ou afastamentos associados a unidade divergente.
- 42 contas RH e uma conta administrativa ativa; três autorizações de operador já existentes.
- Um afastamento preservado integralmente; nove datas válidas preservadas integralmente. Hash antes/depois do afastamento e dos feriados válidos igual.
- Nenhuma migração ou mudança de política/grant realizada neste fechamento.
- manage-rh, manage-cnes e manage-catalogs recusaram chamadas sem sessão com 401. Autocadastro retirado retornou 410.
- access-auth v16 e manage-cnes v8 publicados; funções usam autenticação no corpo, conforme configuração preexistente.

Os 30 avisos informativos RLS sem política correspondem a tabelas fechadas ao cliente. Não criar políticas permissivas para eliminar esse aviso. As funções auxiliares SECURITY DEFINER acessíveis estão no schema privado e devem manter seus controles; não foram promovidas à API pública.

Permanece o aviso de [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) desativada, recurso dependente do plano. Há também 18 recomendações informativas de índices de FK e 26 índices ainda sem uso observado. Não remover índices históricos nem criar todos indiscriminadamente em uma base de piloto pequena. Reavaliar com carga e planos reais.

A consulta de logs agregada apontou sete erros PostgreSQL na janela padrão de 24h, que inclui ensaios e consultas técnicas. O detalhamento por mensagem não ficou disponível no formato dessa ferramenta; não foi usado como prova de ausência de erros operacionais.

## Verificação

- 456 testes Node e quatro testes Python.
- Build estático e verificação de links/contratos; nenhum padrão de chave privilegiada ou chave privada encontrado nos 33 arquivos públicos inspecionados; isso não substitui análise de todos os possíveis segredos.
- CI completo aprovado para a implementação: testes, banco vazio, ensaios integrados e restauração. Publicação Vercel READY. Correções visuais incrementais mantêm a mesma cobertura.
- Navegador: login novo e cabeçalho administrativo confirmados; DAPS penúltima e Administração última; home/login/operador e lista RH em 390 px; grade de folgas sem ultrapassar a página em 320 px; cabeçalho e formulários em 768 px; desktop restaurado. Não concedidas férias fictícias nem alterados aniversários reais.
- Corrigidos após inspeção: navegação com nomes cortados, botões RH fora do campo visível, largura mínima do formulário em 320 px, seletor de mês compacto, dias da semana, cabeçalho comprimido em tablet e alinhamento dos campos de calendário/busca.
- Logs Vercel de erro/fatal consultados na janela de 30 minutos sem registros retornados; console do navegador conferido nas telas visitadas.
- Exclusão dos dois testes sem lixeira na interface; dados anteriores permanecem na auditoria para eventual restauração administrativa.

## Limites operacionais do piloto

O uso em 320/390/768 px e desktop é emulação de viewport no Chrome, não prova de compatibilidade em todos os aparelhos, Safari ou tecnologias assistivas. Impressão nativa e leitores de tela requerem aceite institucional.

As contas RH mantêm as senhas existentes. A política de substituição de senhas padrão, termos de ciência, governança dos dados e validação das normas seguem como ações institucionais em pendencias.md. Não interpretar este relatório como homologação jurídica, teste de carga ou garantia de funcionamento perfeito.
