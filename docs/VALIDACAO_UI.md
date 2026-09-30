# Validação de interface, acessibilidade e acessos

Registro da validação executada em 30/09/2026 antes da homologação institucional.

## Resultado automatizado

- 23 testes aprovados com Node.js 24.
- Fluxo público: página inicial e Simulação Rápida.
- Fluxo autenticado de Servidor: seleção do acesso, carregamento de “Meus pedidos” e envio do contexto `servidor`.
- Fluxos autenticados de RH e Administrador: seleção e troca do acesso, carregamento do painel e envio do contexto correspondente.
- Conta com três acessos: alternância entre Servidor, RH e Administrador sem recriar a sessão.
- Permissões: vínculo do servidor ao próprio pedido, escopo de lotação do RH, acesso amplo do Administrador e bloqueio das funções privilegiadas para papéis públicos.
- Situações: devolução, reenvio, aprovação em ordem, programação, reprogramação, cancelamento e conclusão.
- Interface: indicadores de campo com texto, ícone, formato e `aria-invalid`, além de foco visível e região de avisos.
- Codificação: arquivos de interface conferidos em UTF-8.

Os testes são executados automaticamente pelo GitHub Actions em cada envio à `main` e em pull requests.

## Conferência do Supabase

A consulta somente leitura ao projeto remoto confirmou:

- um perfil cadastrado com os acessos Servidor, RH e Administrador;
- perfis disponíveis para os quatro contextos da aplicação, incluindo o acesso público sem sessão;
- políticas RLS específicas para perfis, servidores, solicitações, períodos, aprovações e histórico;
- escopo do RH condicionado às lotações atribuídas ao perfil.

Nenhum dado, senha ou situação de solicitação real foi alterado durante esta validação.

## Responsividade

As páginas públicas foram renderizadas e inspecionadas nos seguintes formatos:

| Formato | Dimensão validada | Resultado |
|---|---:|---|
| Celular | 360 × 800 | Conteúdo em uma coluna, botões acessíveis e sem dependência de interação lateral |
| Tablet | 768 × 1024 | Blocos alinhados, leitura confortável e navegação preservada |
| Desktop | 1440 × 1000 | Conteúdo centralizado e largura máxima preservada |

Também foram revisados os componentes de formulário, resumo, calendário, escala, tabelas roláveis, login e comprovante. O calendário passa a reduzir suas sete colunas sem impor largura mínima em telas estreitas.

## Repetição da validação

Com Node.js 24 ou superior:

```bash
node --check assets/app.js
node --test tests/*.test.mjs
```

Para a verificação visual, sirva o diretório por HTTP e confira pelo menos as três dimensões da tabela. A homologação pós-publicação nos navegadores institucionais continua registrada na etapa de produção.
