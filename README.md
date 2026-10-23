# SGF — Sistema de Gestão de Funcionários

Sistema auxiliar da Prefeitura de Betim para consulta de cadastros públicos do CNES e controle de afastamentos pelo RH das unidades.

## Fluxo e acessos

- **Administrador:** Atualizar CNES, conferir correções/inclusões, Acessar CNES, remover funcionário do uso ativo com histórico preservado, gerenciar operadores, feriados gerais/específicos e consultar calendários.
- **RH da unidade:** identificar operador autorizado e lançar férias, folgas e day-offs da própria unidade.
- **Consulta pública:** simulação de férias sem dados pessoais.

O cadastro profissional é importado do CNES, sem exigir CPF, matrícula ou login do funcionário. A atualização nunca remove/desativa ausentes nem reativa quem o admin removeu explicitamente. Informações não disponíveis na fonte não são inventadas.

RH/Diretor é uma denominação histórica encontrada em tabelas, testes e documentos anteriores, não um acesso cadastral adicional no fluxo atual. Contas/estruturas legadas permanecem por compatibilidade; não devem ser usadas para criar novos cadastros.

Regras e documentos do RH são independentes do cadastro CNES. O aniversário confirmado pelo RH gera day-off anual e não consome dias de férias úteis; data de nascimento legada não confirmada continua informativa. Folgas registram autorização externa e não criam saldo de banco de horas. O sistema não substitui o processo administrativo nem a homologação institucional.

O login permite selecionar um dos 42 estabelecimentos ou Administração do SGF. As senhas continuam individuais e não são incluídas no catálogo público.

## Executar localmente

Requer Node.js 24 e Python 3.14. Na raiz:

```bash
python -m pip install -r requirements.txt
python -m http.server 8080
```

O servidor estático permite testar a interface, mas não executa a função Python. A consulta autenticada `/api/cnes` precisa da emulação Vercel ou de proxy local para `python -m uvicorn api.cnes:app` (uvicorn é ferramenta opcional de desenvolvimento).

**Atenção:** servir a interface localmente não cria um banco isolado. Os endereços configurados podem apontar para o banco compartilhado. Não executar fixtures ou limpeza contra dados reais.

## Configuração

O frontend usa `SUPABASE_URL` e `SUPABASE_KEY` publicáveis em `assets/app.js` e não carrega automaticamente arquivos `.env`. Chave publicável não concede autorização administrativa.

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, senhas ou tokens no frontend, GitHub, relatórios ou logs. As Edge Functions usam variáveis seguras do Supabase. A função Python verifica o token no Auth e o perfil via RLS, sem chave privilegiada; `SUPABASE_URL` pode definir o destino do backend Python. Ao trocar de projeto, alinhar frontend, função Python, CSP e URLs de recuperação.

A consulta é restrita aos códigos de `config/rh-units.json`. Coleta CNES pode falhar ou retornar parcialmente; nesses casos, não há incorporação. Competência não é inferida da data da consulta.

## Testes e build

```bash
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_cnes*.py'
node scripts/build-static.mjs
```

O build gera `dist/` com assets públicos versionados. Não editar `dist/` como fonte. A função Python é empacotada pelo Vercel a partir de `api/cnes.py`, separadamente dos arquivos estáticos.

CI executa testes Node/Python, reconstrução do banco e ensaios SQL isolados. Testes de contrato não comprovam todas as interações de navegador; um deploy pronto não significa que todos os testes de CI passaram.

`tests/cnes-api-rehearsal.sql` só pode ser executado dentro de BEGIN/ROLLBACK. Scripts de ensaio podem gravar: conferir seu destino antes de executá-los.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `assets/` e `index.html` | Interface, calendário, consulta e exportações. |
| `api/cnes.py` | Consulta Python protegida no próprio site. |
| `cnes_service/` | Núcleo reaproveitado da API-CNES, com validação reforçada. |
| `supabase/functions/` | Autenticação, conferência e operações autorizadas. |
| `supabase/migrations/` | Evolução versionada, inclusive histórico CNES privado. |
| `config/` | Catálogo das unidades autorizadas. |
| `tests/` e `scripts/` | Testes, build e ensaios. |
| `docs/` | Operação, contratos, evidências e pendências. |

## Implantação e manutenção

O destino atual é Vercel, projeto `sgfbetim`, com build `node scripts/build-static.mjs` e saída `dist`. Dependências Python fixadas em `requirements.txt`. A hospedagem estática alternativa Netlify não executa `api/cnes.py`.

Publicar migrações aditivas e Edge Functions compatíveis antes da interface. Não usar reset ou limpeza automática no banco compartilhado. Para instalações novas, aplicar a cadeia integral de migrações.

A consulta completa fica em schema privado, separada dos cadastros operacionais. Updates preservam IDs, autorizações, informações RH e histórico de afastamentos. Não excluir estruturas antigas sem análise de dependências e migração explícita.

## Documentação

- [Feriados por unidade, cadastro CNES e login](docs/FERIADOS_UNIDADES.md)
- [Atualização CNES e operações RH](docs/ATUALIZACAO_CNES.md)
- [Pendências atuais](docs/pendencias.md)
- [Operação](docs/OPERACAO.md)
- [Hospedagem](docs/HOSPEDAGEM.md)
- [Normas de férias](docs/NORMAS_FERIAS_BETIM.md)

Documentos e capturas anteriores podem descrever fluxos já retirados. O contrato de atualização de 23/10 prevalece sobre as instruções antigas de cadastro manual.

## Licença

Software proprietário para uso institucional. Consulte [LICENSE](LICENSE).
