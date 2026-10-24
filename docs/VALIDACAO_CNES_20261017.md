# Validação da primeira entrega CNES — 17/10/2026

> **Referência histórica/técnica:** este documento registra uma etapa anterior. Confira o [índice atual](README.md) antes de usar seus procedimentos; telas, acessos e contagens podem ter mudado.

## Entregue

- Catálogo versionado de 42 logins/CNES (41 UBS e Secretaria), sem credenciais.
- Coleta sequencial de profissionais, equipes e integrantes do portal oficial CNES, associação por identificador/CBO e pendências para ambiguidades.
- Execução sem persistência por padrão, exportação privada opcional para conferência e proteções de rede/tamanho/retentativa.
- Uso documentado em [IMPORTACAO_CNES.md](IMPORTACAO_CNES.md).

## Evidências

- Amazonas: 40 registros profissionais, 3 equipes, 24 integrantes/associações, zero pendências de associação. Não equivale a 40 pessoas ativas distintas ou aceite cadastral.
- Ensaio sequencial das 42 unidades: 40 concluíram na primeira execução; Bandeirinhas e Secretaria produziram respostas explícitas sem integrantes/sem equipes, ainda não reconhecidas pela primeira versão do parser.
- Após correção, repetidas individualmente: Bandeirinhas com 35 registros, 4 equipes (uma sem integrantes), 15 associações e zero pendências; Secretaria com 230 registros e nenhuma equipe.
- Assim, houve coleta funcional das 42 unidades entre o ensaio geral e as duas repetições. Não foi repetida toda a carga depois das correções, para evitar requisições externas desnecessárias.
- 15 testes novos com dados fictícios; suíte completa com **324 testes aprovados**. Build estático e verificação de diff concluídos.

## Limites

Não foram gravados arquivos de profissionais reais nos ensaios, inseridos dados no Supabase, provisionadas contas ou modificadas senhas. HTML externo foi processado somente em memória; logs exibiram contagens/códigos de erro. Não foi feita homologação individual de profissionais, vigência, cargo municipal ou unidade polo, nem ensaio funcional do SOAP.

O coletor não é ainda a tela de importação, não incorpora automaticamente dados e não conclui CN01–CN10. Também não implementa autenticação por unidade, seleção de operador, lançamento pelo RH, calendário novo ou comprovante novo. Os testes automatizados verificam o coletor e limites simulados; não são ensaio de carga do banco ou revisão visual.
