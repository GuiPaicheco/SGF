# SGFS — Sistema de Gestão de Funcionários da Saúde

Ferramenta de apoio ao RH das unidades de saúde e à Administração para organizar profissionais do CNES, calendários, férias, folgas e afastamentos.

**Diretoria IV de Atenção Primária à Saúde · Prefeitura Municipal de Betim**

> Código visível publicamente, com licença proprietária de uso institucional. A publicação do repositório não autoriza acesso ao ambiente, aos dados ou às contas institucionais.

## O que o sistema faz

| Acesso | Funcionalidades |
| --- | --- |
| Administração | Consulta e conferência do CNES, cadastro das unidades, autorização de operadores, feriados gerais/específicos e visão dos calendários. |
| RH da unidade | Identificação do operador autorizado, calendário da equipe, férias regulamentares/prêmio, folgas, afastamentos e day-off. |
| Sem login | Simulação de datas de férias sem identificação pessoal e sem gravar um lançamento. |

O calendário permite consulta mensal ou por intervalo de até 12 meses, filtros por profissional/cargo/equipe, alertas de conflitos, visualização longitudinal ou nominal e exportação em PDF/XLSX.

São 41 UBS e a DAPS no catálogo de acesso. O profissional não precisa de conta própria, CPF ou matrícula para ser incorporado pelo CNES. A Administração confere as diferenças antes de salvar. Uma atualização não apaga afastamentos nem remove automaticamente profissionais ausentes da consulta.

O sistema auxilia a conferência: CNES não comprova saldo, período aquisitivo ou direito ao benefício. Normas, assentamentos e autorização administrativa continuam sob conferência do RH. Veja as [regras documentadas](docs/NORMAS_FERIAS_BETIM.md).

## Executar localmente

Requisitos usados pelo CI: **Node.js 24** e **Python 3.14**. Não há instalação npm para o frontend.

```bash
git clone https://github.com/GuiPaicheco/SGF.git
cd SGF
node scripts/build-static.mjs
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Abra `http://127.0.0.1:8080`. Sirva somente `dist/`, nunca a raiz do repositório em um endereço público.

**Atenção: servir a interface localmente não cria um banco isolado.** A configuração versionada contém a URL e a chave publicável da instalação institucional. Para desenvolver com dados, primeiro configure seu próprio Supabase conforme o [guia de desenvolvimento](docs/DESENVOLVIMENTO.md).

O servidor estático não executa `/api/cnes`. A integração completa requer a função Python e o ambiente Supabase; consulte [hospedagem](docs/HOSPEDAGEM.md).

## Configuração

O frontend usa `SUPABASE_URL` e `SUPABASE_KEY` em `assets/app.js` e **não carrega automaticamente arquivos** `.env`. Esses valores são publicáveis; não concedem acesso administrativo.

A API Python pode receber `SUPABASE_URL` pelo ambiente. [.env.example](.env.example) é um modelo para o backend, não configura o navegador. As Edge Functions recebem seus segredos no ambiente do Supabase.

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, senhas, tokens de sessão ou chaves privadas no frontend, GitHub, issues ou logs. Ao trocar de projeto, alinhe frontend, API Python, CSP, URLs de recuperação e scripts de teste. Não use contas ou dados de produção para demonstrações.

## Testes e build

```bash
node scripts/check-public-repository.mjs
node --test tests/*.test.mjs
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_cnes*.py'
node scripts/build-static.mjs
```

O build gera somente os arquivos públicos em `dist/`, com versões de assets por conteúdo. Não editar essa pasta como fonte.

O CI verifica os arquivos públicos, os testes Node/Python, a reconstrução do banco e ensaios SQL em banco Docker isolado. Testes automatizados não substituem a conferência de navegador; um deploy pronto não significa que todos os testes de CI passaram.

Scripts `verify-*-pilot.mjs` e `verify-access-online.mjs` são ferramentas de manutenção históricas que podem escrever em um banco remoto. Não fazem parte da instalação nem da suíte padrão. Veja [testes e ambientes](docs/DESENVOLVIMENTO.md).

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `index.html`, `assets/` | Interface estática, regras de apresentação, calendário e exportações. |
| `api/cnes.py` | Consulta autenticada do CNES, sem gravação de cadastro. |
| `cnes_service/` | Coleta, leitura e validação dos dados da fonte. |
| `supabase/functions/` | Autenticação e operações autorizadas no servidor. |
| `supabase/migrations/` | Evolução do banco, permissões e regras transacionais. |
| `config/rh-units.json` | Catálogo de estabelecimentos permitidos. |
| `tests/`, `scripts/` | Testes, build e ferramentas de manutenção. |
| `docs/` | Guias atuais, contratos e registros históricos identificados. |

Identificadores internos `SGF`, nomes de projeto e referências a RH/Diretor foram preservados por compatibilidade. A identidade exibida é SGFS; as estruturas legadas não autorizam novos fluxos de solicitação ou autocadastro.

## Implantação e manutenção

O destino atual é Vercel, com build `node scripts/build-static.mjs`, saída `dist/` e função Python separada. O backend é Supabase. A configuração Netlify é alternativa estática e não executa a API Python.

Instalações próprias exigem projeto Supabase separado, migrations e funções compatíveis. Publicar a interface não provisiona contas nem configura o Auth. Não há senhas de instalação no README.

Siga o [guia de publicação](docs/PUBLICACAO.md). Limpeza, reset e fixtures não fazem parte do deploy. Na preparação de 23/10/2026, os dados operacionais da instalação institucional foram esvaziados a pedido do responsável; isso não é um reset automático para instalações futuras.

## Documentação

- [Índice e ordem de leitura](docs/README.md)
- [Uso pelo RH e Administração](docs/MANUAL_USO.md)
- [Desenvolvimento e ambientes isolados](docs/DESENVOLVIMENTO.md)
- [Arquitetura e limites](docs/ARQUITETURA.md)
- [Publicação e manutenção](docs/PUBLICACAO.md)
- [Privacidade e evidências](docs/PRIVACIDADE.md)
- [Pendências](docs/pendencias.md)

## Contribuições e segurança

Leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de propor alterações e [SECURITY.md](SECURITY.md) para comunicar vulnerabilidades. Use exemplos fictícios em issues e pull requests.

## Licença

Software proprietário para uso institucional. Consulte [LICENSE](LICENSE), que mantém a denominação histórica SGF. Os termos não foram alterados nesta preparação. Bibliotecas de terceiros mantêm suas próprias licenças, indicadas em [assets/vendor/README.md](assets/vendor/README.md).
