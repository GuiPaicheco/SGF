# Segurança do SGFS

## Comunicar vulnerabilidades

Não abra issue pública com exploração, credenciais ou dados pessoais. Utilize um canal privado acordado com o mantenedor e com a TI responsável pela instalação. Se o recurso de relato privado do GitHub estiver habilitado, use a aba **Security → Report a vulnerability**. Se não houver um canal disponível, solicite ao mantenedor um contato privado sem publicar detalhes sensíveis.

Informe versão/commit, componente, pré-condições, impacto e passos mínimos de reprodução com dados sintéticos. Não envie senhas, tokens, dumps ou informações de funcionários.

A existência de código público não autoriza testar contas, explorar vulnerabilidades ou extrair dados da instalação institucional. Faça ensaios em uma cópia isolada autorizada.

## Escopo

O fluxo mantido é o da Administração e do RH institucional descrito no README. Estruturas legadas ainda existem por compatibilidade e continuam sujeitas a revisão se afetarem a instalação atual. Documentos históricos não representam versões suportadas independentemente.

## Credenciais e exposição

- A URL e a chave publicável do Supabase são configurações de cliente. Permissões dependem de RLS e validação no servidor.
- Chaves de serviço, tokens administrativos, senhas e chaves privadas são segredos e não podem entrar no repositório.
- Se um segredo for publicado, revogue/rotacione no serviço de origem antes de limpar os arquivos. O histórico, forks, caches e clones podem manter cópias.
- A correção no último commit não apaga versões anteriores. Limpeza de histórico deve ser planejada pelo responsável; não fazer force-push indiscriminado.
- Reporte exposições de dados pelo procedimento institucional, inclusive quando a origem do cadastro é pública.

## Verificações do repositório

O CI executa uma checagem de padrões conhecidos de segredo e caminhos de arquivos internos. Ela não detecta todos os segredos, não inspeciona infraestrutura e não certifica o sistema como seguro. Ative e acompanhe as proteções de secret scanning/push protection disponíveis no provedor conforme a política do repositório.

Dados de testes devem ser fictícios; screenshots e exports reais precisam de revisão humana. Veja [privacidade](docs/PRIVACIDADE.md) e [publicação](docs/PUBLICACAO.md).
