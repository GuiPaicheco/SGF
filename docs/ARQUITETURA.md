# Arquitetura do SGFS

## Visão geral

```text
Navegador — index.html + assets/
  ├─ Supabase Auth e Edge Functions — sessão e operações do RH/Administração
  ├─ Data API + RLS — leituras autorizadas
  ├─ /api/cnes — função Python Vercel, exclusiva da Administração
  │    └─ cnes_service/ — consulta e validação da fonte pública CNES
  └─ Exportações PDF/XLSX — processamento no navegador

Edge Functions — supabase/functions/
  └─ PostgreSQL — funções transacionais, autorização, registros e auditoria
       ├─ public — cadastros e relações protegidos por RLS
       └─ private — fonte CNES, registros RH e identificação de operadores
```

O frontend é uma aplicação estática sem framework. `assets/app.js` coordena sessão, navegação e módulos especializados. O build versiona assets pelo conteúdo e publica apenas uma lista de arquivos. Bibliotecas locais de exportação são carregadas quando necessárias.

## Acessos vigentes

- **Público:** entrada e simulação sem persistir um lançamento.
- **Administração:** consulta e incorporação CNES, autorização dos operadores, feriados e visão das unidades.
- **RH institucional:** conta vinculada a uma unidade; identifica um profissional previamente autorizado antes de operar.

A identidade declarada do operador é registrada junto das ações; uma conta compartilhada não equivale à autenticação individual desse profissional. Essa limitação exige política institucional de uso e evolução conforme as pendências.

Esconder uma aba não é autorização. As funções de servidor revalidam usuário, papel, situação, contexto de unidade e operador conforme a operação. Cabeçalhos enviados pelo navegador não devem ser tratados isoladamente como prova de permissão.

## Cadastros e lançamentos

`config/rh-units.json` limita as unidades consultáveis. A API Python valida o token e o perfil administrativo antes da coleta e não grava cadastros. Dados completos são comparados pelo servidor; a Administração decide as inclusões e alterações. Ausência na coleta não implica desligamento.

Registros CNES e vínculos operacionais têm IDs estáveis. Férias, folgas, aniversários e histórico do RH permanecem separados dos dados importados. Remoção do uso ativo é versionada e não equivale a apagar o histórico.

As funções PostgreSQL mantêm as regras transacionais de lançamento, conflitos, alterações, cancelamento e recálculo. A prévia do navegador não substitui a validação no servidor nem a conferência dos assentamentos.

## Estruturas de compatibilidade

Tabelas antigas de solicitações, aprovações, saldo de banco de horas e cadastro por CPF/matrícula permanecem na cadeia de migrations por compatibilidade. Não são o fluxo atual do produto. O mesmo vale para identificadores internos SGF e papéis históricos RH/Diretor. Não remover estruturas de banco sem análise de dependências e migração explícita.

## Limites

- O CNES pode estar indisponível ou incompleto; erros não podem ser convertidos em lista vazia para incorporação.
- O cache de coleta é temporário e por instância; não é um limitador global distribuído.
- Importação do CNES não comprova direito, saldo ou enquadramento normativo.
- Testes de contrato e ensaios SQL não substituem aceite de uso, visualização e impressão.
- Autorização, backup, retenção, monitoramento e responsabilidades institucionais dependem da configuração e da operação do ambiente.

Veja [desenvolvimento](DESENVOLVIMENTO.md), [publicação](PUBLICACAO.md) e [privacidade](PRIVACIDADE.md).
