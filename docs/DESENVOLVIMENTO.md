# Desenvolvimento e testes

## Requisitos

O CI usa Node.js 24, Python 3.14, Supabase CLI 2.118.0 e PostgreSQL 17. Docker é necessário para o ensaio de banco isolado. Dependências Python estão fixadas em `requirements.txt`; o frontend usa JavaScript/CSS sem bundler e sem dependências npm locais.

## Interface estática

```bash
node scripts/build-static.mjs
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

O build cria `dist/` por uma lista explícita de arquivos. Não sirva a raiz: ela contém código de servidor, ferramentas e documentação. A edição deve ocorrer em `index.html` e `assets/`; reconstrua e recarregue após alterar arquivos.

A URL local não garante isolamento. A interface versionada aponta para a instalação institucional. Para operar dados em desenvolvimento, use um projeto próprio e confira todos os destinos abaixo.

## Projeto separado

1. Crie ou selecione um Supabase exclusivo para desenvolvimento.
2. Aplique a cadeia integral de `supabase/migrations/` no ambiente vazio. Em ambiente existente, confira o histórico antes de aplicar migrations; nunca use reset como atualização de produção.
3. Publique as Edge Functions correspondentes ao código e configure seus segredos pelo Supabase. Consulte a ajuda da versão instalada da CLI antes de executar comandos administrativos.
4. Ajuste `SUPABASE_URL` e a chave publicável em `assets/app.js`.
5. Alinhe `SUPABASE_URL` da API Python e as origens `connect-src` em `index.html`, `vercel.json` e `netlify.toml`.
6. Configure as URLs de recuperação no Supabase Auth para esse ambiente.
7. Provisione somente contas de teste autorizadas. Não copie dados de produção.

A publicação de migrations não garante que as 42 contas institucionais estejam provisionadas. O provisionamento é uma operação administrativa separada. Não use credenciais padrão documentadas em etapas históricas como orientação de produção.

`.env.example` lista a configuração da API Python. O frontend não lê `.env`, e Python não carrega esse arquivo automaticamente: exporte a variável no processo ou configure-a na plataforma.

## Consulta CNES

É recomendável instalar as dependências em um ambiente virtual:

```bash
python -m venv .venv
```

Ative com `source .venv/bin/activate` em Linux/macOS ou `.venv\Scripts\Activate.ps1` no PowerShell. Depois execute os comandos de instalação e testes abaixo. No Windows, o launcher `py -3.14` também pode selecionar o Python.

Instale `requirements.txt` para executar os testes da API. Em implantação, Vercel executa `api/cnes.py` separadamente de `dist/`. Um servidor estático simples não atende essa rota.

Para desenvolvimento integrado, utilize emulação compatível da Vercel ou um proxy local para o serviço ASGI `api.cnes:app`. Um servidor ASGI como uvicorn é ferramenta opcional, não incluída nas dependências de produção. A requisição continua exigindo sessão e perfil administrativo válidos do projeto configurado; não desabilite essa conferência.

## Suíte padrão

```bash
node scripts/check-public-repository.mjs
node --test tests/*.test.mjs
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_cnes*.py'
node scripts/build-static.mjs
```

Esses comandos não exigem credenciais de produção. O script de verificação pública examina arquivos rastreados pelo Git; não é uma auditoria completa de segurança nem substitui secret scanning do provedor.

## Banco e ferramentas de ensaio

O workflow [tests.yml](../.github/workflows/tests.yml) documenta o banco Docker descartável, aplicação das migrations e ensaios transacionais. Use-o como referência para a reconstrução isolada.

| Ferramenta | Efeito / cuidado |
| --- | --- |
| `prepare-workflow-rehearsal.mjs` | Gera SQL. Mantenha BEGIN/ROLLBACK e execute somente no banco isolado. |
| `prepare-demo.mjs` | Gera demonstração com rollback por padrão; a opção de persistência exige consentimento adicional. |
| `reconcile-history.sql` | Consulta de reconciliação somente leitura. |
| `verify-database-rebuild.mjs` | Exige CI e banco Docker isolado; cria/restaura dados sintéticos nesse ambiente. |
| `verify-access-online.mjs`, `verify-*-pilot.mjs`, `verify-registration-pilot.mjs` | Ensaios históricos autenticados; podem criar/alterar registros remotos. Não executar como teste padrão ou contra produção. |

Nenhuma alteração visual justifica repetir cadastro, redefinição de senha, importação ou limpeza em produção. Faça a inspeção de navegador com leitura e dados fictícios isolados quando houver necessidade de gravar.

## Antes de um pull request

Execute as verificações pertinentes, informe o que foi realmente testado e consulte [CONTRIBUTING.md](../CONTRIBUTING.md). Não inclua dumps, PDFs do CNES, planilhas reais, screenshots pessoais ou tokens em commits.
