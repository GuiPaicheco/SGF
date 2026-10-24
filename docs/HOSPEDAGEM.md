# Hospedagem do SGFS

## Vercel

O destino atual é Vercel, projeto `sgfbetim`, branch `main`. O endereço institucional é [sgfbetim.vercel.app](https://sgfbetim.vercel.app/).

`vercel.json` configura:

- Build: `node scripts/build-static.mjs`.
- Saída estática: `dist/`.
- Função Python: `api/cnes.py`, incluindo `cnes_service/` e `config/rh-units.json`.
- Cabeçalhos de segurança, CSP e cache.

A função Python é empacotada separadamente; publicar apenas `dist/` em um servidor estático não disponibiliza `/api/cnes`.

Use a configuração de ambiente da plataforma para o backend Python. Ao definir outro Supabase, ajuste também frontend, CSP e URLs do Auth; consulte [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md). Não exponha segredos em variáveis públicas.

## Supabase

Banco, Auth e Edge Functions são implantados separadamente da interface. O deploy Vercel não aplica migrations, não provisiona contas e não configura URLs de recuperação.

A chave publicável fica no cliente; chaves privilegiadas pertencem ao servidor. Os dados privados dependem das políticas RLS e das validações das funções, não do sigilo da URL do projeto.

## Netlify

`netlify.toml` permanece como alternativa de publicação estática. Usa o mesmo build e diretório de saída, mas não executa a função Python Vercel. Para oferecer a consulta CNES nessa hospedagem, seria necessário um backend compatível e uma integração própria; não declarar equivalência funcional automática.

## Conferência após publicação

Confirme commit e estado do deploy; abra início, login e simulação. Faça leitura autenticada autorizada para conferir o calendário e a unidade. Verifique responsividade, console e exportações quando afetadas.

Documentos, backups, migrations, configurações de editor e arquivos de ambiente não pertencem ao diretório servido. Não teste indisponibilidade criando dados, apagando registros ou redefinindo senhas reais.

Veja [PUBLICACAO.md](PUBLICACAO.md) para a sequência de atualização e recuperação.
